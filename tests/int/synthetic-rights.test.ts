import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
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
async function directory() { const root = await mkdtemp(`${realpathSync(os.tmpdir())}/yc-synthetic-`); directories.push(root); return root; }
// Rights seeding must never reach YouCam; any request fails the test.
function refusingTransport() {
  const requests: TransportRequest[] = [];
  const transport: Transport = { close() {}, async send(request) { requests.push(request); throw new Error('unexpected YouCam request'); } };
  return { transport, requests };
}
const generator = 'OpenAI built-in image generation tool';
async function setup(entries: (sha: string) => object[], provenance?: (sha: string) => unknown) {
  const root = await directory(), rights = `${root}/rights`; await mkdir(rights);
  const model = await readFile('assets/demo/model-front.png'), sha = createHash('sha256').update(model).digest('hex');
  await writeFile(`${rights}/model.png`, model);
  await writeFile(`${rights}/provenance.json`, JSON.stringify(provenance ? provenance(sha) : { assets: [{ file: 'model.png', sha256: sha, generator }] }));
  await writeFile(`${rights}/manifest.json`, JSON.stringify({ version: 1, entries: entries(sha) }));
  const fake = refusingTransport();
  const session = createFixtureSession(parseEnv({ YOUCAM_MODE: 'live', YOUCAM_API_KEY: 'fake-key-only', DATA_DIR: `${root}/data`, YOUCAM_RIGHTS_MANIFEST: `${rights}/manifest.json`, PORT: '5298' }), { liveTransport: fake.transport, armDeadline() {}, clearDeadline() {} });
  return { session, fake };
}
const synthetic = (sha: string, overrides: object = {}) => ({
  rightsId: 'synthetic-model', kind: 'synthetic_generated', displayLabel: 'Fictional sample model (AI-generated)',
  fictionalNoRealSubject: true, depictsAdult: true, generator, provenanceFile: 'provenance.json', generatedOn: '2026-10-23',
  scopes: ['development'], repoDistribution: 'local-only', noProminentThirdPartyMarks: true, file: 'model.png', sha256: sha, notes: 'test', ...overrides,
});
const human = (sha: string, overrides: object = {}) => ({
  rightsId: 'human-model', kind: 'person_self_consent', displayLabel: 'Consenting adult', subjectIsAdult: true, aiProcessingConsent: true, vendorRetentionDisclosed: true,
  scopes: ['development'], repoDistribution: 'local-only', noProminentThirdPartyMarks: true, licenceUrl: null, consentRecordedAt: new Date().toISOString(), file: 'model.png', sha256: sha, notes: 'test', ...overrides,
});

test('a documented fictional synthetic model is admitted with its own provenance; failing assertions are skipped', async () => {
  const { session, fake } = await setup(sha => [
    synthetic(sha),
    synthetic(sha, { rightsId: 'not-fictional', fictionalNoRealSubject: false }),
    synthetic(sha, { rightsId: 'not-adult', depictsAdult: false }),
    synthetic(sha, { rightsId: 'no-dev-scope', scopes: ['demo_video'] }),
    synthetic(sha, { rightsId: 'other-generator', generator: 'Some other tool' }),
    synthetic(sha, { rightsId: 'missing-provenance', provenanceFile: 'missing.json' }),
    synthetic('0'.repeat(64), { rightsId: 'wrong-hash' }),
    human(sha, { rightsId: 'no-consent', aiProcessingConsent: false }),
  ]);
  try {
    await session.ready;
    const { models } = await (await captured.app!.request('/api/models')).json();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ rightsId: 'synthetic-model', label: 'Fictional sample model (AI-generated)', source: 'rights_manifest', synthetic: false, provenance: 'ai_generated_fictional' });
  } finally { session.stop(); await session.wait(); }
  expect(fake.requests).toHaveLength(0);
});

test('provenance must list this file hash', async () => {
  const { session } = await setup(sha => [synthetic(sha)], () => ({ assets: [{ file: 'model.png', sha256: 'f'.repeat(64), generator }] }));
  try { await session.ready; expect((await (await captured.app!.request('/api/models')).json()).models).toEqual([]); }
  finally { session.stop(); await session.wait(); }
});

test('consented human entries keep their own provenance label', async () => {
  const { session } = await setup(sha => [human(sha)]);
  try { await session.ready; expect((await (await captured.app!.request('/api/models')).json()).models[0]).toMatchObject({ rightsId: 'human-model', provenance: 'recorded_consent' }); }
  finally { session.stop(); await session.wait(); }
});

test.each([
  ['a synthetic entry asserting human consent', (sha: string) => synthetic(sha, { aiProcessingConsent: true })],
  ['a synthetic entry asserting a consent date', (sha: string) => synthetic(sha, { consentRecordedAt: new Date().toISOString() })],
  ['a human entry claiming synthetic provenance', (sha: string) => human(sha, { fictionalNoRealSubject: true })],
  ['a synthetic entry with a provenance path outside the manifest folder', (sha: string) => synthetic(sha, { provenanceFile: '../provenance.json' })],
])('rejects the manifest for %s', async (_name, entry) => {
  const { session, fake } = await setup(sha => [entry(sha)]);
  await expect(session.ready).rejects.toMatchObject({ exitCode: 2, message: expect.stringContaining('Invalid rights manifest') });
  await session.wait().catch(() => undefined);
  expect(fake.requests).toHaveLength(0);
});
