// DRAFT_UNRUN: 24 explicit registrations, no parameterized expansion.
// Imports the production injected seam; never duplicates its ownership algorithm.
// No real listener, timers, store, Runner, filesystem, application or native imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpLifetime } from '../../src/server/http-lifetime.js';
import type { HttpListener } from '../../src/server/http-lifetime.js';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function boundary(config: {
  startup?: Promise<void>; runner?: () => Promise<void>; close?: () => Promise<void>;
  store?: () => Promise<void>; cancel?: () => void; dispose?: () => void;
} = {}) {
  const calls: string[] = [], closeStarted = deferred<void>(), runnerStarted = deferred<void>();
  let events!: Parameters<HttpListener['subscribe']>[0];
  let locked = true, deadline = false, listeners = 0;
  const owner = new HttpLifetime({
    stopAdmission: () => { calls.push('stopAdmission'); },
    cancel: () => { calls.push('cancel'); config.cancel?.(); },
    armDeadline: () => { calls.push('armDeadline'); deadline = true; },
    joinStartup: () => config.startup ?? Promise.resolve(),
    joinRunner: () => { calls.push('joinRunner'); runnerStarted.resolve(); return config.runner?.() ?? Promise.resolve(); },
    dispose: () => { calls.push('dispose'); config.dispose?.(); },
    closeStore: async () => { calls.push('closeStore'); await config.store?.(); locked = false; },
    clearDeadline: () => { calls.push('clearDeadline'); deadline = false; },
    removeSignals: () => { calls.push('removeSignals'); },
  });
  owner.attach({
    subscribe: handlers => { events = handlers; listeners = 3; return () => { calls.push('unsubscribe'); listeners = 0; }; },
    close: () => {
      calls.push('closeListener'); closeStarted.resolve();
      return (config.close?.() ?? Promise.resolve()).then(() => { events.close(); });
    },
  });
  return { owner, calls, events, closeStarted, runnerStarted,
    get locked() { return locked; }, get deadline() { return deadline; }, get listeners() { return listeners; } };
}
const refuse = () => '503';

