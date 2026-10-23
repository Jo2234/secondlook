// DRAFT ONLY — R30 does not authorize importing or executing this file.
import { describe, expect, it } from 'vitest';
import { admissionReady, admissionBody, correlatedJobs, definitiveFixtureRefusal, FixtureAdmission, fixtureBody, fixtureReady, inspectedJobs, observedFixtureRefusal, sameJobIdentity } from '../../src/web/fixture-admission.js';
import type { FixtureInputs, FixtureReview } from '../../src/web/fixture-admission.js';
import type { JobsResponse, TryOnJob } from '../../src/shared/types.js';

const UUID = '12345678-1234-4234-8234-123456789abc';
const OTHER_UUID = '22345678-1234-4234-8234-123456789abc';
const at = '2026-10-19T00:00:00.000Z';
const id = (n: number) => String(n).padStart(20, '0');
function inputs(): FixtureInputs {
  const declaration = { photoType: 'hanger' as const, category: 'upper_body' as const, singleGarment: true, frontFacing: true, notComposite: true, fullyVisible: true, noPeopleInPhoto: true };
  const capability = { photoType: declaration.photoType, category: declaration.category, status: 'documented' as const, citation: 'accepted fixture contract' };
  return {
    health: { mode: 'fixture', version: '0.0.0', thresholdsVersion: 'q1-2026-10-19', buyerUpload: 'disabled', preflight: null, capabilities: [capability] },
    listing: { id: id(1), mode: 'fixture', title: 'Sample top', conditionNotes: '', priceText: null, garmentPhotoIds: [id(2)], declaration, measurements: { category: 'upper_body', valuesMm: { pit_to_pit: 500, length: 600, shoulder: 400, sleeve: 'na' }, enteredUnit: 'cm', tagSize: null }, tryOnResultIds: [], status: 'ready', createdAt: at, updatedAt: at, readiness: { ready: true, missing: [] } },
    photoId: id(2), declaration, quality: { photoId: id(2), role: 'garment', verdict: 'pass', checks: [{ id: 'capability', severity: 'pass', measured: null, threshold: 'fixture documented', messageKey: 'capability', source: 'capability' }], thresholdsVersion: 'q1-2026-10-19', capability, spendAllowed: true },
    models: [3, 4].map(n => ({ photoId: id(n), label: 'Synthetic fixture model', rightsId: null, source: 'synthetic', synthetic: true, provenance: 'demo_placeholder' as const })), modelIds: [id(3), id(4)], dirty: false,
  };
}
function envelope(r: FixtureReview): JobsResponse {
  return { mode: 'fixture', jobs: r.modelIds.map((modelPhotoId, n): TryOnJob => ({
    id: id(10 + n), mode: 'fixture', listingId: r.listingId, buyerSessionId: null, garmentPhotoId: r.photoId, modelPhotoId,
    category: r.declaration.category, request: { garment_category: r.declaration.category, change_shoes: false, filter_multi_person: 'strict' },
    attempts: [{ n: 1, state: 'queued', taskId: null, srcFileId: null, refFileId: null, postCount: 0, getCount: 0, uploadsStartedAt: null, postSendStartedAt: null, attemptDeadlineAt: null, submittedAt: null, deadlineAt: null, error: null, ledgerEntryId: id(20 + n), history: [] }],
    resultImageId: null, createdAt: at, requestId: r.requestId,
  })) };
}
function posting() {
  const c = new FixtureAdmission(), i = inputs(), r = c.open(i, UUID);
  expect(c.claim(r, i)).toBe(true); expect(c.startPost(r, i)).not.toBeNull();
  return { c, i, r };
}

