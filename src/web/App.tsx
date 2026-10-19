import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { COPY, UI_COPY as C } from '../shared/copy.js';
import { compareMeasurements, formatMeasurement, measurementProblems, parseMeasurement, REQUIRED_FIELDS } from '../shared/measurements.js';
import { listingText } from '../domain/listing.js';
import type { GarmentDeclaration, HealthResponse, ListingResponse, ListingWriteRequest, MeasurementField, Measurements, ModelOption, QualityReport, TryOnJob, TryOnRequest, Unit, UnitsResponse } from '../shared/types.js';
import { ApiError, mediaUrl, SellerApi } from './api.js';

const DEFAULT_DECLARATION: GarmentDeclaration = { photoType: 'hanger', category: 'upper_body', singleGarment: false, frontFacing: false, notComposite: false, fullyVisible: false, noPeopleInPhoto: false };
const EMPTY: ListingWriteRequest = { title: '', conditionNotes: '', priceText: null, garmentPhotoIds: [], declaration: null, measurements: null };
const ACTIVE = new Set(['queued', 'uploading', 'submitting', 'polling', 'downloading']);
function fixtureListingText(listing: ListingResponse): string {
  return [listingText({ ...listing, tryOnResultIds: [] }), listing.tryOnResultIds.length ? COPY.mode.fixtureImage : '', C.copyData].filter(Boolean).join('\n\n');
}
type CostReview = Readonly<{ listingId: string; savedAt: string; photoId: string; modelIds: readonly string[]; declarationKey: string; requestId: string }>;
function valuesFor(m: Measurements | null): Partial<Record<MeasurementField, string>> {
  return Object.fromEntries(Object.entries(m?.valuesMm ?? {}).map(([key, value]) => [key, value === 'na' ? 'na' : String(m?.enteredUnit === 'in' ? Math.round(value / 25.4 * 4) / 4 : value / 10)]));
}
function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><h2>{title}</h2>{children}</section>; }
function Image({ id, caption }: { id: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  return <figure>{failed ? <div className="image-missing">{C.missingImage}</div> : <img src={mediaUrl(id)} alt={caption} loading="lazy" onError={() => setFailed(true)} />}<figcaption>{caption}</figcaption></figure>;
}
function ReviewDialog({ review, title, onConfirm, onClose, busy }: { review: CostReview; title: string; onConfirm: () => void; onClose: () => void; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null); const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); cancel.current?.focus(); return () => { dialog.current?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return <dialog ref={dialog} aria-labelledby="cost-heading" aria-describedby="cost-detail" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <span className="eyebrow">{C.simulated}</span><h2 id="cost-heading">{C.costTitle}</h2><p id="cost-detail">{C.costBody}</p><p>{C.modalContext}</p>
    <dl><dt>{C.title}</dt><dd>{title}</dd><dt>{C.original}</dt><dd className="mono">{review.photoId}</dd><dt>{C.modelCount}</dt><dd>{review.modelIds.length}</dd><dt>{C.request}</dt><dd className="mono">{review.requestId}</dd></dl>
    <div className="actions"><button ref={cancel} disabled={busy} onClick={onClose}>{C.cancel}</button><button className="primary" disabled={busy} onClick={onConfirm}>{busy ? C.busy : C.confirm}</button></div>
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
  const [health, setHealth] = useState<HealthResponse | null>(null), [units, setUnits] = useState<UnitsResponse | null>(null);
  const [listings, setListings] = useState<ListingResponse[]>([]), [models, setModels] = useState<ModelOption[]>([]);
  const [saved, setSaved] = useState<ListingResponse | null>(null), [draft, setDraft] = useState<ListingWriteRequest>(EMPTY);
  const [declaration, setDeclaration] = useState<GarmentDeclaration>(DEFAULT_DECLARATION), [photoId, setPhotoId] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null), [unit, setUnit] = useState<Unit>('cm');
  const [measurementText, setMeasurementText] = useState<Partial<Record<MeasurementField, string>>>({}), [tagSize, setTagSize] = useState('');
  const originalMeasurements = useRef<Measurements | null>(null), editedMeasurements = useRef(new Set<MeasurementField>());
  const [selectedModels, setSelectedModels] = useState<string[]>([]), [review, setReview] = useState<CostReview | null>(null);
  const [jobs, setJobs] = useState<TryOnJob[]>([]), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null), [unknown, setUnknown] = useState(false), [copyStatus, setCopyStatus] = useState('');
  const disabled = busy || unknown || health?.mode !== 'fixture';
  async function reads() {
    const [l, u, m] = await Promise.all([api.listings(), api.units(), api.models()]);
    if (mounted.current) { setListings(l.listings.slice(0, 100)); setUnits(u); setModels(m.models.filter(x => x.synthetic).slice(0, 16)); }
  }
  async function action(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null);
    try { await work(); } catch (e) {
      if (mounted.current) { setError(e instanceof ApiError ? e.code : 'request_or_state_invalid'); if (e instanceof ApiError && e.uncertain) setUnknown(true); }
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true;
    void action(async () => { const h = await api.health(); if (mounted.current) setHealth(h); await reads(); });
    return () => { mounted.current = false; api.dispose(); };
  }, []);
  // Poll known jobs only, one request per ID per second; no POST retries or guessed IDs.
  useEffect(() => {
    if (!jobs.some(job => ACTIVE.has(job.attempts.at(-1)?.state ?? ''))) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (working.current) { timer = setTimeout(tick, 1000); return; }
      try {
        const next: TryOnJob[] = []; for (const job of jobs) next.push(await api.job(job.id));
        if (!cancelled && mounted.current) { setJobs(next); const u = await api.units(); if (!cancelled) setUnits(u); if (saved) { const l = await api.listing(saved.id); if (!cancelled) setSaved(l); } }
      } catch (e) { if (!cancelled) setError(e instanceof ApiError ? e.code : 'job_read_failed'); }
      if (!cancelled) timer = setTimeout(tick, 1000);
    };
    timer = setTimeout(tick, 1000); return () => { cancelled = true; clearTimeout(timer); };
  }, [jobs, saved?.id]);
  function invalidate() { setDirty(true); setReview(null); }
  function changeDeclaration(next: GarmentDeclaration) { setDeclaration(next); setQuality(null); invalidate(); }
  function choose(listing: ListingResponse | null) {
    if (busy) return;
    setSaved(listing); setDraft(listing ? { title: listing.title, conditionNotes: listing.conditionNotes, priceText: listing.priceText, garmentPhotoIds: [...listing.garmentPhotoIds], declaration: listing.declaration, measurements: listing.measurements } : { ...EMPTY, garmentPhotoIds: [] });
    setDeclaration(listing?.declaration ?? { ...DEFAULT_DECLARATION }); setPhotoId(listing?.garmentPhotoIds[0] ?? null); setQuality(null);
    setUnit(listing?.measurements?.enteredUnit ?? 'cm'); setMeasurementText(valuesFor(listing?.measurements ?? null)); setTagSize(listing?.measurements?.tagSize ?? '');
    originalMeasurements.current = listing?.measurements ?? null; editedMeasurements.current.clear();
    setSelectedModels([]); setJobs([]); setReview(null); setDirty(false); setCopyStatus(''); setError(null);
  }
  function measurements(): Measurements {
    const valuesMm: Measurements['valuesMm'] = {};
    for (const field of REQUIRED_FIELDS[declaration.category]) {
      const original = originalMeasurements.current;
      if (!editedMeasurements.current.has(field) && original?.category === declaration.category && original.enteredUnit === unit && original.valuesMm[field] !== undefined) { valuesMm[field] = original.valuesMm[field]; continue; }
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
      const next = await api.save(saved?.id ?? null, { ...draft, garmentPhotoIds: photoId ? [photoId] : [], declaration: { ...declaration }, measurements: measurements() });
      setSaved(next); setDraft(next); setDirty(false); await reads();
    });
  }
  async function openCostReview() {
    if (disabled || dirty || !saved?.readiness.ready || !photoId || !quality?.spendAllowed || quality.photoId !== photoId || !selectedModels.length) return;
    const frozen: CostReview = Object.freeze({ listingId: saved.id, savedAt: saved.updatedAt, photoId, modelIds: Object.freeze([...selectedModels]), declarationKey: JSON.stringify(declaration), requestId: crypto.randomUUID() });
    setReview(frozen);
  }
  async function confirm() {
    if (disabled || !review || !saved) return;
    const frozen = review;
    if (dirty || saved.id !== frozen.listingId || saved.updatedAt !== frozen.savedAt || photoId !== frozen.photoId || JSON.stringify(declaration) !== frozen.declarationKey || JSON.stringify(selectedModels) !== JSON.stringify(frozen.modelIds) || !quality?.spendAllowed) { setReview(null); setError('review_stale'); return; }
    await action(async () => {
      const body: TryOnRequest = { requestId: frozen.requestId, garmentPhotoId: frozen.photoId, modelPhotoIds: [...frozen.modelIds], confirmCostCu: 0 };
      const result = await api.generate(frozen.listingId, body); setJobs(result.jobs); setReview(null); setSaved(await api.listing(frozen.listingId)); await reads();
    });
  }
  const terminalProblem = jobs.some(job => ['failed', 'timed_out', 'uncertain', 'cancelled'].includes(job.attempts.at(-1)?.state ?? ''));
  const canGenerate = !disabled && !dirty && saved?.readiness.ready && quality?.spendAllowed && photoId === quality.photoId && selectedModels.length > 0 && !jobs.some(job => ACTIVE.has(job.attempts.at(-1)?.state ?? '')) && !terminalProblem;
  return <><div className="mode-banner" role="status"><b>DEMO</b><span>{COPY.mode.fixture}</span></div>
    <header><a className="brand" href="#top" aria-label={C.brand}><span className="brand-mark">S</span>{C.brand}<small>{C.studio}</small></a><button disabled={busy} onClick={() => void action(async () => { const h = await api.health(); setHealth(h); await reads(); })}>{C.refresh}</button></header>
    <main id="top"><section className="hero"><div><span className="eyebrow">{C.eyebrow}</span><h1>{C.heading}</h1><p>{C.intro}</p></div><div className="hero-note"><span>01—03</span><p>{C.fixtureOnly}</p></div></section>
      {!health && <p className="notice">{busy ? C.connecting : C.disconnected}</p>}
      {unknown && <div role="alert" className="notice danger"><strong>{C.unknown}</strong><p>{C.unknownAdmission}</p></div>}
      {error && <div role="alert" className="notice danger">{C.serverError} <code>{error}</code>{error === 'measurements_invalid' && <p>{C.invalidMeasurements}</p>}{error === 'review_stale' && <p>{C.stale}</p>}</div>}
      <div className="studio-layout"><aside><div className="section-label"><h2>{C.listings}</h2><button disabled={busy} onClick={() => choose(null)}>＋ {C.add}</button></div>
        {!listings.length && <p>{COPY.listing.empty}</p>}
        <div className="listing-list">{listings.map(l => <button key={l.id} className={`listing-card ${saved?.id === l.id ? 'selected' : ''}`} disabled={busy} onClick={() => choose(l)}>{l.garmentPhotoIds[0] && <img alt="" src={mediaUrl(l.garmentPhotoIds[0])} />}<span><strong>{l.title || C.add}</strong><small>{l.readiness.ready ? C.ready : `${C.missing}: ${l.readiness.missing.join(', ')}`}</small></span><span aria-hidden="true">↗</span></button>)}</div>
        {listings.length === 100 && <small>{C.more}</small>}
        <Panel title={C.units} className="units"><span className="pill">{C.simulated}</span><dl><dt>{C.budget}</dt><dd>{units ? (units.remainingBudgetCu / 100).toFixed(2) : '—'}</dd><dt>{C.committed}</dt><dd>{units ? (units.committedCu / 100).toFixed(2) : '—'}</dd><dt>{C.balance}</dt><dd>{units?.balanceEstimateCu === null || !units ? C.notAvailable : (units.balanceEstimateCu / 100).toFixed(2)}</dd></dl><p>{COPY.units.check}</p><button disabled title={C.fixtureOnly}>{COPY.units.runCheck}</button></Panel>
      </aside><div className="workspace">
        <Panel title={C.stepPhoto}><div className="photo-layout">{photoId ? <Image key={photoId} id={photoId} caption={COPY.listing.original} /> : <div className="photo-placeholder" aria-hidden="true"><span>＋</span></div>}
          <div><label className="upload-label">{C.upload}<input disabled={disabled} type="file" accept="image/jpeg,image/png" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || disabled) return; void action(async () => { const result = await api.photo(file); setPhotoId(result.photo.id); setQuality(null); invalidate(); }); }} /></label><p className="muted">{C.fileLimit}</p>
          <fieldset disabled={disabled}><legend>{C.declaration}</legend><div className="field-pair"><label>{C.photoType}<select value={declaration.photoType} onChange={e => changeDeclaration({ ...declaration, photoType: e.target.value as GarmentDeclaration['photoType'] })}>{Object.entries(C.types).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>{C.category}<select value={declaration.category} onChange={e => { changeDeclaration({ ...declaration, category: e.target.value as GarmentDeclaration['category'] }); setMeasurementText({}); originalMeasurements.current = null; editedMeasurements.current.clear(); }}>{Object.entries(C.categories).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
          {(Object.keys(C.declarations) as (keyof typeof C.declarations)[]).map(key => <label className="check" key={key}><input type="checkbox" checked={declaration[key]} onChange={event => changeDeclaration({ ...declaration, [key]: event.target.checked })} />{C.declarations[key]}</label>)}</fieldset>
          <button disabled={disabled || !photoId} onClick={() => void action(async () => { if (photoId) setQuality(await api.evaluate(photoId, { ...declaration })); })}>{busy ? COPY.quality.checking : C.evaluate}</button><p className="muted">{C.clearQuality}</p></div></div>
          {quality ? <div className="quality"><h3>{C.quality} <span className={`pill ${quality.verdict}`}>{quality.verdict}</span></h3>{quality.capability?.status === 'unverified' && <p className="notice">{COPY.mode.unverified}</p>}<table><thead><tr><th>{C.quality}</th><th>{C.measured}</th><th>{C.threshold}</th><th>{C.evidence}</th></tr></thead><tbody>{quality.checks.map(check => <tr key={check.id} className={check.severity}><td><strong>{COPY.quality[check.messageKey]}</strong><small>{check.severity}</small></td><td>{check.measured ?? '—'}</td><td>{check.threshold}</td><td>{check.source}</td></tr>)}</tbody></table>{quality.verdict === 'warn' && <p>{COPY.quality.warning}</p>}</div> : photoId && <p className="notice">{C.qualityUnknown}</p>}
        </Panel>
        <Panel title={C.stepDetails}><form onSubmit={event => void save(event)}><fieldset disabled={disabled}><div className="field-pair"><label>{C.title}<input required maxLength={80} value={draft.title} onChange={e => { setDraft(v => ({ ...v, title: e.target.value })); invalidate(); }} /></label><label>{C.price}<input maxLength={20} value={draft.priceText ?? ''} onChange={e => { setDraft(v => ({ ...v, priceText: e.target.value || null })); invalidate(); }} /></label></div><label>{C.notes}<textarea maxLength={500} rows={3} value={draft.conditionNotes} onChange={e => { setDraft(v => ({ ...v, conditionNotes: e.target.value })); invalidate(); }} /></label>
          <h3>{C.measurements}</h3><p>{C.measureHelp}</p><div className="field-pair"><label>{C.unit}<select value={unit} onChange={e => { setUnit(e.target.value as Unit); setMeasurementText({}); originalMeasurements.current = null; editedMeasurements.current.clear(); invalidate(); }}><option value="cm">{C.cm}</option><option value="in">{C.inch}</option></select></label><label>{C.tag}<input maxLength={24} value={tagSize} onChange={e => { setTagSize(e.target.value); invalidate(); }} /></label></div><small>{C.unitReset}</small>
          <div className="measure-grid">{REQUIRED_FIELDS[declaration.category].map(field => <label key={field}>{C.fields[field]}<input inputMode="decimal" maxLength={12} placeholder={field === 'sleeve' ? C.na : unit} value={measurementText[field] ?? ''} onChange={e => { editedMeasurements.current.add(field); setMeasurementText(v => ({ ...v, [field]: e.target.value === C.na ? 'na' : e.target.value })); invalidate(); }} /></label>)}</div></fieldset>
          <div className="actions"><button className="primary" disabled={disabled} type="submit">{busy ? C.busy : C.save}</button>{dirty && <span>{C.dirty}</span>}</div>
        </form>{saved && <p className="muted">{C.readiness}: {saved.readiness.ready ? C.ready : saved.readiness.missing.join(', ')} · {C.timestamp}: <time>{saved.updatedAt}</time></p>}</Panel>
        <Panel title={C.stepPreview}><h3>{C.selectModels}</h3><div className="model-grid">{models.map(model => <label className={`model ${selectedModels.includes(model.photoId) ? 'selected' : ''}`} key={model.photoId}><input type="checkbox" disabled={disabled || Boolean(review) || !selectedModels.includes(model.photoId) && selectedModels.length === 2} checked={selectedModels.includes(model.photoId)} onChange={e => { setSelectedModels(values => e.target.checked ? [...values, model.photoId] : values.filter(value => value !== model.photoId)); setReview(null); }} /><img src={mediaUrl(model.photoId)} alt={model.label} /><strong>{model.label}</strong><small>{C.synthetic}</small></label>)}</div><button className="primary" disabled={!canGenerate} onClick={() => void openCostReview()}>{C.generate}</button>
          {!!jobs.length && <div className="jobs"><h3>{C.progress}</h3>{jobs.map(job => { const a = job.attempts.at(-1); return <article key={job.id}><div className="section-label"><strong>{C.job} <code>{job.id}</code></strong><span className={`pill ${a?.state}`}>{a?.state ?? '—'}</span></div><ol className="steps">{C.fixtureSteps.map(s => <li key={s}>{s}</li>)}</ol>{a?.error && <p role="status">{C.fixtureError} {COPY.errors[a.error.messageKey]} <code>{a.error.code}</code></p>}{a?.state === 'uncertain' && <p>{COPY.job.uncertain}</p>}{a && ACTIVE.has(a.state) && <button disabled={disabled} onClick={() => void action(async () => { const next = await api.cancel(job.id); setJobs(v => v.map(old => old.id === next.id ? next : old)); setUnits(await api.units()); })}>{COPY.job.cancel}</button>}</article>; })}{terminalProblem && <p className="notice">{C.retryDisabled}</p>}<button disabled={busy} onClick={() => void action(async () => { const next: TryOnJob[] = []; for (const j of jobs) next.push(await api.job(j.id)); setJobs(next); await reads(); if (saved) setSaved(await api.listing(saved.id)); })}>{C.refreshJobs}</button></div>}
        </Panel>
        {saved && <><Panel title={C.gallery}><p>{C.originalFirst}</p><div className="gallery">{saved.garmentPhotoIds.map(id => <Image key={id} id={id} caption={COPY.listing.original} />)}{saved.tryOnResultIds.map(id => <Image key={id} id={id} caption={`${C.fixturePreview} · ${COPY.mode.fixtureImage}`} />)}</div><p className="muted">{C.recoveryDisabled}</p><h3>{C.listingText}</h3><textarea readOnly rows={8} value={fixtureListingText(saved)} aria-label={C.listingText} /><button onClick={() => { void navigator.clipboard.writeText(fixtureListingText(saved)).then(() => setCopyStatus(C.copied), () => setCopyStatus(C.copyFailed)); }}>{C.copy}</button><span role="status"> {copyStatus}</span><p className="muted">{C.copyData}</p></Panel>{saved.measurements && <Compare key={saved.id} item={saved.measurements} />}</>}
      </div></div>
      <Panel title={C.units}><div className="table-scroll"><table><thead><tr><th>{C.job}</th><th>{C.attempt}</th><th>{C.state}</th><th>{C.cu}</th><th>{C.reason}</th></tr></thead><tbody>{units?.ledger.map(entry => <tr key={entry.id}><td><code>{entry.jobId}</code></td><td>{entry.attempt}</td><td>{entry.state}</td><td>{(entry.cu / 100).toFixed(2)}</td><td>{entry.reason}</td></tr>)}</tbody></table></div>{units && !units.ledger.length && <p>{C.ledgerEmpty}</p>}</Panel>
      <Panel title={C.buyer} className="buyer"><span className="pill">{C.disabled}</span><p>{COPY.buyer.disabled}</p><blockquote>{COPY.retention.vendor}</blockquote><details><summary>{C.pc1}</summary><p>{C.localNotEnabled}</p><p>{C.fixtureOnly}</p></details></Panel>
    </main><footer>{C.brand} · {C.fixtureOnly}</footer>{review && saved && <ReviewDialog review={review} title={saved.title} onConfirm={() => void confirm()} onClose={() => setReview(null)} busy={busy} />}</>;
}
