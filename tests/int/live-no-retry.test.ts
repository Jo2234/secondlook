import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, expect, test, vi } from 'vitest';
import type { Hono } from 'hono';
import { parseEnv } from '../../src/shared/env.js';
import type { Transport, TransportRequest } from '../../src/youcam/transport.js';
import { createFixtureSession } from '../../src/server/fixture-session.js';
const captured = vi.hoisted(() => ({ app: undefined as Hono | undefined }));
vi.mock('../../src/server/app.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/server/app.js')>();
  return { ...actual, createApp: (...args: Parameters<typeof actual.createApp>) => { captured.app = actual.createApp(...args); return captured.app; } };
});
const directories: string[] = [];
afterAll(async () => { for (const directory of directories) await rm(directory, { recursive: true, force: true }); });
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const api = 'https://yce-api-01.makeupar.com', media = 'https://yce-us.s3-accelerate.amazonaws.com';
type Failure = 'slot_parse' | 'slot_500' | 'put_403' | 'put_500' | 'task_429';
// Documented response shapes; one step fails per scenario. No network is used.
function fakeTransport(failure: Failure) {
  const requests: TransportRequest[] = []; let slots = 0;
  const reply = (status: number, body: unknown) => ({ status, headers: { 'content-type': 'application/json' }, bytes: Buffer.from(JSON.stringify(body)) });
  const transport: Transport = { close() {}, async send(request) {
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path.includes('feature-cost')) return reply(200, { result: { skus: [{ description: 'Cloth v4', amount: 2, unit: 'result_image', proc_unit: 1, run_task_url: `${api}/s2s/v2.0/task/cloth-v4` }], next_token: null } });
    if (path === '/s2s/v1.0/client/credit') return reply(200, { results: [{ type: 'ApiPaygToken', amount_dec: 100, expiry: Date.now() + 86400000 }] });
    if (path === '/s2s/v2.0/file') {
      if (failure === 'slot_parse') return reply(200, { status: 200, data: {} });
      if (failure === 'slot_500') return reply(500, { status: 500, error: 'Internal' });
      return reply(200, { status: 200, data: { files: [{ file_id: `file-${++slots}`, requests: [{ method: 'PUT', url: `${media}/upload-${slots}`, headers: { 'Content-Type': 'image/jpg' } }] }] } });
    }
    if (request.method === 'PUT') return failure === 'put_403' ? reply(403, {}) : failure === 'put_500' ? reply(500, {}) : reply(200, {});
    if (request.method === 'POST' && path === '/s2s/v2.0/task/cloth-v4') return failure === 'task_429' ? reply(429, { status: 429, error: 'Too Many Requests' }) : reply(200, { status: 200, data: { task_id: 'task-one' } });
    throw new Error(`unexpected fake request: ${request.method} ${path}`);
  } };
  return { transport, requests };
}
async function runOnce(failure: Failure, port: string) {
  const root = await mkdtemp(`${realpathSync(os.tmpdir())}/yc-noretry-`); directories.push(root);
  const rights = `${root}/rights`; await mkdir(rights);
  const model = await readFile('assets/demo/model-front.png'), garment = await readFile('assets/demo/tee.png');
  await writeFile(`${rights}/model.png`, model);
  await writeFile(`${rights}/manifest.json`, JSON.stringify({ version: 1, entries: [{ rightsId: 'test-model', kind: 'person_self_consent', displayLabel: 'Consenting test model', subjectIsAdult: true, aiProcessingConsent: true, vendorRetentionDisclosed: true, scopes: ['development'], repoDistribution: 'local-only', noProminentThirdPartyMarks: true, licenceUrl: null, consentRecordedAt: new Date().toISOString(), file: 'model.png', sha256: createHash('sha256').update(model).digest('hex'), notes: '' }] }));
  const fake = fakeTransport(failure);
  const session = createFixtureSession(parseEnv({ YOUCAM_MODE: 'live', YOUCAM_API_KEY: 'fake-key-only', DATA_DIR: `${root}/data`, YOUCAM_RIGHTS_MANIFEST: `${rights}/manifest.json`, PORT: port }), { liveTransport: fake.transport, armDeadline() {}, clearDeadline() {} });
  try {
    await session.ready; const app = captured.app!;
    const { models } = await (await app.request('/api/models')).json();
    const form = new FormData(); form.set('role', 'garment'); form.set('file', new File([garment], 'tee.png', { type: 'image/png' }));
    const { photo } = await (await app.request('/api/photos', { method: 'POST', body: form })).json();
    const declaration = { photoType: 'hanger', category: 'upper_body', singleGarment: true, frontFacing: true, notComposite: true, fullyVisible: true, noPeopleInPhoto: true };
    await app.request(`/api/photos/${photo.id}/evaluate`, json({ declaration }));
    const listing = await (await app.request('/api/listings', json({ title: 'Test top', conditionNotes: '', priceText: null, garmentPhotoIds: [photo.id], declaration, measurements: { category: 'upper_body', valuesMm: { pit_to_pit: 520, length: 680, shoulder: 450, sleeve: 'na' }, enteredUnit: 'cm', tagSize: null } }))).json();
    expect((await app.request('/api/units/preflight', json({}))).status).toBe(200);
    const admitted = await app.request(`/api/listings/${listing.id}/tryon`, json({ requestId: randomUUID(), garmentPhotoId: photo.id, modelPhotoIds: [models[0].photoId], confirmCostCu: 200 }));
    expect(admitted.status).toBe(200); const { jobs } = await admitted.json();
    let job;
    for (let i = 0; i < 200; i++) {
      job = await (await app.request(`/api/jobs/${jobs[0].id}`)).json();
      if (['succeeded', 'failed', 'uncertain', 'timed_out', 'cancelled'].includes(job.attempts.at(-1).state)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const units = await (await app.request('/api/units')).json();
    const count = (method: string, pathname: string) => fake.requests.filter(r => r.method === method && new URL(r.url).pathname === pathname).length;
    return { attempt: job.attempts.at(-1), ledger: units.ledger, filePosts: count('POST', '/s2s/v2.0/file'), puts: fake.requests.filter(r => r.method === 'PUT').length, taskPosts: count('POST', '/s2s/v2.0/task/cloth-v4') };
  } finally { session.stop(); await session.wait(); }
}

test.each([
  ['slot response that does not parse', 'slot_parse', 5291],
  ['slot request answered with HTTP 500', 'slot_500', 5292],
] as const)('live: a %s sends exactly one File API slot POST, no PUT and no task, and releases the units', async (_name, failure, port) => {
  const r = await runOnce(failure, String(port));
  expect({ filePosts: r.filePosts, puts: r.puts, taskPosts: r.taskPosts }).toEqual({ filePosts: 1, puts: 0, taskPosts: 0 });
  expect(r.attempt).toMatchObject({ state: 'failed', postCount: 0, taskId: null, error: { code: 'upload_failed' } });
  expect(r.ledger).toMatchObject([{ state: 'released', reason: 'upload_failed' }]);
}, 20_000);

test.each([
  ['403 (no slot refresh)', 'put_403', 5293],
  ['HTTP 500', 'put_500', 5294],
] as const)('live: a presigned PUT failing with %s sends exactly one slot POST and one PUT, no task, and releases the units', async (_name, failure, port) => {
  const r = await runOnce(failure, String(port));
  expect({ filePosts: r.filePosts, puts: r.puts, taskPosts: r.taskPosts }).toEqual({ filePosts: 1, puts: 1, taskPosts: 0 });
  expect(r.attempt).toMatchObject({ state: 'failed', postCount: 0, taskId: null, error: { code: 'upload_failed' } });
  expect(r.ledger).toMatchObject([{ state: 'released', reason: 'upload_failed' }]);
}, 20_000);

test('live: a 429 on the cloth-task POST is not re-submitted; the reservation is released', async () => {
  const r = await runOnce('task_429', '5295');
  expect({ filePosts: r.filePosts, puts: r.puts, taskPosts: r.taskPosts }).toEqual({ filePosts: 2, puts: 2, taskPosts: 1 });
  expect(r.attempt).toMatchObject({ state: 'failed', postCount: 1, taskId: null, error: { code: 'rate_limited' } });
  expect(r.ledger).toMatchObject([{ state: 'released' }]);
}, 20_000);
