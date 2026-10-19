import { expect, test } from 'vitest';
import { admit, balanceEstimateCu, beginObservation, committedCu, settle, type AdmissionInput, type LedgerState } from '../../src/domain/ledger.js';
import type { LedgerEntry, PreflightRecord } from '../../src/shared/types.js';
const now = '2026-10-19T01:00:00.000Z';
const preflight: PreflightRecord = { at: now, baseUrl: 'https://yce-api-01.makeupar.com', fenceSeq: 10, featureCost: { matched: [], costPerTaskCu: 400, status: 'ok' }, balanceCu: 10000, ok: true, problems: [] };
const empty: LedgerState = { entries: [], requests: [], seq: 10, observing: false };
function input(i = 1, n = 1, state = empty): AdmissionInput {
  return { state, body: { requestId: `a1234567-1234-4234-8234-${String(i).padStart(12, '0')}`, listingId: 'listing', garmentPhotoId: 'garment', modelPhotoIds: Array.from({ length: n }, (_, j) => `m${j}`), confirmCostCu: 400 * n }, mode: 'live', budgetCu: 1000, preflight, now, allocations: Array.from({ length: n }, (_, j) => ({ entryId: `e${i}${j}`, jobId: `j${i}${j}`, attempt: 1 })) };
}
const entry = (state: LedgerEntry['state'], cu: number, seq: number): LedgerEntry => ({ id: state + seq, jobId: 'j', attempt: 1, mode: 'live', cu, state, at: now, createdSeq: 1, settledAt: state === 'reserved' ? null : now, settledSeq: state === 'reserved' ? null : seq, reason: '' });
test('F9 pure sequential mutex model admits two of five with budget 10 cost 4; replay has same total', () => {
  let state = empty, admitted = 0, rejected = 0;
  for (let i = 1; i <= 5; i++) { const result = admit(input(i, 1, state)); if (result.ok) { state = result.state; admitted++; } else { expect(result.error).toBe('budget_exceeded'); rejected++; } }
  expect([admitted, rejected, committedCu(state.entries)]).toEqual([2, 3, 800]);
  expect(committedCu(JSON.parse(JSON.stringify(state.entries)))).toBe(800);
});
test('F28 atomic N=2 refuses a partial batch and idempotent requests preserve state', () => {
  const first = admit(input()); if (!first.ok) throw new Error('first refused');
  const before = JSON.stringify(first.state);
  expect(admit(input(2, 2, first.state))).toEqual({ ok: false, error: 'budget_exceeded' }); expect(JSON.stringify(first.state)).toBe(before);
  const replay = admit(input(1, 1, first.state)); expect(replay).toMatchObject({ ok: true, replay: true, jobIds: first.jobIds });
  expect(admit({ ...input(1, 1, first.state), body: { ...input().body, garmentPhotoId: 'changed' } })).toEqual({ ok: false, error: 'request_id_conflict' });
});
test('F29/F37 fence deducts all outstanding and only post-fence spent, with one-task margin', () => {
  const entries = [entry('reserved', 200, 1), entry('possibly_spent', 100, 1), entry('spent', 300, 11), entry('spent', 900, 10)];
  expect(balanceEstimateCu({ balanceCu: 1000, fenceSeq: 10 }, entries)).toBe(400);
  expect(admit({ ...input(), preflight: { ...preflight, balanceCu: 700 } })).toEqual({ ok: false, error: 'insufficient_balance_estimate' });
  expect(admit({ ...input(), preflight: { ...preflight, balanceCu: 800 } }).ok).toBe(true);
  expect(beginObservation(12, entries, 0, false)).toEqual({ ok: false, error: 'preflight_busy' });
  expect(beginObservation(12, [], 1, false)).toEqual({ ok: false, error: 'preflight_busy' });
  expect(admit({ ...input(), state: { ...empty, observing: true } })).toEqual({ ok: false, error: 'preflight_in_progress' });
});
test('settlement permanently retains possibly-spent commitments and releases only proven non-acceptance', () => {
  const reserved = entry('reserved', 400, 1);
  const unknown = settle(reserved, { success: false, postStarted: true, definitiveNonAccepting: false }, now, 11);
  expect(unknown.state).toBe('possibly_spent'); expect(settle(unknown, { success: false, postStarted: false, definitiveNonAccepting: true }, now, 12)).toBe(unknown);
  expect(settle(reserved, { success: false, postStarted: true, definitiveNonAccepting: true }, now, 11).state).toBe('released');
  expect(settle(reserved, { success: true, postStarted: true, definitiveNonAccepting: false }, now, 11).state).toBe('spent');
});

test('F29 refreshed observation deducts old unresolved commitments and rejects need4 from observed10 minus8', () => {
  const unresolved = [{ ...entry('reserved', 400, 1), createdSeq: 1 }, { ...entry('possibly_spent', 400, 2), createdSeq: 2 }];
  expect(balanceEstimateCu({ balanceCu: 1000, fenceSeq: 10 }, unresolved)).toBe(200);
  const request = { ...input(), budgetCu: 10000, state: { ...empty, entries: unresolved }, preflight: { ...preflight, balanceCu: 1000 } };
  expect(admit(request)).toEqual({ ok: false, error: 'insufficient_balance_estimate' });
});
test('F25 pure settlement releases a proved-unsent reservation once and preserves charged or ambiguous totals on replay', () => {
  const reserved = entry('reserved', 400, 1);
  const unsent = settle(reserved, { success: false, postStarted: false, definitiveNonAccepting: false }, now, 11);
  expect(unsent.state).toBe('released'); expect(committedCu([unsent])).toBe(0);
  expect(settle(unsent, { success: false, postStarted: false, definitiveNonAccepting: false }, now, 12)).toBe(unsent);
  for (const success of [false, true]) {
    const settled = settle(reserved, { success, postStarted: true, definitiveNonAccepting: false }, now, 11);
    const replayed = JSON.parse(JSON.stringify(settled)) as LedgerEntry;
    expect(committedCu([replayed])).toBe(400);
    expect(settle(replayed, { success: false, postStarted: false, definitiveNonAccepting: true }, now, 12)).toBe(replayed);
    expect(committedCu([replayed])).toBe(400);
  }
  // Spawn/SIGKILL/store replay F25 cases remain pending the S2 store and an integration grant.
});
