// DRAFT_UNRUN R56: 32 expanded pure injected cases; no real FS/native/session integration.
// Not an execution grant. Importing/running this file is outside R56 authority.
import { describe, expect, it } from 'vitest';
import { CHECKPOINT_STORE_POLICY, RetainedStoreIO, StoreWriteBudget, closeOwnedStoreLock, createStoreDirectory, matchesOwnedStoreLock, readBoundedStoreData, residentStoreIOOwnerCount } from '../../src/server/store.js';
import { HttpLifetime } from '../../src/server/http-lifetime.js';
import type { HttpLifetimeOptions, HttpListener } from '../../src/server/http-lifetime.js';

const fault = () => new Error('injected_failure');
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function lifecycle(overrides: Partial<HttpLifetimeOptions> = {}) {
  const calls: string[] = [];
  const options: HttpLifetimeOptions = {
    stopAdmission: () => { calls.push('seal'); }, cancel: () => { calls.push('cancel'); }, armDeadline: () => { calls.push('deadline'); },
    joinStartup: async () => { calls.push('startup'); }, joinRunner: async () => { calls.push('runner'); },
    joinRetained: async () => { calls.push('IO'); }, dispose: () => { calls.push('dispose'); },
    closeStore: async () => { calls.push('store_close'); }, clearDeadline: () => {}, removeSignals: () => {}, ...overrides,
  };
  const http = new HttpLifetime(options);
  return { http, calls };
}

describe('R56 owned lock proof — 8 DRAFT_UNRUN injected cases', () => {
  it.each(['ok', 'missing', 'malformed', 'mismatch', 'read', 'unlink', 'sync', 'close'] as const)('%s', async kind => {
    const calls: string[] = [], body = '{"lockId":"owned"}';
    const task = closeOwnedStoreLock({
      prove: async () => {
        calls.push('proof');
        if (kind === 'missing' || kind === 'read') throw fault();
        const actual = kind === 'malformed' ? '{' : kind === 'mismatch' ? '{"lockId":"other"}' : body;
        return matchesOwnedStoreLock(new TextEncoder().encode(actual), body);
      },
      unlink: async () => { calls.push('unlink'); if (kind === 'unlink') throw fault(); },
      sync: async () => { calls.push('sync'); if (kind === 'sync') throw fault(); },
      join: async () => { calls.push('actual_IO_close'); if (kind === 'close') throw fault(); },
    });
    if (kind === 'ok') { await task; expect(calls).toEqual(['proof', 'unlink', 'sync', 'actual_IO_close']); }
    else {
      await expect(task).rejects.toThrow();
      if (['missing', 'malformed', 'mismatch', 'read'].includes(kind)) expect(calls).toEqual(['proof']);
      if (kind === 'unlink') expect(calls).toEqual(['proof', 'unlink']);
      if (kind === 'sync') expect(calls).toEqual(['proof', 'unlink', 'sync']);
    }
  });
});

