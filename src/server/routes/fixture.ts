import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { createAttempt, step } from '../../domain/job-machine.js';
import { admit, balanceEstimateCu, committedCu } from '../../domain/ledger.js';
import { capability, capabilityAllows } from '../../domain/capabilities.js';
import { readiness, validateOriginalIds } from '../../domain/listing.js';
import { evaluateGarmentPhoto } from '../../domain/quality/gate.js';
import { measurePixels } from '../../domain/quality/metrics.js';
import { analyzePhoto, rasterNormalizedPhoto } from '../../images/raster.js';
import { EvaluatePhotoRequestSchema, IdSchema, ListingPatchRequestSchema, ListingWriteRequestSchema, RetryRequestSchema, TryOnRequestSchema } from '../../shared/schemas.js';
import type { Listing, StoredPhoto } from '../../shared/types.js';
import { COPY } from '../../shared/copy.js';
import { batchDeadlineMs } from '../../youcam/limits.js';
import type { AppEnv } from '../env.js';
import type { Store } from '../store.js';
import type { Runner } from '../runner.js';
import { RuntimeRefused } from '../owned-runtime.js';
import { deleteBuyer, sweepExpired } from '../ttl-sweeper.js';
export const newId = (): string => randomUUID().replaceAll('-', '').slice(0, 20);
export class RouteError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 422 | 503 | 507;
  constructor(code: string, status: RouteError['status'] = 409) { super(code); this.status = status; }
}
export interface Services { store: Store; runner: Runner; signal: AbortSignal }
export function fixtureRoutes(app: Hono, env: AppEnv, services: Services): void {
  const { store, runner } = services;
  const now = () => new Date().toISOString();
  const id = (value: string): string => { const parsed = IdSchema.safeParse(value); if (!parsed.success) throw new RouteError('invalid_request', 400); return parsed.data; };
  const listingResponse = (listing: Listing) => {
    const state = store.snapshot(); return { ...listing, readiness: readiness(listing, Object.fromEntries(state.qualities.map(q => [q.photoId, q])), new Set(state.images.map(i => i.id))), mode: env.mode };
  };
  app.use('/api/*', async (c, next) => {
    if (services.signal.aborted && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) throw new RouteError('runner_closed', 503);
    await sweepExpired(store, Date.now()); await next();
  });
  app.get('/api/models', c => c.json({ mode: env.mode, models: store.snapshot().photos.filter(p => p.role === 'model' && p.source === 'synthetic').map(p => ({ photoId: p.id, label: 'DEMO synthetic mannequin', rightsId: p.rightsId, source: p.source, synthetic: true })) }));
  app.post('/api/photos', async c => {
    if (env.mode !== 'fixture') throw new RouteError('live_execution_not_ready', 503);
    const body = await c.req.parseBody();
    if (body.role !== 'garment' || !(body.file instanceof File)) throw new RouteError('invalid_request', 400);
    const { photo } = await analyzePhoto(new Uint8Array(await body.file.arrayBuffer()));
    const photoId = newId(), path = `photos/${photoId}.jpg`;
    const stored: StoredPhoto = { id: photoId, role: 'garment', mode: env.mode, source: 'seller_upload', rightsId: null, original: photo.original, normalized: { ...photo.normalized, path }, createdAt: now(), expiresAt: null };
    await store.writeMedia(path, photo.data);
    try { await store.commit(state => { state.photos.push(stored); return state; }); }
    catch (error) { await store.removeMedia(path); throw error; }
    return c.json({ mode: env.mode, photo: stored, quality: null });
  });
  app.post('/api/photos/:id/evaluate', async c => {
    const photoId = id(c.req.param('id')), parsed = EvaluatePhotoRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ mode: env.mode, error: 'invalid_request', issues: parsed.error.issues.map(i => ({ path: i.path.map(String), message: i.message })) }, 400);
    const photo = store.snapshot().photos.find(p => p.id === photoId && p.role === 'garment'); if (!photo) throw new RouteError('not_found', 404);
    const pixels = measurePixels(await rasterNormalizedPhoto(await store.readMedia(photo.normalized.path)));
    const quality = evaluateGarmentPhoto({ photoId, mode: env.mode, declaration: parsed.data.declaration, manifestConsent: false, metrics: { ...pixels, format: photo.original.format, originalBytes: photo.original.bytes, normalizedBytes: photo.normalized.bytes, width: photo.normalized.width, height: photo.normalized.height, originalWidth: photo.original.width, originalHeight: photo.original.height } });
    await store.commit(state => { state.qualities = state.qualities.filter(q => q.photoId !== photoId); state.qualities.push(quality); return state; });
    return c.json({ ...quality, mode: env.mode });
  });
  app.get('/api/listings', c => c.json({ mode: env.mode, listings: store.snapshot().listings.map(listingResponse) }));
  app.get('/api/listings/:id', c => { const listing = store.snapshot().listings.find(l => l.id === id(c.req.param('id'))); if (!listing) throw new RouteError('not_found', 404); return c.json(listingResponse(listing)); });
  for (const method of ['post', 'patch'] as const) {
    const path = method === 'post' ? '/api/listings' : '/api/listings/:id';
    app[method](path, async c => {
      const parsed = (method === 'post' ? ListingWriteRequestSchema : ListingPatchRequestSchema).safeParse(await c.req.json());
      if (!parsed.success) return c.json({ mode: env.mode, error: 'invalid_request', issues: parsed.error.issues.map(i => ({ path: i.path.map(String), message: i.message })) }, 400);
      const listingId = method === 'post' ? newId() : id(c.req.param('id')!);
      const next = await store.commit(state => {
        const old = state.listings.find(l => l.id === listingId);
        if (method === 'patch' && !old) throw new RouteError('not_found', 404);
        const listing: Listing = { id: listingId, mode: env.mode, title: '', conditionNotes: '', priceText: null, garmentPhotoIds: [], declaration: null, measurements: null, tryOnResultIds: [], status: 'draft', createdAt: now(), updatedAt: now(), ...old, ...parsed.data };
        if (!validateOriginalIds(listing.garmentPhotoIds, new Set(state.images.map(i => i.id)))) throw new RouteError('generated_image_not_cover', 422);
        if (listing.garmentPhotoIds.some(photoId => !state.photos.some(p => p.id === photoId && p.role === 'garment'))) throw new RouteError('invalid_request', 400);
        listing.status = readiness(listing, Object.fromEntries(state.qualities.map(q => [q.photoId, q]))).ready ? 'ready' : 'draft'; listing.updatedAt = now();
        state.listings = state.listings.filter(l => l.id !== listingId); state.listings.push(listing); return state;
      }); return c.json(listingResponse(next.listings.find(l => l.id === listingId)!));
    });
  }
  app.get('/api/units', c => {
    const state = store.snapshot(), committed = committedCu(state.ledger);
    return c.json({ mode: env.mode, preflight: state.preflight, budgetCu: env.budgetCu, ledger: state.ledger, committedCu: committed, remainingBudgetCu: env.budgetCu - committed, balanceEstimateCu: state.preflight ? balanceEstimateCu(state.preflight, state.ledger) : null });
  });
  app.post('/api/units/preflight', c => c.json({ mode: env.mode, error: env.mode === 'fixture' ? 'fixture_no_live_preflight' : 'live_execution_not_ready' }, 409));
  app.post('/api/listings/:id/tryon', async c => {
    if (env.mode !== 'fixture') throw new RouteError('live_execution_not_ready', 503);
    const listingId = id(c.req.param('id')), parsed = TryOnRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) throw new RouteError('invalid_request', 400);
    store.assertWritable();
    const body = { ...parsed.data, listingId };
    const response = (jobIds: string[]) => {
      const state = store.snapshot(), jobs = jobIds.map(jobId => state.jobs.find(job => job.id === jobId));
      if (jobs.some(job => !job)) throw new RouteError('admission_record_inconsistent', 503);
      return c.json({ mode: env.mode, jobs });
    };
    // A proven durable replay consumes no capacity, creates no promise of new work and writes nothing.
    // Never use this snapshot after a failed/unknown store commit.
    const known = store.snapshot();
    if (known.requests.some(request => request.requestId === body.requestId)) {
      const replay = admit({ state: { entries: known.ledger, requests: known.requests, seq: known.seq, observing: known.observing }, body, mode: env.mode, budgetCu: env.budgetCu, preflight: known.preflight, now: now(), allocations: [] });
      if (!replay.ok) throw new RouteError(replay.error);
      return response(replay.jobIds);
    }
    const jobIds = await runner.admit(async () => {
      let admittedIds: string[] = [], replay = false;
      await store.commit(state => {
        const allocations = parsed.data.modelPhotoIds.map(() => ({ entryId: newId(), jobId: newId(), attempt: 1 }));
        const admittedAt = now();
        const admission = admit({ state: { entries: state.ledger, requests: state.requests, seq: state.seq, observing: state.observing }, body, mode: env.mode, budgetCu: env.budgetCu, preflight: state.preflight, now: admittedAt, allocations });
        if (!admission.ok) throw new RouteError(admission.error); admittedIds = admission.jobIds; replay = admission.replay;
        if (replay) return state;
        // Recheck after store serialization: a failure/shutdown may have fenced the reservation.
        runner.assertAdmissionOpen();
        const listing = state.listings.find(l => l.id === listingId), photo = state.photos.find(p => p.id === parsed.data.garmentPhotoId && p.role === 'garment');
        if (!listing || !photo || !listing.garmentPhotoIds.includes(photo.id) || !listing.declaration) throw new RouteError('quality_failed');
        if (!capabilityAllows(capability(listing.declaration.photoType, listing.declaration.category), env.mode)) throw new RouteError('capability_blocked');
        const quality = state.qualities.find(q => q.photoId === photo.id);
        const d = listing.declaration;
        if (!d.singleGarment || !d.frontFacing || !d.notComposite || !d.fullyVisible || !d.noPeopleInPhoto && d.photoType !== 'worn') throw new RouteError('quality_failed');
        if (!quality?.spendAllowed || quality.capability?.photoType !== listing.declaration.photoType || quality.capability?.category !== listing.declaration.category) throw new RouteError('quality_failed');
        if (parsed.data.modelPhotoIds.some(modelId => !state.photos.some(p => p.id === modelId && p.role === 'model' && p.source === 'synthetic'))) throw new RouteError('rights_missing');
        state.ledger = [...admission.state.entries]; state.requests = [...admission.state.requests];
        allocations.forEach((allocation, index) => {
          const category = listing.declaration!.category;
          state.jobs.push({ id: allocation.jobId, mode: env.mode, listingId, buyerSessionId: null, garmentPhotoId: photo.id, modelPhotoId: parsed.data.modelPhotoIds[index]!, category, request: { garment_category: category, change_shoes: false, filter_multi_person: 'strict' }, attempts: [createAttempt(1, allocation.entryId)], resultImageId: null, createdAt: admittedAt, requestId: parsed.data.requestId });
        });
        state.batches.push({ requestId: parsed.data.requestId, jobIds: admittedIds, deadlineAt: new Date(Date.parse(admittedAt) + batchDeadlineMs(admittedIds.length, env.taskDeadlineMs)).toISOString() }); return state;
      });
      return { value: admittedIds, jobIds: admittedIds, replay };
    }, error => error instanceof RouteError || error instanceof RuntimeRefused && error.code === 'runner_closed' || error instanceof Error && error.message === 'store_full');
    // The runtime has retained the work. This response awaits admission durability only.
    return response(jobIds);
  });
  app.get('/api/jobs/:id', c => { const job = store.snapshot().jobs.find(j => j.id === id(c.req.param('id'))); if (!job) throw new RouteError('not_found', 404); return c.json({ ...job, mode: env.mode }); });
  app.post('/api/jobs/:id/retry', async c => {
    const parsed = RetryRequestSchema.safeParse(await c.req.json()); if (!parsed.success) throw new RouteError('invalid_request', 400);
    // Deliberately fail closed until retry admission/idempotency is separately integration-reviewed.
    return c.json({ mode: env.mode, error: 'retry_not_ready' }, 503);
  });
  app.post('/api/jobs/:id/cancel', async c => {
    const jobId = id(c.req.param('id'));
    runner.cancel(jobId);
    const state = await store.commit(state => {
      const job = state.jobs.find(j => j.id === jobId); if (!job) throw new RouteError('not_found', 404);
      const result = step(job.attempts.at(-1)!, { type: 'cancel' }, now()); job.attempts[job.attempts.length - 1] = result.attempt;
      for (const effect of result.effects) if (effect.type === 'settle') { const entry = state.ledger.find(e => e.id === result.attempt.ledgerEntryId); if (entry && entry.state !== 'spent' && entry.state !== 'released') { entry.state = effect.state; entry.settledAt = now(); entry.settledSeq = state.seq + 1; entry.reason = 'cancel'; } }
      return state;
    }); return c.json({ ...state.jobs.find(j => j.id === jobId)!, mode: env.mode });
  });
  app.post('/api/jobs/:id/artifact-recovery', c => c.json({ mode: env.mode, error: 'artifact_recovery_not_ready' }, 503));
  for (const path of ['/api/buyer-sessions', '/api/buyer-sessions/:id/photo', '/api/buyer-sessions/:id/tryon']) app.post(path, c => c.json({ mode: env.mode, error: 'buyer_upload_disabled', local: COPY.retention.local, vendor: COPY.retention.vendor }, 403));
  app.delete('/api/buyer-sessions/:id', async c => c.json({ ...await deleteBuyer(store, id(c.req.param('id')), now()), mode: env.mode }));
  app.get('/media/:id', async c => {
    const mediaId = id(c.req.param('id')), state = store.snapshot();
    const photo = state.photos.find(p => p.id === mediaId), image = state.images.find(i => i.id === mediaId && !i.artifactMissing);
    if (!photo && !image || photo?.expiresAt && Date.parse(photo.expiresAt) <= Date.now() || image?.expiresAt && Date.parse(image.expiresAt) <= Date.now()) throw new RouteError('not_found', 404);
    if (photo?.role === 'buyer' || image?.buyerSessionId) c.header('Cache-Control', 'no-store');
    c.header('Content-Type', 'image/jpeg'); return c.body(new Uint8Array(await store.readMedia(photo?.normalized.path ?? image!.disclosedPath)));
  });
}
