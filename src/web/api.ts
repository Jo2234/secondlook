import type { HealthResponse, JobsResponse, ListingResponse, ListingWriteRequest, ModelsResponse, PhotoUploadResponse, QualityReport, TryOnJob, UnitsResponse, GarmentDeclaration } from '../shared/types.js';
import { COPY } from '../shared/copy.js';
import { TryOnJobSchema, QualityReportSchema, TryOnRequestSchema } from '../shared/schemas.js';
import { correlatedJobs, observedFixtureRefusal, fixtureBody, fixtureHealth, fixtureModels, inspectedJobs } from './fixture-admission.js';
import type { FixtureReview } from './fixture-admission.js';

const ID = /^[0-9a-z]{20}$/;
const MAX_RESPONSE = 1024 * 1024;
const DEFINITIVE = new Set(['invalid_request', 'quality_failed', 'capability_blocked', 'rights_missing', 'cost_mismatch', 'budget_exceeded', 'insufficient_balance_estimate', 'request_id_conflict', 'buyer_upload_disabled', 'origin_refused', 'body_too_large', 'image_too_large', 'image_unsupported', 'generated_image_not_cover']);
export class ApiError extends Error {
  constructor(readonly code: string, readonly uncertain = false, readonly status: number | null = null) { super(code); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('response_invalid');
  return value as Record<string, unknown>;
}
function id(value: string): string { if (!ID.test(value)) throw new ApiError('id_invalid'); return value; }
export function mediaUrl(value: string): string { return `/media/${id(value)}`; }

type R = Record<string, unknown>;
const object = (v: unknown): v is R => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const identifier = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const nullableId = (v: unknown) => v === null || identifier(v);
const date = (v: unknown) => text(v, 40) && Number.isFinite(Date.parse(v));
const list = (v: unknown, cap: number, valid: (item: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.length <= cap && v.every(valid);
const category = (v: unknown) => ['upper_body', 'outer', 'full_body', 'lower_body'].includes(v as string);
const severity = (v: unknown) => ['pass', 'warn', 'fail'].includes(v as string);
function declaration(v: unknown): boolean {
  return object(v) && category(v.category) && ['hanger', 'mannequin', 'flatlay', 'worn'].includes(v.photoType as string) && ['singleGarment', 'frontFacing', 'notComposite', 'fullyVisible', 'noPeopleInPhoto'].every(k => typeof v[k] === 'boolean');
}
function measurements(v: unknown): boolean {
  const fields = ['pit_to_pit', 'length', 'shoulder', 'sleeve', 'waist', 'hip', 'rise', 'inseam', 'leg_opening'];
  return object(v) && category(v.category) && ['cm', 'in'].includes(v.enteredUnit as string) && (v.tagSize === null || text(v.tagSize, 24)) && object(v.valuesMm) && Object.entries(v.valuesMm).every(([key, value]) => fields.includes(key) && (integer(value) && value >= 50 && value <= 2000 || key === 'sleeve' && value === 'na'));
}
function listing(v: unknown): boolean {
  return object(v) && v.mode === 'fixture' && identifier(v.id) && text(v.title, 80) && text(v.conditionNotes, 500) && (v.priceText === null || text(v.priceText, 20)) && list(v.garmentPhotoIds, 32, identifier) && list(v.tryOnResultIds, 4096, identifier) && (v.declaration === null || declaration(v.declaration)) && (v.measurements === null || measurements(v.measurements)) && date(v.createdAt) && date(v.updatedAt) && object(v.readiness) && typeof v.readiness.ready === 'boolean' && list(v.readiness.missing, 32, x => text(x, 80));
}
function quality(v: unknown): boolean {
  return QualityReportSchema.safeParse(v).success && object(v) && identifier(v.photoId) && v.role === 'garment' && severity(v.verdict) && typeof v.spendAllowed === 'boolean' && text(v.thresholdsVersion, 80) && (v.capability === null || object(v.capability) && category(v.capability.category) && text(v.capability.status, 40) && text(v.capability.photoType, 40)) && list(v.checks, 64, check => object(check) && text(check.id, 80) && severity(check.severity) && (check.measured === null || text(check.measured, 256) || typeof check.measured === 'number' && Number.isFinite(check.measured)) && text(check.threshold, 256) && text(check.messageKey, 80) && Object.hasOwn(COPY.quality, check.messageKey) && ['pixel', 'declaration', 'capability', 'doc_spec'].includes(check.source as string));
}
function job(v: unknown): boolean {
  return TryOnJobSchema.safeParse(v).success && object(v) && v.mode === 'fixture' && identifier(v.id) && nullableId(v.listingId) && identifier(v.garmentPhotoId) && identifier(v.modelPhotoId) && text(v.requestId, 64) && nullableId(v.resultImageId) && Array.isArray(v.attempts) && v.attempts.length > 0 && list(v.attempts, 128, a => object(a) && integer(a.n) && a.n > 0 && ['queued', 'uploading', 'submitting', 'polling', 'downloading', 'succeeded', 'failed', 'timed_out', 'uncertain', 'cancelled'].includes(a.state as string) && (a.error === null || object(a.error) && text(a.error.code, 160) && text(a.error.messageKey, 80) && Object.hasOwn(COPY.errors, a.error.messageKey)));
}
function units(v: R): boolean {
  return integer(v.budgetCu) && integer(v.committedCu) && integer(v.remainingBudgetCu) && (v.balanceEstimateCu === null || integer(v.balanceEstimateCu)) && list(v.ledger, 4096, e => object(e) && identifier(e.id) && identifier(e.jobId) && integer(e.attempt) && integer(e.cu) && ['reserved', 'spent', 'released', 'possibly_spent'].includes(e.state as string) && text(e.reason, 512));
}

/** Same-origin fixture-only browser client. No key, persistence, automatic POST retry or remote URL. */
export class SellerApi {
  private verifiedFixture = false;
  private active = new Set<AbortController>();
  async call<T>(path: string, method = 'GET', body?: unknown, valid: (value: R) => boolean = () => false, admission?: FixtureReview): Promise<T> {
    if (!/^\/api\/[a-z0-9/_-]+$/.test(path) || !['127.0.0.1', 'localhost'].includes(location.hostname) || location.protocol !== 'http:') throw new ApiError('origin_refused');
    const mutation = method !== 'GET';
    // Only the reviewed fixture generate seam is open; retry and buyer admission stay closed.
    const fixtureGenerate = method === 'POST' && admission !== undefined
      && path === `/api/listings/${id(admission.listingId)}/tryon`
      && JSON.stringify(body) === JSON.stringify(fixtureBody(admission));
    if (mutation && /\/(?:tryon|retry)(?:\/|$)/.test(path) && !fixtureGenerate) throw new ApiError('admission_contract_unavailable');
    if (mutation && !this.verifiedFixture) throw new ApiError('fixture_required');
    const controller = new AbortController(); this.active.add(controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    let sent = false;
    try {
      const multipart = body instanceof FormData;
      sent = true;
      const response = await fetch(path, { method, credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body), headers: multipart ? {} : { 'content-type': 'application/json' } }) });
      if (!response.body) throw new ApiError('response_invalid');
      const reader = response.body.getReader(); let used = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          used += part.value.length; if (used > MAX_RESPONSE) throw new ApiError('response_cap'); chunks.push(part.value);
        }
      } finally {
        // Observe cancellation rejection; the original 15s fetch deadline is not renewed.
        void reader.cancel().catch(() => {}); reader.releaseLock();
      }
      const bytes = new Uint8Array(used); let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      const value = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      if (value.mode !== 'fixture') throw new ApiError('fixture_required');
      if (!response.ok) {
        const code = typeof value.error === 'string' && /^[a-z0-9_]{1,80}$/.test(value.error) ? value.error : 'request_refused';
        const invalidPhoto = path === '/api/photos' && method === 'POST' && response.status === 422 && code === 'image_invalid';
        throw new ApiError(code, mutation && !(fixtureGenerate ? observedFixtureRefusal(value, response.status) : invalidPhoto || response.status < 500 && DEFINITIVE.has(code)), response.status);
      }
      // Invalid success envelopes after a write are uncertain, just like malformed JSON.
      if (!valid(value)) throw new ApiError('response_invalid');
      return value as T;
    } catch (error) {
      if (error instanceof ApiError) {
        if (mutation && sent && error.status === null) throw new ApiError(error.code, true);
        throw error;
      }
      throw new ApiError('connection_or_response_unknown', mutation && sent);
    } finally { clearTimeout(timer); this.active.delete(controller); }
  }
  async health(): Promise<HealthResponse> {
    this.verifiedFixture = false;
    const result = await this.call<HealthResponse>('/api/health', 'GET', undefined, v => fixtureHealth(v) && text(v.version, 80) && text(v.thresholdsVersion, 80) && list(v.capabilities, 64, object));
    this.verifiedFixture = result.mode === 'fixture' && result.buyerUpload === 'disabled'; return result;
  }
  models = () => this.call<ModelsResponse>('/api/models', 'GET', undefined, v => fixtureModels(v) && list(v.models, 1024, m => object(m) && identifier(m.photoId) && text(m.label, 256) && typeof m.synthetic === 'boolean' && text(m.source, 80)) && new Set((v.models as R[]).map(m => m.photoId)).size === (v.models as R[]).length);
  listings = () => this.call<{ mode: 'fixture'; listings: ListingResponse[] }>('/api/listings', 'GET', undefined, v => list(v.listings, 4096, listing));
  listing = (value: string) => this.call<ListingResponse>(`/api/listings/${id(value)}`, 'GET', undefined, v => listing(v) && v.id === value);
  units = () => this.call<UnitsResponse>('/api/units', 'GET', undefined, units);
  photo(file: File): Promise<PhotoUploadResponse> {
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new ApiError('photo_file_invalid');
    const form = new FormData(); form.set('role', 'garment'); form.set('file', file); return this.call('/api/photos', 'POST', form, v => object(v.photo) && identifier(v.photo.id) && v.photo.role === 'garment' && v.photo.mode === 'fixture' && (v.quality === null || quality(v.quality)));
  }
  evaluate = (value: string, declaration: GarmentDeclaration) => this.call<QualityReport>(`/api/photos/${id(value)}/evaluate`, 'POST', { declaration }, v => quality(v) && v.photoId === value);
  save = (value: string | null, body: ListingWriteRequest) => this.call<ListingResponse>(value ? `/api/listings/${id(value)}` : '/api/listings', value ? 'PATCH' : 'POST', body, v => listing(v) && (value === null || v.id === value));
  generate(review: FixtureReview): Promise<JobsResponse> {
    const body = fixtureBody(review);
    return this.call(`/api/listings/${id(review.listingId)}/tryon`, 'POST', body, v => correlatedJobs(v, review) !== null, review);
  }
  lookup(review: FixtureReview): Promise<JobsResponse> {
    fixtureBody(review);
    return this.call(`/api/tryon-requests/${review.requestId}`, 'GET', undefined, v => correlatedJobs(v, review) !== null);
  }
  inspectRequest(requestId: string): Promise<JobsResponse> {
    if (!TryOnRequestSchema.shape.requestId.safeParse(requestId).success) throw new ApiError('request_id_invalid');
    return this.call(`/api/tryon-requests/${requestId}`, 'GET', undefined, v => inspectedJobs(v, requestId) !== null);
  }
  job = (value: string) => this.call<TryOnJob>(`/api/jobs/${id(value)}`, 'GET', undefined, v => job(v) && v.id === value);
  cancel = (value: string) => this.call<TryOnJob>(`/api/jobs/${id(value)}/cancel`, 'POST', {}, v => job(v) && v.id === value);
  dispose(): void { for (const controller of this.active) controller.abort(); this.active.clear(); }
}
