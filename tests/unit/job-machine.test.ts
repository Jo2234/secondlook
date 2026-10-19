import { expect, test } from 'vitest';
import { createAttempt, retryAttempt, step, type Event } from '../../src/domain/job-machine.js';
import type { TryOnAttempt } from '../../src/shared/types.js';
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
