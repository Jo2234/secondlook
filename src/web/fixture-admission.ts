import { HealthResponseSchema, InvalidRequestResponseSchema, JobsResponseSchema, ListingResponseSchema, ModelsResponseSchema, QualityReportSchema, TryOnRequestSchema } from '../shared/schemas.js';
import type { GarmentDeclaration, HealthResponse, JobsResponse, ListingResponse, ModelOption, QualityReport, TryOnJob, TryOnRequest } from '../shared/types.js';

export interface FixtureInputs {
  health: HealthResponse | null; listing: ListingResponse | null; photoId: string | null;
  declaration: GarmentDeclaration; quality: QualityReport | null;
  models: ModelOption[]; modelIds: string[]; dirty: boolean;
}
export type FixtureReview = Readonly<{
  listingId: string; savedAt: string; title: string; photoId: string;
  modelIds: readonly string[]; declaration: Readonly<GarmentDeclaration>;
  declarationKey: string; requestId: string;
}>;
export const declarationKey = (d: GarmentDeclaration | null): string => d === null ? '' : JSON.stringify([
  d.photoType, d.category, d.singleGarment, d.frontFacing, d.notComposite, d.fullyVisible, d.noPeopleInPhoto,
]);

/** UI admission uses the production schemas and the server's fixture rules, never a weaker quality gate. */
export function fixtureReady(i: FixtureInputs): boolean {
  const { health: h, listing: l, quality: q, declaration: d } = i;
  if (!HealthResponseSchema.safeParse(h).success || h?.mode !== 'fixture' || h.buyerUpload !== 'disabled'
    || !ListingResponseSchema.safeParse(l).success || l?.mode !== 'fixture' || !l.readiness.ready || l.readiness.missing.length
    || i.dirty || !l.title.trim() || !i.photoId || l.garmentPhotoIds[0] !== i.photoId || !l.measurements
    || declarationKey(l.declaration) !== declarationKey(d)
    || !d.singleGarment || !d.frontFacing || !d.notComposite || !d.fullyVisible || !d.noPeopleInPhoto && d.photoType !== 'worn'
    || !QualityReportSchema.safeParse(q).success || q?.role !== 'garment' || q.photoId !== i.photoId
    || q.verdict === 'fail' || !q.spendAllowed || q.checks.some(c => c.severity === 'fail')
    || q.thresholdsVersion !== h.thresholdsVersion || q.capability?.category !== d.category || q.capability.photoType !== d.photoType
    || !['documented', 'unverified', 'live_ok'].includes(q.capability.status)) return false;
  return ModelsResponseSchema.safeParse({ mode: 'fixture', models: i.models }).success
    && i.modelIds.length >= 1 && i.modelIds.length <= 2 && new Set(i.modelIds).size === i.modelIds.length
    && i.modelIds.every(id => i.models.filter(m => m.photoId === id && m.synthetic && m.source === 'synthetic').length === 1);
}
export function reviewMatches(r: FixtureReview, i: FixtureInputs): boolean {
  return fixtureReady(i) && i.listing?.id === r.listingId && i.listing.updatedAt === r.savedAt
    && i.photoId === r.photoId && declarationKey(i.declaration) === r.declarationKey
    && i.modelIds.length === r.modelIds.length && i.modelIds.every((id, n) => id === r.modelIds[n]);
}
export function fixtureBody(r: FixtureReview): TryOnRequest {
  const body = { requestId: r.requestId, garmentPhotoId: r.photoId, modelPhotoIds: [...r.modelIds], confirmCostCu: 0 };
  if (!TryOnRequestSchema.strict().safeParse(body).success || new Set(r.modelIds).size !== r.modelIds.length) throw new Error('fixture_request_invalid');
  return body;
}
/** The lookup has the same {mode,jobs} envelope as admission. Array order is part of identity. */
export function correlatedJobs(value: unknown, r: FixtureReview, knownIds?: readonly string[]): JobsResponse | null {
  const parsed = JobsResponseSchema.strict().safeParse(value);
  if (!parsed.success || parsed.data.mode !== 'fixture') return null;
  const { jobs } = parsed.data;
  if (jobs.length !== r.modelIds.length || new Set(jobs.map(j => j.id)).size !== jobs.length
    || knownIds && (knownIds.length !== jobs.length || jobs.some((j, n) => j.id !== knownIds[n]))
    || jobs.some((j, n) => j.mode !== 'fixture' || j.requestId !== r.requestId || j.listingId !== r.listingId
      || j.buyerSessionId !== null || j.garmentPhotoId !== r.photoId || j.modelPhotoId !== r.modelIds[n]
      || j.category !== r.declaration.category || j.request.garment_category !== r.declaration.category)) return null;
  return parsed.data;
}
export function inspectedJobs(value: unknown, requestId: string): JobsResponse | null {
  const p = JobsResponseSchema.strict().safeParse(value);
  if (!TryOnRequestSchema.shape.requestId.safeParse(requestId).success || !p.success || p.data.mode !== 'fixture'
    || p.data.jobs.length < 1 || p.data.jobs.length > 2 || new Set(p.data.jobs.map(j => j.id)).size !== p.data.jobs.length
    || p.data.jobs.some(j => j.mode !== 'fixture' || j.requestId !== requestId || j.buyerSessionId !== null || j.listingId === null)) return null;
  return p.data;
}
// Only observed, exact pre-effect refusal envelopes qualify. A conflict can refer to existing
// work; 5xx, including runner/store failures, never authorizes a replacement admission.
export function definitiveFixtureRefusal(status: number | null, code: string): boolean {
  return status === 400 && code === 'invalid_request' || status === 403 && code === 'origin_refused'
    || status === 413 && code === 'body_too_large'
    || status === 409 && ['quality_failed', 'capability_blocked', 'rights_missing', 'cost_mismatch', 'budget_exceeded', 'insufficient_balance_estimate', 'preflight_in_progress'].includes(code);
}
export function observedFixtureRefusal(value: unknown, status: number): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v.mode === 'fixture' && typeof v.error === 'string' && definitiveFixtureRefusal(status, v.error)
    && (Object.keys(v).length === 2 || v.error === 'invalid_request' && InvalidRequestResponseSchema.strict().safeParse(v).success);
}
export function sameJobIdentity(a: TryOnJob, b: TryOnJob): boolean {
  return a.id === b.id && a.mode === 'fixture' && b.mode === 'fixture' && a.requestId === b.requestId
    && a.listingId === b.listingId && a.buyerSessionId === b.buyerSessionId && a.buyerSessionId === null
    && a.garmentPhotoId === b.garmentPhotoId && a.modelPhotoId === b.modelPhotoId && a.category === b.category
    && a.request.garment_category === b.request.garment_category && a.request.change_shoes === b.request.change_shoes
    && a.request.filter_multi_person === b.request.filter_multi_person;
}
export type FixturePhase = 'idle' | 'review' | 'checking' | 'posting' | 'unknown' | 'accepted' | 'refused';
/** Synchronous, network-free ownership. One instance is retained by the page module across React remounts. */
export class FixtureAdmission {
  private phase: FixturePhase = 'idle';
  private review: FixtureReview | null = null;
  private jobIds: readonly string[] | undefined;
  private readonly admittedListings = new Set<string>();
  private readonly sessionJobIds = new Set<string>();
  snapshot() { return { phase: this.phase, review: this.review }; }
  blocksMutations(): boolean { return ['checking', 'posting', 'unknown'].includes(this.phase); }
  coversLedger(jobIds: readonly string[]): boolean { return jobIds.every(id => this.sessionJobIds.has(id)); }
  canReview(i: FixtureInputs): boolean {
    return !this.blocksMutations() && this.phase !== 'review' && !i.listing?.tryOnResultIds.length
      && !this.admittedListings.has(i.listing?.id ?? '') && fixtureReady(i);
  }
  open(i: FixtureInputs, requestId: string): FixtureReview {
    if (!this.canReview(i)) throw new Error('fixture_review_unavailable');
    const r: FixtureReview = Object.freeze({ listingId: i.listing!.id, savedAt: i.listing!.updatedAt, title: i.listing!.title,
      photoId: i.photoId!, modelIds: Object.freeze([...i.modelIds]), declaration: Object.freeze({ ...i.declaration }),
      declarationKey: declarationKey(i.declaration), requestId });
    fixtureBody(r); this.review = r; this.jobIds = undefined; this.phase = 'review'; return r;
  }
  close(r: FixtureReview): void { if (this.review === r && this.phase === 'review') this.phase = 'idle'; }
  claim(r: FixtureReview, i: FixtureInputs): boolean {
    if (this.review !== r || this.phase !== 'review') return false;
    if (!reviewMatches(r, i)) { this.phase = 'refused'; return false; }
    this.phase = 'checking'; return true;
  }
  startPost(r: FixtureReview, current: FixtureInputs): TryOnRequest | null {
    if (this.review !== r || this.phase !== 'checking') return null;
    if (!reviewMatches(r, current)) { this.phase = 'refused'; return null; }
    this.phase = 'posting'; return fixtureBody(r);
  }
  fail(r: FixtureReview, status: number | null, code: string): void {
    if (this.review !== r) return;
    if (this.phase === 'checking') this.phase = 'refused'; // GET failed; POST was never invoked.
    else if (this.phase === 'posting') this.phase = definitiveFixtureRefusal(status, code) ? 'refused' : 'unknown';
  }
  found(r: FixtureReview, value: unknown): TryOnJob[] | null {
    if (this.review !== r || !['posting', 'unknown', 'accepted'].includes(this.phase)) return null;
    const result = correlatedJobs(value, r, this.jobIds);
    if (!result) { if (this.phase !== 'accepted') this.phase = 'unknown'; return null; }
    this.jobIds = Object.freeze(result.jobs.map(j => j.id)); this.admittedListings.add(r.listingId);
    result.jobs.forEach(j => this.sessionJobIds.add(j.id));
    this.phase = 'accepted'; return result.jobs;
  }
  missing(r: FixtureReview): void {
    if (this.review === r && ['posting', 'unknown'].includes(this.phase)) this.phase = 'unknown';
  }
}

// Strict response checks shared with the existing bounded same-origin API client.
export const fixtureHealth = (v: unknown): boolean => HealthResponseSchema.safeParse(v).success
  && (v as HealthResponse).mode === 'fixture' && (v as HealthResponse).buyerUpload === 'disabled';
export const fixtureModels = (v: unknown): boolean => {
  const p = ModelsResponseSchema.safeParse(v);
  return p.success && p.data.mode === 'fixture' && new Set(p.data.models.map(m => m.photoId)).size === p.data.models.length
    && p.data.models.every(m => m.synthetic && m.source === 'synthetic');
};
