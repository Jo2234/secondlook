// DRAFT_UNRUN. 18 explicit cases; no parameterized/hidden test expansion.
// Pure injected boundary only: no server, filesystem, network, timers or installed imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwnedRuntime } from '../../src/server/owned-runtime.js';
import type { RuntimeReceipt } from '../../src/server/owned-runtime.js';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const receipt = (ids = ['job-a'], replay = false): RuntimeReceipt<string[]> => ({ value: ids, jobIds: ids, replay });
const refused = () => false;

test('01 reservation exists before admission storage is invoked', async () => {
  const commit = deferred<RuntimeReceipt<string[]>>();
  const runtime = new OwnedRuntime(async () => {});
  const admitted = runtime.admit(() => { assert.equal(runtime.status().owned, 1); return commit.promise; }, refused);
  assert.equal(runtime.status().owned, 1);
  commit.resolve(receipt()); await admitted; await runtime.drain();
  assert.equal(runtime.status().owned, 0);
});
test('02 durable IDs return while execution is still owned and pending', async () => {
  const work = deferred<void>(), started = deferred<void>();
  const runtime = new OwnedRuntime(async () => { started.resolve(); await work.promise; });
  assert.deepEqual(await runtime.admit(async () => receipt(), refused), ['job-a']);
  await started.promise; assert.equal(runtime.status().owned, 1);
  work.resolve(); await runtime.drain();
});
test('03 two model IDs occupy one owned batch and one executor call', async () => {
  const work = deferred<void>();
  const calls: string[][] = [];
  const runtime = new OwnedRuntime(async ids => { calls.push([...ids]); await work.promise; });
  assert.deepEqual(await runtime.admit(async () => receipt(['job-a', 'job-b']), refused), ['job-a', 'job-b']);
  assert.equal(runtime.status().owned, 1); work.resolve(); await runtime.drain();
  assert.deepEqual(calls, [['job-a', 'job-b']]);
});
test('04 later batches cannot overlap the first executor', async () => {
  const first = deferred<void>(), started = deferred<void>(); const calls: string[] = [];
  const runtime = new OwnedRuntime(async ids => { calls.push(ids[0]!); if (ids[0] === 'first') { started.resolve(); await first.promise; } });
  await runtime.admit(async () => receipt(['first']), refused); await started.promise;
  await runtime.admit(async () => receipt(['second']), refused);
  assert.deepEqual(calls, ['first']); first.resolve(); await runtime.drain(); assert.deepEqual(calls, ['first', 'second']);
});
test('05 a 33rd reservation refuses before its commit callback', async () => {
  const commits = Array.from({ length: 32 }, () => deferred<RuntimeReceipt<string[]>>());
  const runtime = new OwnedRuntime(async () => {});
  const pending = commits.map(commit => runtime.admit(() => commit.promise, refused)); let calls = 0;
  await assert.rejects(runtime.admit(async () => { calls++; return receipt(); }, refused), { code: 'runner_queue_full' });
  assert.equal(calls, 0); assert.equal(runtime.status().owned, 32);
  commits.forEach((commit, index) => commit.resolve(receipt([`job-${index}`])));
  await Promise.all(pending); await runtime.drain();
});
test('06 running plus 31 queued fills the existing 32 batch bound', async () => {
  const work = deferred<void>(), started = deferred<void>();
  const runtime = new OwnedRuntime(async () => { started.resolve(); await work.promise; });
  await runtime.admit(async () => receipt(['first']), refused); await started.promise;
  for (let index = 0; index < 31; index++) await runtime.admit(async () => receipt([`later-${index}`]), refused);
  await assert.rejects(runtime.admit(async () => receipt(['overflow']), refused), { code: 'runner_queue_full' });
  assert.equal(runtime.status().owned, 32); work.resolve(); await runtime.drain();
});
test('07 a proven pre-effect refusal releases capacity without a fence', async () => {
  const rejected = new Error('quality_failed'), runtime = new OwnedRuntime(async () => {});
  await assert.rejects(runtime.admit(async () => { throw rejected; }, error => error === rejected), rejected);
  assert.deepEqual(runtime.status(), { stopped: false, fence: null, owned: 0 });
  await runtime.admit(async () => receipt(), refused); await runtime.drain();
});
test('08 a failed commit fences all subsequent admission callbacks', async () => {
  const failure = new Error('store_commit_failed'), runtime = new OwnedRuntime(async () => {}); let later = 0;
  await assert.rejects(runtime.admit(async () => { throw failure; }, refused), failure);
  await assert.rejects(runtime.admit(async () => { later++; return receipt(); }, refused), { code: 'runner_fenced' });
  assert.equal(later, 0); assert.equal(runtime.status().fence?.phase, 'admission');
  await assert.rejects(runtime.drain(), { code: 'runner_fenced' });
});
test('09 unknown commit cannot manufacture execution or clean drain proof', async () => {
  let executions = 0; const runtime = new OwnedRuntime(async () => { executions++; });
  await assert.rejects(runtime.admit(async () => { throw new Error('store_commit_unknown'); }, refused), /store_commit_unknown/);
  assert.equal(executions, 0); assert.equal(runtime.status().owned, 0);
  await assert.rejects(runtime.drain(), { code: 'runner_fenced' });
});
test('10 serialized duplicate receipts return the same IDs without another execution', async () => {
  let durable = false, calls = 0; const runtime = new OwnedRuntime(async () => { calls++; });
  const commit = async () => { const replay = durable; durable = true; return receipt(['stable'], replay); };
  assert.deepEqual(await Promise.all([runtime.admit(commit, refused), runtime.admit(commit, refused)]), [['stable'], ['stable']]);
  await runtime.drain(); assert.equal(calls, 1);
});
test('11 replay releases its reservation without queuing work', async () => {
  let calls = 0; const runtime = new OwnedRuntime(async () => { calls++; });
  assert.deepEqual(await runtime.admit(async () => receipt(['known'], true), refused), ['known']);
  await runtime.drain(); assert.equal(calls, 0); assert.equal(runtime.status().owned, 0);
});
test('12 execution failure remains visible after the work promise settles', async () => {
  const runtime = new OwnedRuntime(async () => { throw new Error('worker_failed'); });
  await runtime.admit(async () => receipt(), refused);
  await assert.rejects(runtime.drain(), { code: 'runner_fenced' });
  assert.deepEqual(runtime.status().fence, { phase: 'execution', jobIds: ['job-a'] });
});
test('13 queued work never starts after a preceding execution failure', async () => {
  const first = deferred<void>(), started = deferred<void>(); const calls: string[] = [];
  const runtime = new OwnedRuntime(async ids => { calls.push(ids[0]!); started.resolve(); await first.promise; });
  await runtime.admit(async () => receipt(['first']), refused); await started.promise;
  await runtime.admit(async () => receipt(['second']), refused);
  first.reject(new Error('failed')); await assert.rejects(runtime.drain(), { code: 'runner_fenced' });
  assert.deepEqual(calls, ['first']); assert.equal(runtime.status().owned, 0);
});
test('14 stopping admission refuses before invoking storage', async () => {
  const runtime = new OwnedRuntime(async () => {}); let commits = 0;
  runtime.stopAdmission();
  await assert.rejects(runtime.admit(async () => { commits++; return receipt(); }, refused), { code: 'runner_closed' });
  assert.equal(commits, 0); await runtime.drain();
});
test('15 cancel plus drain retains ownership until cancellation-aware work finishes', async () => {
  const started = deferred<AbortSignal>(), work = deferred<void>(); let drained = false;
  const runtime = new OwnedRuntime(async (_ids, signal) => { started.resolve(signal); await work.promise; });
  await runtime.admit(async () => receipt(), refused); const signal = await started.promise;
  runtime.stopAdmission(); const drain = runtime.drain().then(() => { drained = true; });
  await Promise.resolve(); assert.equal(signal.aborted, true); assert.equal(drained, false);
  work.resolve(); await drain; assert.equal(runtime.status().owned, 0);
});
test('16 stop during commit keeps the reservation and publishes only cancelled work', async () => {
  const commit = deferred<RuntimeReceipt<string[]>>(); let cancelled = false, drained = false;
  const runtime = new OwnedRuntime(async (_ids, signal) => { cancelled = signal.aborted; });
  const admission = runtime.admit(() => commit.promise, refused);
  runtime.stopAdmission(); const drain = runtime.drain().then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false); assert.equal(runtime.status().owned, 1);
  commit.resolve(receipt()); assert.deepEqual(await admission, ['job-a']); await drain; assert.equal(cancelled, true);
});
test('17 an oversized committed receipt fences publication instead of widening capacity', async () => {
  let calls = 0; const runtime = new OwnedRuntime(async () => { calls++; });
  await assert.rejects(runtime.admit(async () => receipt(['a', 'b', 'c']), refused), /invalid_owned_batch/);
  assert.equal(calls, 0); assert.equal(runtime.status().fence?.phase, 'queue');
  await assert.rejects(runtime.drain(), { code: 'runner_fenced' });
});
test('18 repeated stop and drain never clear an existing failure fence', async () => {
  const runtime = new OwnedRuntime(async () => { throw new Error('failed'); });
  await runtime.admit(async () => receipt(), refused);
  await assert.rejects(runtime.drain(), { code: 'runner_fenced' }); const fence = runtime.status().fence;
  runtime.stopAdmission(); runtime.stopAdmission();
  await assert.rejects(runtime.drain(), { code: 'runner_fenced' }); assert.deepEqual(runtime.status().fence, fence);
});
