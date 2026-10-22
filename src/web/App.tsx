import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { COPY, UI_COPY as C } from '../shared/copy.js';
import { compareMeasurements, formatMeasurement, measurementProblems, parseMeasurement, REQUIRED_FIELDS } from '../shared/measurements.js';
import { listingText } from '../domain/listing.js';
import type { GarmentDeclaration, HealthResponse, ListingResponse, ListingWriteRequest, MeasurementField, Measurements, ModelOption, QualityReport, TryOnJob, Unit, UnitsResponse } from '../shared/types.js';
import { formatGuidance, formatMeasured } from './quality-display.js';
import { ApiError, mediaUrl, SellerApi } from './api.js';
import { FixtureAdmission, sameJobIdentity, reviewMatches } from './fixture-admission.js';
import type { FixtureInputs, FixtureReview } from './fixture-admission.js';

// Session memory only. React remounts retain ownership; a full navigation cannot recover it.
const fixtureAdmission = new FixtureAdmission();

const DEFAULT_DECLARATION: GarmentDeclaration = { photoType: 'hanger', category: 'upper_body', singleGarment: false, frontFacing: false, notComposite: false, fullyVisible: false, noPeopleInPhoto: false };
const EMPTY: ListingWriteRequest = { title: '', conditionNotes: '', priceText: null, garmentPhotoIds: [], declaration: null, measurements: null };
const ACTIVE = new Set(['queued', 'uploading', 'submitting', 'polling', 'downloading']);
function fixtureListingText(listing: ListingResponse): string {
  return [listingText({ ...listing, tryOnResultIds: [] }), listing.tryOnResultIds.length ? (listing.mode === 'live' ? COPY.listing.disclosure : COPY.mode.fixtureImage) : '', listing.mode === 'live' ? C.liveCopyData : C.copyData].filter(Boolean).join('\n\n');
}
type CostReview = FixtureReview;
const displayUnits = (cu: number | null | undefined) => cu === null || cu === undefined ? C.notAvailable : (cu / 100).toFixed(2);
function valuesFor(m: Measurements | null): Partial<Record<MeasurementField, string>> {
  return Object.fromEntries(Object.entries(m?.valuesMm ?? {}).map(([key, value]) => [key, value === 'na' ? 'na' : String(m?.enteredUnit === 'in' ? Math.round(value / 25.4 * 4) / 4 : value / 10)]));
}
function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><h2>{title}</h2>{children}</section>; }
function Image({ id, caption }: { id: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  return <figure>{failed ? <div className="image-missing">{C.missingImage}</div> : <img src={mediaUrl(id)} alt={caption} loading="lazy" onError={() => setFailed(true)} />}<figcaption>{caption}</figcaption></figure>;
}
function ReviewDialog({ review, title, onConfirm, onClose, busy }: { review: CostReview; title: string; onConfirm: () => void; onClose: () => void; busy: boolean }) {
  const live = review.mode === 'live';
  const dialog = useRef<HTMLDialogElement>(null); const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); cancel.current?.focus(); return () => { dialog.current?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return <dialog ref={dialog} aria-labelledby="cost-heading" aria-describedby="cost-detail" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    {!live && <span className="eyebrow">{C.simulated}</span>}<h2 id="cost-heading">{live ? C.liveCostTitle : C.costTitle}</h2><p id="cost-detail">{live ? C.liveAdmission : C.costBody}</p>{live && <><dl><dt>{C.tryOnCount}</dt><dd>{review.modelIds.length}</dd><dt>{C.costPerTask}</dt><dd>{displayUnits(review.costPerTaskCu)}</dd><dt>{C.totalCost}</dt><dd><strong>{displayUnits(review.costPerTaskCu! * review.modelIds.length)}</strong></dd><dt>{C.preflightBalance}</dt><dd>{displayUnits(review.balanceCu)}</dd><dt>{C.checkedAt}</dt><dd>{review.preflightAt}</dd></dl><p>{COPY.retention.vendor}</p><p>{COPY.listing.disclosure}</p></>}<p>{C.modalContext}</p>
    <dl><dt>{C.title}</dt><dd>{title}</dd><dt>{C.listings}</dt><dd className="mono">{review.listingId}</dd><dt>{C.original}</dt><dd className="mono">{review.photoId}</dd><dt>{C.timestamp}</dt><dd>{review.savedAt}</dd><dt>{C.declaration}</dt><dd>{C.types[review.declaration.photoType]} · {C.categories[review.declaration.category]}<ul>{(Object.keys(C.declarations) as (keyof typeof C.declarations)[]).map(key => <li key={key}>{review.declaration[key] ? '✓' : '—'} {C.declarations[key]}</li>)}</ul></dd><dt>{C.modelCount}</dt><dd>{review.modelIds.join(', ')}</dd><dt>{C.request}</dt><dd className="mono">{review.requestId}</dd></dl>
    <p>{live ? C.liveAdmission : C.fixtureAdmission}</p><div className="actions"><button ref={cancel} disabled={busy} onClick={onClose}>{C.cancel}</button><button className="primary" disabled={busy} onClick={onConfirm}>{live ? `${C.spend} ${displayUnits(review.costPerTaskCu! * review.modelIds.length)} ${C.andGenerate}` : C.confirm}</button></div>
  </dialog>;
}
function Compare({ item }: { item: Measurements }) {
  const [values, setValues] = useState<Partial<Record<MeasurementField, string>>>({});
  const reference: Measurements['valuesMm'] = {};
  for (const [field, value] of Object.entries(values)) { const mm = parseMeasurement(value, item.enteredUnit); if (mm !== null) reference[field as MeasurementField] = mm; }
  const differences = compareMeasurements(item.valuesMm, reference);
  return <Panel title={C.compare}><p>{COPY.compare.disclaimer}</p><p className="muted">{COPY.compare.flat} {C.privacy}</p><div className="compare-grid">
    {REQUIRED_FIELDS[item.category].map(field => <label key={field}>{C.fields[field]}<input inputMode="decimal" autoComplete="off" value={values[field] ?? ''} onChange={event => setValues(v => ({ ...v, [field]: event.target.value.slice(0, 12) }))} aria-label={`${C.yours}: ${C.fields[field]}`} /><small>{C.difference}: {differences[field] === undefined ? '—' : formatMeasurement(differences[field]!, item.enteredUnit, true)}</small></label>)}
  </div><button onClick={() => setValues({})}>{C.clear}</button></Panel>;
}

export function App() {
  const api = useRef(new SellerApi()).current;
  const mounted = useRef(true), working = useRef(false);
  const generation = useRef(0);
  const [pollEpoch, setPollEpoch] = useState(0);
  const [health, setHealth] = useState<HealthResponse | null>(null), [units, setUnits] = useState<UnitsResponse | null>(null);
  const [listings, setListings] = useState<ListingResponse[]>([]), [models, setModels] = useState<ModelOption[]>([]);
  const [saved, setSaved] = useState<ListingResponse | null>(null), [draft, setDraft] = useState<ListingWriteRequest>(EMPTY);
  const [declaration, setDeclaration] = useState<GarmentDeclaration>(DEFAULT_DECLARATION), [photoId, setPhotoId] = useState<string | null>(null);
  const [photoDimensions, setPhotoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null), [unit, setUnit] = useState<Unit>('cm');
  const [measurementText, setMeasurementText] = useState<Partial<Record<MeasurementField, string>>>({}), [tagSize, setTagSize] = useState('');
  const originalMeasurements = useRef<Measurements | null>(null), editedMeasurements = useRef(new Set<MeasurementField>());
  const [selectedModels, setSelectedModels] = useState<string[]>([]), [review, setReview] = useState<CostReview | null>(null);
  const [admissionState, setAdmissionState] = useState(() => fixtureAdmission.snapshot());
  const [lookupId, setLookupId] = useState(''), [inspected, setInspected] = useState<TryOnJob[]>([]);
  const [jobs, setJobs] = useState<TryOnJob[]>([]), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null), [unknown, setUnknown] = useState(false), [copyStatus, setCopyStatus] = useState('');
  const live = health?.mode === 'live';
  const [clock, setClock] = useState(Date.now());
  const disabled = busy || unknown || fixtureAdmission.blocksMutations() || Boolean(review) || !health;
  const inputs = (): FixtureInputs => ({ health, listing: saved, photoId, declaration, quality, models, modelIds: selectedModels, dirty, units });
  function syncAdmission() { if (mounted.current) setAdmissionState(fixtureAdmission.snapshot()); }
  function closeReview() { if (review) fixtureAdmission.close(review); setReview(null); syncAdmission(); }
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (review?.mode === 'live' && !reviewMatches(review, inputs())) { closeReview(); setError('review_stale'); }
  }, [units, clock]);
  async function reads() {
    const [l, u, m] = await Promise.all([api.listings(), api.units(), api.models()]);
    if (mounted.current) { setListings(l.listings.slice(0, 100)); setUnits(u); setModels(m.models.slice(0, 16)); }
  }
  async function action(work: () => Promise<void>, readOnly = false) {
    if (working.current || !readOnly && (unknown || fixtureAdmission.blocksMutations())) return;
    generation.current += 1;
    working.current = true; setBusy(true); setError(null);
    try { await work(); } catch (e) {
      if (mounted.current) { setError(e instanceof ApiError ? e.code : 'request_or_state_invalid'); if (e instanceof ApiError && e.uncertain) setUnknown(true); }
    } finally { generation.current += 1; working.current = false; if (mounted.current) { setBusy(false); syncAdmission(); setPollEpoch(n => n + 1); } }
  }
  useEffect(() => {
    mounted.current = true;
    const retained = fixtureAdmission.snapshot();
    // An abandoned unsent dialog has no write to recover. Never discard checking/posting/unknown ownership.
    if (retained.phase === 'review' && retained.review) fixtureAdmission.close(retained.review);
    syncAdmission();
    void action(async () => { const h = await api.health(); if (mounted.current) setHealth(h); await reads(); }, true);
    return () => { generation.current += 1; mounted.current = false; api.dispose(); };
  }, []);
  async function jobSnapshot(ids: string[], listingId: string | null) {
    const ownerGeneration = generation.current;
    const prior = [...jobs];
    const next = await Promise.all(ids.map(value => api.job(value)));
    if (next.some(j => j.mode !== health?.mode || j.listingId !== listingId || j.buyerSessionId !== null || prior.some(p => p.id === j.id && !sameJobIdentity(p, j)))) throw new ApiError('job_identity_mismatch');
    const [u, l] = await Promise.all([api.units(), listingId ? api.listing(listingId) : Promise.resolve(null)]);
    return { next, u, l, ownerGeneration };
  }
  function publishJobs(snapshot: Awaited<ReturnType<typeof jobSnapshot>>) {
    if (!mounted.current || generation.current !== snapshot.ownerGeneration) return;
    setJobs(snapshot.next); setUnits(snapshot.u);
    if (snapshot.l) { const listing = snapshot.l; setSaved(listing); setListings(old => old.map(l => l.id === listing.id ? listing : l)); }
  }
  async function publishAcceptedJobs(r: FixtureReview, accepted: TryOnJob[], ownerGeneration: number) {
    const current = () => mounted.current && generation.current === ownerGeneration && saved?.id === r.listingId;
    if (!current()) return;
    // Acceptance survives ancillary read failure; terminal jobs cannot rely on the active-only poll.
    setJobs(accepted);
    const [listing, ledger] = await Promise.all([api.listing(r.listingId), api.units()]);
    if (!current()) return;
    setSaved(listing); setUnits(ledger);
    setListings(old => old.map(l => l.id === listing.id ? listing : l));
  }
  const jobIdsKey = jobs.map(job => job.id).join(',');
  // Poll ownership depends on ID/selection/action identity, never each fetched array.
  // A tick collects jobs, units and listing before one guarded publication.
  useEffect(() => {
    if (!jobs.some(job => ACTIVE.has(job.attempts.at(-1)?.state ?? ''))) return;
    const ids = jobIdsKey.split(','), listingId = saved?.id ?? null, started = generation.current;
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !cancelled && mounted.current && generation.current === started;
    const tick = async () => {
      if (!current()) return;
      if (working.current) { timer = setTimeout(tick, 1000); return; }
      try {
        const snapshot = await jobSnapshot(ids, listingId);
        if (!current() || working.current) return;
        publishJobs(snapshot);
        if (!snapshot.next.some(job => ACTIVE.has(job.attempts.at(-1)?.state ?? ''))) return;
      } catch (e) { if (current() && !working.current) setError(e instanceof ApiError ? e.code : 'job_read_failed'); }
      if (current() && !working.current) timer = setTimeout(tick, 1000);
    };
    timer = setTimeout(tick, 1000); return () => { cancelled = true; clearTimeout(timer); };
  }, [jobIdsKey, saved?.id, pollEpoch]);
  function invalidate() { setDirty(true); closeReview(); }
  function changeDeclaration(next: GarmentDeclaration) { setDeclaration(next); setQuality(null); invalidate(); }
  function choose(listing: ListingResponse | null) {
    if (working.current || unknown || fixtureAdmission.blocksMutations()) return;
    closeReview();
    generation.current += 1;
    setSaved(listing); setDraft(listing ? { title: listing.title, conditionNotes: listing.conditionNotes, priceText: listing.priceText, garmentPhotoIds: [...listing.garmentPhotoIds], declaration: listing.declaration, measurements: listing.measurements } : { ...EMPTY, garmentPhotoIds: [] });
    setDeclaration(listing?.declaration ?? { ...DEFAULT_DECLARATION }); setPhotoId(listing?.garmentPhotoIds[0] ?? null); setPhotoDimensions(null); setQuality(null);
    setUnit(listing?.measurements?.enteredUnit ?? 'cm'); setMeasurementText(valuesFor(listing?.measurements ?? null)); setTagSize(listing?.measurements?.tagSize ?? '');
    originalMeasurements.current = listing?.measurements ?? null; editedMeasurements.current.clear();
    setSelectedModels([]); setJobs([]); setReview(null); setDirty(false); setCopyStatus(''); setInspected([]); setError(null);
  }
  function measurements(): Measurements {
    const original = originalMeasurements.current;
    const valuesMm: Measurements['valuesMm'] = original?.category === declaration.category ? { ...original.valuesMm } : {};
    for (const field of REQUIRED_FIELDS[declaration.category]) {
      if (!editedMeasurements.current.has(field) && original?.category === declaration.category && original.enteredUnit === unit && original.valuesMm[field] !== undefined) { valuesMm[field] = original.valuesMm[field]; continue; }
      delete valuesMm[field];
      const value = measurementText[field] ?? '';
      if (field === 'sleeve' && value === 'na') valuesMm[field] = 'na';
      else { const mm = parseMeasurement(value, unit); if (mm !== null) valuesMm[field] = mm; }
    }
    const result: Measurements = { category: declaration.category, enteredUnit: unit, valuesMm, tagSize: tagSize.trim() || null };
    if (measurementProblems(result).length) throw new ApiError('measurements_invalid'); return result;
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (disabled) return;
    await action(async () => {
      const originals = [...draft.garmentPhotoIds];
      if (photoId) { if (originals.length) originals[0] = photoId; else originals.push(photoId); }
      const next = await api.save(saved?.id ?? null, { ...draft, garmentPhotoIds: originals, declaration: { ...declaration }, measurements: measurements() });
      setSaved(next); setDraft(next); setDirty(false);
      originalMeasurements.current = next.measurements; editedMeasurements.current.clear();
      setMeasurementText(valuesFor(next.measurements)); setTagSize(next.measurements?.tagSize ?? '');
      await reads();
    });
  }
  const ledgerContextKnown = units !== null && fixtureAdmission.coversLedger(units.ledger.map(e => e.jobId));
  function openCostReview() {
    if (!ledgerContextKnown || working.current || disabled || jobs.length || !fixtureAdmission.canReview(inputs())) return;
    try { setReview(fixtureAdmission.open(inputs(), crypto.randomUUID())); setError(null); syncAdmission(); }
    catch { setError('fixture_review_unavailable'); }
  }
  function confirm() {
    if (!review || working.current || unknown || !ledgerContextKnown) return;
    const r = review;
    void action(async () => {
      if (!fixtureAdmission.claim(r, inputs())) { setReview(null); syncAdmission(); throw new ApiError('review_stale'); }
      syncAdmission();
      const started = generation.current;
      try {
        const [h, l, m, u] = await Promise.all([api.health(), api.listing(r.listingId), api.models(), api.units()]);
        if (!mounted.current || generation.current !== started) { fixtureAdmission.fail(r, null, 'review_interrupted'); return; }
        setUnits(u);
        if (!fixtureAdmission.coversLedger(u.ledger.map(e => e.jobId))) throw new ApiError('ledger_context_unavailable');
        const body = fixtureAdmission.startPost(r, { ...inputs(), health: h, listing: l, models: m.models, units: u });
        if (!body) throw new ApiError('review_stale');
        syncAdmission();
        // No retry path: the controller owns this UUID before the first asynchronous write.
        const result = await api.generate(r);
        const accepted = fixtureAdmission.found(r, result);
        if (!accepted) throw new ApiError('admission_identity_mismatch', true);
        if (mounted.current && generation.current === started) {
          setReview(null); setUnknown(false);
          await publishAcceptedJobs(r, accepted, started);
        }
      } catch (e) {
        fixtureAdmission.fail(r, e instanceof ApiError && !e.uncertain ? e.status : null, e instanceof ApiError ? e.code : 'admission_unknown');
        if (mounted.current) { setReview(null); if (fixtureAdmission.snapshot().phase === 'unknown') setUnknown(true); }
        throw e;
      } finally { syncAdmission(); }
    });
  }
  function reconcile() {
    const state = fixtureAdmission.snapshot(), r = state.review;
    if (!r || !['unknown', 'accepted'].includes(state.phase)) return;
    void action(async () => {
      const started = generation.current;
      try {
        const result = await api.lookup(r);
        const accepted = fixtureAdmission.found(r, result);
        if (!accepted) throw new ApiError('admission_identity_mismatch');
        if (mounted.current && generation.current === started) {
          if (state.phase === 'unknown') setUnknown(false);
          // Read-only resolution may outlive a selection; never replace another listing.
          await publishAcceptedJobs(r, accepted, started);
        }
      } catch (e) {
        fixtureAdmission.missing(r); // 404, malformed and unavailable reads all retain uncertainty.
        throw e;
      } finally { syncAdmission(); }
    }, true);
  }
  function lookupRequest() {
    // With no frozen context this is inspection only, never adoption or POST permission.
    if (!saved || admissionState.review || working.current) return;
    void action(async () => {
      // Full job envelopes are read via the bounded API; no new request identity is minted.
      const started = generation.current;
      const result = await api.inspectRequest(lookupId);
      if (mounted.current && generation.current === started) { setInspected(result.jobs); setError(null); }
    }, true);
  }
  const terminalProblem = jobs.some(job => ['failed', 'timed_out', 'uncertain', 'cancelled'].includes(job.attempts.at(-1)?.state ?? ''));
  const canGenerate = ledgerContextKnown && !disabled && !jobs.length && fixtureAdmission.canReview(inputs());
  async function readKnownJob(value: string) {
    if (!saved) return;
    await action(async () => {
      const next = await api.job(value);
      if (next.listingId !== saved.id || next.buyerSessionId !== null) throw new ApiError('job_listing_mismatch');
      publishJobs(await jobSnapshot([...new Set([...jobs.map(j => j.id), next.id])], saved.id));
    }, true);
  }
  async function cancelKnownJob(value: string) {
    if (disabled) return;
    await action(async () => {
      const prior = jobs.find(j => j.id === value);
      const started = generation.current;
      const next = await api.cancel(value);
      if (!mounted.current || generation.current !== started) return;
      if (!prior || !sameJobIdentity(prior, next)) throw new ApiError('job_identity_mismatch', true);
      // Retain the acknowledged cancel even if a subsequent read fails.
      setJobs(old => old.map(job => job.id === next.id ? next : job));
      publishJobs(await jobSnapshot(jobs.map(j => j.id), saved?.id ?? null));
    });
  }
  return <><div className={`mode-banner ${live ? 'live' : ''}`} role="status"><b>{live ? COPY.mode.live : 'DEMO'}</b><span>{live ? C.liveBanner : COPY.mode.fixture}</span></div>
    <header><a className="brand" href="#top" aria-label={C.brand}><span className="brand-mark">S</span>{C.brand}<small>{C.studio}</small></a><button disabled={busy} onClick={() => void action(async () => { const h = await api.health(); setHealth(h); await reads(); }, true)}>{C.refresh}</button></header>
    <main id="top"><section className="hero"><div><span className="eyebrow">{C.eyebrow}</span><h1>{C.heading}</h1><p>{live ? C.liveIntro : C.intro}</p></div><div className="hero-note"><span>01—03</span><p>{live ? C.liveNote : C.fixtureOnly}</p></div></section>
      {!health && <p className="notice">{busy ? C.connecting : C.disconnected}</p>}
      {(unknown || admissionState.phase === 'unknown' || admissionState.phase === 'posting') && <div role="alert" className="notice danger"><strong>{live ? C.liveUnknown : C.unknown}</strong>{admissionState.phase === 'unknown' && <p>{live ? C.liveUnknown : C.unknownAdmission}</p>}</div>}
      {error && <div role="alert" className="notice danger">{C.serverError} <code>{error}</code>{error === 'measurements_invalid' && <p>{C.invalidMeasurements}</p>}{error === 'review_stale' && <p>{C.stale}</p>}</div>}
      <div className="studio-layout"><aside><div className="section-label"><h2>{C.listings}</h2><button disabled={disabled} onClick={() => choose(null)}>＋ {C.add}</button></div>
        {!listings.length && <p>{COPY.listing.empty}</p>}
        <div className="listing-list">{listings.map(l => <button key={l.id} className={`listing-card ${saved?.id === l.id ? 'selected' : ''}`} disabled={disabled} onClick={() => choose(l)}>{l.garmentPhotoIds[0] && <img alt="" src={mediaUrl(l.garmentPhotoIds[0])} />}<span><strong>{l.title || C.add}</strong><small>{l.readiness.ready ? C.ready : `${C.missing}: ${l.readiness.missing.join(', ')}`}</small></span><span aria-hidden="true">↗</span></button>)}</div>
        {listings.length === 100 && <small>{C.more}</small>}
        <Panel title={C.units} className="units">{!live && <span className="pill">{C.simulated}</span>}{live && <><dl><dt>{C.preflight}</dt><dd>{!units?.preflight ? C.preflightNone : units.preflight.ok && units.preflight.featureCost.status === 'ok' && clock - Date.parse(units.preflight.at) >= 0 && clock - Date.parse(units.preflight.at) < 30 * 60000 ? C.preflightOk : C.preflightProblem}</dd><dt>{C.costPerTask}</dt><dd>{displayUnits(units?.preflight?.featureCost.costPerTaskCu)}</dd><dt>{C.preflightBalance}</dt><dd>{displayUnits(units?.preflight?.balanceCu)}</dd><dt>{C.checkedAt}</dt><dd>{units?.preflight?.at ?? '—'}</dd><dt>{C.preflightAge}</dt><dd>{units?.preflight ? Math.max(0, (clock - Date.parse(units.preflight.at)) / 60000).toFixed(1) : '—'}</dd></dl>{units?.preflight && <p>{units.preflight.featureCost.status} {units.preflight.problems.join(', ')}</p>}</>}<dl><dt>{live ? C.liveBudget : C.budget}</dt><dd>{units ? (units.remainingBudgetCu / 100).toFixed(2) : '—'}</dd><dt>{C.committed}</dt><dd>{units ? (units.committedCu / 100).toFixed(2) : '—'}</dd><dt>{live ? C.liveBalance : C.balance}</dt><dd>{units?.balanceEstimateCu === null || !units ? C.notAvailable : (units.balanceEstimateCu / 100).toFixed(2)}</dd></dl>{live ? <><p>{C.checkLiveNote}</p><button disabled={disabled} onClick={() => void action(async () => { setUnits(await api.preflight()); })}>{C.checkLive}</button></> : <><p>{COPY.units.check}</p><button disabled title={C.fixtureOnly}>{COPY.units.runCheck}</button></>}</Panel>
      </aside><div className="workspace">
        <Panel title={C.stepPhoto}><div className="photo-layout">{photoId ? <Image key={photoId} id={photoId} caption={COPY.listing.original} /> : <div className="photo-placeholder" aria-hidden="true"><span>＋</span></div>}
          <div><label className="upload-label">{C.upload}<input disabled={disabled} type="file" accept="image/jpeg,image/png" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || disabled) return; void action(async () => { const result = await api.photo(file); setPhotoId(result.photo.id); setPhotoDimensions({ width: result.photo.original.width, height: result.photo.original.height }); setQuality(null); invalidate(); }); }} /></label><p className="muted">{C.fileLimit} {C.photoReplace}</p>
          <fieldset disabled={disabled}><legend>{C.declaration}</legend><div className="field-pair"><label>{C.photoType}<select value={declaration.photoType} onChange={e => changeDeclaration({ ...declaration, photoType: e.target.value as GarmentDeclaration['photoType'] })}>{Object.entries(C.types).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>{C.category}<select value={declaration.category} onChange={e => { changeDeclaration({ ...declaration, category: e.target.value as GarmentDeclaration['category'] }); setMeasurementText({}); originalMeasurements.current = null; editedMeasurements.current.clear(); }}>{Object.entries(C.categories).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
          {(Object.keys(C.declarations) as (keyof typeof C.declarations)[]).map(key => <label className="check" key={key}><input type="checkbox" checked={declaration[key]} onChange={event => changeDeclaration({ ...declaration, [key]: event.target.checked })} />{C.declarations[key]}</label>)}</fieldset>
          <button disabled={disabled || !photoId} onClick={() => void action(async () => { if (photoId) setQuality(await api.evaluate(photoId, { ...declaration })); })}>{busy ? COPY.quality.checking : C.evaluate}</button><p className="muted">{C.clearQuality}</p></div></div>
          {quality ? <div className="quality"><h3>{C.quality} <span className={`pill ${quality.verdict}`}>{quality.verdict}</span></h3>{quality.capability?.status === 'unverified' && <p className="notice">{COPY.mode.unverified}</p>}<table><thead><tr><th>{C.quality}</th><th>{C.measured}</th><th>{C.threshold}</th><th>{C.evidence}</th></tr></thead><tbody>{quality.checks.map(check => <tr key={check.id} className={check.severity}><td><strong>{formatGuidance(check.messageKey, photoDimensions ?? {})}</strong><small>{check.severity}</small></td><td>{formatMeasured(check.measured)}</td><td>{check.threshold}</td><td>{check.source}</td></tr>)}</tbody></table>{quality.verdict === 'warn' && <p>{COPY.quality.warning}</p>}</div> : photoId && <p className="notice">{C.qualityUnknown}</p>}
        </Panel>
        <Panel title={C.stepDetails}><form onSubmit={event => void save(event)}><fieldset disabled={disabled}><div className="field-pair"><label>{C.title}<input required maxLength={80} value={draft.title} onChange={e => { setDraft(v => ({ ...v, title: e.target.value })); invalidate(); }} /></label><label>{C.price}<input maxLength={20} value={draft.priceText ?? ''} onChange={e => { setDraft(v => ({ ...v, priceText: e.target.value || null })); invalidate(); }} /></label></div><label>{C.notes}<textarea maxLength={500} rows={3} value={draft.conditionNotes} onChange={e => { setDraft(v => ({ ...v, conditionNotes: e.target.value })); invalidate(); }} /></label>
          <h3>{C.measurements}</h3><p>{C.measureHelp}</p><div className="field-pair"><label>{C.unit}<select value={unit} onChange={e => { setUnit(e.target.value as Unit); setMeasurementText({}); editedMeasurements.current = new Set(REQUIRED_FIELDS[declaration.category]); invalidate(); }}><option value="cm">{C.cm}</option><option value="in">{C.inch}</option></select></label><label>{C.tag}<input maxLength={24} value={tagSize} onChange={e => { setTagSize(e.target.value); invalidate(); }} /></label></div><small>{C.unitReset}</small>
          <div className="measure-grid">{REQUIRED_FIELDS[declaration.category].map(field => <label key={field}>{C.fields[field]}<input inputMode="decimal" maxLength={12} placeholder={field === 'sleeve' ? C.na : unit} value={measurementText[field] ?? ''} onChange={e => { editedMeasurements.current.add(field); setMeasurementText(v => ({ ...v, [field]: e.target.value === C.na ? 'na' : e.target.value })); invalidate(); }} /></label>)}</div></fieldset>
          <div className="actions"><button className="primary" disabled={disabled} type="submit">{busy ? C.busy : C.save}</button>{dirty && <span>{C.dirty}</span>}</div>
        </form>{saved && <p className="muted">{C.readiness}: {saved.readiness.ready ? C.ready : saved.readiness.missing.join(', ')} · {C.timestamp}: <time>{saved.updatedAt}</time></p>}</Panel>
        <Panel title={live ? C.liveStep : C.stepPreview}><h3>{live ? C.liveModels : C.selectModels}</h3><div className="model-grid">{models.map(model => <label className={`model ${selectedModels.includes(model.photoId) ? 'selected' : ''}`} key={model.photoId}><input type="checkbox" disabled={disabled || Boolean(review) || !selectedModels.includes(model.photoId) && selectedModels.length === 2} checked={selectedModels.includes(model.photoId)} onChange={e => { setSelectedModels(values => e.target.checked ? [...values, model.photoId] : values.filter(value => value !== model.photoId)); closeReview(); }} /><img src={mediaUrl(model.photoId)} alt={model.label} /><strong>{model.label}</strong><small>{live ? C.consented : C.synthetic}</small></label>)}</div><p id="admission-unavailable" className="notice">{live ? C.liveAdmission : C.fixtureAdmission}</p><button className="primary" disabled={!canGenerate} aria-describedby="admission-unavailable" onClick={() => void openCostReview()}>{live ? C.liveGenerate : C.generate}</button>
          <p className="muted">{C.sessionAdmission}</p>{units && !ledgerContextKnown && <p className="notice">{C.ledgerContext}</p>}
          {admissionState.review ? <div className="notice"><label>{C.request}<input readOnly className="mono" value={admissionState.review.requestId} onFocus={e => e.target.select()} /></label><p>{C.state}: {admissionState.phase}</p><p>{C.title}: {admissionState.review.title} · {C.original}: {admissionState.review.photoId}</p>{['unknown', 'accepted'].includes(admissionState.phase) && <button disabled={busy} onClick={reconcile}>{C.reconcile}</button>}</div> : <div><label>{C.lookupRequest}<input className="mono" value={lookupId} maxLength={36} onChange={e => { setLookupId(e.target.value); setInspected([]); }} /></label><button disabled={busy || !saved || !lookupId} onClick={lookupRequest}>{C.inspectRequest}</button>{!!inspected.length && <div><p>{C.lookupContext}</p>{inspected.map(j => <p key={j.id}><code>{j.id}</code> · {C.title}: <code>{j.listingId}</code> · {C.original}: <code>{j.garmentPhotoId}</code> · {C.modelCount}: <code>{j.modelPhotoId}</code> · {j.attempts.at(-1)?.state}</p>)}</div>}</div>}
          {!!jobs.length && <div className="jobs"><h3>{C.progress}</h3>{jobs.map(job => { const a = job.attempts.at(-1); return <article key={job.id}><div className="section-label"><strong>{C.job} <code>{job.id}</code></strong><span className={`pill ${a?.state}`}>{a?.state ?? '—'}</span></div><ol className="steps">{(live ? C.liveSteps : C.fixtureSteps).map(s => <li key={s}>{s}</li>)}</ol>{a?.error && <p role="status">{live ? C.liveError : C.fixtureError} {COPY.errors[a.error.messageKey]} <code>{a.error.code}</code></p>}{a?.state === 'uncertain' && <p>{live ? C.liveUnknown : C.fixtureJobUnknown}</p>}{a && ACTIVE.has(a.state) && <button disabled={disabled} onClick={() => void cancelKnownJob(job.id)}>{COPY.job.cancel}</button>}</article>; })}{terminalProblem && <p className="notice">{C.retryDisabled}</p>}<button disabled={busy} onClick={() => void action(async () => { publishJobs(await jobSnapshot(jobs.map(j => j.id), saved?.id ?? null)); }, true)}>{C.refreshJobs}</button></div>}
        </Panel>
        {saved && <><Panel title={C.gallery}><p>{live ? C.liveOriginalFirst : C.originalFirst}</p><div className="gallery">{saved.garmentPhotoIds.map(id => <Image key={id} id={id} caption={COPY.listing.original} />)}{saved.tryOnResultIds.map(id => <Image key={id} id={id} caption={live ? C.livePreview : `${C.fixturePreview} · ${COPY.mode.fixtureImage}`} />)}</div><p className="muted">{C.recoveryDisabled}</p><h3>{C.listingText}</h3><textarea readOnly rows={8} value={fixtureListingText(saved)} aria-label={C.listingText} /><button onClick={() => { void navigator.clipboard.writeText(fixtureListingText(saved)).then(() => setCopyStatus(C.copied), () => setCopyStatus(C.copyFailed)); }}>{C.copy}</button><span role="status"> {copyStatus}</span><p className="muted">{live ? C.liveCopyData : C.copyData}</p></Panel>{saved.measurements && <Compare key={`${saved.id}:${saved.measurements.category}:${saved.measurements.enteredUnit}`} item={saved.measurements} />}</>}
      </div></div>
      <Panel title={C.units}><div className="table-scroll"><table><thead><tr><th>{C.job}</th><th>{C.attempt}</th><th>{C.state}</th><th>{C.cu}</th><th>{C.reason}</th></tr></thead><tbody>{units?.ledger.map(entry => <tr key={entry.id}><td><button disabled={busy || !saved} title={C.readKnownJob} onClick={() => void readKnownJob(entry.jobId)}><code>{entry.jobId}</code></button></td><td>{entry.attempt}</td><td>{entry.state}</td><td>{(entry.cu / 100).toFixed(2)}</td><td>{entry.reason}</td></tr>)}</tbody></table></div>{units && !units.ledger.length && <p>{C.ledgerEmpty}</p>}</Panel>
      <Panel title={C.buyer} className="buyer"><span className="pill">{C.disabled}</span><p>{COPY.buyer.disabled}</p><blockquote>{COPY.retention.vendor}</blockquote><details><summary>{C.pc1}</summary><p>{C.localNotEnabled}</p><p>{live ? C.liveNote : C.fixtureOnly}</p></details></Panel>
    </main><footer>{C.brand} · {live ? C.liveNote : C.fixtureOnly}</footer>{review && saved && <ReviewDialog review={review} title={review.title} onConfirm={confirm} onClose={closeReview} busy={busy} />}</>;
}
