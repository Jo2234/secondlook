import fc from 'fast-check';
import { expect, test } from 'vitest';
import { createAttempt, isTerminal, retryAttempt, step, type Event, type RequestKind } from '../../src/domain/job-machine.js';
import { DEFAULT_TASK_DEADLINE_MS, maxTaskGets } from '../../src/youcam/limits.js';
const options = { numRuns: 200, seed: 20261019 };
const events: Event[] = [{ type: 'start' }, { type: 'uploads_ok', srcFileId: 's', refFileId: 'r' }, { type: 'limiter_granted', request: 'task_post' }, { type: 'task_created', taskId: 'one' }, { type: 'task_created', taskId: 'two' }, { type: 'post_response', http: 429 }, { type: 'post_response', http: 400, errorCode: 'BadRequest' }, { type: 'post_transport_error' }, { type: 'poll_due' }, { type: 'limiter_granted', request: 'task_get' }, { type: 'poll_running' }, { type: 'poll_success', url: 'https://example.invalid/result' }, { type: 'limiter_granted', request: 'download' }, { type: 'downloaded' }, { type: 'download_failed', expired: true }, { type: 'get_error' }, { type: 'cancel' }];
const start = Date.UTC(2026, 9, 19);
test('I1–I4/I6/I7 arbitrary interleavings preserve task identity bounds terminal absorption and one granted request (seed 20261019)', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: events.length - 1 }), fc.integer({ min: 0, max: 30000 })), { minLength: 100, maxLength: 200 }), sequence => {
    let a = createAttempt(1, 'entry'), now = start, taskId: string | null = null, inFlight: RequestKind | null = null;
    for (const [index, delta] of sequence) {
      const event = events[index]!; now += delta;
      const wasTerminal = isTerminal(a), oldState = a.state;
      const result = step(a, event, new Date(now).toISOString());
      if (wasTerminal) { expect(result.attempt.state).toBe(oldState); expect(result.effects).toEqual([]); }
      if (taskId) { expect(result.attempt.taskId).toBe(taskId); expect(result.effects.filter(e => e.type === 'request' && e.request === 'task_post')).toEqual([]); }
      if (a.attemptDeadlineAt && now >= Date.parse(a.attemptDeadlineAt)) expect(result.effects.filter(e => ['request', 'request_grant', 'wait'].includes(e.type))).toEqual([]);
      for (const effect of result.effects) {
        if (effect.type === 'request') { expect(event.type).toBe('limiter_granted'); expect(inFlight).toBeNull(); inFlight = effect.request; }
        if (effect.type === 'abort_cleanup') inFlight = null;
      }
      // A response is observed only if the reducer recorded a response marker this step.
      if (result.attempt.history.slice(a.history.length).some(h => h.reason.startsWith('response:'))) inFlight = null;
      if (isTerminal(result.attempt) && result.attempt.postSendStartedAt) {
        const settlement = result.effects.find(e => e.type === 'settle');
        if (!wasTerminal && settlement?.type === 'settle') {
          const rejected = result.attempt.history.filter(h => h.reason === 'post_rejected').length === result.attempt.postCount;
          expect(settlement.state).toBe(result.attempt.state === 'succeeded' ? 'spent' : rejected ? 'released' : 'possibly_spent');
        }
      }
      expect(result.attempt.postCount).toBeLessThanOrEqual(3); expect(result.attempt.getCount).toBeLessThanOrEqual(maxTaskGets(DEFAULT_TASK_DEADLINE_MS));
      taskId = result.attempt.taskId; a = result.attempt;
    }
  }), options);
});

test('I5 paid retries always create n+1 with a fresh ledger identity (seed 20261019)', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 100000 }), (n, cost) => {
    const previous = { ...createAttempt(n, 'old-entry'), state: 'uncertain' as const };
    const request = { ledgerEntryId: 'new-entry', requestId: 'a1234567-1234-4234-8234-123456789012', previousRequestId: 'previous', confirmCostCu: cost, expectedCostCu: cost };
    expect(retryAttempt(previous, request)).toMatchObject({ n: n + 1, ledgerEntryId: 'new-entry', taskId: null, postCount: 0 });
    expect(() => retryAttempt(previous, { ...request, requestId: request.previousRequestId })).toThrow();
    expect(() => retryAttempt(previous, { ...request, confirmCostCu: cost + 1 })).toThrow();
  }), options);
});