describe('R56 retained actual handle/operation owner — 6 DRAFT_UNRUN cases', () => {
  it('publishes an operation before invoking any work', async () => {
    const io = new RetainedStoreIO<{ close(): Promise<void> }>();
    let invoked = false;
    const task = io.run('read', async () => { invoked = true; expect(io.status().pending).toBe(1); });
    expect(invoked).toBe(false); expect(io.status().pending).toBe(1);
    await task; await io.join(); io.release();
  });
  it('retains the actual failed-close object and original task without a blind retry', async () => {
    const io = new RetainedStoreIO<{ close(): Promise<void> }>(); let closes = 0;
    const handle = io.capture({ close: async () => { closes++; throw fault(); } });
    const first = io.closeHandle(handle); await expect(first).rejects.toThrow('store_io_UNKNOWN');
    expect(io.closeHandle(handle)).toBe(first); expect(closes).toBe(1);
    expect(io.status().handles).toBe(1); expect(io.status().retainedOperations).toBe(1);
    await expect(io.join()).rejects.toThrow(); expect(() => io.release()).toThrow();
  });
  it('roots a pre-Store acquisition owner even when no Store ever fulfills', async () => {
    const count = residentStoreIOOwnerCount(), io = new RetainedStoreIO<{ close(): Promise<void> }>();
    await expect(io.run('acquire', async () => { io.capture({ close: async () => { throw fault(); } }); throw fault(); })).rejects.toThrow();
    expect(residentStoreIOOwnerCount()).toBe(count + 1); expect(io.status().handles).toBe(1);
    await expect(io.join()).rejects.toThrow(); // default acquisition uses this same resident primitive
  });
  it('independently records work failure and actual close failure', async () => {
    const io = new RetainedStoreIO<{ close(): Promise<void> }>();
    const handle = io.capture({ close: async () => { throw fault(); } });
    await expect(io.use(handle, 'read', async () => { throw fault(); })).rejects.toThrow();
    expect(io.status().faults).toBe(2); expect(io.status().handles).toBe(1);
  });
  it('captures synchronous callback throws only after publication', async () => {
    const io = new RetainedStoreIO<{ close(): Promise<void> }>();
    const task = io.run('remove_media', () => { expect(io.status().pending).toBe(1); throw fault(); });
    await expect(task).rejects.toThrow(); expect(io.status().unknown).toBe(true);
    expect(io.status().retainedOperations).toBe(1);
  });
  it('does not join a still-pending actual close by assuming descriptor disappearance', async () => {
    const io = new RetainedStoreIO<{ close(): Promise<void> }>(), gate = deferred<void>();
    const handle = io.capture({ close: () => gate.promise }), closing = io.closeHandle(handle);
    let joined = false; const join = io.join().then(() => { joined = true; });
    await Promise.resolve(); expect(joined).toBe(false); expect(io.status().handles).toBe(1);
    gate.resolve(); await closing; await join; io.release(); expect(io.status().released).toBe(true);
  });
});

describe('R56 logical reservations and fresh creation — 7 DRAFT_UNRUN cases', () => {
  it('refuses per-file overflow before a write callback can run', () => {
    const budget = new StoreWriteBudget(CHECKPOINT_STORE_POLICY); let wrote = false;
    expect(() => { budget.reserveWrite('media', 2097153); wrote = true; }).toThrow();
    expect(wrote).toBe(false); expect(budget.status().bytes).toBe(0);
  });
  it('never refunds after removal or rename decisions', () => {
    const budget = new StoreWriteBudget(CHECKPOINT_STORE_POLICY); budget.reserveWrite('state', 100);
    // There is deliberately no refund API and no deletion/rename inference in the budget.
    expect(budget.status()).toEqual({ bytes: 100, files: 1, directories: 0 });
    budget.reserveWrite('state', 100); expect(budget.status().bytes).toBe(200);
  });
  it('reserves synchronously across competing callbacks before either writes', async () => {
    const budget = new StoreWriteBudget(CHECKPOINT_STORE_POLICY);
    const reservations = Array.from({ length: 15 }, () => Promise.resolve().then(() => { budget.reserveWrite('media', 2097152); }));
    const outcomes = await Promise.allSettled(reservations);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(14);
    expect(budget.status().bytes).toBe(29360128); expect(budget.status().files).toBe(14);
  });
  it('keeps charges when an injected write partially fails', async () => {
    const budget = new StoreWriteBudget(CHECKPOINT_STORE_POLICY), io = new RetainedStoreIO<{ close(): Promise<void> }>();
    await expect(io.run('write_media', async () => { budget.reserveWrite('media', 20); throw fault(); })).rejects.toThrow();
    expect(budget.status()).toEqual({ bytes: 20, files: 1, directories: 0 });
  });
  it('counts temp rewrites/open attempts rather than only surviving files', () => {
    const budget = new StoreWriteBudget(CHECKPOINT_STORE_POLICY);
    for (let i = 0; i < 16; i++) budget.reserveWrite('state', 1);
    expect(() => budget.reserveWrite('state', 1)).toThrow(); expect(budget.status().files).toBe(16);
  });
  it('limits charged mkdir attempts to eight with no refunds', () => {
    const budget = new StoreWriteBudget(CHECKPOINT_STORE_POLICY);
    for (let i = 0; i < 8; i++) budget.reserveDirectory();
    expect(() => budget.reserveDirectory()).toThrow(); expect(budget.status().directories).toBe(8);
  });
  it('passes recursive:false and rejects existing checkpoint directory without adoption', async () => {
    const seen: boolean[] = [];
    await expect(createStoreDirectory(true, async recursive => { seen.push(recursive); throw fault(); })).rejects.toThrow();
    expect(seen).toEqual([false]);
    await createStoreDirectory(false, async recursive => { seen.push(recursive); }); expect(seen).toEqual([false, true]);
  });
});