test('01 accepted fetch is retained before its synchronous body begins', async () => {
  const h = boundary(); h.events.ready(); let invoked = false;
  const response = h.owner.handle(() => { invoked = true; assert.equal(h.owner.status().requests, 1); return 'ok'; }, refuse);
  assert.equal(invoked, false); assert.equal(h.owner.status().requests, 1);
  assert.equal(await response, 'ok'); await h.owner.stop(); assert.equal(h.owner.status().requests, 0);
});
test('02 disconnected photo work outlives listener closure and retains lock/root', async () => {
  const analysis = deferred<void>(), entered = deferred<void>(); const h = boundary(); h.events.ready();
  // Deliberately drop the returned response, as a disconnected adapter may do.
  h.owner.handle(async () => { entered.resolve(); await analysis.promise; assert.equal(h.locked, true); h.calls.push('mediaEffect'); return 'ok'; }, refuse);
  await entered.promise; let rootDone = false;
  const root = h.owner.wait().then(() => { rootDone = true; }); h.owner.stop();
  await h.closeStarted.promise; assert.equal(h.locked, true); assert.equal(rootDone, false); assert.equal(h.deadline, true);
  analysis.resolve(); await root;
  assert.ok(h.calls.indexOf('mediaEffect') < h.calls.indexOf('closeStore')); assert.equal(h.locked, false);
});
test('03 stop refuses new fetch synchronously before cancel can reenter', async () => {
  let h!: ReturnType<typeof boundary>, refused!: Promise<string>, invoked = 0;
  h = boundary({ cancel: () => { refused = h.owner.handle(() => { invoked++; return 'bad'; }, refuse); } }); h.events.ready();
  const stop = h.owner.stop(); assert.equal(h.owner.status().accepting, false);
  assert.equal(await refused, '503'); await stop; assert.equal(invoked, 0);
});
test('04 two retained handlers release only their own settled records', async () => {
  const a = deferred<string>(), b = deferred<string>(); const h = boundary(); h.events.ready();
  const first = h.owner.handle(() => a.promise, refuse), second = h.owner.handle(() => b.promise, refuse);
  a.resolve('a'); await first; assert.equal(h.owner.status().requests, 1);
  const stop = h.owner.stop(); await h.closeStarted.promise; assert.equal(h.locked, true);
  b.resolve('b'); await second; await stop; assert.equal(h.owner.status().requests, 0);
});
test('05 synchronous application throw preserves original rejection and root failure', async () => {
  const failure = new Error('sync_fetch'); const h = boundary(); h.events.ready();
  const root = assert.rejects(h.owner.wait(), error => error === failure);
  await assert.rejects(h.owner.handle(() => { throw failure; }, refuse), error => error === failure);
  await root; assert.equal(h.locked, true); assert.equal(h.owner.status().requests, 0);
});
test('06 dropped rejected fetch is internally observed and stops the root', async () => {
  const failure = new Error('async_fetch'); const h = boundary(); h.events.ready();
  const root = assert.rejects(h.owner.wait(), error => error === failure);
  h.owner.handle(async () => { throw failure; }, refuse);
  await root; assert.equal(h.owner.status().failure, failure); assert.equal(h.locked, true);
});
test('07 undefined rejection remains a failure after physical request count reaches zero', async () => {
  const h = boundary(); h.events.ready();
  const root = h.owner.wait().then(() => assert.fail('root must reject'), error => { assert.equal(error, undefined); });
  h.owner.handle(() => Promise.reject(undefined), refuse);
  await root; assert.equal(h.owner.status().failed, true); assert.equal(h.owner.status().requests, 0); assert.equal(h.locked, true);
});
test('08 late handler finally cleanup finishes under lock before store closure', async () => {
  const body = deferred<void>(), cleanup = deferred<void>(), cleaning = deferred<void>(); const h = boundary(); h.events.ready();
  const response = h.owner.handle(async () => {
    try { await body.promise; return 'ok'; }
    finally { cleaning.resolve(); await cleanup.promise; assert.equal(h.locked, true); }
  }, refuse);
  const stop = h.owner.stop(); body.resolve(); await cleaning.promise;
  assert.equal(h.locked, true); assert.equal(h.owner.status().requests, 1); cleanup.resolve(); await response; await stop;
});
test('09 asynchronous EADDRINUSE before ready invokes observed cleanup and original failure', async () => {
  const failure = Object.assign(new Error('bind'), { code: 'EADDRINUSE' }); const h = boundary();
  const root = assert.rejects(h.owner.wait(), error => error === failure); h.events.error(failure);
  assert.equal(h.owner.status().accepting, false); await root;
  assert.equal(h.owner.status().listenerReady, false); assert.equal(h.owner.status().listenerClosed, true);
  assert.equal(h.locked, true); assert.equal(h.listeners, 0);
});
test('10 later listener error joins active handler and Runner independently', async () => {
  const work = deferred<string>(), run = deferred<void>(), failure = new Error('later_error');
  const h = boundary({ runner: () => run.promise }); h.events.ready(); h.owner.handle(() => work.promise, refuse);
  let rootDone = false; const root = assert.rejects(h.owner.wait(), error => error === failure).then(() => { rootDone = true; });
  h.events.error(failure); await h.runnerStarted.promise; work.resolve('ok');
  await h.closeStarted.promise; assert.equal(rootDone, false); assert.equal(h.locked, true); run.resolve(); await root;
});
test('11 unexpected close after ready stops admission and rejects root', async () => {
  const h = boundary(); h.events.ready(); const root = assert.rejects(h.owner.wait(), /http_listener_unexpected_close/);
  h.events.close(); assert.equal(h.owner.status().accepting, false); await root;
  assert.equal(h.calls.includes('closeListener'), false); assert.equal(h.locked, true); assert.equal(h.listeners, 0);
});
test('12 unexpected close before readiness releases readiness wait with failure', async () => {
  const h = boundary(); const root = assert.rejects(h.owner.wait(), /http_listener_unexpected_close/);
  h.events.close(); await root; assert.equal(h.owner.status().listenerReady, false); assert.equal(h.locked, true);
});
test('13 expected close event is successful and does not replace disposition', async () => {
  const h = boundary(); h.events.ready(); const root = h.owner.wait(); await h.owner.stop(); await root;
  assert.equal(h.owner.status().failed, false); assert.equal(h.owner.status().listenerClosed, true); assert.equal(h.locked, false);
});
test('14 simultaneous signal-style stop calls return exactly the same cleanup promise', async () => {
  const h = boundary(); h.events.ready(); const first = h.owner.stop(), second = h.owner.stop();
  assert.equal(first, second); await first; assert.equal(h.owner.stop(), first);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 1); assert.equal(h.calls.filter(call => call === 'closeStore').length, 1);
});
test('15 signal followed by listener failure preserves the original listener error', async () => {
  const gate = deferred<void>(), failure = new Error('during_stop'); const h = boundary({ runner: () => gate.promise }); h.events.ready();
  const first = h.owner.stop(), root = assert.rejects(h.owner.wait(), error => error === failure);
  h.events.error(failure); assert.equal(h.owner.stop(), first); await h.runnerStarted.promise; gate.resolve(); await root; assert.equal(h.locked, true);
});
test('16 first failure is sticky across later errors and successful zero-work joins', async () => {
  const first = new Error('first'), second = new Error('second'); const h = boundary(); h.events.ready();
  const root = assert.rejects(h.owner.wait(), error => error === first);
  h.events.error(first); h.events.error(second); await root;
  assert.equal(h.owner.status().failure, first); assert.equal(h.owner.status().requests, 0); assert.equal(h.locked, true);
});
test('17 listener close rejection cannot skip Runner or request cleanup', async () => {
  const failure = new Error('close_failed'), work = deferred<string>(), run = deferred<void>();
  const h = boundary({ close: async () => { throw failure; }, runner: () => run.promise }); h.events.ready();
  const response = h.owner.handle(() => work.promise, refuse), root = assert.rejects(h.owner.wait(), error => error === failure);
  h.owner.stop(); await h.closeStarted.promise; await h.runnerStarted.promise;
  assert.equal(h.locked, true); work.resolve('ok'); run.resolve(); await response; await root;
  assert.equal(h.listeners, 3); assert.equal(h.deadline, true); assert.equal(h.calls.includes('closeStore'), false);
});
test('18 Runner rejection cannot skip listener or pending handler join', async () => {
  const failure = new Error('runner_unknown'), work = deferred<string>();
  const h = boundary({ runner: async () => { throw failure; } }); h.events.ready();
  const response = h.owner.handle(() => work.promise, refuse), root = assert.rejects(h.owner.wait(), error => error === failure);
  h.owner.stop(); await h.closeStarted.promise; assert.equal(h.locked, true); assert.equal(h.listeners, 3);
  work.resolve('ok'); await response; await root; assert.equal(h.listeners, 0); assert.equal(h.locked, true);
});
test('19 startup remains owned during stop before final Runner/listener joins', async () => {
  const startup = deferred<void>(); const h = boundary({ startup: startup.promise }); h.events.ready();
  const stop = h.owner.stop(); await Promise.resolve(); assert.equal(h.calls.includes('joinRunner'), false);
  assert.equal(h.locked, true); assert.equal(h.deadline, true); startup.resolve(); await stop;
});
test('20 startup failure plus unresolved startup work retains lock and watchdog', async () => {
  const startup = deferred<void>(), failure = new Error('startup'); const h = boundary({ startup: startup.promise }); h.events.ready();
  const root = assert.rejects(h.owner.wait(), error => error === failure); h.owner.fail(failure);
  await Promise.resolve(); assert.equal(h.locked, true); assert.equal(h.deadline, true); assert.equal(h.listeners, 3);
  startup.resolve(); await root; assert.equal(h.locked, true); assert.equal(h.listeners, 0);
});
test('21 stop during pending bind waits for ready before issuing close', async () => {
  const h = boundary(); const stop = h.owner.stop(); await h.runnerStarted.promise;
  assert.equal(h.calls.includes('closeListener'), false); assert.equal(h.locked, true); assert.equal(h.deadline, true);
  h.events.ready(); await stop; assert.equal(h.calls.includes('closeListener'), true); assert.equal(h.locked, false);
});
test('22 stalled handler prefix retains watchdog and observers until actual settlement', async () => {
  const stalled = deferred<string>(); const h = boundary(); h.events.ready();
  const response = h.owner.handle(() => stalled.promise, refuse), stop = h.owner.stop(); await h.closeStarted.promise;
  // Finite draft prefix of a never-settling handler; no timeout/race manufactures completion.
  assert.equal(h.owner.status().requests, 1); assert.equal(h.locked, true); assert.equal(h.deadline, true); assert.equal(h.listeners, 3);
  stalled.resolve('ok'); await response; await stop; assert.equal(h.deadline, false); assert.equal(h.listeners, 0);
});
test('23 store-close rejection is nonzero without claiming known owner release', async () => {
  const failure = new Error('store_close_unknown'); const h = boundary({ store: async () => { throw failure; } }); h.events.ready();
  const root = assert.rejects(h.owner.wait(), error => error === failure); h.owner.stop(); await root;
  assert.equal(h.owner.status().failure, failure); assert.equal(h.listeners, 0); assert.equal(h.calls.filter(call => call === 'closeStore').length, 1);
  // This port keeps its lock; a real unlink/directory-sync failure has UNKNOWN release truth.
});
test('24 disposal failure stays failed and never calls store close', async () => {
  const failure = new Error('dispose'); const h = boundary({ dispose: () => { throw failure; } }); h.events.ready();
  const root = assert.rejects(h.owner.wait(), error => error === failure); h.owner.stop(); await root;
  assert.equal(h.locked, true); assert.equal(h.calls.includes('closeStore'), false); assert.equal(h.listeners, 0); assert.equal(h.deadline, false);
});

