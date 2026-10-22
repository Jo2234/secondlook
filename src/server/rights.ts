import { open, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { EnvError } from '../shared/env.js';
import type { AppEnv } from '../shared/env.js';
import { analyzePhoto } from '../images/raster.js';
import type { Store } from './store.js';
import { newId } from './routes/fixture.js';
const entrySchema = z.object({
  rightsId: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  kind: z.enum(['person_self_consent', 'person_written_consent', 'stock_licence']),
  displayLabel: z.string().min(1).max(60), subjectIsAdult: z.boolean(), aiProcessingConsent: z.boolean(), vendorRetentionDisclosed: z.boolean(),
  scopes: z.array(z.enum(['development', 'demo_video', 'repo'])), repoDistribution: z.enum(['allowed', 'local-only']),
  noProminentThirdPartyMarks: z.boolean(), licenceUrl: z.string().nullable(), consentRecordedAt: z.iso.datetime(),
  file: z.string().min(1).refine(s => !isAbsolute(s) && !/^[a-z]:/i.test(s) && !s.includes('\\') && !s.split('/').includes('..')),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), notes: z.string(),
});
const manifestSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema) }).refine(m => new Set(m.entries.map(e => e.rightsId)).size === m.entries.length);
export type EligibleRights = ReadonlyMap<string, { displayLabel: string; sha256: string }>;
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
  const { manifest, entries } = input, eligible = new Map<string, { displayLabel: string; sha256: string }>();
  for (const entry of entries) {
    const skip = (field: string) => console.error(`rights_manifest ${entry.rightsId}: ${field}`);
    const failed = !entry.subjectIsAdult ? 'subjectIsAdult' : !entry.aiProcessingConsent ? 'aiProcessingConsent' : !entry.vendorRetentionDisclosed ? 'vendorRetentionDisclosed' : !entry.scopes.includes('development') ? 'scopes' : null;
    if (failed) { skip(failed); continue; }
    let bytes: Uint8Array;
    try {
      const base = await realpath(dirname(manifest)), file = await realpath(resolve(base, entry.file)), path = relative(base, file);
      if (isAbsolute(path) || path.split('/').includes('..')) { skip('file'); continue; }
      const handle = await open(file, 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 10_000_000) { skip('file_size'); continue; }
        // Bound the read even if the file grows after stat.
        const buffer = Buffer.alloc(10_000_001); let size = 0;
        while (size < buffer.length) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size); if (!bytesRead) break; size += bytesRead; }
        if (size > 10_000_000) { skip('file_size'); continue; }
        bytes = buffer.subarray(0, size);
      } finally { await handle.close(); }
    } catch { skip('file'); continue; }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== entry.sha256.toLowerCase()) { skip('sha256'); continue; }
    const existing = store.snapshot().photos.some(p => p.role === 'model' && p.mode === 'live' && p.source === 'rights_manifest' && p.rightsId === entry.rightsId && p.original.sha256 === sha256);
    if (!existing) {
      let analyzed: Awaited<ReturnType<typeof analyzePhoto>>;
      try { analyzed = await analyzePhoto(bytes); } catch { skip('file'); continue; }
      const { photo } = analyzed, id = newId(), path = `photos/${id}.jpg`;
      await store.writeMedia(path, photo.data);
      await store.commit(state => { state.photos.push({ id, role: 'model', mode: 'live', source: 'rights_manifest', rightsId: entry.rightsId, original: photo.original, normalized: { ...photo.normalized, path }, createdAt: new Date().toISOString(), expiresAt: null }); return state; });
    }
    eligible.set(entry.rightsId, { displayLabel: entry.displayLabel, sha256 });
  }
  return eligible;
}
