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
  const runner = new Runner({ store, limiter, signal: signal.signal, taskDeadlineMs: 60_000,
    client: () => { const client = new FixtureClient({ scenario: 'post_transport_error', now: systemClock.now, result: async () => { throw new Error('download forbidden after ambiguous POST'); } }); clients.push(client); return client; },
    disclose: async () => { throw new Error('disclosure forbidden after ambiguous POST'); },
  });
  let passed = false;
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
    const payload = await result.json(), job = payload.jobs[0]; expect(payload.mode).toBe('fixture'); expect(job.attempts[0]).toMatchObject({ state: 'uncertain', postCount: 1 });
    expect(store.snapshot().ledger).toHaveLength(1); expect(store.snapshot().ledger[0]!.state).toBe('possibly_spent'); expect(clients[0]!.counts.posts).toBe(1);
    const stateBytes = await readFile(`${directory}/state.json`);
    const replay = await app.request(`/api/listings/${listing.id}/tryon`, json(body)); expect(replay.status).toBe(200); expect((await replay.json()).jobs[0].id).toBe(job.id);
    expect(await readFile(`${directory}/state.json`)).toEqual(stateBytes); expect(clients).toHaveLength(1);
    const conflict = await app.request(`/api/listings/${listing.id}/tryon`, json({ ...body, confirmCostCu: 1 })); expect(conflict.status).toBe(409); expect(await readFile(`${directory}/state.json`)).toEqual(stateBytes);
    passed = true;
  } finally {
    signal.abort(); await runner.drain(); limiter.dispose(); await store.close();
    // A failed run retains its synthetic state evidence. Both outcomes release only the owner's lock.
    if (passed) await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
