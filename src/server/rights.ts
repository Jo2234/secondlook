import { open, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { EnvError } from '../shared/env.js';
import type { AppEnv } from '../shared/env.js';
import { analyzePhoto } from '../images/raster.js';
import type { Store } from './store.js';
import { newId } from './routes/fixture.js';
const relativeFile = z.string().min(1).refine(s => !isAbsolute(s) && !/^[a-z]:/i.test(s) && !s.includes('\\') && !s.split('/').includes('..'));
const common = {
  rightsId: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/), displayLabel: z.string().min(1).max(60),
  scopes: z.array(z.enum(['development', 'demo_video', 'repo'])), repoDistribution: z.enum(['allowed', 'local-only']),
  noProminentThirdPartyMarks: z.boolean(), file: relativeFile, sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), notes: z.string(),
};
// Real people or licensed stock: admission needs the recorded human consent assertions.
const humanEntrySchema = z.strictObject({
  ...common, kind: z.enum(['person_self_consent', 'person_written_consent', 'stock_licence']),
  subjectIsAdult: z.boolean(), aiProcessingConsent: z.boolean(), vendorRetentionDisclosed: z.boolean(),
  licenceUrl: z.string().nullable(), consentRecordedAt: z.iso.datetime(),
});
// A generated picture of a fictional adult. It carries no consent fields, so it can never assert that a real person agreed.
const syntheticEntrySchema = z.strictObject({
  ...common, kind: z.literal('synthetic_generated'),
  fictionalNoRealSubject: z.boolean(), depictsAdult: z.boolean(), generator: z.string().min(1).max(120),
  provenanceFile: relativeFile, generatedOn: z.iso.date(),
});
const entrySchema = z.discriminatedUnion('kind', [humanEntrySchema, syntheticEntrySchema]);
const provenanceSchema = z.object({ assets: z.array(z.object({ sha256: z.string(), generator: z.string() }).loose()) }).loose();
const manifestSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema) }).refine(m => new Set(m.entries.map(e => e.rightsId)).size === m.entries.length);
export type RightsProvenance = 'recorded_consent' | 'ai_generated_fictional';
export type EligibleRights = ReadonlyMap<string, { displayLabel: string; sha256: string; provenance: RightsProvenance }>;
/** Validate configuration before acquiring the data-dir owner lock. */
export async function loadRightsManifest(env: AppEnv) {
  const manifest = resolve(env.rightsManifest ?? resolve(env.dataDir, 'rights/manifest.json'));
  let raw: string;
  try { raw = await readFile(manifest, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { manifest, entries: [] }; throw new EnvError('Cannot read rights manifest'); }
  let parsed: z.infer<typeof manifestSchema>;
  try { parsed = manifestSchema.parse(JSON.parse(raw)); }
  catch { throw new EnvError('Invalid rights manifest: expected version 1 and valid entries'); }
  return { manifest, entries: parsed.entries };
}
/** Startup snapshot: only verified originals are admitted or advertised by this session. */
export async function seedRightsModels(store: Store, input: Awaited<ReturnType<typeof loadRightsManifest>>): Promise<EligibleRights> {
  const { manifest, entries } = input, eligible = new Map<string, { displayLabel: string; sha256: string; provenance: RightsProvenance }>();
  for (const entry of entries) {
    const skip = (field: string) => console.error(`rights_manifest ${entry.rightsId}: ${field}`);
    const failed = entry.kind === 'synthetic_generated'
      ? !entry.fictionalNoRealSubject ? 'fictionalNoRealSubject' : !entry.depictsAdult ? 'depictsAdult' : !entry.scopes.includes('development') ? 'scopes' : null
      : !entry.subjectIsAdult ? 'subjectIsAdult' : !entry.aiProcessingConsent ? 'aiProcessingConsent' : !entry.vendorRetentionDisclosed ? 'vendorRetentionDisclosed' : !entry.scopes.includes('development') ? 'scopes' : null;
    if (failed) { skip(failed); continue; }
    const bytes = await readConfined(manifest, entry.file, 10_000_000);
    if (typeof bytes === 'string') { skip(bytes); continue; }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== entry.sha256.toLowerCase()) { skip('sha256'); continue; }
    if (entry.kind === 'synthetic_generated') {
      // The provenance record must name this exact file hash and the same generator.
      const record = await readConfined(manifest, entry.provenanceFile, 64_000);
      let documented = false;
      if (typeof record !== 'string') { try { documented = provenanceSchema.parse(JSON.parse(Buffer.from(record).toString('utf8'))).assets.some(a => a.sha256.toLowerCase() === sha256 && a.generator === entry.generator); } catch { documented = false; } }
      if (!documented) { skip('provenance'); continue; }
    }
    const existing = store.snapshot().photos.some(p => p.role === 'model' && p.mode === 'live' && p.source === 'rights_manifest' && p.rightsId === entry.rightsId && p.original.sha256 === sha256);
    if (!existing) {
      let analyzed: Awaited<ReturnType<typeof analyzePhoto>>;
      try { analyzed = await analyzePhoto(bytes); } catch { skip('file'); continue; }
      const { photo } = analyzed, id = newId(), path = `photos/${id}.jpg`;
      await store.writeMedia(path, photo.data);
      await store.commit(state => { state.photos.push({ id, role: 'model', mode: 'live', source: 'rights_manifest', rightsId: entry.rightsId, original: photo.original, normalized: { ...photo.normalized, path }, createdAt: new Date().toISOString(), expiresAt: null }); return state; });
    }
    eligible.set(entry.rightsId, { displayLabel: entry.displayLabel, sha256, provenance: entry.kind === 'synthetic_generated' ? 'ai_generated_fictional' : 'recorded_consent' });
  }
  return eligible;
}
/** Read a file that must stay inside the manifest directory; returns a skip reason on failure. */
async function readConfined(manifest: string, name: string, limit: number): Promise<Uint8Array | 'file' | 'file_size'> {
  try {
    const base = await realpath(dirname(manifest)), file = await realpath(resolve(base, name)), path = relative(base, file);
    if (isAbsolute(path) || path.split('/').includes('..')) return 'file';
    const handle = await open(file, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > limit) return 'file_size';
      // Bound the read even if the file grows after stat.
      const buffer = Buffer.alloc(limit + 1); let size = 0;
      while (size < buffer.length) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size); if (!bytesRead) break; size += bytesRead; }
      return size > limit ? 'file_size' : buffer.subarray(0, size);
    } finally { await handle.close(); }
  } catch { return 'file'; }
}