// R38 DRAFT_UNRUN additions. Pure injected listener-contract cases, NOT native-body tests.
// The original 24 registrations and their assertions above remain byte-for-byte intact.
test('25 R38 resolved application response does not release a pending native bridge', async () => {
  const native = deferred<void>(); const h = boundary({ close: () => native.promise }); h.events.ready();
  assert.equal(await h.owner.handle(() => 'actual response returned', refuse), 'actual response returned');
  const stop = h.owner.stop(); await h.closeStarted.promise;
  assert.equal(h.owner.status().requests, 0); assert.equal(h.locked, true);
  assert.equal(h.calls.includes('closeStore'), false); native.resolve(); await stop;
  assert.equal(h.locked, false);
});
test('26 R38 a later native cancellation rejection stays failed after application fulfillment', async () => {
  const native = deferred<void>(), failure = new Error('original_reader_cancel_failed');
  const h = boundary({ close: () => native.promise }); h.events.ready();
  await h.owner.handle(() => 'response', refuse);
  const root = assert.rejects(h.owner.wait(), error => error === failure);
  h.owner.stop(); await h.closeStarted.promise; native.reject(failure); await root;
  assert.equal(h.locked, true); assert.equal(h.calls.includes('closeStore'), false); assert.equal(h.listeners, 3);
});
test('27 R38 native close failure does not discard an independent body join', async () => {
  const body = deferred<void>(), bodyStarted = deferred<void>(), failure = new Error('native_close_failed');
  const h = boundary({ close: async () => {
    const joins = await Promise.allSettled([Promise.reject(failure), (async () => { bodyStarted.resolve(); await body.promise; })()]);
    for (const result of joins) if (result.status === 'rejected') throw result.reason;
  } }); h.events.ready();
  let ended = false; const root = assert.rejects(h.owner.wait(), error => error === failure).then(() => { ended = true; });
  h.owner.stop(); await bodyStarted.promise;
  assert.equal(ended, false); assert.equal(h.locked, true); assert.equal(h.calls.includes('closeStore'), false);
  body.resolve(); await root; assert.equal(h.locked, true);
});
test('28 R38 pending native release retains the same stop task and original deadline', async () => {
  const native = deferred<void>(); const h = boundary({ close: () => native.promise }); h.events.ready();
  const first = h.owner.stop(); await h.closeStarted.promise;
  assert.equal(h.owner.stop(), first); assert.equal(h.calls.filter(call => call === 'armDeadline').length, 1);
  assert.equal(h.deadline, true); assert.equal(h.locked, true); assert.equal(h.listeners, 3);
  native.resolve(); await first; assert.equal(h.deadline, false);
});