describe('fixture admission controller — 30 draft cases, no React/network/provider mocks', () => {
  it('accepts one synthetic model and confirms zero fixture units', () => {
    const i = inputs(); i.modelIds = [id(3)]; const c = new FixtureAdmission(), r = c.open(i, UUID);
    expect(fixtureBody(r)).toEqual({ requestId: UUID, garmentPhotoId: id(2), modelPhotoIds: [id(3)], confirmCostCu: 0 });
  });
  it('freezes two models and declaration independently of caller arrays', () => {
    const i = inputs(), c = new FixtureAdmission(), r = c.open(i, UUID); i.modelIds.reverse(); i.declaration.frontFacing = false;
    expect(r.modelIds).toEqual([id(3), id(4)]); expect(r.declaration.frontFacing).toBe(true);
  });
  it('rejects non-v4 UUID before opening a review', () => {
    const c = new FixtureAdmission(); expect(() => c.open(inputs(), '12345678-1234-1234-8234-123456789abc')).toThrow(); expect(c.snapshot().phase).toBe('idle');
  });
  it('rejects duplicate models', () => { const i = inputs(); i.modelIds = [id(3), id(3)]; expect(fixtureReady(i)).toBe(false); });
  it('rejects zero models', () => { const i = inputs(); i.modelIds = []; expect(fixtureReady(i)).toBe(false); });
  it('rejects more than two models', () => { const i = inputs(); i.modelIds.push(id(5)); expect(fixtureReady(i)).toBe(false); });
  it('rejects non-synthetic provenance even with synthetic flag', () => { const i = inputs(); i.models[0]!.source = 'rights_manifest'; expect(fixtureReady(i)).toBe(false); });
  it('rejects live health', () => { const i = inputs(); i.health!.mode = 'live'; expect(fixtureReady(i)).toBe(false); });
  it('rejects enabled buyer health', () => { const i = inputs(); i.health!.buyerUpload = 'enabled'; expect(fixtureReady(i)).toBe(false); });
  it('rejects dirty saved facts', () => { const i = inputs(); i.dirty = true; expect(fixtureReady(i)).toBe(false); });
  it('rejects a non-ready listing', () => { const i = inputs(); i.listing!.readiness.ready = false; expect(fixtureReady(i)).toBe(false); });
  it('rejects a quality check failure despite permissive headline fields', () => { const i = inputs(); i.quality!.checks[0]!.severity = 'fail'; expect(fixtureReady(i)).toBe(false); });
  it('rejects a quality report for another photo or thresholds version', () => {
    const i = inputs(); i.quality!.photoId = id(99); expect(fixtureReady(i)).toBe(false); i.quality!.photoId = id(2); i.quality!.thresholdsVersion = 'old'; expect(fixtureReady(i)).toBe(false);
  });
  it('refuses stale saved timestamp before claiming any POST', () => {
    const i = inputs(), c = new FixtureAdmission(), r = c.open(i, UUID); i.listing!.updatedAt = '2026-10-19T00:00:01.000Z';
    expect(c.claim(r, i)).toBe(false); expect(c.startPost(r, i)).toBeNull(); expect(c.snapshot().phase).toBe('refused');
  });
  it('refuses changed model order at confirmation', () => {
    const i = inputs(), c = new FixtureAdmission(), r = c.open(i, UUID); i.modelIds.reverse(); expect(c.claim(r, i)).toBe(false);
  });
  it('refuses changed declaration even when caller mutates shared input', () => {
    const i = inputs(), c = new FixtureAdmission(), r = c.open(i, UUID); i.declaration.fullyVisible = false; expect(c.claim(r, i)).toBe(false);
  });
  it('claims synchronously and permits only one transition to POST', () => {
    const i = inputs(), c = new FixtureAdmission(), r = c.open(i, UUID);
    expect(c.claim(r, i)).toBe(true); expect(c.claim(r, i)).toBe(false); expect(c.startPost(r, i)).not.toBeNull(); expect(c.startPost(r, i)).toBeNull(); expect(c.blocksMutations()).toBe(true);
  });
  it('refuses a changed listing from the pre-POST GET', () => {
    const i = inputs(), c = new FixtureAdmission(), r = c.open(i, UUID); c.claim(r, i); i.listing!.id = id(99);
    expect(c.startPost(r, i)).toBeNull(); expect(c.snapshot().phase).toBe('refused');
  });
  it('retains the original identity after an ambiguous transport result', () => {
    const { c, i, r } = posting(); c.fail(r, null, 'connection_or_response_unknown');
    expect(c.snapshot()).toEqual({ phase: 'unknown', review: r }); expect(c.canReview(i)).toBe(false); expect(() => c.open(i, OTHER_UUID)).toThrow(); expect(c.startPost(r, i)).toBeNull();
  });
  it('treats 500 with a familiar refusal code as unknown', () => { const { c, r } = posting(); c.fail(r, 500, 'quality_failed'); expect(c.snapshot().phase).toBe('unknown'); });
  it('keeps malformed success uncertain', () => { const { c, r } = posting(); expect(c.found(r, { mode: 'fixture', jobs: [] })).toBeNull(); expect(c.snapshot().phase).toBe('unknown'); });
  it('adopts matching original jobs after explicit read-only found', () => {
    const { c, r } = posting(); c.fail(r, null, 'lost'); expect(c.found(r, envelope(r))?.map(j => j.id)).toEqual([id(10), id(11)]); expect(c.snapshot().phase).toBe('accepted');
  });
  it('keeps a missing 404 unknown and does not mint another request', () => {
    const { c, i, r } = posting(); c.fail(r, null, 'lost'); c.missing(r); expect(c.snapshot().phase).toBe('unknown'); expect(c.snapshot().review).toBe(r); expect(c.canReview(i)).toBe(false);
  });
  it('rejects reordered jobs from a lookup', () => { const { c, r } = posting(), v = envelope(r); v.jobs.reverse(); expect(c.found(r, v)).toBeNull(); expect(c.blocksMutations()).toBe(true); });
  it('rejects duplicate job IDs', () => { const { r } = posting(), v = envelope(r); v.jobs[1]!.id = v.jobs[0]!.id; expect(correlatedJobs(v, r)).toBeNull(); });
  it('rejects wrong request, listing, photo, model and mode correlations', () => {
    const { r } = posting();
    // One test case; each assertion independently uses the actual production validator.
    const request = envelope(r); request.jobs[0]!.requestId = OTHER_UUID; expect(correlatedJobs(request, r)).toBeNull();
    const listing = envelope(r); listing.jobs[0]!.listingId = id(99); expect(correlatedJobs(listing, r)).toBeNull();
    const photo = envelope(r); photo.jobs[0]!.garmentPhotoId = id(99); expect(correlatedJobs(photo, r)).toBeNull();
    const model = envelope(r); model.jobs[0]!.modelPhotoId = id(99); expect(correlatedJobs(model, r)).toBeNull();
    const live = envelope(r); live.jobs[0]!.mode = 'live'; expect(correlatedJobs(live, r)).toBeNull();
  });
  it('keeps known accepted IDs and state after a later missing or mismatching read', () => {
    const { c, r } = posting(); c.found(r, envelope(r)); c.missing(r); const v = envelope(r); v.jobs[0]!.id = id(99);
    expect(c.found(r, v)).toBeNull(); expect(c.snapshot().phase).toBe('accepted');
  });
  it('distinguishes exact direct refusal from conflict and unknown status', () => {
    const { c, i, r } = posting(); c.fail(r, 409, 'quality_failed'); expect(c.snapshot().phase).toBe('refused'); expect(c.canReview(i)).toBe(true);
    expect(definitiveFixtureRefusal(409, 'request_id_conflict')).toBe(false); expect(definitiveFixtureRefusal(null, 'quality_failed')).toBe(false);
    expect(observedFixtureRefusal({ mode: 'fixture', error: 'quality_failed' }, 409)).toBe(true);
    expect(observedFixtureRefusal({ mode: 'fixture', error: 'quality_failed', jobs: [] }, 409)).toBe(false);
  });
  it('fences stale review callbacks after closing and replacing a review', () => {
    const i = inputs(), c = new FixtureAdmission(), old = c.open(i, UUID); c.close(old); const next = c.open(i, OTHER_UUID);
    c.fail(old, null, 'lost'); expect(c.claim(old, i)).toBe(false); expect(c.snapshot().review).toBe(next); expect(c.claim(next, i)).toBe(true);
  });
  it('inspection does not authorize admission or relax original job identity', () => {
    const { c, i, r } = posting(), v = envelope(r); c.found(r, v);
    expect(c.canReview(i)).toBe(false); expect(c.coversLedger(v.jobs.map(j => j.id))).toBe(true); expect(new FixtureAdmission().coversLedger(v.jobs.map(j => j.id))).toBe(false);
    expect(inspectedJobs(v, UUID)?.jobs.length).toBe(2); expect(inspectedJobs(v, OTHER_UUID)).toBeNull();
    const changed = { ...v.jobs[0]!, modelPhotoId: id(99) }; expect(sameJobIdentity(v.jobs[0]!, changed)).toBe(false);
  });
});