function bounded(sequence: number[], size = 2, unchanged = true) {
  const lengths: number[] = [];
  return { lengths, actions: {
    size: async () => size,
    read: async (_bytes: Uint8Array, _offset: number, remaining: number) => { lengths.push(remaining); return sequence.shift() ?? 0; },
    unchanged: async () => unchanged,
  } };
}
describe('R56 captured bounded bytes — 5 DRAFT_UNRUN cases', () => {
  it('requires actual EOF after the exact captured size', async () => {
    const input = bounded([2, 0]); expect((await readBoundedStoreData(2, input.actions)).byteLength).toBe(2);
    expect(input.lengths).toEqual([3, 1]);
  });
  it('refuses cap+1 without accepting a full-buffer read as EOF', async () => {
    await expect(readBoundedStoreData(2, bounded([3]).actions)).rejects.toThrow('store_read_eof');
  });
  it('refuses an identity change after reads', async () => {
    await expect(readBoundedStoreData(2, bounded([2, 0], 2, false).actions)).rejects.toThrow('store_read_identity');
  });
  it('checks fd-stat size before allocation/read callbacks', async () => {
    const input = bounded([], 3); await expect(readBoundedStoreData(2, input.actions)).rejects.toThrow('store_read_cap');
    expect(input.lengths).toEqual([]);
  });
  it('refuses truncated EOF even when under cap', async () => {
    await expect(readBoundedStoreData(2, bounded([1, 0]).actions)).rejects.toThrow('store_read_eof');
  });
});

describe('R56 independent retained join — 6 DRAFT_UNRUN cases', () => {
  it.each(['startup', 'listener', 'request', 'runner'] as const)('still joins IO after %s rejects', async kind => {
    const { http, calls } = lifecycle({
      joinStartup: async () => { if (kind === 'startup') throw fault(); },
      joinRunner: async () => { if (kind === 'runner') throw fault(); },
    });
    if (kind === 'listener') {
      const listener: HttpListener = {
        subscribe(events) { events.ready(); return () => {}; }, close: async () => { throw fault(); },
      }; http.attach(listener);
    }
    let request: Promise<unknown> | undefined;
    if (kind === 'request') { request = http.handle(async () => { throw fault(); }, () => undefined); request.catch(() => undefined); }
    await expect(http.stop()).rejects.toThrow();
    if (request) await expect(request).rejects.toThrow();
    expect(calls).toContain('IO'); expect(calls).not.toContain('store_close');
  });
  it('explicit no-policy-acquired composition still awaits IO and allows only positive close', async () => {
    let noPolicyAcquired = false, policyJoined = false, ioJoined = false;
    const { http, calls } = lifecycle({ joinRetained: async () => {
      const policy: { join(): Promise<void> } | undefined = undefined;
      const outcomes = await Promise.allSettled([
        Promise.resolve().then(async () => { if (!policy) { noPolicyAcquired = true; policyJoined = true; } }),
        Promise.resolve().then(async () => { ioJoined = true; }),
      ]);
      expect(outcomes.every(result => result.status === 'fulfilled')).toBe(true);
    } });
    await http.stop(); expect(noPolicyAcquired && policyJoined && ioJoined).toBe(true); expect(calls).toContain('store_close');
    // Composition test only: no real createFixtureSession, native, Store, listener or filesystem.
  });
  it('seals Runner then policy synchronously and returns the published stop during reentry, without self-await', async () => {
    const order: string[] = []; let reentrant: Promise<void> | undefined;
    const { http } = lifecycle({
      stopAdmission: () => { order.push('runner_seal'); order.push('policy_seal'); },
      armDeadline: () => { order.push('deadline'); reentrant = http.stop(); },
      cancel: () => { order.push('cancel'); },
      joinRetained: async () => {
        // Independent resources only. Never return http.stop()/wait() from either join.
        await Promise.allSettled([Promise.resolve().then(() => { order.push('policy_join'); }), Promise.resolve().then(() => { order.push('IO_join'); })]);
      },
    });
    const stop = http.stop(); expect(reentrant).toBe(stop);
    expect(order).toEqual(['runner_seal', 'policy_seal', 'deadline', 'cancel']);
    await stop; expect(order.slice(-2)).toEqual(['policy_join', 'IO_join']);
  });
});
