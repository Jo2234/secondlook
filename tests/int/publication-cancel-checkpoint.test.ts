// DRAFT_UNRUN. A future exact one-file grant is required. No listener or upstream network.
import { access, readFile, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { Store } from '../../src/server/store.js';
import { Runner } from '../../src/server/runner.js';
import { parseEnv } from '../../src/shared/env.js';
import type { StoredPhoto, TryOnJob } from '../../src/shared/types.js';
import { committedCu } from '../../src/domain/ledger.js';
import { FixtureClient } from '../../src/youcam/fixture-client.js';
import type { CallOptions, TaskResult } from '../../src/youcam/client.js';
import { checkSignal, systemClock } from '../../src/youcam/operations.js';
import { SlidingLogLimiter } from '../../src/youcam/rate-limiter.js';
import { normalizePhoto } from '../../src/images/normalize.js';
import { discloseImage } from '../../src/images/disclose.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
// Only the provider response is controlled. Production Runner/reducer/Store/limiter are used.
// A first successful GET keeps the unchanged five-second poll schedule and real clock finite;
// it does not claim coverage of FixtureClient's default four-GET progression.
class PublicationClient extends FixtureClient {
  override async getClothTask(taskId: string, options: CallOptions): Promise<TaskResult> {
    await super.getClothTask(taskId, options);
    return { status: 'success', engineError: null, errorMessage: null, resultUrl: 'https://yce-us.s3-accelerate.amazonaws.com/fixture-result-1.png' };
  }
}
type Boundary = 'download' | 'disclose' | 'written' | 'selected';
async function checkpoint(boundary: Boundary): Promise<void> {
  const directory = process.env.YOUCAM_INT_DATA_DIR;
  if (!directory || !directory.endsWith('/data')) throw new Error('exact owned data namespace required');
  await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  const store = await Store.acquire(directory), signal = new AbortController(), limiter = new SlidingLogLimiter(systemClock);
  const reached = deferred(), release = deferred();
  const wait = async (workSignal: AbortSignal) => {
    reached.resolve();
    const abort = () => release.resolve();
    workSignal.addEventListener('abort', abort, { once: true });
    try { checkSignal(workSignal); await release.promise; checkSignal(workSignal); }
    finally { workSignal.removeEventListener('abort', abort); }
  };
  const clients: PublicationClient[] = [];
  let disclosureCalls = 0, imageId: string | undefined, imagePath: string | undefined;
  let jobId: string | undefined, modelBytes: Uint8Array = new Uint8Array();
  const runner = new Runner({ store, limiter, signal: signal.signal, taskDeadlineMs: 60_000, clock: systemClock,
    client: () => {
      const client = new PublicationClient({ now: systemClock.now, result: async workSignal => {
        if (boundary === 'download') await wait(workSignal);
        return modelBytes;
      } }); clients.push(client); return client;
    },
    disclose: async (bytes, job, workSignal) => {
      disclosureCalls++;
      if (boundary === 'disclose') await wait(workSignal);
      const output = await discloseImage(bytes, job.mode, workSignal);
      imageId = randomUUID().replaceAll('-', '').slice(0, 20); imagePath = `generated/${imageId}.jpg`;
      return { ...output, id: imageId, disclosedPath: imagePath, jobId: job.id, listingId: job.listingId, buyerSessionId: null,
        mode: job.mode, label: 'demo_fixture', artifactMissing: false, createdAt: new Date().toISOString(), expiresAt: null };
    },
  });
  // Forward to the real Store unchanged. These gates retain the actual operation/promise;
  // they neither replace persistence nor emulate a successful commit.
  const originalWrite = store.writeMedia.bind(store), originalCommit = store.commit.bind(store);
  store.writeMedia = async (path, bytes) => {
    await originalWrite(path, bytes);
    if (boundary === 'written' && path === imagePath) { reached.resolve(); await release.promise; }
  };
  let selectedSeq: number | undefined;
  store.commit = change => originalCommit(state => {
    const next = change(state);
    const published = next.jobs.find(job => job.id === jobId);
    if (boundary === 'selected' && selectedSeq === undefined && imageId && published?.resultImageId === imageId
      && published.attempts.at(-1)!.state === 'succeeded') {
      selectedSeq = state.seq + 1;
      // Abort after production chose its atomic next state, before Store writes/fsync/rename.
      // The route below queues its cancel behind this SAME real Store commit.
      runner.cancel(published.id); reached.resolve();
    }
    return next;
  });
  let passed = false, failed = false, failure: unknown;
  const remember = (error: unknown) => { if (!failed) { failed = true; failure = error; } };
  try {
    const photo = await normalizePhoto(await readFile('assets/demo/model-front.png'));
    modelBytes = photo.data;
    const modelId = 'a'.repeat(20), path = `photos/${modelId}.jpg`;
    await store.writeMedia(path, photo.data);
    const model: StoredPhoto = { id: modelId, role: 'model', mode: 'fixture', source: 'synthetic', rightsId: null,
      original: photo.original, normalized: { ...photo.normalized, path }, createdAt: new Date().toISOString(), expiresAt: null };
    await store.commit(state => { state.photos.push(model); return state; });
    const app = createApp(parseEnv({ DATA_DIR: directory }), { store, runner, signal: signal.signal });
    const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await app.request('/api/buyer-sessions', json({}))).status).toBe(403);
    const upload = new FormData(); upload.set('role', 'garment');
    upload.set('file', new File([new Uint8Array(await readFile('assets/demo/tee.png'))], 'synthetic-tee.png', { type: 'image/png' }));
    const uploaded = await app.request('/api/photos', { method: 'POST', body: upload }); expect(uploaded.status).toBe(200);
    const { photo: garment } = await uploaded.json();
    const declaration = { photoType: 'hanger', category: 'upper_body', singleGarment: true, frontFacing: true, notComposite: true, fullyVisible: true, noPeopleInPhoto: true };
    const evaluated = await app.request(`/api/photos/${garment.id}/evaluate`, json({ declaration }));
    expect(evaluated.status).toBe(200); expect((await evaluated.json()).spendAllowed).toBe(true);
    const listingResponse = await app.request('/api/listings', json({ title: 'Synthetic publication checkpoint', conditionNotes: '', priceText: null,
      garmentPhotoIds: [garment.id], declaration, measurements: { category: 'upper_body', valuesMm: { pit_to_pit: 520, length: 680, shoulder: 450, sleeve: 'na' }, enteredUnit: 'cm', tagSize: null } }));
    expect(listingResponse.status).toBe(200); const listing = await listingResponse.json(); expect(listing.readiness.ready).toBe(true);
    const body = { requestId: randomUUID(), garmentPhotoId: garment.id, modelPhotoIds: [modelId], confirmCostCu: 0 };
    const admission = await app.request(`/api/listings/${listing.id}/tryon`, json(body)); expect(admission.status).toBe(200);
    const admitted = await admission.json(); expect(admitted.jobs).toHaveLength(1);
    jobId = admitted.jobs[0].id; expect(jobId).toMatch(/^[0-9a-z]{20}$/);
    // A failed or prematurely completed real Runner must fail this wait, rather than leave
    // an unobserved drain rejection or silently wait for a boundary it can no longer reach.
    const progression = runner.drain().then(() => { throw new Error('publication_boundary_not_reached'); });
    await Promise.race([reached.promise, progression]);
    const cancelled = await app.request(`/api/jobs/${jobId}/cancel`, json({})); expect(cancelled.status).toBe(200);
    const response = await cancelled.json() as TryOnJob;
    const expectedState = boundary === 'selected' ? 'succeeded' : 'cancelled';
    expect(response.attempts.at(-1)!.state).toBe(expectedState);
    release.resolve(); await runner.drain();
    const state = store.snapshot(), job = state.jobs.find(item => item.id === jobId)!;
    expect(job).toEqual(response); expect(job.attempts).toHaveLength(1);
    expect(job).toMatchObject({ requestId: body.requestId, listingId: listing.id, garmentPhotoId: garment.id, modelPhotoId: modelId });
    expect(job.attempts[0]).toMatchObject({ state: expectedState, postCount: 1, getCount: 1, taskId: 'fixture-task-1' });
    expect(state.jobs).toHaveLength(1); expect(state.requests).toHaveLength(1); expect(state.requests[0]!.jobIds).toEqual([jobId]);
    expect(state.ledger).toHaveLength(1); expect(committedCu(state.ledger)).toBe(0);
    expect(state.ledger[0]).toMatchObject({ jobId, attempt: 1, mode: 'fixture', cu: 0,
      id: job.attempts[0]!.ledgerEntryId, state: boundary === 'selected' ? 'spent' : 'possibly_spent' });
    expect(clients).toHaveLength(1); expect(clients[0]!.counts).toEqual({ posts: 1, gets: 1, files: 2, downloads: 1 });
    expect(disclosureCalls).toBe(boundary === 'download' ? 0 : 1);
    if (boundary === 'selected') {
      expect(state.images).toHaveLength(1); expect(job.resultImageId).toBe(imageId);
      expect(state.images[0]).toMatchObject({ id: imageId, jobId, disclosedPath: imagePath, listingId: listing.id, mode: 'fixture' });
      expect(state.listings[0]!.tryOnResultIds).toEqual([imageId]);
      expect(state.ledger[0]!.settledSeq).toBe(selectedSeq); expect(state.seq).toBe(selectedSeq);
      expect(state.images[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
      const media = await store.readMedia(imagePath!); expect(media.length).toBeGreaterThan(0);
      expect(createHash('sha256').update(media).digest('hex')).toBe(state.images[0]!.sha256);
      expect((await app.request(`/media/${imageId}`)).status).toBe(200);
    } else {
      expect(job.resultImageId).toBeNull(); expect(state.images).toHaveLength(0); expect(state.listings[0]!.tryOnResultIds).toEqual([]);
      if (imagePath) await expect(access(store.path(imagePath))).rejects.toMatchObject({ code: 'ENOENT' });
      if (imageId) expect((await app.request(`/media/${imageId}`)).status).toBe(404);
    }
    // The actual durable JSON must contain precisely the same atomic outcome and references.
    expect(JSON.parse(await readFile(`${directory}/state.json`, 'utf8'))).toEqual(state);
    const stateBytes = await readFile(`${directory}/state.json`), counts = clients[0]!.counts;
    const again = await app.request(`/api/jobs/${jobId}/cancel`, json({})); expect(again.status).toBe(200); expect(await again.json()).toEqual(response);
    expect(await readFile(`${directory}/state.json`)).toEqual(stateBytes); expect(store.snapshot()).toEqual(state); expect(clients[0]!.counts).toEqual(counts);
    expect(state.listings[0]!.garmentPhotoIds).toEqual([garment.id]);
    expect(await store.readMedia(path)).toEqual(photo.data);
    expect((await store.readMedia(garment.normalized.path)).length).toBeGreaterThan(0);
    passed = true;
  } catch (error) { remember(error); }
  finally {
    // Unblock every retained controlled promise before joining actual Runner cleanup.
    release.resolve(); let joined = false, cleanupFailed = false;
    const cleanupFailure = (error: unknown) => { cleanupFailed = true; remember(error); };
    try { runner.stopAdmission(); } catch (error) { cleanupFailure(error); }
    try { signal.abort(); } catch (error) { cleanupFailure(error); }
    try { await runner.drain(); joined = true; } catch (error) { cleanupFailure(error); }
    try { limiter.dispose(); } catch (error) { cleanupFailure(error); }
    if (joined && !cleanupFailed && !failed) {
      try { store.assertWritable(); await store.close(); } catch (error) { cleanupFailure(error); }
    }
    // Never remove a failed/unknown run or release its lock as if it succeeded.
    if (passed && !failed) { try { await rm(directory, { recursive: true, force: true }); } catch (error) { cleanupFailure(error); } }
  }
  if (failed) throw failure;
}

test('DRAFT publication: cancel during controlled download retains observed task and cost', async () => checkpoint('download'), 20_000);
test('DRAFT publication: cancel during controlled disclosure publishes no references', async () => checkpoint('disclose'), 20_000);
test('DRAFT publication: cancel after own media sync removes only the unpublished file', async () => checkpoint('written'), 20_000);
test('DRAFT publication: abort after Store callback chooses publication returns durable success', async () => checkpoint('selected'), 20_000);
