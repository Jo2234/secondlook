// R59 DRAFT_UNRUN: six pure production-seam cases; no real FS/Store/factory/native execution.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RetainedStoreIO, readBoundedStoreData, readStoreOpenOutcome, recoverStoreArtifact,
  prepareStoreCommit, serializeStoreCommit, storeReadValue } from '../../src/server/store.js';
import type { StateStore } from '../../src/server/store.js';
import { emptyState } from '../../src/youcam/workflow-state.js';
import type { GeneratedImage } from '../../src/shared/types.js';

type Handle = { close(): Promise<void> };
const positiveBytes = new Uint8Array([1, 2, 3]);
function image(): GeneratedImage {
  return { id: 'a'.repeat(20), listingId: null, buyerSessionId: null, jobId: 'b'.repeat(20),
    mode: 'fixture', disclosedPath: `generated/${'a'.repeat(20)}.jpg`, width: 1, height: 1,
    label: 'demo_fixture', sha256: createHash('sha256').update(positiveBytes).digest('hex'),
    artifactMissing: false, createdAt: '2026-10-19T00:00:00.000Z', expiresAt: null };
}
// Inject only a commit primitive into the actual recovery helper. Preparation/serialization/IO
// disposition use production functions; this is not an actual Store or filesystem implementation.
function recoveryStore(io: RetainedStoreIO<Handle>, initial: GeneratedImage) {
  let current = emptyState(), tail: Promise<unknown> = Promise.resolve(), publications = 0;
  current.images.push(initial);
  const store: StateStore = {
    snapshot: () => structuredClone(current),
    commit: change => {
      const result = serializeStoreCommit(tail, () => {
        io.assertHealthy(); return prepareStoreCommit(current, change, 2097152);
      }, prepared => io.startCommit(async () => {
        publications++; current = prepared.next; return structuredClone(current);
      }));
      tail = result.catch(() => undefined); return result;
    },
  };
  return { store, publications: () => publications };
}
describe('R59 recovery absence — six DRAFT_UNRUN cases', () => {
  it('carries initial open ENOENT through the outer observer, preserves it for readers and allows recovery/later commit', async () => {
    const io = new RetainedStoreIO<Handle>(), original = Object.assign(new Error('missing'), { code: 'ENOENT' });
    let reads = 0;
    const outcome = await io.run('read', () => readStoreOpenOutcome(io, async () => {
      expect(io.status().pending).toBe(1); throw original;
    }, async () => { reads++; return positiveBytes; }));
    expect(outcome).toEqual({ kind: 'missing', error: original }); expect(reads).toBe(0);
    await expect(Promise.resolve(outcome).then(storeReadValue)).rejects.toBe(original);
    expect(io.status()).toMatchObject({ unknown: false, faults: 0, handles: 0, pending: 0, retainedOperations: 0 });
    const initial = image(), q = recoveryStore(io, initial);
    await recoverStoreArtifact(q.store, initial, outcome);
    expect(q.store.snapshot().images[0]!.artifactMissing).toBe(true);
    await q.store.commit(state => { state.observing = true; return state; });
    expect(q.store.snapshot().seq).toBe(2); expect(q.publications()).toBe(2);
    await io.join(); io.release();
  });
  it('keeps an initial permission failure UNKNOWN without a handle or recovery mutation', async () => {
    const io = new RetainedStoreIO<Handle>(), original = Object.assign(new Error('permission'), { code: 'EACCES' });
    const initial = image(), q = recoveryStore(io, initial);
    await expect(io.run('read', async () => recoverStoreArtifact(q.store, initial,
      await readStoreOpenOutcome(io, async () => { throw original; }, async () => positiveBytes)))).rejects.toThrow('store_io_UNKNOWN');
    expect(q.store.snapshot().images[0]!.artifactMissing).toBe(false); expect(q.publications()).toBe(0);
    expect(io.status()).toMatchObject({ unknown: true, handles: 0, pending: 0 });
    await expect(q.store.commit(state => state)).rejects.toThrow('store_io_UNKNOWN');
    await expect(io.join()).rejects.toThrow(); expect(() => io.release()).toThrow();
  });
  it('never classifies a post-open read ENOENT as absence, and still closes the captured handle', async () => {
    const io = new RetainedStoreIO<Handle>(); let closes = 0;
    const handle = { close: async () => { closes++; } };
    await expect(io.run('read', () => readStoreOpenOutcome(io, async () => handle, async () => {
      expect(io.status().handles).toBe(1); throw Object.assign(new Error('read'), { code: 'ENOENT' });
    }))).rejects.toThrow('store_io_UNKNOWN');
    expect(closes).toBe(1); expect(io.status()).toMatchObject({ unknown: true, handles: 0, pending: 0 });
    const laterAbsence = await io.run('read', () => readStoreOpenOutcome(io,
      async () => { throw Object.assign(new Error('later absence'), { code: 'ENOENT' }); }, async () => positiveBytes));
    expect(laterAbsence.kind).toBe('missing'); expect(io.status().unknown).toBe(true);
    await expect(io.join()).rejects.toThrow(); expect(() => io.release()).toThrow();
  });
  it('keeps the actual bounded-reader identity refusal UNKNOWN after successful close', async () => {
    const io = new RetainedStoreIO<Handle>(); let closes = 0;
    await expect(io.run('read', () => readStoreOpenOutcome(io, async () => ({ close: async () => { closes++; } }),
      async () => readBoundedStoreData(4, { size: async () => 0, read: async () => 0, unchanged: async () => false })))).rejects.toThrow('store_io_UNKNOWN');
    expect(closes).toBe(1); expect(io.status()).toMatchObject({ unknown: true, handles: 0, pending: 0 });
    await expect(io.join()).rejects.toThrow(); expect(() => io.release()).toThrow();
  });
  it('withholds positive bytes on close ENOENT and retains the actual handle/task without retry', async () => {
    const io = new RetainedStoreIO<Handle>(); let closes = 0;
    const handle = { close: async () => { closes++; throw Object.assign(new Error('close'), { code: 'ENOENT' }); } };
    await expect(io.run('read', () => readStoreOpenOutcome(io, async () => handle, async () => positiveBytes))).rejects.toThrow('store_io_UNKNOWN');
    const failedClose = io.closeHandle(handle);
    await expect(failedClose).rejects.toThrow(); expect(io.closeHandle(handle)).toBe(failedClose);
    expect(closes).toBe(1); expect(io.status()).toMatchObject({ unknown: true, handles: 1, pending: 0 });
    expect(io.status().retainedOperations).toBeGreaterThan(0);
    await expect(io.join()).rejects.toThrow(); expect(() => io.release()).toThrow();
  });
  it('preserves positive-byte hash matching, mismatch recovery and already-missing state without extra commits', async () => {
    const io = new RetainedStoreIO<Handle>(), initial = image(), q = recoveryStore(io, initial); let closes = 0;
    const outcome = await io.run('read', () => readStoreOpenOutcome(io,
      async () => ({ close: async () => { closes++; } }), async () => positiveBytes));
    expect(storeReadValue(outcome)).toBe(positiveBytes); expect(closes).toBe(1);
    await recoverStoreArtifact(q.store, initial, outcome);
    expect(q.store.snapshot().images[0]!.artifactMissing).toBe(false); expect(q.publications()).toBe(0);
    const mismatch = await io.run('read', () => readStoreOpenOutcome(io,
      async () => ({ close: async () => { closes++; } }), async () => new Uint8Array([9])));
    await recoverStoreArtifact(q.store, initial, mismatch);
    const marked = q.store.snapshot().images[0]!;
    expect(marked.artifactMissing).toBe(true); expect(q.publications()).toBe(1);
    await recoverStoreArtifact(q.store, marked, mismatch); await recoverStoreArtifact(q.store, marked, outcome);
    expect(q.publications()).toBe(1); expect(q.store.snapshot().images[0]!.artifactMissing).toBe(true);
    expect(closes).toBe(2); expect(io.status()).toMatchObject({ unknown: false, handles: 0, pending: 0, retainedOperations: 0 });
    await io.join(); io.release();
  });
});
