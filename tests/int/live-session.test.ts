import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, expect, test, vi } from 'vitest';
import type { Hono } from 'hono';
import type { Store } from '../../src/server/store.js';
import { parseEnv } from '../../src/shared/env.js';
import type { Transport, TransportRequest } from '../../src/youcam/transport.js';
import { YouCamError } from '../../src/youcam/client.js';
import { createFixtureSession } from '../../src/server/fixture-session.js';
const captured = vi.hoisted(() => ({ app: undefined as Hono | undefined, store: undefined as Store | undefined }));
vi.mock('../../src/server/app.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/server/app.js')>();
  return { ...actual, createApp: (...args: Parameters<typeof actual.createApp>) => { captured.store = args[1]?.store; captured.app = actual.createApp(...args); return captured.app; } };
});
const directories: string[] = [];
afterAll(async () => { for (const directory of directories) await rm(directory, { recursive: true, force: true }); });
async function directory() { const root = await mkdtemp(`${realpathSync(os.tmpdir())}/yc-live-`); directories.push(root); return root; }
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const api = 'https://yce-api-01.makeupar.com', media = 'https://yce-us.s3-accelerate.amazonaws.com';
function fakeTransport(result: Uint8Array) {
  const requests: TransportRequest[] = []; let closed = false, authFailure = false, slots = 0;
  const transport: Transport = { close: () => { closed = true; }, async send(request) {
    requests.push(request);
    if (authFailure) throw new YouCamError('http', { http: 403 });
    const path = new URL(request.url).pathname;
    let body: unknown;
    if (path.includes('feature-cost')) body = { result: { skus: [{ description: 'Cloth v4', amount: 2, unit: 'result_image', proc_unit: 1, run_task_url: `${api}/s2s/v2.0/task/cloth-v4` }], next_token: null } };
    else if (path === '/s2s/v1.0/client/credit') body = { results: [{ type: 'ApiPaygToken', amount_dec: 100, expiry: Date.now() + 86400000 }] };
    // Shapes follow the AI Clothes guide samples ({ status, data }), which differ from the File API reference page.
    else if (path === '/s2s/v2.0/file') body = { status: 200, data: { files: [{ file_id: `file-${++slots}`, requests: [{ method: 'PUT', url: `${media}/upload-${slots}`, headers: { 'Content-Type': 'image/jpg' } }] }] } };
    else if (request.method === 'PUT') body = {};
    else if (request.method === 'POST' && path === '/s2s/v2.0/task/cloth-v4') body = { data: { task_id: 'task-one' } };
    else if (path === '/s2s/v2.0/task/cloth-v4/task-one') body = { status: 200, data: { error: null, results: { url: `${media}/result.png` }, task_status: 'success' } };
    else if (path === '/result.png') return { status: 200, headers: { 'content-type': 'image/png' }, bytes: result };
    else throw new Error(`unexpected fake request: ${request.method} ${path}`);
    return { status: 200, headers: { 'content-type': 'application/json' }, bytes: Buffer.from(JSON.stringify(body)) };
  } };
  return { transport, requests, closed: () => closed, failAuth: () => { authFailure = true; } };
}
test('live session uses eligible rights, free preflight, durable admission and real HTTP client protocol with fake transport', async () => {
  const root = await directory(), dataDir = `${root}/data`, rightsDir = `${root}/rights`;
  await mkdir(rightsDir);
  const model = await readFile('assets/demo/model-front.png'), garmentBytes = await readFile('assets/demo/tee.png');
  await writeFile(`${rightsDir}/model.png`, model);
  const entry = { rightsId: 'test-model', kind: 'person_self_consent', displayLabel: 'Consenting test model', subjectIsAdult: true, aiProcessingConsent: true, vendorRetentionDisclosed: true, scopes: ['development'], repoDistribution: 'local-only', noProminentThirdPartyMarks: false, licenceUrl: null, consentRecordedAt: new Date().toISOString(), file: 'model.png', sha256: createHash('sha256').update(model).digest('hex'), notes: 'Synthetic test data only' };
  await writeFile(`${rightsDir}/manifest.json`, JSON.stringify({ version: 1, entries: [entry, { ...entry, rightsId: 'not-consented', aiProcessingConsent: false }] }));
  const fake = fakeTransport(model);
  const env = parseEnv({ YOUCAM_MODE: 'live', YOUCAM_API_KEY: 'fake-key-only', DATA_DIR: dataDir, YOUCAM_RIGHTS_MANIFEST: `${rightsDir}/manifest.json`, PORT: '5299' });
  const session = createFixtureSession(env, { liveTransport: fake.transport, armDeadline() {}, clearDeadline() {} });
  try {
    await session.ready; const app = captured.app!;
    const models = await (await app.request('/api/models')).json(); expect(models.models).toHaveLength(1);
    expect(models.models[0]).toMatchObject({ rightsId: 'test-model', label: entry.displayLabel, synthetic: false, source: 'rights_manifest', provenance: 'recorded_consent' });
    const form = new FormData(); form.set('role', 'garment'); form.set('file', new File([garmentBytes], 'tee.png', { type: 'image/png' }));
    const upload = await app.request('/api/photos', { method: 'POST', body: form }); expect(upload.status).toBe(200);
    const { photo } = await upload.json(); expect(photo.mode).toBe('live');
    const declaration = { photoType: 'hanger', category: 'upper_body', singleGarment: true, frontFacing: true, notComposite: true, fullyVisible: true, noPeopleInPhoto: true };
    const quality = await app.request(`/api/photos/${photo.id}/evaluate`, json({ declaration })); expect((await quality.json()).spendAllowed).toBe(true);
    const saved = await app.request('/api/listings', json({ title: 'Test top', conditionNotes: '', priceText: null, garmentPhotoIds: [photo.id], declaration, measurements: { category: 'upper_body', valuesMm: { pit_to_pit: 520, length: 680, shoulder: 450, sleeve: 'na' }, enteredUnit: 'cm', tagSize: null } }));
    expect(saved.status).toBe(200); const listing = await saved.json();
    const body = { requestId: randomUUID(), garmentPhotoId: photo.id, modelPhotoIds: [models.models[0].photoId], confirmCostCu: 200 };
    const tryon = (overrides = {}) => app.request(`/api/listings/${listing.id}/tryon`, json({ ...body, requestId: randomUUID(), ...overrides }));
    const before = await tryon(); expect(before.status).toBe(409); expect(await before.json()).toMatchObject({ error: 'cost_unknown' }); expect(fake.requests).toHaveLength(0);
    const preflight = await app.request('/api/units/preflight', json({})); expect(preflight.status).toBe(200);
    expect(await preflight.json()).toMatchObject({ preflight: { ok: true, featureCost: { costPerTaskCu: 200 } } });
    expect(fake.requests.map(r => r.method)).toEqual(['GET', 'GET']);
    const wrong = await tryon({ confirmCostCu: 199 }); expect(wrong.status).toBe(409); expect(await wrong.json()).toMatchObject({ error: 'cost_mismatch' });
    // A stored synthetic fixture model still cannot pass live rights checks.
    const statePath = `${dataDir}/state.json`;
    const stateBefore = JSON.parse(await readFile(statePath, 'utf8'));
    expect(stateBefore.photos.filter((p: { source: string }) => p.source === 'synthetic')).toHaveLength(0);
    await captured.store!.commit(state => { state.photos.push({ ...state.photos.find(p => p.role === 'model')!, id: 'f'.repeat(20), source: 'synthetic', mode: 'fixture', rightsId: null }); return state; });
    expect((await (await app.request('/api/models')).json()).models).toHaveLength(1);
    const refused = await tryon({ modelPhotoIds: ['f'.repeat(20)] }); expect(refused.status).toBe(409); expect(await refused.json()).toMatchObject({ error: 'rights_missing' });
    expect(fake.requests.filter(r => r.method === 'POST')).toHaveLength(0);
    const admitted = await tryon(); expect(admitted.status).toBe(200); const { jobs } = await admitted.json();
    let job;
    for (let i = 0; i < 150; i++) {
      job = await (await app.request(`/api/jobs/${jobs[0].id}`)).json();
      if (['succeeded', 'failed', 'uncertain', 'timed_out'].includes(job.attempts.at(-1).state)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(job.attempts.at(-1).state).toBe('succeeded');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    expect(state.images[0]).toMatchObject({ mode: 'live', label: 'ai_tryon_approximate' }); expect(state.ledger[0].state).toBe('spent');
    const count = (method: string, path: string) => fake.requests.filter(r => r.method === method && new URL(r.url).pathname === path).length;
    expect(count('POST', '/s2s/v2.0/file')).toBe(2); expect(fake.requests.filter(r => r.method === 'PUT')).toHaveLength(2);
    expect(count('POST', '/s2s/v2.0/task/cloth-v4')).toBe(1); expect(count('GET', '/s2s/v2.0/task/cloth-v4/task-one')).toBeGreaterThanOrEqual(1); expect(count('GET', '/result.png')).toBe(1);
    for (const request of fake.requests) expect(Object.keys(request.headers).some(k => k.toLowerCase() === 'authorization')).toBe(new URL(request.url).origin === api);
    fake.failAuth();
    const failed = await app.request('/api/units/preflight', json({})); expect(failed.status).toBe(502); expect(await failed.json()).toEqual({ mode: 'live', error: 'preflight_failed', reason: 'auth' });
    expect(JSON.parse(await readFile(statePath, 'utf8')).observing).toBe(false);
  } finally { session.stop(); await session.wait(); }
  expect(fake.closed()).toBe(true); expect(session.status().safeClosure).toBe(true);
}, 20_000);

test('live startup tolerates missing rights and rejects malformed manifests without transport requests', async () => {
  for (const malformed of [false, true]) {
    const root = await directory(), dataDir = `${root}/data`, manifest = `${root}/manifest.json`, fake = fakeTransport(new Uint8Array());
    if (malformed) await writeFile(manifest, '{broken');
    const session = createFixtureSession(parseEnv({ YOUCAM_MODE: 'live', YOUCAM_API_KEY: 'fake-key-only', DATA_DIR: dataDir, YOUCAM_RIGHTS_MANIFEST: manifest, PORT: '5299' }), { liveTransport: fake.transport, armDeadline() {}, clearDeadline() {} });
    if (malformed) { await expect(session.ready).rejects.toMatchObject({ exitCode: 2, message: expect.stringContaining('Invalid rights manifest') }); await session.wait().catch(() => undefined); expect(session.status().storeAcquired).toBe(false); }
    else { try { await session.ready; expect((await (await captured.app!.request('/api/models')).json()).models).toEqual([]); } finally { session.stop(); await session.wait(); } }
    expect(fake.requests).toHaveLength(0); expect(fake.closed()).toBe(true);
  }
});
