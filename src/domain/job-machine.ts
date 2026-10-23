import type { Id, IsoTime, JobState, TryOnAttempt, UserError } from '../shared/types.js';
import { mapError } from './errors.js';
import { attemptDeadlineMs, DEFAULT_TASK_DEADLINE_MS, DOWNLOAD_PHASE_MS, GET_BACKOFF_MS, MAX_GET_RETRIES, MAX_RESULT_REFRESHES, MAX_TASK_POSTS, maxTaskGets, POLL_FAST_MS, POLL_FAST_UNTIL_MS, POLL_SLOW_MS, UPLOAD_PHASE_MS } from '../youcam/limits.js';
export type RequestKind = 'file_post' | 'upload_put' | 'task_post' | 'task_get' | 'download';
export type Effect = { type: 'request_grant'; request: RequestKind; notBefore: number } | { type: 'request'; request: RequestKind } | { type: 'wait'; until: number } | { type: 'abort_cleanup' } | { type: 'settle'; state: 'spent' | 'released' | 'possibly_spent' };
export type Event =
  | { type: 'start' } | { type: 'request_upload'; request: 'file_post' | 'upload_put' } | { type: 'upload_request_finished' }
  | { type: 'uploads_ok'; srcFileId: string; refFileId: string } | { type: 'upload_failed' }
  | { type: 'limiter_granted'; request: RequestKind } | { type: 'limiter_failed' }
  | { type: 'task_created'; taskId: string } | { type: 'post_response'; http: number; errorCode?: string }
  | { type: 'post_transport_error' | 'post_timeout' | 'post_parse_error' }
  | { type: 'poll_due' } | { type: 'poll_running' } | { type: 'poll_success'; url: string } | { type: 'poll_error'; code: string }
  | { type: 'get_error' } | { type: 'downloaded' } | { type: 'download_failed'; expired: boolean }
  | { type: 'cancel' | 'attempt_deadline' | 'task_deadline' | 'upload_phase_deadline' | 'download_phase_deadline' };
