import type { HealthResponse, JobsResponse, ListingResponse, ListingWriteRequest, ModelsResponse, PhotoUploadResponse, QualityReport, TryOnJob, TryOnRequest, UnitsResponse, GarmentDeclaration } from '../shared/types.js';

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

/** Same-origin fixture-only browser client. No key, persistence, automatic POST retry or remote URL. */
export class SellerApi {
  private verifiedFixture = false;
  private active = new Set<AbortController>();
  async call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!/^\/api\/[a-z0-9/_-]+$/.test(path) || !['127.0.0.1', 'localhost'].includes(location.hostname) || location.protocol !== 'http:') throw new ApiError('origin_refused');
    const mutation = method !== 'GET';
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
        throw new ApiError(code, mutation && !(response.status < 500 && DEFINITIVE.has(code)), response.status);
      }
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
    const result = await this.call<HealthResponse>('/api/health');
    this.verifiedFixture = result.mode === 'fixture' && result.buyerUpload === 'disabled'; return result;
  }
  models = () => this.call<ModelsResponse>('/api/models');
  listings = () => this.call<{ mode: 'fixture'; listings: ListingResponse[] }>('/api/listings');
  listing = (value: string) => this.call<ListingResponse>(`/api/listings/${id(value)}`);
  units = () => this.call<UnitsResponse>('/api/units');
  photo(file: File): Promise<PhotoUploadResponse> {
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new ApiError('photo_file_invalid');
    const form = new FormData(); form.set('role', 'garment'); form.set('file', file); return this.call('/api/photos', 'POST', form);
  }
  evaluate = (value: string, declaration: GarmentDeclaration) => this.call<QualityReport>(`/api/photos/${id(value)}/evaluate`, 'POST', { declaration });
  save = (value: string | null, body: ListingWriteRequest) => this.call<ListingResponse>(value ? `/api/listings/${id(value)}` : '/api/listings', value ? 'PATCH' : 'POST', body);
  generate = (value: string, body: TryOnRequest) => this.call<JobsResponse>(`/api/listings/${id(value)}/tryon`, 'POST', body);
  job = (value: string) => this.call<TryOnJob>(`/api/jobs/${id(value)}`);
  cancel = (value: string) => this.call<TryOnJob>(`/api/jobs/${id(value)}/cancel`, 'POST', {});
  dispose(): void { for (const controller of this.active) controller.abort(); this.active.clear(); }
}
