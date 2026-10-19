import { createHash } from 'node:crypto';
import { isTerminal, step } from '../domain/job-machine.js';
import type { Effect, Event, RequestKind } from '../domain/job-machine.js';
import type { GeneratedImage, StoredPhoto, TryOnJob } from '../shared/types.js';
import type { YouCamClient } from '../youcam/client.js';
import { YouCamError } from '../youcam/client.js';
import { bounded, checkSignal, systemClock } from '../youcam/operations.js';
import type { Clock } from '../youcam/operations.js';
import { DOWNLOAD_PHASE_MS, DOWNLOAD_TIMEOUT_MS, FILE_POST_TIMEOUT_MS, GET_TIMEOUT_MS, MAX_SLOT_REFRESHES, MAX_UPLOAD_TRIES, PUT_TIMEOUT_MS, UPLOAD_PHASE_MS, attemptDeadlineMs } from '../youcam/limits.js';
import { markPostCommitment } from '../youcam/workflow-state.js';
import type { WorkflowState } from '../youcam/workflow-state.js';
import type { SlidingLogLimiter } from '../youcam/rate-limiter.js';
import type { Store } from './store.js';
import { OwnedRuntime, RuntimeRefused } from './owned-runtime.js';
import type { RuntimeReceipt } from './owned-runtime.js';
export interface RunnerOptions {
  store: Store; limiter: SlidingLogLimiter; signal: AbortSignal; taskDeadlineMs: number; clock?: Clock;
  client: (job: TryOnJob) => YouCamClient;
  disclose: (bytes: Uint8Array, job: TryOnJob, signal: AbortSignal) => Promise<Omit<GeneratedImage, 'sha256'> & { bytes: Uint8Array }>;
}
/** Single attempt slot, distinct from the transport's two-socket limit. No untracked work. */
export class Runner {
  private readonly options: RunnerOptions; private readonly clock: Clock;
  private readonly runtime: OwnedRuntime;
  private readonly controllers = new Map<string, AbortController>();
  constructor(options: RunnerOptions) {
    this.options = options; this.clock = options.clock ?? systemClock;
    this.runtime = new OwnedRuntime(async (ids, signal) => { for (const id of ids) await this.run(id, signal); });
  }
  status() { return this.runtime.status(); }
  assertAdmissionOpen(): void {
    this.options.store.assertWritable(); this.runtime.assertOpen();
    if (this.options.signal.aborted) throw new RuntimeRefused('runner_closed');
  }
  stopAdmission(): void { this.runtime.stopAdmission(); }
  cancel(id: string): void { this.controllers.get(id)?.abort(); }
  async drain(): Promise<void> { await this.runtime.drain(); }
  admit<T>(commit: () => Promise<RuntimeReceipt<T>>, definitiveRefusal: (error: unknown) => boolean): Promise<T> {
    this.assertAdmissionOpen();
    return this.runtime.admit(commit, definitiveRefusal);
  }
  /** Startup already reconciled these jobs durably. They must have a task ID; never POST. */
  async resume(id: string): Promise<void> {
    const attempt = this.options.store.snapshot().jobs.find(job => job.id === id)?.attempts.at(-1);
    if (!attempt?.taskId || !['polling', 'downloading'].includes(attempt.state) || !attempt.attemptDeadlineAt) throw new Error('unsafe_resume');
    await this.admit(async () => ({ value: undefined, jobIds: [id], replay: false }), () => false);
    await this.drain();
  }
  private async run(id: string, batchSignal: AbortSignal): Promise<void> {
    const { store, limiter } = this.options, clock = this.clock;
    const initial = store.snapshot().jobs.find(j => j.id === id);
    if (!initial || isTerminal(initial.attempts.at(-1)!)) return;
    const recovery = initial.attempts.at(-1)!.state !== 'queued';
    if (recovery && (!initial.attempts.at(-1)!.taskId || !['polling', 'downloading'].includes(initial.attempts.at(-1)!.state))) throw new Error('unsafe_resume');
    const batch = store.snapshot().batches.findLast(b => b.jobIds.includes(id));
    if (!batch) throw new Error('batch_missing');
    const controller = new AbortController(); this.controllers.set(id, controller);
    const parent = AbortSignal.any([this.options.signal, batchSignal, controller.signal]);
    const now = () => new Date(clock.now()).toISOString();
    const current = () => store.snapshot().jobs.find(j => j.id === id)!;
    const requestAllowed = (signal: AbortSignal, kind: RequestKind): void => {
      checkSignal(signal); store.assertWritable();
      if (this.runtime.status().fence) throw new Error('runner_fenced');
      const a = current().attempts.at(-1)!, time = clock.now();
      const downloadStart = a.history.find(h => h.to === 'downloading' && h.from !== 'downloading');
      if (isTerminal(a)) throw new YouCamError('aborted');
      if (time >= Date.parse(batch.deadlineAt) || a.attemptDeadlineAt && time >= Date.parse(a.attemptDeadlineAt)
        || kind === 'task_get' && a.deadlineAt && time >= Date.parse(a.deadlineAt)
        || ['file_post', 'upload_put'].includes(kind) && a.uploadsStartedAt && time >= Date.parse(a.uploadsStartedAt) + UPLOAD_PHASE_MS
        || downloadStart && ['task_get', 'download'].includes(kind) && time >= Date.parse(downloadStart.at) + DOWNLOAD_PHASE_MS) throw new YouCamError('timeout');
      if (recovery && !['task_get', 'download'].includes(kind)) throw new Error('unsafe_resume');
    };
    // The publication path uses this same reducer/effect interpreter inside its own commit.
    const applyEvent = (state: WorkflowState, job: TryOnJob, event: Event): Effect[] => {
      const a = job.attempts.at(-1)!;
      if (isTerminal(a)) return [];
      const result = step(a, event, now(), { taskDeadlineMs: this.options.taskDeadlineMs, batchDeadlineAt: batch.deadlineAt });
      job.attempts[job.attempts.length - 1] = result.attempt; const effects = result.effects;
      if (event.type === 'limiter_granted' && event.request === 'task_post' && effects.some(e => e.type === 'request')) markPostCommitment(state, id, now());
      for (const effect of effects) if (effect.type === 'settle') {
        const entry = state.ledger.find(e => e.id === result.attempt.ledgerEntryId);
        if (!entry || entry.state === 'spent' || entry.state === 'released') continue;
        entry.state = effect.state; entry.settledAt = now(); entry.settledSeq = state.seq + 1; entry.reason = result.attempt.error?.code ?? result.attempt.state;
      }
      return effects;
    };
    const sendEvent = async (event: Event): Promise<Effect[]> => {
      let effects: Effect[] = [];
      await store.commit(state => {
        effects = applyEvent(state, state.jobs.find(j => j.id === id)!, event); return state;
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
          try { await limiter.acquire(grantSignal); }
          catch (error) { store.assertWritable(); if (grantSignal.aborted) throw error; return sendEvent({ type: 'limiter_failed' }); }
          checkSignal(grantSignal);
          // A failed intent commit is not a limiter failure and must never produce a request.
          return sendEvent({ type: 'limiter_granted', request: kind });
        };
        const uploadRequest = async <T>(kind: 'file_post' | 'upload_put', work: (signal: AbortSignal) => Promise<T>, uploadSignal: AbortSignal, ms: number): Promise<T> => {
          const effects = await sendEvent({ type: 'request_upload', request: kind });
          if (!effects.some(e => e.type === 'request_grant')) throw new YouCamError('aborted');
          const granted = await grant(kind, clock.now(), uploadSignal);
          if (!granted.some(e => e.type === 'request' && e.request === kind)) throw new YouCamError('aborted');
          try { requestAllowed(uploadSignal, kind); return await bounded(uploadSignal, ms, s => { requestAllowed(s, kind); return work(s); }, clock); }
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
              catch (error) { store.assertWritable(); if (uploadSignal.aborted || !(error instanceof YouCamError) || n === MAX_UPLOAD_TRIES - 1 || error.kind === 'policy' || error.http === 401) throw error; await clock.sleep(1000 * 2 ** n, uploadSignal); }
            }
            if (!slot) throw new YouCamError('parse');
            let refresh = false;
            for (let n = 0; n < MAX_UPLOAD_TRIES; n++) {
              try { await uploadRequest('upload_put', s => client.putBytes(slot!.put, bytes, { signal: s }), uploadSignal, PUT_TIMEOUT_MS); return slot.fileId; }
              catch (error) {
                store.assertWritable(); if (!(error instanceof YouCamError)) throw error;
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
          } catch (error) { store.assertWritable(); if (signal.aborted || !(error instanceof YouCamError)) throw error; await sendEvent({ type: 'upload_failed' }); return; }
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
              try { requestAllowed(signal, 'task_post'); const result = await bounded(signal, FILE_POST_TIMEOUT_MS, s => { requestAllowed(s, 'task_post'); return client.createClothTask({ ...job.request, src_file_id: a.srcFileId!, ref_file_id: a.refFileId! }, { signal: s }); }, clock); next = await sendEvent({ type: 'task_created', taskId: result.taskId }); }
              catch (error) {
                store.assertWritable();
                if (!(error instanceof YouCamError)) throw error;
                if (signal.aborted) throw error;
                next = await sendEvent(error instanceof YouCamError && error.kind === 'http' && error.http !== undefined ? { type: 'post_response', http: error.http, ...(error.errorCode ? { errorCode: error.errorCode } : {}) } : { type: error instanceof YouCamError && error.kind === 'parse' ? 'post_parse_error' : error instanceof YouCamError && error.kind === 'timeout' ? 'post_timeout' : 'post_transport_error' });
              }
            } else if (effect.request === 'task_get') {
              try {
                requestAllowed(signal, 'task_get');
                const result = await bounded(signal, GET_TIMEOUT_MS, s => { requestAllowed(s, 'task_get'); return client.getClothTask(a.taskId!, { signal: s }); }, clock);
                if (result.status === 'success' && result.resultUrl) { resultUrl = result.resultUrl; next = await sendEvent({ type: 'poll_success', url: resultUrl }); }
                else next = await sendEvent(result.status === 'error' ? { type: 'poll_error', code: result.engineError ?? 'unknown_internal_error' } : result.status === 'success' ? { type: 'get_error' } : { type: 'poll_running' });
              } catch (error) { store.assertWritable(); if (signal.aborted || !(error instanceof YouCamError)) throw error; next = await sendEvent({ type: 'get_error' }); }
            } else if (effect.request === 'download') {
              try {
                if (!resultUrl) throw new YouCamError('parse');
                requestAllowed(signal, 'download');
                const bytes = await bounded(signal, DOWNLOAD_TIMEOUT_MS, s => { requestAllowed(s, 'download'); return client.download(resultUrl!, { signal: s }); }, clock);
                const disclosed = await this.options.disclose(bytes, job, signal); checkSignal(signal);
                const { bytes: output, ...image } = disclosed;
                // Only a fulfilled wx/write/sync/close/directory-sync proves ownership of this file.
                // A partial write failure retains its exact path; it must not delete an EEXIST file.
                await store.writeMedia(image.disclosedPath, output);
                const cleanUnpublished = async (): Promise<void> => {
                  // Unknown/not-committed Store failures both fence this owner. Never use stale memory
                  // to delete a file whose publication may have renamed onto canonical state.
                  await store.commit(state => {
                    if (state.images.some(i => i.id === image.id || i.disclosedPath === image.disclosedPath)
                      || state.photos.some(p => p.id === image.id || p.normalized.path === image.disclosedPath)
                      || state.jobs.some(j => j.resultImageId === image.id)
                      || state.listings.some(l => l.tryOnResultIds.includes(image.id) || l.garmentPhotoIds.includes(image.id))
                      || state.buyers.some(b => b.imageIds.includes(image.id))) throw new Error('publication_media_referenced');
                    return state;
                  });
                  store.assertWritable();
                  await store.removeMedia(image.disclosedPath);
                };
                let published = false;
                try {
                  const settled = await store.commit(state => {
                    // This synchronous callback is the cancellation/publication linearization point.
                    // A later abort cannot undo a chosen publication while its fsync is awaited.
                    checkSignal(signal); store.assertWritable();
                    if (this.runtime.status().fence) throw new Error('runner_fenced');
                    const matches = state.jobs.filter(j => j.id === id), stored = matches[0], active = stored?.attempts.at(-1);
                    if (matches.length !== 1 || !stored || !active || stored.requestId !== job.requestId
                      || stored.mode !== job.mode || stored.listingId !== job.listingId || stored.buyerSessionId !== job.buyerSessionId
                      || stored.garmentPhotoId !== job.garmentPhotoId || stored.modelPhotoId !== job.modelPhotoId
                      || stored.category !== job.category || stored.createdAt !== job.createdAt
                      || stored.request.garment_category !== job.request.garment_category
                      || stored.request.change_shoes !== job.request.change_shoes || stored.request.filter_multi_person !== job.request.filter_multi_person
                      || stored.attempts.length !== job.attempts.length || active.n !== a.n || active.ledgerEntryId !== a.ledgerEntryId
                      || active.taskId !== a.taskId || active.postSendStartedAt !== a.postSendStartedAt) throw new Error('publication_identity_changed');
                    if (isTerminal(active)) throw new YouCamError('aborted');
                    const entries = state.ledger.filter(e => e.id === active.ledgerEntryId), entry = entries[0];
                    if (entries.length !== 1 || !entry || entry.jobId !== id || entry.attempt !== active.n || entry.mode !== stored.mode
                      || entry.state === 'spent' || entry.state === 'released') throw new Error('publication_ledger_inconsistent');
                    const listings = state.listings.filter(l => l.id === stored.listingId), listing = listings[0];
                    if (stored.listingId !== null && (listings.length !== 1 || !listing || listing.mode !== stored.mode)
                      || stored.buyerSessionId !== null) throw new Error('publication_owner_missing');
                    if (image.jobId !== id || image.mode !== stored.mode || image.listingId !== stored.listingId || image.buyerSessionId !== stored.buyerSessionId
                      || image.artifactMissing || stored.resultImageId !== null
                      || state.images.some(i => i.id === image.id || i.disclosedPath === image.disclosedPath)
                      || state.photos.some(p => p.id === image.id || p.normalized.path === image.disclosedPath)
                      || state.jobs.some(j => j.resultImageId === image.id)
                      || state.listings.some(l => l.tryOnResultIds.includes(image.id) || l.garmentPhotoIds.includes(image.id))
                      || state.buyers.some(b => b.imageIds.includes(image.id))) throw new Error('publication_image_conflict');
                    next = applyEvent(state, stored, { type: 'downloaded' });
                    // Deadlines and active download intent belong to step(), not a second status machine.
                    if (stored.attempts.at(-1)!.state !== 'succeeded') {
                      if (!isTerminal(stored.attempts.at(-1)!)) throw new Error('publication_transition_refused');
                      return state;
                    }
                    if (!next.some(e => e.type === 'settle' && e.state === 'spent')
                      || state.ledger.find(e => e.id === active.ledgerEntryId)?.state !== 'spent') throw new Error('publication_settlement_missing');
                    state.images.push({ ...image, sha256: createHash('sha256').update(output).digest('hex') });
                    stored.resultImageId = image.id; if (listing) listing.tryOnResultIds.push(image.id);
                    return state;
                  });
                  published = settled.jobs.find(j => j.id === id)?.resultImageId === image.id;
                } catch (error) {
                  try { await cleanUnpublished(); }
                  catch (cleanupError) {
                    if (cleanupError !== error) throw new AggregateError([error, cleanupError], 'publication_cleanup_failed');
                  }
                  throw error;
                }
                if (!published) await cleanUnpublished();
              } catch (error) { store.assertWritable(); if (signal.aborted || !(error instanceof YouCamError)) throw error; next = await sendEvent({ type: 'download_failed', expired: error.http === 403 || error.http === 410 }); }
            }
          }
          effects.push(...next);
        }
        if (!isTerminal(current().attempts.at(-1)!)) await sendEvent({ type: 'attempt_deadline' });
      }, clock);
    } catch (error) {
      store.assertWritable();
      if (parent.aborted) await sendEvent({ type: 'cancel' });
      else await sendEvent({ type: 'attempt_deadline' });
      if (!(error instanceof YouCamError) && !(error instanceof Error && error.message === 'aborted')) throw error;
    } finally { this.controllers.delete(id); await store.cleanTmp(id); }
  }
}
