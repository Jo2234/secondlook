import { expect, test } from 'vitest';
import { createAttempt, retryAttempt, step, type Event } from '../../src/domain/job-machine.js';
import type { TryOnAttempt } from '../../src/shared/types.js';
import { LIVE_REQUEST_POLICY, requestPolicy } from '../../src/youcam/limits.js';
const time = (ms: number) => new Date(Date.UTC(2026, 9, 19) + ms).toISOString();
function submitted(): TryOnAttempt {
  let a = createAttempt(1, 'entry1');
  for (const event of [{ type: 'start' }, { type: 'uploads_ok', srcFileId: 's', refFileId: 'r' }, { type: 'limiter_granted', request: 'task_post' }] as const) a = step(a, event, time(0)).attempt;
  return a;
}
test('F4/F35 every ambiguous POST outcome is absorbing uncertain with no second POST', () => {
  for (const event of [{ type: 'post_transport_error' }, { type: 'post_timeout' }, { type: 'post_parse_error' }, ...[500, 502, 503].map(http => ({ type: 'post_response' as const, http }))] as Event[]) {
    const result = step(submitted(), event, time(1));
    expect(result.attempt).toMatchObject({ state: 'uncertain', postCount: 1 });
    expect(result.effects).toContainEqual({ type: 'settle', state: 'possibly_spent' });
    expect(step(result.attempt, { type: 'limiter_granted', request: 'task_post' }, time(3600000)).effects).toEqual([]);
  }
});
test('F5 429 twice then task-created uses three POSTs; third 429 fails and releases', () => {
  let a = submitted();
  for (const [responseAt, sendAt] of [[100, 1200], [1300, 3400]] as const) { a = step(a, { type: 'post_response', http: 429 }, time(responseAt)).attempt; a = step(a, { type: 'limiter_granted', request: 'task_post' }, time(sendAt)).attempt; }
  expect(a.postCount).toBe(3);
  expect(step(a, { type: 'task_created', taskId: 'task-one' }, time(6000)).attempt).toMatchObject({ state: 'polling', taskId: 'task-one', postCount: 3 });
  const failed = step(a, { type: 'post_response', http: 429 }, time(6000));
  expect(failed.attempt).toMatchObject({ state: 'failed', postCount: 3, error: { code: 'rate_limited' } }); expect(failed.effects).toContainEqual({ type: 'settle', state: 'released' });
});
test('live request policy: a 429 on the single cloth-task POST fails and releases without a second POST', () => {
  const failed = step(submitted(), { type: 'post_response', http: 429 }, time(100), { taskPosts: LIVE_REQUEST_POLICY.taskPosts });
  expect(failed.attempt).toMatchObject({ state: 'failed', postCount: 1, error: { code: 'rate_limited' } });
  expect(failed.effects).toContainEqual({ type: 'settle', state: 'released' }); expect(failed.effects.some(e => e.type === 'request_grant' || e.type === 'request')).toBe(false);
  expect(step(failed.attempt, { type: 'limiter_granted', request: 'task_post' }, time(5000), { taskPosts: 1 }).attempt.postCount).toBe(1);
  expect(requestPolicy('live')).toEqual({ uploadTries: 1, slotRefreshes: 0, taskPosts: 1 }); expect(requestPolicy('unexpected')).toBe(LIVE_REQUEST_POLICY);
  expect(requestPolicy('fixture')).toEqual({ uploadTries: 3, slotRefreshes: 1, taskPosts: 3 });
});
test('cancel before sending releases; after sending is uncertain; after a definitive 429 releases', () => {
  const queuedPost = step(step(createAttempt(1, 'e'), { type: 'start' }, time(0)).attempt, { type: 'uploads_ok', srcFileId: 's', refFileId: 'r' }, time(0)).attempt;
  expect(step(queuedPost, { type: 'cancel' }, time(1))).toMatchObject({ attempt: { state: 'cancelled', postCount: 0 } });
  expect(step(submitted(), { type: 'cancel' }, time(1))).toMatchObject({ attempt: { state: 'uncertain' }, effects: [{ type: 'abort_cleanup' }, { type: 'settle', state: 'possibly_spent' }] });
  const rejected = step(submitted(), { type: 'post_response', http: 429 }, time(1)).attempt;
  expect(step(rejected, { type: 'cancel' }, time(2))).toMatchObject({ attempt: { state: 'cancelled' }, effects: [{ type: 'abort_cleanup' }, { type: 'settle', state: 'released' }] });
});
test('F7 one result refresh; F19 polling cancellation; I4 no request after original deadline', () => {
  let a = step(submitted(), { type: 'task_created', taskId: 'task' }, time(1)).attempt;
  const cancelled = step(a, { type: 'cancel' }, time(2)); expect(cancelled.attempt.state).toBe('cancelled');
  expect(cancelled.effects).toContainEqual({ type: 'settle', state: 'possibly_spent' });
  expect(step(a, { type: 'poll_due' }, a.attemptDeadlineAt!).effects.filter(e => e.type === 'request' || e.type === 'request_grant')).toEqual([]);
  for (const t of [6000, 7000]) {
    if (a.state === 'polling' && t === 6000) a = step(a, { type: 'poll_due' }, time(t)).attempt;
    a = step(a, { type: 'limiter_granted', request: 'task_get' }, time(t)).attempt;
    a = step(a, { type: 'poll_success', url: 'https://media/result' }, time(t)).attempt;
    a = step(a, { type: 'limiter_granted', request: 'download' }, time(t)).attempt;
    a = step(a, { type: 'download_failed', expired: true }, time(t)).attempt;
  }
  expect(a).toMatchObject({ state: 'failed', taskId: 'task', error: { code: 'result_download_failed' } });
});
test('I5 retry requires fresh confirmation request and ledger identity', () => {
  const failed = step(submitted(), { type: 'post_timeout' }, time(1)).attempt;
  const input = { ledgerEntryId: 'entry2', requestId: 'a1234567-1234-4234-8234-123456789012', previousRequestId: 'old', confirmCostCu: 200, expectedCostCu: 200 };
  expect(retryAttempt(failed, input)).toMatchObject({ n: 2, state: 'queued', ledgerEntryId: 'entry2', taskId: null, postCount: 0 });
  expect(() => retryAttempt(failed, { ...input, ledgerEntryId: 'entry1' })).toThrow('retry_not_admitted');
});