function liveInputs(): FixtureInputs {
  const i = inputs(); i.health!.mode = 'live'; i.listing!.mode = 'live';
  i.models = i.models.map(m => ({ ...m, synthetic: false, source: 'rights_manifest', rightsId: 'consent-1', provenance: 'recorded_consent' as const }));
  i.units = { mode: 'live', preflight: { at: new Date().toISOString(), baseUrl: 'https://example.invalid', fenceSeq: 0,
    featureCost: { matched: [], status: 'ok', costPerTaskCu: 125 }, balanceCu: 1000, ok: true, problems: [] },
    budgetCu: 1000, committedCu: 0, remainingBudgetCu: 1000, balanceEstimateCu: 1000, ledger: [] };
  return i;
}
describe('live admission uses reviewed cost, rights and current mode', () => {
  it('admits fresh consented models and sends cost times count', () => {
    const i = liveInputs(), c = new FixtureAdmission(); expect(admissionReady(i, 'live', i.units)).toBe(true);
    const r = c.open(i, UUID); expect(admissionBody(r).confirmCostCu).toBe(250);
    expect(c.claim(r, i)).toBe(true); expect(c.startPost(r, i)?.confirmCostCu).toBe(250);
  });
  it('admits AI-generated fictional manifest models but never demo placeholders in live mode', () => {
    const i = liveInputs(); i.models = i.models.map(m => ({ ...m, provenance: 'ai_generated_fictional' as const }));
    expect(admissionReady(i, 'live', i.units)).toBe(true);
    i.models[1]!.provenance = 'demo_placeholder'; expect(admissionReady(i, 'live', i.units)).toBe(false);
  });
  it.each(['missing', 'stale', 'boundary', 'future', 'status', 'not_ok', 'synthetic', 'provenance', 'source', 'rights', 'budget', 'balance', 'health', 'listing', 'units', 'negative', 'fractional', 'null'] as const)('rejects %s', reason => {
    const i = liveInputs(), u = i.units!, p = u.preflight!;
    if (reason === 'missing') u.preflight = null;
    if (reason === 'stale') p.at = new Date(Date.now() - 31 * 60000).toISOString();
    if (reason === 'boundary') p.at = new Date(Date.now() - 30 * 60000).toISOString();
    if (reason === 'future') p.at = new Date(Date.now() + 60000).toISOString();
    if (reason === 'status') p.featureCost.status = 'cost_unknown';
    if (reason === 'not_ok') p.ok = false;
    if (reason === 'synthetic') i.models[0]!.synthetic = true;
    if (reason === 'provenance') i.models[0]!.provenance = 'demo_placeholder';
    if (reason === 'source') i.models[0]!.source = 'seller_upload';
    if (reason === 'rights') i.models[0]!.rightsId = null;
    if (reason === 'budget') u.remainingBudgetCu = 249;
    if (reason === 'balance') u.balanceEstimateCu = 374;
    if (reason === 'health') i.health!.mode = 'fixture';
    if (reason === 'listing') i.listing!.mode = 'fixture';
    if (reason === 'units') u.mode = 'fixture';
    if (reason === 'negative') p.featureCost.costPerTaskCu = -1;
    if (reason === 'fractional') p.featureCost.costPerTaskCu = 1.5;
    if (reason === 'null') p.featureCost.costPerTaskCu = null;
    expect(admissionReady(i, 'live', u)).toBe(false);
  });
  it('requires one task of balance headroom but permits the boundary', () => {
    const i = liveInputs(); i.units!.remainingBudgetCu = 250; i.units!.balanceEstimateCu = 375;
    expect(admissionReady(i)).toBe(true);
  });
  it('invalidates review on a preflight or units change before POST', () => {
    const i = liveInputs(), c = new FixtureAdmission(), r = c.open(i, UUID);
    expect(c.claim(r, i)).toBe(true); i.units!.remainingBudgetCu -= 1;
    expect(c.startPost(r, i)).toBeNull(); expect(c.snapshot().phase).toBe('refused');
    const next = c.open(i, OTHER_UUID); i.units!.preflight!.featureCost.costPerTaskCu = 100;
    expect(c.claim(next, i)).toBe(false);
  });
  it('retains unknown live ownership and reconciles only live jobs', () => {
    const i = liveInputs(), c = new FixtureAdmission(), r = c.open(i, UUID);
    c.claim(r, i); c.startPost(r, i); c.fail(r, null, 'lost'); expect(c.blocksMutations()).toBe(true);
    const v = envelope(r); v.mode = 'live'; v.jobs.forEach(j => { j.mode = 'live'; });
    expect(c.found(r, v)?.length).toBe(2); expect(c.snapshot().phase).toBe('accepted');
  });
  it('rejects mixed modes for correlation and inspection in both directions', () => {
    const r = new FixtureAdmission().open(inputs(), UUID), v = envelope(r);
    expect(correlatedJobs(v, r, undefined, 'live')).toBeNull();
    v.mode = 'live'; expect(correlatedJobs(v, r, undefined, 'live')).toBeNull();
    expect(inspectedJobs(v, UUID, 'live')).toBeNull();
    v.jobs.forEach(j => { j.mode = 'live'; });
    expect(correlatedJobs(v, r, undefined, 'live')?.jobs.length).toBe(2);
    expect(inspectedJobs(v, UUID, 'live')?.jobs.length).toBe(2);
    expect(correlatedJobs(v, r, undefined, 'fixture')).toBeNull();
    v.mode = 'fixture'; expect(correlatedJobs(v, r)).toBeNull(); expect(inspectedJobs(v, UUID)).toBeNull();
  });
  it('preserves zero fixture body and every fixture quality gate in live', () => {
    const f = inputs(), r = new FixtureAdmission().open(f, UUID); expect(admissionBody(r).confirmCostCu).toBe(0);
    const i = liveInputs(); i.quality!.checks[0]!.severity = 'fail'; expect(admissionReady(i)).toBe(false);
  });
});
