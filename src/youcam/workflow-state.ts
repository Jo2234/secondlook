import type { ArtifactRecovery, DeletionReceipt, GeneratedImage, LedgerEntry, Listing, PreflightRecord, QualityReport, StoredPhoto, TryOnJob } from '../shared/types.js';
import type { RequestRecord } from '../domain/ledger.js';
import { isTerminal } from '../domain/job-machine.js';
import { STORE_MAX_JOBS, STORE_MAX_LISTINGS, STORE_MAX_PHOTOS } from './limits.js';
export interface BatchRecord { requestId: string; jobIds: string[]; deadlineAt: string }
export interface BuyerRecord { id: string; expiresAt: string; photoIds: string[]; imageIds: string[]; jobIds: string[] }
export interface WorkflowState {
  version: 1; seq: number; observing: boolean; preflight: PreflightRecord | null;
  photos: StoredPhoto[]; qualities: QualityReport[]; listings: Listing[]; jobs: TryOnJob[]; images: GeneratedImage[];
  ledger: LedgerEntry[]; requests: RequestRecord[]; batches: BatchRecord[]; recoveries: ArtifactRecovery[];
  buyers: BuyerRecord[]; receipts: DeletionReceipt[];
}
export function emptyState(): WorkflowState { return { version: 1, seq: 0, observing: false, preflight: null, photos: [], qualities: [], listings: [], jobs: [], images: [], ledger: [], requests: [], batches: [], recoveries: [], buyers: [], receipts: [] }; }
export function assertStoreBounds(s: WorkflowState): void {
  if (s.photos.length > STORE_MAX_PHOTOS || s.listings.length > STORE_MAX_LISTINGS || s.jobs.length > STORE_MAX_JOBS) throw new Error('store_full');
}
export function recoverState(previous: WorkflowState, now: string): { state: WorkflowState; resume: string[] } {
  const state = structuredClone(previous), resume: string[] = []; state.observing = false;
  for (const job of state.jobs) {
    const a = job.attempts.at(-1)!; if (isTerminal(a)) continue;
    const batch = state.batches.findLast(b => b.jobIds.includes(job.id));
    const future = a.attemptDeadlineAt !== null && Number.isFinite(Date.parse(a.attemptDeadlineAt)) && Date.parse(now) < Date.parse(a.attemptDeadlineAt)
      && batch !== undefined && Number.isFinite(Date.parse(batch.deadlineAt)) && Date.parse(now) < Date.parse(batch.deadlineAt);
    if (a.taskId && future && (a.state === 'polling' || a.state === 'downloading')) {
      // Drop only stale in-flight intent. Recovery cannot create/upload/POST, reset deadlines or get counts.
      const from = a.state; a.state = 'polling';
      a.history.push({ at: now, from, to: 'polling', reason: 'response:task_get' }, { at: now, from: 'polling', to: 'polling', reason: `grant:task_get:${Date.parse(now)}` });
      const entry = state.ledger.find(e => e.id === a.ledgerEntryId);
      if (entry?.state === 'reserved') { entry.state = 'possibly_spent'; entry.settledAt = now; entry.settledSeq = state.seq + 1; entry.reason = 'recovered_task'; }
      resume.push(job.id); continue;
    }
    const from = a.state;
    a.state = a.taskId ? 'timed_out' : a.postSendStartedAt ? 'uncertain' : 'failed';
    a.error = { code: a.taskId ? 'deadline' : a.postSendStartedAt ? 'interrupted_after_send' : 'interrupted', upstream: null, retryable: 'user_confirm', messageKey: 'interrupted' };
    a.history.push({ at: now, from, to: a.state, reason: 'startup_recovery' });
    const entry = state.ledger.find(e => e.id === a.ledgerEntryId);
    if (entry && entry.state !== 'spent' && entry.state !== 'released') {
      entry.state = a.postSendStartedAt || a.taskId ? 'possibly_spent' : 'released'; entry.settledAt = now; entry.settledSeq = state.seq + 1; entry.reason = a.error.code;
    }
  }
  for (const request of state.requests) if (request.jobIds.some(id => !state.jobs.some(j => j.id === id))) {
    for (const entry of state.ledger.filter(e => request.jobIds.includes(e.jobId))) {
      const a = state.jobs.find(j => j.id === entry.jobId)?.attempts.at(-1);
      if (entry.state === 'reserved') { entry.state = a && !a.postSendStartedAt ? 'released' : 'possibly_spent'; entry.settledAt = now; entry.settledSeq = state.seq + 1; entry.reason = 'recovery_inconsistent'; }
    }
  }
  return { state, resume };
}
export function markPostCommitment(state: WorkflowState, jobId: string, now: string): void {
  const a = state.jobs.find(j => j.id === jobId)!.attempts.at(-1)!;
  if (!a.postSendStartedAt || a.postCount < 1) throw new Error('missing_post_intent');
  const entry = state.ledger.find(e => e.id === a.ledgerEntryId);
  if (!entry || entry.state === 'spent' || entry.state === 'released') throw new Error('invalid_post_commitment');
  entry.state = 'possibly_spent'; entry.settledAt = now; entry.settledSeq = state.seq + 1; entry.reason = 'post_send_intent';
}