function pollingAttempt(): TryOnAttempt { return step(submitted(), { type: 'task_created', taskId: 'task' }, time(1)).attempt; }
function expiredResult(): TryOnAttempt {
  let a = pollingAttempt();
  for (const event of [{ type: 'poll_due' }, { type: 'limiter_granted', request: 'task_get' }, { type: 'poll_success', url: 'https://media/result' }, { type: 'limiter_granted', request: 'download' }, { type: 'download_failed', expired: true }] as const) a = step(a, event, time(6000)).attempt;
  return a;
}
test('GET limiter failures share the consecutive retry/backoff cap without counting an unsent HTTP GET', () => {
  let a = pollingAttempt(), clock = 5001;
  const expectedBackoffs = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];
  for (let i = 0; i <= 8; i++) {
    a = step(a, { type: 'poll_due' }, time(clock)).attempt;
    const result = step(a, { type: 'limiter_failed' }, time(clock), { jitterFactor: .8 });
    expect(result.attempt.getCount).toBe(0);
    expect(result.attempt.history.filter(h => h.reason === 'get_error')).toHaveLength(i + 1);
    expect(result.effects.filter(e => e.type === 'request')).toEqual([]);
    if (i < 8) {
      expect(result.effects).toEqual([{ type: 'wait', until: Date.parse(time(clock)) + expectedBackoffs[i]! * .8 }]);
      clock += expectedBackoffs[i]! * .8;
    } else {
      expect(result.attempt).toMatchObject({ state: 'failed', taskId: 'task', error: { code: 'get_retries_exhausted' } });
      expect(result.effects).toContainEqual({ type: 'settle', state: 'possibly_spent' });
      expect(step(result.attempt, { type: 'poll_due' }, time(clock + 3600000)).effects).toEqual([]);
    }
    a = result.attempt;
  }
});
test('a successful running GET resets the shared consecutive error allowance', () => {
  let a = pollingAttempt();
  a = step(a, { type: 'poll_due' }, time(5001)).attempt;
  a = step(a, { type: 'limiter_failed' }, time(5001)).attempt;
  a = step(a, { type: 'poll_due' }, time(6001)).attempt;
  a = step(a, { type: 'limiter_granted', request: 'task_get' }, time(6001)).attempt;
  a = step(a, { type: 'get_error' }, time(6001)).attempt;
  a = step(a, { type: 'poll_due' }, time(8001)).attempt;
  a = step(a, { type: 'limiter_granted', request: 'task_get' }, time(8001)).attempt;
  a = step(a, { type: 'poll_running' }, time(8001)).attempt;
  a = step(a, { type: 'poll_due' }, time(13001)).attempt;
  const result = step(a, { type: 'limiter_failed' }, time(13001));
  expect(result.attempt.getCount).toBe(2); expect(result.effects).toEqual([{ type: 'wait', until: Date.parse(time(14001)) }]);
});
test('refresh running, engine error and transport failure terminate without another GET', () => {
  for (const event of [{ type: 'poll_running' }, { type: 'poll_error', code: 'error_pose' }, { type: 'get_error' }] as const) {
    let a = expiredResult();
    a = step(a, { type: 'limiter_granted', request: 'task_get' }, time(6001)).attempt;
    const result = step(a, event, time(6002));
    expect(result.attempt).toMatchObject({ state: 'failed', taskId: 'task', getCount: 2, error: { code: 'result_download_failed' } });
    expect(result.effects).toEqual([{ type: 'abort_cleanup' }, { type: 'settle', state: 'possibly_spent' }]);
    for (const next of [{ type: 'poll_due' }, { type: 'limiter_granted', request: 'task_get' }] as const) expect(step(result.attempt, next, time(3600000)).effects).toEqual([]);
  }
});
test('refresh limiter failure sends zero refresh GETs and cannot re-enter polling', () => {
  const result = step(expiredResult(), { type: 'limiter_failed' }, time(6001));
  expect(result.attempt).toMatchObject({ state: 'failed', getCount: 1, taskId: 'task', error: { code: 'result_download_failed' } });
  expect(result.effects).toEqual([{ type: 'abort_cleanup' }, { type: 'settle', state: 'possibly_spent' }]);
  expect(step(result.attempt, { type: 'poll_due' }, time(3600000)).effects).toEqual([]);
});
test('successful refresh permits one new download; second expiry never requests a second refresh', () => {
  let a = expiredResult();
  for (const event of [{ type: 'limiter_granted', request: 'task_get' }, { type: 'poll_success', url: 'https://media/fresh' }, { type: 'limiter_granted', request: 'download' }] as const) a = step(a, event, time(6001)).attempt;
  expect(step(a, { type: 'downloaded' }, time(6002)).attempt.state).toBe('succeeded');
  const failed = step(a, { type: 'download_failed', expired: true }, time(6002));
  expect(failed.attempt).toMatchObject({ state: 'failed', getCount: 2, taskId: 'task', error: { code: 'result_download_failed' } });
  expect(failed.effects.filter(e => e.type === 'request' || e.type === 'request_grant')).toEqual([]);
});
test('refresh preserves original attempt, batch and download deadlines and cancellation', () => {
  const a = expiredResult();
  for (const [at, options] of [[a.attemptDeadlineAt!, {}], [time(6002), { batchDeadlineAt: time(6002) }], [time(66000), {}]] as const) {
    const result = step(a, { type: 'limiter_granted', request: 'task_get' }, at, options);
    expect(result.effects.filter(e => e.type === 'request' || e.type === 'request_grant' || e.type === 'wait')).toEqual([]);
    expect(['failed', 'timed_out']).toContain(result.attempt.state);
    expect(result.effects).toContainEqual({ type: 'settle', state: 'possibly_spent' });
  }
  expect(step(a, { type: 'cancel' }, time(6002))).toMatchObject({ attempt: { state: 'cancelled' }, effects: [{ type: 'abort_cleanup' }, { type: 'settle', state: 'possibly_spent' }] });
});
