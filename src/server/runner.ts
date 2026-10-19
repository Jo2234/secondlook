import { createHash } from 'node:crypto';
import { isTerminal, step } from '../domain/job-machine.js';
import type { Effect, Event, RequestKind } from '../domain/job-machine.js';
import type { GeneratedImage, StoredPhoto, TryOnJob } from '../shared/types.js';
import type { YouCamClient } from '../youcam/client.js';
import { YouCamError } from '../youcam/client.js';
import { bounded, checkSignal, systemClock } from '../youcam/operations.js';
import type { Clock } from '../youcam/operations.js';
import { DOWNLOAD_TIMEOUT_MS, FILE_POST_TIMEOUT_MS, GET_TIMEOUT_MS, MAX_SLOT_REFRESHES, MAX_UPLOAD_TRIES, PUT_TIMEOUT_MS, UPLOAD_PHASE_MS, attemptDeadlineMs } from '../youcam/limits.js';
import { markPostCommitment } from '../youcam/workflow-state.js';
import type { SlidingLogLimiter } from '../youcam/rate-limiter.js';
import type { Store } from './store.js';
export interface RunnerOptions {
  store: Store; limiter: SlidingLogLimiter; signal: AbortSignal; taskDeadlineMs: number; clock?: Clock;
  client: (job: TryOnJob) => YouCamClient;
  disclose: (bytes: Uint8Array, job: TryOnJob, signal: AbortSignal) => Promise<Omit<GeneratedImage, 'sha256'> & { bytes: Uint8Array }>;
}
/** Single attempt slot, distinct from the transport's two-socket limit. No untracked work. */
export class Runner {
  private readonly options: RunnerOptions; private readonly clock: Clock;
  private tail: Promise<unknown> = Promise.resolve(); private queued = 0;
  private readonly controllers = new Map<string, AbortController>();
  constructor(options: RunnerOptions) { this.options = options; this.clock = options.clock ?? systemClock; }
  cancel(id: string): void { this.controllers.get(id)?.abort(); }
  async drain(): Promise<void> { await this.tail; }
  runBatch(ids: string[], recovery = false): Promise<void> {
    if (this.queued >= 32) return Promise.reject(new Error('runner_queue_full'));
    this.queued++;
    const result = this.tail.then(async () => { for (const id of ids) await this.run(id, recovery); });
    this.tail = result.catch(() => undefined);
    return result.finally(() => { this.queued--; });
  }
  private async run(id: string, recovery: boolean): Promise<void> {
    const { store, limiter } = this.options, clock = this.clock;
    const initial = store.snapshot().jobs.find(j => j.id === id);
    if (!initial || isTerminal(initial.attempts.at(-1)!)) return;
    const batch = store.snapshot().batches.findLast(b => b.jobIds.includes(id));
    if (!batch) throw new Error('batch_missing');
    const controller = new AbortController(); this.controllers.set(id, controller);
    const parent = AbortSignal.any([this.options.signal, controller.signal]);
    const now = () => new Date(clock.now()).toISOString();
    const current = () => store.snapshot().jobs.find(j => j.id === id)!;
    const sendEvent = async (event: Event): Promise<Effect[]> => {
      let effects: Effect[] = [];
      await store.commit(state => {
        const job = state.jobs.find(j => j.id === id)!, a = job.attempts.at(-1)!;
        const result = step(a, event, now(), { taskDeadlineMs: this.options.taskDeadlineMs, batchDeadlineAt: batch.deadlineAt });
        job.attempts[job.attempts.length - 1] = result.attempt; effects = result.effects;
        if (event.type === 'limiter_granted' && event.request === 'task_post' && effects.some(e => e.type === 'request')) markPostCommitment(state, id, now());
        for (const effect of effects) if (effect.type === 'settle') {
          const entry = state.ledger.find(e => e.id === result.attempt.ledgerEntryId);
          if (!entry || entry.state === 'spent' || entry.state === 'released') continue;
          entry.state = effect.state; entry.settledAt = now(); entry.settledSeq = state.seq + 1; entry.reason = result.attempt.error?.code ?? result.attempt.state;
        }
        return state;
      }); return effects;
    };
    try {
      const deadline = Math.min(Date.parse(batch.deadlineAt), initial.attempts.at(-1)!.attemptDeadlineAt ? Date.parse(initial.attempts.at(-1)!.attemptDeadlineAt!) : clock.now() + attemptDeadlineMs(this.options.taskDeadlineMs));
      if (clock.now() >= deadline) { await sendEvent({ type: 'attempt_deadline' }); return; }
      await bounded(parent, deadline - clock.now(), async signal => {
        const client = this.options.client(current()); let resultUrl: string | null = null;
        const grant = async (kind: RequestKind, notBefore = clock.now(), grantSignal = signal): Promise<Effect[]> => {
          if (notBefore > clock.now()) await clock.sleep(notBefore - clock.now(), grantSignal);
          checkSignal(grantSignal);
          try { await limiter.acquire(grantSignal); checkSignal(grantSignal); return await sendEvent({ type: 'limiter_granted', request: kind }); }
          catch (error) { if (grantSignal.aborted) throw error; return sendEvent({ type: 'limiter_failed' }); }
        };
        const uploadRequest = async <T>(kind: 'file_post' | 'upload_put', work: (signal: AbortSignal) => Promise<T>, uploadSignal: AbortSignal, ms: number): Promise<T> => {
          const effects = await sendEvent({ type: 'request_upload', request: kind });
          if (!effects.some(e => e.type === 'request_grant')) throw new YouCamError('aborted');
          const granted = await grant(kind, clock.now(), uploadSignal);
          if (!granted.some(e => e.type === 'request' && e.request === kind)) throw new YouCamError('aborted');
          try { return await bounded(uploadSignal, ms, work, clock); }
          finally { await sendEvent({ type: 'upload_request_finished' }); }
        };
        const upload = async (photo: StoredPhoto, uploadSignal: AbortSignal): Promise<string> => {
          const bytes = await store.readMedia(photo.normalized.path); checkSignal(uploadSignal);
          if (createHash('sha256').update(bytes).digest('hex') !== photo.normalized.sha256) throw new YouCamError('parse');
          let refreshes = 0;
          for (let slotNumber = 0; slotNumber <= MAX_SLOT_REFRESHES; slotNumber++) {
            let slot: Awaited<ReturnType<YouCamClient['createUpload']>> | undefined;
            for (let n = 0; n < MAX_UPLOAD_TRIES; n++) {
              try { slot = await uploadRequest('file_post', s => client.createUpload({ contentType: 'image/jpg', fileName: `${photo.id}.jpg`, fileSize: bytes.length }, { signal: s }), uploadSignal, FILE_POST_TIMEOUT_MS); break; }
              catch (error) { if (uploadSignal.aborted || n === MAX_UPLOAD_TRIES - 1 || error instanceof YouCamError && (error.kind === 'policy' || error.http === 401)) throw error; await clock.sleep(1000 * 2 ** n, uploadSignal); }
            }
            if (!slot) throw new YouCamError('parse');
            let refresh = false;
            for (let n = 0; n < MAX_UPLOAD_TRIES; n++) {
              try { await uploadRequest('upload_put', s => client.putBytes(slot!.put, bytes, { signal: s }), uploadSignal, PUT_TIMEOUT_MS); return slot.fileId; }
              catch (error) {
                if (error instanceof YouCamError && error.http === 403 && refreshes < MAX_SLOT_REFRESHES) { refreshes++; refresh = true; break; }
                if (uploadSignal.aborted || n === MAX_UPLOAD_TRIES - 1 || error instanceof YouCamError && error.kind === 'policy') throw error;
                await clock.sleep(1000 * 2 ** n, uploadSignal);
              }
            }
            if (!refresh) break;
          }
          throw new YouCamError('transport');
        };
        let effects: Effect[];
        if (!recovery) {
          await sendEvent({ type: 'start' });
          try {
            const photos = store.snapshot().photos;
            const src = photos.find(p => p.id === current().modelPhotoId), ref = photos.find(p => p.id === current().garmentPhotoId);
            if (!src || !ref) throw new YouCamError('parse');
            const files = await bounded(signal, UPLOAD_PHASE_MS, async uploadSignal => ({ src: await upload(src, uploadSignal), ref: await upload(ref, uploadSignal) }), clock);
            effects = await sendEvent({ type: 'uploads_ok', srcFileId: files.src, refFileId: files.ref });
          } catch (error) { if (signal.aborted) throw error; await sendEvent({ type: 'upload_failed' }); return; }
        } else {
          // recoverState has already durably installed a GET grant; no upload or POST recovery path.
          effects = [{ type: 'request_grant', request: 'task_get', notBefore: clock.now() }];
        }
        for (let count = 0; count < 1000 && !isTerminal(current().attempts.at(-1)!); count++) {
          checkSignal(signal);
          const effect = effects.shift(); if (!effect) throw new Error('runner_effect_missing');
          let next: Effect[] = [];
          if (effect.type === 'wait') { await clock.sleep(Math.max(0, effect.until - clock.now()), signal); next = await sendEvent({ type: 'poll_due' }); }
          else if (effect.type === 'request_grant') next = await grant(effect.request, effect.notBefore);
          else if (effect.type === 'request') {
            const job = current(), a = job.attempts.at(-1)!;
            if (effect.request === 'task_post') {
              try { const result = await bounded(signal, FILE_POST_TIMEOUT_MS, s => client.createClothTask({ ...job.request, src_file_id: a.srcFileId!, ref_file_id: a.refFileId! }, { signal: s }), clock); next = await sendEvent({ type: 'task_created', taskId: result.taskId }); }
              catch (error) {
                if (signal.aborted) throw error;
                next = await sendEvent(error instanceof YouCamError && error.kind === 'http' && error.http !== undefined ? { type: 'post_response', http: error.http, ...(error.errorCode ? { errorCode: error.errorCode } : {}) } : { type: error instanceof YouCamError && error.kind === 'parse' ? 'post_parse_error' : error instanceof YouCamError && error.kind === 'timeout' ? 'post_timeout' : 'post_transport_error' });
              }
            } else if (effect.request === 'task_get') {
              try {
                const result = await bounded(signal, GET_TIMEOUT_MS, s => client.getClothTask(a.taskId!, { signal: s }), clock);
                if (result.status === 'success' && result.resultUrl) { resultUrl = result.resultUrl; next = await sendEvent({ type: 'poll_success', url: resultUrl }); }
                else next = await sendEvent(result.status === 'error' ? { type: 'poll_error', code: result.engineError ?? 'unknown_internal_error' } : result.status === 'success' ? { type: 'get_error' } : { type: 'poll_running' });
              } catch (error) { if (signal.aborted) throw error; next = await sendEvent({ type: 'get_error' }); }
            } else if (effect.request === 'download') {
              try {
                if (!resultUrl) throw new YouCamError('parse');
                const bytes = await bounded(signal, DOWNLOAD_TIMEOUT_MS, s => client.download(resultUrl!, { signal: s }), clock);
                const disclosed = await this.options.disclose(bytes, job, signal); checkSignal(signal);
                const { bytes: output, ...image } = disclosed;
                await store.writeMedia(image.disclosedPath, output); checkSignal(signal);
                await store.commit(state => {
                  state.images.push({ ...image, sha256: createHash('sha256').update(output).digest('hex') });
                  const stored = state.jobs.find(j => j.id === id)!; stored.resultImageId = image.id;
                  const listing = state.listings.find(l => l.id === job.listingId); if (listing) listing.tryOnResultIds.push(image.id);
                  return state;
                });
                next = await sendEvent({ type: 'downloaded' });
              } catch (error) { if (signal.aborted) throw error; next = await sendEvent({ type: 'download_failed', expired: error instanceof YouCamError && (error.http === 403 || error.http === 410) }); }
            }
          }
          effects.push(...next);
        }
        if (!isTerminal(current().attempts.at(-1)!)) await sendEvent({ type: 'attempt_deadline' });
      }, clock);
    } catch (error) {
      if (controller.signal.aborted || this.options.signal.aborted) await sendEvent({ type: 'cancel' });
      else await sendEvent({ type: 'attempt_deadline' });
      if (!(error instanceof YouCamError) && !(error instanceof Error && error.message === 'aborted')) throw error;
    } finally { this.controllers.delete(id); await store.cleanTmp(id); }
  }
}