const terminalStates = new Set<JobState>(['succeeded', 'failed', 'timed_out', 'uncertain', 'cancelled']);
export const isTerminal = (a: Pick<TryOnAttempt, 'state'>): boolean => terminalStates.has(a.state);
export function createAttempt(n: number, ledgerEntryId: Id): TryOnAttempt {
  return { n, state: 'queued', taskId: null, srcFileId: null, refFileId: null, postCount: 0, getCount: 0, uploadsStartedAt: null, postSendStartedAt: null, attemptDeadlineAt: null, submittedAt: null, deadlineAt: null, error: null, ledgerEntryId, history: [] };
}
export function retryAttempt(previous: TryOnAttempt, input: { ledgerEntryId: Id; requestId: string; previousRequestId: string; confirmCostCu: number; expectedCostCu: number }): TryOnAttempt {
  if (!['failed', 'timed_out', 'uncertain', 'cancelled'].includes(previous.state) || input.ledgerEntryId === previous.ledgerEntryId || input.requestId === input.previousRequestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId) || !Number.isSafeInteger(input.confirmCostCu) || input.confirmCostCu < 0 || input.confirmCostCu !== input.expectedCostCu) throw new Error('retry_not_admitted');
  return createAttempt(previous.n + 1, input.ledgerEntryId);
}
// Request intent is durable in the canonical attempt history; no unpersisted in-flight flag.
function requestState(a: TryOnAttempt): { phase: 'grant' | 'request'; kind: RequestKind; notBefore: number } | null {
  for (let i = a.history.length - 1; i >= 0; i--) {
    const reason = a.history[i]!.reason;
    if (reason.startsWith('response:')) return null;
    const parts = reason.split(':');
    if (parts[0] === 'grant' || parts[0] === 'request') return { phase: parts[0], kind: parts[1] as RequestKind, notBefore: Number(parts[2] ?? 0) };
  }
  return null;
}
const localError = (code: string, messageKey: UserError['messageKey'] = 'retry'): UserError => ({ code, upstream: null, retryable: 'user_confirm', messageKey });
export function step(previous: TryOnAttempt, event: Event, now: IsoTime, options: { taskDeadlineMs?: number; batchDeadlineAt?: IsoTime; jitterFactor?: number; taskPosts?: number } = {}): { attempt: TryOnAttempt; effects: Effect[] } {
  const a: TryOnAttempt = { ...previous, history: [...previous.history] }, effects: Effect[] = [], time = Date.parse(now), taskMs = options.taskDeadlineMs ?? DEFAULT_TASK_DEADLINE_MS;
  const taskPosts = Math.min(options.taskPosts ?? MAX_TASK_POSTS, MAX_TASK_POSTS);
  if (!Number.isFinite(time)) throw new Error('invalid_clock');
  const record = (reason: string, to = a.state): void => { a.history.push({ at: now, from: a.state, to, reason }); a.state = to; };
  const done = () => ({ attempt: a, effects });
  if (isTerminal(a)) { record(`ignored:${event.type}`); return done(); }
  const active = requestState(a);
  const allPostsRejected = (): boolean => a.postCount > 0 && a.history.filter(h => h.reason === 'post_rejected').length === a.postCount;
  const ambiguousSend = (): boolean => a.postSendStartedAt !== null && !allPostsRejected();
  const settle = (state: JobState, error: UserError | null, definitive = false): void => {
    record(`terminal:${event.type}`, state); a.error = error;
    effects.push({ type: 'abort_cleanup' }, { type: 'settle', state: state === 'succeeded' ? 'spent' : ambiguousSend() && !definitive ? 'possibly_spent' : 'released' });
  };
  const grant = (request: RequestKind, notBefore = time): void => { record(`grant:${request}:${notBefore}`); effects.push({ type: 'request_grant', request, notBefore }); };
  const finish = (kind: RequestKind): void => record(`response:${kind}`);
  const wait = (until: number): void => { record(`wait:${until}`); effects.push({ type: 'wait', until }); };
  const refreshing = a.history.some(h => h.reason === 'result_refresh');
  const failDownload = (): void => settle('failed', localError('result_download_failed', 'download'));
  const getFailure = (): void => {
    finish('task_get');
    if (refreshing) { failDownload(); return; }
    record('get_error');
    const sinceRunning = a.history.slice(a.history.map(h => h.reason).lastIndexOf('poll_running') + 1).filter(h => h.reason === 'get_error').length;
    if (sinceRunning > MAX_GET_RETRIES) { settle('failed', localError('get_retries_exhausted')); return; }
    const factor = options.jitterFactor ?? 1;
    if (!Number.isFinite(factor) || factor < .8 || factor > 1.2) throw new Error('invalid_jitter');
    wait(time + GET_BACKOFF_MS[Math.min(sinceRunning - 1, GET_BACKOFF_MS.length - 1)]! * factor);
  };
  const attemptExpired = a.attemptDeadlineAt !== null && time >= Date.parse(a.attemptDeadlineAt) || options.batchDeadlineAt !== undefined && time >= Date.parse(options.batchDeadlineAt);
  if (attemptExpired || event.type === 'attempt_deadline') {
    settle(a.state === 'submitting' ? ambiguousSend() ? 'uncertain' : 'failed' : a.state === 'queued' || a.state === 'uploading' ? 'failed' : 'timed_out', localError('deadline', 'later')); return done();
  }
  if (a.state === 'uploading' && a.uploadsStartedAt && time >= Date.parse(a.uploadsStartedAt) + UPLOAD_PHASE_MS || event.type === 'upload_phase_deadline' && a.state === 'uploading') { settle('failed', localError('upload_deadline')); return done(); }
  if (a.state === 'polling' && a.deadlineAt && time >= Date.parse(a.deadlineAt) || event.type === 'task_deadline' && a.state === 'polling') { settle('timed_out', localError('deadline', 'later')); return done(); }
  const downloadStart = a.history.find(h => h.to === 'downloading' && h.from !== 'downloading');
  if (downloadStart && (a.state === 'downloading' || a.state === 'polling') && time >= Date.parse(downloadStart.at) + DOWNLOAD_PHASE_MS || event.type === 'download_phase_deadline' && a.state === 'downloading') { settle('failed', localError('result_download_failed', 'download')); return done(); }
  if (event.type === 'cancel') { settle(a.state === 'submitting' && ambiguousSend() ? 'uncertain' : 'cancelled', a.state === 'submitting' && ambiguousSend() ? localError('uncertain_charge') : null); return done(); }
  if (event.type === 'start' && a.state === 'queued') {
    a.uploadsStartedAt = now; a.attemptDeadlineAt = new Date(time + attemptDeadlineMs(taskMs)).toISOString(); record('start', 'uploading'); return done();
  }
  if (event.type === 'request_upload' && a.state === 'uploading' && !active) { grant(event.request); return done(); }
  if (event.type === 'limiter_granted' && active?.phase === 'grant' && active.kind === event.request && time >= active.notBefore) {
    if (event.request === 'task_post') {
      if (a.taskId || a.postCount >= taskPosts || a.state !== 'submitting') return done();
      a.postCount++; a.postSendStartedAt ??= now;
    }
    if (event.request === 'task_get') { if (a.getCount >= maxTaskGets(taskMs)) { settle('timed_out', localError('deadline', 'later')); return done(); } a.getCount++; }
    record(`request:${event.request}`); effects.push({ type: 'request', request: event.request }); return done();
  }
  if (event.type === 'limiter_failed' && active?.phase === 'grant') {
    if (active.kind !== 'task_get') finish(active.kind);
    if (active.kind === 'task_post') settle('failed', localError('limiter_timeout'), true);
    else if (active.kind === 'task_get') getFailure();
    else settle('failed', localError('limiter_timeout'));
    return done();
  }
  if (event.type === 'upload_request_finished' && a.state === 'uploading' && active?.phase === 'request' && ['file_post', 'upload_put'].includes(active.kind)) { finish(active.kind); return done(); }
  if (event.type === 'upload_failed' && a.state === 'uploading') { settle('failed', localError('upload_failed')); return done(); }
  if (event.type === 'uploads_ok' && a.state === 'uploading' && !active) { a.srcFileId = event.srcFileId; a.refFileId = event.refFileId; record('uploads_ok', 'submitting'); grant('task_post'); return done(); }
  if (a.state === 'submitting' && active?.phase === 'request' && active.kind === 'task_post') {
    if (event.type === 'task_created' && event.taskId) { finish('task_post'); a.taskId = event.taskId; a.submittedAt = now; a.deadlineAt = new Date(time + taskMs).toISOString(); record('task_created', 'polling'); wait(time + POLL_FAST_MS); return done(); }
    if (event.type === 'post_response') {
      finish('task_post');
      if (event.http === 429 || event.http === 401 || event.http === 400 && ['InvalidParameters', 'BadRequest', 'CreditInsufficiency', 'InvalidStyle', 'InvalidStyleGroup'].includes(event.errorCode ?? '')) record('post_rejected');
      if (event.http === 429 && a.postCount < taskPosts) { grant('task_post', time + 1000 * 2 ** (a.postCount - 1)); return done(); }
      const definitive = event.http === 401 || event.http === 429 || event.http === 400 && ['InvalidParameters', 'BadRequest', 'CreditInsufficiency', 'InvalidStyle', 'InvalidStyleGroup'].includes(event.errorCode ?? '');
      settle(definitive ? 'failed' : 'uncertain', definitive ? mapError({ http: event.http, ...(event.errorCode ? { errorCode: event.errorCode } : {}) }) : localError('uncertain_charge'), definitive); return done();
    }
    if (['post_transport_error', 'post_timeout', 'post_parse_error'].includes(event.type)) { finish('task_post'); settle('uncertain', localError('uncertain_charge')); return done(); }
  }
  if (event.type === 'poll_due' && a.state === 'polling' && !active && a.taskId && !refreshing) {
    const lastWait = [...a.history].reverse().find(h => h.reason.startsWith('wait:'));
    if (!lastWait || time >= Number(lastWait.reason.slice(5))) grant('task_get');
    return done();
  }
  if (a.state === 'polling' && active?.phase === 'request' && active.kind === 'task_get') {
    if (event.type === 'poll_running') { finish('task_get'); if (refreshing) { failDownload(); return done(); } record('poll_running'); wait(time + (time - Date.parse(a.submittedAt!) < POLL_FAST_UNTIL_MS ? POLL_FAST_MS : POLL_SLOW_MS)); return done(); }
    if (event.type === 'poll_success' && event.url) { finish('task_get'); record('poll_success', 'downloading'); grant('download'); return done(); }
    if (event.type === 'poll_error') { finish('task_get'); if (refreshing) failDownload(); else settle('failed', mapError({ engineError: event.code })); return done(); }
    if (event.type === 'get_error') { getFailure(); return done(); }
    if (event.type === 'poll_success' && refreshing) { finish('task_get'); failDownload(); return done(); }
  }
  if (a.state === 'downloading' && active?.phase === 'request' && active.kind === 'download') {
    if (event.type === 'downloaded') { finish('download'); settle('succeeded', null); return done(); }
    if (event.type === 'download_failed') {
      finish('download');
      if (event.expired && a.history.filter(h => h.reason === 'result_refresh').length < MAX_RESULT_REFRESHES) { record('result_refresh', 'polling'); grant('task_get'); }
      else settle('failed', localError('result_download_failed', 'download'));
      return done();
    }
  }
  record(`ignored:${event.type}`); return done();
}
