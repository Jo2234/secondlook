// Proposed future one-file integration grant only. No listener and no upstream network.
import { access, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { parseEnv } from '../../src/shared/env.js';
import { Store } from '../../src/server/store.js';
import { Runner } from '../../src/server/runner.js';
import { SlidingLogLimiter } from '../../src/youcam/rate-limiter.js';
import { FixtureClient } from '../../src/youcam/fixture-client.js';
import { systemClock } from '../../src/youcam/operations.js';
import { normalizePhoto } from '../../src/images/normalize.js';
import type { StoredPhoto } from '../../src/shared/types.js';

test('S2 fixture API checkpoint: gate, disabled buyer, atomic idempotency, durable ambiguous POST', async () => {
  const directory = process.env.YOUCAM_INT_DATA_DIR;
  if (!directory || !directory.endsWith('/data')) throw new Error('exact owned data namespace required');
  await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  const store = await Store.acquire(directory), signal = new AbortController(), limiter = new SlidingLogLimiter(systemClock);
  const clients: FixtureClient[] = [];
  let disclosureCalls = 0;
  const runner = new Runner({ store, limiter, signal: signal.signal, taskDeadlineMs: 60_000,
    client: () => { const client = new FixtureClient({ scenario: 'post_transport_error', now: systemClock.now, result: async () => { throw new Error('download forbidden after ambiguous POST'); } }); clients.push(client); return client; },
    disclose: async () => { disclosureCalls++; throw new Error('disclosure forbidden after ambiguous POST'); },
  });
  let passed = false, failed = false;
  let failure: unknown;
  const rememberFailure = (error: unknown) => { if (!failed) { failed = true; failure = error; } };
  try {
    const photo = await normalizePhoto(await readFile('assets/demo/model-front.png'));
    const modelId = 'a'.repeat(20), path = `photos/${modelId}.jpg`;
    await store.writeMedia(path, photo.data);
    const model: StoredPhoto = { id: modelId, role: 'model', mode: 'fixture', source: 'synthetic', rightsId: null, original: photo.original, normalized: { ...photo.normalized, path }, createdAt: new Date().toISOString(), expiresAt: null };
    await store.commit(state => { state.photos.push(model); return state; });
    const app = createApp(parseEnv({ DATA_DIR: directory }), { store, runner, signal: signal.signal });
    const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(await (await app.request('/api/health')).json()).toMatchObject({ mode: 'fixture', buyerUpload: 'disabled' });
    expect((await app.request('/api/buyer-sessions', json({}))).status).toBe(403);
    expect((await app.request('/api/buyer-sessions', { ...json({}), headers: { 'Content-Type': 'application/json', Origin: 'https://refused.invalid' } })).status).toBe(403);
    const upload = new FormData(); upload.set('role', 'garment'); upload.set('file', new File([new Uint8Array(await readFile('assets/demo/tee.png'))], 'synthetic-tee.png', { type: 'image/png' }));
    const uploaded = await app.request('/api/photos', { method: 'POST', body: upload }); expect(uploaded.status).toBe(200);
    const { photo: garment } = await uploaded.json();
    const declaration = { photoType: 'hanger', category: 'upper_body', singleGarment: true, frontFacing: true, notComposite: true, fullyVisible: true, noPeopleInPhoto: true };
    const evaluated = await app.request(`/api/photos/${garment.id}/evaluate`, json({ declaration })); expect(evaluated.status).toBe(200); expect((await evaluated.json()).spendAllowed).toBe(true);
    const listingResponse = await app.request('/api/listings', json({ title: 'Synthetic checkpoint top', conditionNotes: '', priceText: null, garmentPhotoIds: [garment.id], declaration, measurements: { category: 'upper_body', valuesMm: { pit_to_pit: 520, length: 680, shoulder: 450, sleeve: 'na' }, enteredUnit: 'cm', tagSize: null } }));
    expect(listingResponse.status).toBe(200); const listing = await listingResponse.json(); expect(listing.readiness.ready).toBe(true);
    const body = { requestId: randomUUID(), garmentPhotoId: garment.id, modelPhotoIds: [modelId], confirmCostCu: 0 };
    const result = await app.request(`/api/listings/${listing.id}/tryon`, json(body)); expect(result.status).toBe(200);
    const payload = await result.json(); expect(payload.mode).toBe('fixture'); expect(payload.jobs).toHaveLength(1);
    const admitted = payload.jobs[0]; expect(admitted.id).toMatch(/^[0-9a-z]{20}$/);
    const jobId = admitted.id;
    const identity = { id: jobId, mode: 'fixture', requestId: body.requestId, listingId: listing.id, garmentPhotoId: garment.id, modelPhotoId: modelId };
    expect(admitted).toMatchObject(identity);
    // Admission may be queued or already progressed; only the retained completion join proves the outcome.
    const lookup = await app.request(`/api/tryon-requests/${body.requestId}`); expect(lookup.status).toBe(200);
    const known = await lookup.json(); expect(known.mode).toBe('fixture'); expect(known.jobs.map((job: { id: string }) => job.id)).toEqual([jobId]); expect(known.jobs[0]).toMatchObject(identity);
    await runner.drain();
    const completed = await app.request(`/api/jobs/${jobId}`); expect(completed.status).toBe(200);
    const job = await completed.json(); expect(job).toMatchObject(identity); expect(job.attempts).toHaveLength(1); expect(job.attempts[0]).toMatchObject({ state: 'uncertain', postCount: 1 });
    expect(store.snapshot().ledger).toHaveLength(1); expect(store.snapshot().ledger[0]).toMatchObject({ jobId, state: 'possibly_spent' });
    expect(clients).toHaveLength(1); expect(clients[0]!.counts).toMatchObject({ posts: 1, gets: 0, downloads: 0 }); expect(disclosureCalls).toBe(0);
    const clientCounts = clients.map(client => client.counts);
    const stateBytes = await readFile(`${directory}/state.json`);
    // After progression joins, read-only found/missing/invalid lookups cannot change durable state or client counts.
    const settledLookup = await app.request(`/api/tryon-requests/${body.requestId}`); expect(settledLookup.status).toBe(200);
    const settled = await settledLookup.json(); expect(settled.mode).toBe('fixture'); expect(settled.jobs.map((item: { id: string }) => item.id)).toEqual([jobId]); expect(settled.jobs[0]).toEqual(job);
    const missing = await app.request('/api/tryon-requests/00000000-0000-4000-8000-000000000000'); expect(missing.status).toBe(404); expect(await missing.json()).toMatchObject({ mode: 'fixture', error: 'not_found' });
    // A valid UUID v1 is still invalid here: lookup reuses the admission UUID v4 schema exactly.
    for (const invalid of ['not-a-request-id', '00000000-0000-1000-8000-000000000000']) {
      const response = await app.request(`/api/tryon-requests/${invalid}`); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ mode: 'fixture', error: 'invalid_request' });
    }
    expect(await readFile(`${directory}/state.json`)).toEqual(stateBytes); expect(clients).toHaveLength(1); expect(clients[0]!.counts).toMatchObject({ posts: 1, gets: 0, downloads: 0 }); expect(disclosureCalls).toBe(0);
    expect(clients.map(client => client.counts)).toEqual(clientCounts);
    const replay = await app.request(`/api/listings/${listing.id}/tryon`, json(body)); expect(replay.status).toBe(200); expect((await replay.json()).jobs[0].id).toBe(job.id);
    expect(await readFile(`${directory}/state.json`)).toEqual(stateBytes); expect(clients).toHaveLength(1); expect(clients[0]!.counts.posts).toBe(1);
    expect(clients.map(client => client.counts)).toEqual(clientCounts);
    const conflict = await app.request(`/api/listings/${listing.id}/tryon`, json({ ...body, confirmCostCu: 1 })); expect(conflict.status).toBe(409); expect(await readFile(`${directory}/state.json`)).toEqual(stateBytes);
    expect(clients).toHaveLength(1); expect(clients[0]!.counts).toMatchObject({ posts: 1, gets: 0, downloads: 0 }); expect(disclosureCalls).toBe(0);
    expect(clients.map(client => client.counts)).toEqual(clientCounts);
    passed = true;
  } catch (error) {
    rememberFailure(error);
  } finally {
    // Refuse admission synchronously before cancellation, then join actual Runner cleanup.
    let joined = false, cleanupFailed = false;
    const cleanupFailure = (error: unknown) => { cleanupFailed = true; rememberFailure(error); };
    try { runner.stopAdmission(); } catch (error) { cleanupFailure(error); }
    try { signal.abort(); } catch (error) { cleanupFailure(error); }
    try { await runner.drain(); joined = true; } catch (error) { cleanupFailure(error); }
    // Disposal is independent of a rejected drain. Failed/unknown ownership never releases the lock.
    try { limiter.dispose(); } catch (error) { cleanupFailure(error); }
    if (joined && !cleanupFailed && !failed) {
      try { store.assertWritable(); await store.close(); } catch (error) { cleanupFailure(error); }
    }
    // Preserve synthetic evidence after any test/cleanup failure; retain the original failure value.
    if (passed && !failed) { try { await rm(directory, { recursive: true, force: true }); } catch (error) { cleanupFailure(error); } }
  }
  if (failed) throw failure;
}, 20_000);
