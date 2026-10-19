import type { Id, IsoTime, LedgerEntry, Mode, PreflightRecord, TryOnRequest } from '../shared/types.js';
import { PREFLIGHT_MAX_AGE_MS } from '../youcam/limits.js';
export const committedCu = (entries: readonly LedgerEntry[]): number => entries.reduce((n, e) => n + (e.state === 'released' ? 0 : e.cu), 0);
export function balanceEstimateCu(preflight: Pick<PreflightRecord, 'balanceCu' | 'fenceSeq'>, entries: readonly LedgerEntry[]): number | null {
  if (preflight.balanceCu === null) return null;
  return preflight.balanceCu - entries.reduce((n, e) => n + (e.state === 'reserved' || e.state === 'possibly_spent' || e.state === 'spent' && (e.settledSeq === null || e.settledSeq > preflight.fenceSeq) ? e.cu : 0), 0);
}
export function beginObservation(seq: number, entries: readonly LedgerEntry[], nonTerminalAttempts: number, observing: boolean): { ok: true; fenceSeq: number; observing: true } | { ok: false; error: string } {
  if (observing) return { ok: false, error: 'preflight_in_progress' };
  if (nonTerminalAttempts !== 0 || entries.some(e => e.state === 'reserved')) return { ok: false, error: 'preflight_busy' };
  return { ok: true, fenceSeq: seq, observing: true };
}
export interface AdmissionBody extends TryOnRequest { listingId: Id }
export interface RequestRecord { requestId: string; bodyKey: string; jobIds: Id[] }
export interface LedgerState { entries: readonly LedgerEntry[]; requests: readonly RequestRecord[]; seq: number; observing: boolean }
const key = (body: AdmissionBody): string => JSON.stringify([body.listingId, body.garmentPhotoId, body.modelPhotoIds, body.confirmCostCu]);
export interface AdmissionInput { state: LedgerState; body: AdmissionBody; mode: Mode; budgetCu: number; preflight: PreflightRecord | null; now: IsoTime; allocations: { entryId: Id; jobId: Id; attempt: number }[] }
export type AdmissionResult = { ok: false; error: string } | { ok: true; replay: boolean; jobIds: Id[]; state: LedgerState };
// Caller commits the returned state AND corresponding jobs atomically under the store mutex.
export function admit(input: AdmissionInput): AdmissionResult {
  const { state, body, mode, preflight, allocations } = input;
  const reject = (error: string): AdmissionResult => ({ ok: false, error });
  const stored = state.requests.find(r => r.requestId === body.requestId);
  if (stored) return stored.bodyKey === key(body) ? { ok: true, replay: true, jobIds: [...stored.jobIds], state } : reject('request_id_conflict');
  if (state.observing) return reject('preflight_in_progress');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return reject('invalid_request');
  const n = body.modelPhotoIds.length;
  if (n < 1 || n > 2 || allocations.length !== n || new Set(body.modelPhotoIds).size !== n) return reject('invalid_request');
  if (new Set(allocations.map(a => a.entryId)).size !== n || new Set(allocations.map(a => a.jobId)).size !== n || allocations.some(a => state.entries.some(e => e.id === a.entryId || e.jobId === a.jobId && e.attempt === a.attempt))) return reject('allocation_conflict');
  const cost = mode === 'fixture' ? 0 : preflight?.featureCost.costPerTaskCu;
  if (mode === 'live' && (!preflight || !preflight.ok || preflight.featureCost.status !== 'ok')) return reject(preflight?.featureCost.status !== 'ok' ? preflight?.featureCost.status ?? 'cost_unknown' : 'cost_unknown');
  if (cost === null || cost === undefined || !Number.isSafeInteger(cost) || cost < 0) return reject('cost_invalid');
  if (mode === 'live' && (!Number.isFinite(Date.parse(input.now)) || !Number.isFinite(Date.parse(preflight!.at)) || Date.parse(input.now) < Date.parse(preflight!.at) || Date.parse(input.now) - Date.parse(preflight!.at) > PREFLIGHT_MAX_AGE_MS)) return reject('preflight_stale');
  const need = cost * n;
  if (body.confirmCostCu !== need) return reject('cost_mismatch');
  if (!Number.isSafeInteger(input.budgetCu) || input.budgetCu < 0 || committedCu(state.entries) + need > input.budgetCu) return reject('budget_exceeded');
  const estimate = preflight ? balanceEstimateCu(preflight, state.entries) : null;
  if (mode === 'live' && (estimate === null || estimate - need < cost)) return reject('insufficient_balance_estimate');
  const seq = state.seq + 1;
  const entries: LedgerEntry[] = allocations.map(a => ({ id: a.entryId, jobId: a.jobId, attempt: a.attempt, mode, cu: cost, state: 'reserved', at: input.now, createdSeq: seq, settledAt: null, settledSeq: null, reason: 'admitted' }));
  const jobIds = allocations.map(a => a.jobId);
  return { ok: true, replay: false, jobIds, state: { ...state, seq, entries: [...state.entries, ...entries], requests: [...state.requests, { requestId: body.requestId, bodyKey: key(body), jobIds }] } };
}
export function settle(entry: LedgerEntry, outcome: { success: boolean; postStarted: boolean; definitiveNonAccepting: boolean }, at: IsoTime, seq: number): LedgerEntry {
  if (entry.state !== 'reserved') return entry; // Possibly spent is permanent; terminal settlements are idempotent.
  return { ...entry, state: outcome.success ? 'spent' : outcome.postStarted && !outcome.definitiveNonAccepting ? 'possibly_spent' : 'released', settledAt: at, settledSeq: seq, reason: outcome.success ? 'success' : outcome.definitiveNonAccepting ? 'definitive_non_acceptance' : outcome.postStarted ? 'acceptance_unknown' : 'not_started' };
}
