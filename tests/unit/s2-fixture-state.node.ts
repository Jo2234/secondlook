// Direct Node root, test isolation disabled. New pure/injected logic only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureClient, scenarioForHash } from '../../src/youcam/fixture-client.js';
import type { FixtureScenario } from '../../src/youcam/fixture-client.js';
import { YouCamError } from '../../src/youcam/client.js';
import { safeError, safeHeaders, safeUrl, shortId } from '../../src/youcam/redact.js';
import { emptyState, markPostCommitment, recoverState } from '../../src/youcam/workflow-state.js';
import { collectPreflight } from '../../src/youcam/preflight-run.js';
import type { WorkflowState } from '../../src/youcam/workflow-state.js';
const at = '2026-10-19T06:00:00.000Z', future = '2026-10-19T06:05:00.000Z';
const call = () => ({ signal: new AbortController().signal });
const body = { src_file_id: 'src', ref_file_id: 'ref', garment_category: 'upper_body' as const, change_shoes: false, filter_multi_person: 'strict' as const };
function fixture(scenario: FixtureScenario = 'ok') { return new FixtureClient({ scenario, now: () => Date.parse(at), result: async () => new Uint8Array([1, 2, 3]) }); }
function state(phase: 'queued' | 'submitting' | 'polling' | 'downloading' | 'succeeded', sent = true): WorkflowState {
  const s = emptyState(); s.seq = 12;
  s.jobs.push({ id: 'job', mode: 'fixture', listingId: null, buyerSessionId: null, garmentPhotoId: 'garment', modelPhotoId: 'model', category: 'upper_body', request: { garment_category: 'upper_body', change_shoes: false, filter_multi_person: 'strict' }, createdAt: at, requestId: 'request', resultImageId: null,
    attempts: [{ n: 1, state: phase, taskId: ['polling', 'downloading', 'succeeded'].includes(phase) ? 'task-keep' : null, srcFileId: null, refFileId: null, postCount: sent ? 1 : 0, getCount: 7, uploadsStartedAt: at, postSendStartedAt: sent ? at : null, attemptDeadlineAt: future, submittedAt: at, deadlineAt: future, error: null, ledgerEntryId: 'entry', history: [] }] });
  s.ledger.push({ id: 'entry', jobId: 'job', attempt: 1, mode: 'fixture', cu: 400, state: phase === 'succeeded' ? 'spent' : 'reserved', at, createdSeq: 1, settledAt: null, settledSeq: null, reason: 'admitted' });
  s.batches.push({ requestId: 'request', jobIds: ['job'], deadlineAt: future }); return s;
}
test('S2 fixture has three running polls then success and never invents a price', async () => {
  const client = fixture(); assert.deepEqual(await client.createClothTask(body, call()), { taskId: 'fixture-task-1' });
  for (let i = 0; i < 3; i++) assert.equal((await client.getClothTask('fixture-task-1', call())).status, 'running');
  assert.equal((await client.getClothTask('fixture-task-1', call())).status, 'success');
  assert.deepEqual(await client.featureCost(call()), []); assert.equal(await client.creditBalance(call()), 0);
});
test('S2 fixture distinguishes ambiguous transport from received status and no-units', async () => {
  for (const [scenario, expected] of [['post_ambiguous', { kind: 'timeout' }], ['post_transport_error', { kind: 'transport' }], ['post_5xx', { kind: 'http', http: 503 }], ['no_units', { kind: 'http', http: 400, errorCode: 'CreditInsufficiency' }]] as const) await assert.rejects(fixture(scenario).createClothTask(body, call()), expected);
  const limited = fixture('rate_limited');
  await assert.rejects(limited.createClothTask(body, call()), { http: 429 }); await assert.rejects(limited.createClothTask(body, call()), { http: 429 });
  assert.deepEqual(await limited.createClothTask(body, call()), { taskId: 'fixture-task-1' });
});
test('S2 fixture one-expiry refresh and abort are deterministic without a network', async () => {
  const client = fixture('url_expired_once'), url = 'https://yce-us.s3-accelerate.amazonaws.com/fixture-result-4.png';
  await assert.rejects(client.download(url, call()), { http: 403 }); assert.deepEqual(await client.download(url, call()), new Uint8Array([1, 2, 3]));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.createClothTask(body, { signal: controller.signal }), { kind: 'aborted' }); assert.equal(client.counts.posts, 0);
});
test('S2 fixture scenario selection uses longest hexadecimal prefix and safe default', () => {
  assert.equal(scenarioForHash('abcdef123', { ab: 'slow', abcdef: 'never', '': 'no_units' }), 'never');
  assert.equal(scenarioForHash('ff', { ab: 'slow' }), 'ok');
});
test('S2 redaction reconstructs errors and strips bearer and presigned query secrets', () => {
  assert.equal(safeUrl('https://yce-us.s3-accelerate.amazonaws.com/a?X-Amz-Signature=yc_CANARY#secret'), 'https://yce-us.s3-accelerate.amazonaws.com/a');
  assert.deepEqual(safeHeaders({ aUtHoRiZaTiOn: 'Bearer yc_CANARY', 'X-Api-Key': 'yc_CANARY', Accept: 'image/png' }), { 'X-Api-Key': '[redacted]', Accept: 'image/png' });
  assert.deepEqual(safeError(new Error('yc_CANARY')), { kind: 'internal' });
  assert.deepEqual(safeError(new YouCamError('http', { http: 401, errorCode: 'yc_CANARY_7f3a' })), { kind: 'http', http: 401 });
  assert.equal(shortId('1234567890123456'), '12345678…');
});
test('S2 write-ahead commitment precedes permission to POST', () => {
  const s = state('submitting'); markPostCommitment(s, 'job', at);
  assert.equal(s.ledger[0]!.state, 'possibly_spent'); assert.equal(s.ledger[0]!.settledSeq, 13);
  assert.throws(() => markPostCommitment(state('submitting', false), 'job', at), /missing_post_intent/);
});
test('S2 recovery releases provably unsent work and preserves ambiguous commitments idempotently', () => {
  const unsent = recoverState(state('queued', false), at); assert.deepEqual(unsent.resume, []); assert.equal(unsent.state.ledger[0]!.state, 'released');
  const sent = recoverState(state('submitting'), at); assert.deepEqual(sent.resume, []); assert.equal(sent.state.jobs[0]!.attempts[0]!.state, 'uncertain'); assert.equal(sent.state.ledger[0]!.state, 'possibly_spent');
  assert.deepEqual(recoverState(sent.state, at).state, sent.state);
});
test('S2 recovery is GET-only inside both original deadlines and requests nothing after either', () => {
  for (const phase of ['polling', 'downloading'] as const) {
    const original = state(phase), before = structuredClone(original), recovered = recoverState(original, at);
    assert.deepEqual(original, before); assert.deepEqual(recovered.resume, ['job']);
    const a = recovered.state.jobs[0]!.attempts[0]!;
    assert.equal(a.taskId, 'task-keep'); assert.equal(a.postCount, 1); assert.equal(a.getCount, 7); assert.equal(a.attemptDeadlineAt, future); assert.equal(a.deadlineAt, future);
    assert.equal(a.history.at(-1)!.reason, `grant:task_get:${Date.parse(at)}`); assert.equal(recovered.state.ledger[0]!.state, 'possibly_spent');
    for (const expireBatch of [false, true]) {
      const expired = state(phase); if (expireBatch) expired.batches[0]!.deadlineAt = at; else expired.jobs[0]!.attempts[0]!.attemptDeadlineAt = at;
      const result = recoverState(expired, at); assert.deepEqual(result.resume, []); assert.equal(result.state.jobs[0]!.attempts[0]!.state, 'timed_out'); assert.equal(result.state.ledger[0]!.state, 'possibly_spent');
    }
  }
});
test('S2 succeeded stays absorbing; fixture preflight explicitly costs zero without vendor calls', async () => {
  const original = state('succeeded'); assert.deepEqual(recoverState(original, future), { state: original, resume: [] });
  const client = fixture(), record = await collectPreflight({ client, signal: call().signal, fenceSeq: 12, baseUrl: 'fixture' });
  assert.equal(record.ok, true); assert.equal(record.balanceCu, 0); assert.deepEqual(record.featureCost, { matched: [], costPerTaskCu: 0, status: 'ok' });
  assert.deepEqual(client.counts, { posts: 0, gets: 0, files: 0, downloads: 0 });
});
