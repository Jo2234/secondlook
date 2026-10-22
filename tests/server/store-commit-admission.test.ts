// R57 DRAFT_UNRUN: six pure production-seam cases. No FS/native/factory execution.
import { describe, expect, it } from 'vitest';
import { RetainedStoreIO, ownedStoreReadFlags, prepareStoreCommit, serializeStoreCommit } from '../../src/server/store.js';
import { emptyState } from '../../src/youcam/workflow-state.js';
import type { WorkflowState } from '../../src/youcam/workflow-state.js';

function queue() {
  const io = new RetainedStoreIO<{ close(): Promise<void> }>();
  let state = emptyState(), tail: Promise<unknown> = Promise.resolve(), writes = 0;
  return {
    io, snapshot: () => structuredClone(state), writes: () => writes,
    commit(change: (state: WorkflowState) => WorkflowState, cap = 2097152, write?: () => Promise<void>) {
      const result = serializeStoreCommit(tail, () => {
        io.assertHealthy(); return prepareStoreCommit(state, change, cap);
      }, prepared => io.startCommit(async () => {
        expect(io.status().pending).toBe(1); writes++;
        await write?.(); state = prepared.next; return structuredClone(state);
      }));
      tail = result.catch(() => undefined); return result;
    },
  };
}
describe('R57 commit admission boundary — six DRAFT_UNRUN cases', () => {
  it('preserves the exact callback exception and clone with no IO record', async () => {
    const q = queue(), business = { reason: 'ordinary_admission_rejection' };
    await expect(q.commit(state => { state.observing = true; throw business; })).rejects.toBe(business);
    expect(q.snapshot()).toEqual(emptyState()); expect(q.writes()).toBe(0);
    expect(q.io.status()).toMatchObject({ unknown: false, faults: 0, pending: 0, retainedOperations: 0 });
    await q.io.join(); q.io.release();
  });
  it('keeps actual bounds, schema and body-cap failures before all IO publication', async () => {
    const q = queue();
    await expect(q.commit(state => { state.photos.length = 2001; return state; })).rejects.toThrow('store_full');
    await expect(q.commit(state => { state.version = 2 as 1; return state; })).rejects.toThrow();
    await expect(q.commit(state => { state.observing = true; return state; }, 1)).rejects.toThrow('state_too_large');
    expect(q.snapshot()).toEqual(emptyState()); expect(q.writes()).toBe(0);
    expect(q.io.status()).toMatchObject({ faults: 0, pending: 0, retainedOperations: 0 });
    await q.io.join(); q.io.release();
  });
  it('allows a legitimate later commit after rejection and avoids IO for a no-op', async () => {
    const q = queue(), rejection = new Error('ordinary');
    await expect(q.commit(() => { throw rejection; })).rejects.toBe(rejection);
    expect((await q.commit(state => { state.observing = true; return state; })).seq).toBe(1);
    expect((await q.commit(state => state)).seq).toBe(1); expect(q.writes()).toBe(1);
    await q.io.join(); q.io.release();
  });
  it('serializes concurrent preparation after the preceding actual write settles', async () => {
    const q = queue(), order: string[] = []; let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const first = q.commit(state => { order.push('first'); state.observing = true; return state; }, 2097152, () => gate);
    const second = q.commit(state => { order.push('second'); expect(state.seq).toBe(1); state.observing = false; return state; });
    await Promise.resolve(); expect(order).toEqual(['first']); finish();
    await first; expect((await second).seq).toBe(2); expect(order).toEqual(['first', 'second']);
    await q.io.join(); q.io.release();
  });
  it('retains an actual IO-stage close failure and fences later preparation without retry', async () => {
    const q = queue(); let closes = 0;
    const handle = q.io.capture({ close: async () => { closes++; throw new Error('actual_close_fault'); } });
    await expect(q.commit(state => { state.observing = true; return state; }, 2097152,
      () => q.io.closeHandle(handle))).rejects.toThrow('store_io_UNKNOWN');
    const originalClose = q.io.closeHandle(handle);
    await expect(originalClose).rejects.toThrow(); expect(q.io.closeHandle(handle)).toBe(originalClose);
    await expect(q.commit(state => state)).rejects.toThrow('store_io_UNKNOWN');
    expect(closes).toBe(1); expect(q.snapshot()).toEqual(emptyState());
    expect(q.io.status()).toMatchObject({ unknown: true, handles: 1, pending: 0 });
    expect(q.io.status().retainedOperations).toBeGreaterThan(0);
    await expect(q.io.join()).rejects.toThrow(); expect(() => q.io.release()).toThrow();
  });
  it('refuses absent numeric safe primitives through the actual production flag guard', () => {
    expect(() => ownedStoreReadFlags({ O_RDONLY: 0, O_NONBLOCK: 4 })).toThrow('store_read_flags_unsupported');
    expect(() => ownedStoreReadFlags({ O_RDONLY: 0, O_NOFOLLOW: 8 })).toThrow('store_read_flags_unsupported');
    expect(ownedStoreReadFlags({ O_RDONLY: 0, O_NOFOLLOW: 8, O_NONBLOCK: 4 })).toBe(12);
    // The production readOwned call orders this guard before lstat/open; no open callback is simulated.
  });
});
