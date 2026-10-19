import type { CapabilityRow, CheckResult, GarmentDeclaration, Id, Mode, PhotoRole, QualityReport, Severity } from '../../shared/types.js';
import { capability, capabilityAllows, garmentRightsAllow } from '../capabilities.js';
import { NORMALIZED_MAX_BYTES, ORIGINAL_MAX_BYTES } from '../../youcam/limits.js';
import { THRESHOLDS as T, THRESHOLDS_VERSION } from './thresholds.js';
export interface GivenMetrics {
  format: string; originalBytes: number; normalizedBytes: number; width: number; height: number;
  originalWidth: number; originalHeight: number; sharpness: number; mean: number; clipping: number; backgroundBusy: number;
}
const rank: Record<Severity, number> = { pass: 0, warn: 1, fail: 2 };
function report(photoId: Id, role: PhotoRole, checks: CheckResult[], row: CapabilityRow | null, permits: boolean): QualityReport {
  const verdict = checks.reduce<Severity>((worst, check) => rank[check.severity] > rank[worst] ? check.severity : worst, 'pass');
  return { photoId, role, verdict, checks, thresholdsVersion: THRESHOLDS_VERSION, capability: row, spendAllowed: verdict !== 'fail' && permits };
}
function pixels(m: GivenMetrics, garment: boolean): CheckResult[] {
  const checks: CheckResult[] = [];
  function add(id: CheckResult['id'], severity: Severity, measured: CheckResult['measured'], threshold: string, source: CheckResult['source'] = 'pixel'): void {
    checks.push({ id, severity, measured, threshold, messageKey: id, source });
  }
  const long = Math.max(m.width, m.height), short = Math.min(m.width, m.height);
  const dimensionsValid = [m.width, m.height].every(v => Number.isSafeInteger(v) && v > 0);
  add('format', ['jpeg', 'png'].includes(m.format) ? 'pass' : 'fail', m.format, 'JPEG or PNG', 'doc_spec');
  add('file_size', Number.isSafeInteger(m.originalBytes) && m.originalBytes > 0 && m.originalBytes <= ORIGINAL_MAX_BYTES && Number.isSafeInteger(m.normalizedBytes) && m.normalizedBytes > 0 && m.normalizedBytes < NORMALIZED_MAX_BYTES ? 'pass' : 'fail', m.normalizedBytes, 'original ≤ 25 MB; normalized < 10,000,000 B', 'doc_spec');
  add('min_dimensions', dimensionsValid && long >= T.minLong && short >= T.minShort ? 'pass' : 'fail', `${m.width}×${m.height}`, 'long ≥ 512 and short ≥ 384', 'doc_spec');
  add('recommended_dimensions', long >= T.recommendedLong && short >= T.recommendedShort ? 'pass' : 'warn', `${m.width}×${m.height}`, 'long ≥ 1024 and short ≥ 768', 'doc_spec');
  add('max_dimensions_normalized', dimensionsValid && long <= T.maxNormalizedSide ? 'pass' : 'fail', `${m.originalWidth}×${m.originalHeight} → ${m.width}×${m.height}`, 'normalized side ≤ 4096', 'doc_spec');
  add('aspect_ratio', long / short > T.aspectWarn ? 'warn' : 'pass', long / short, 'ratio ≤ 3');
  add('sharpness', !Number.isFinite(m.sharpness) || m.sharpness < T.sharpnessFail ? 'fail' : m.sharpness < T.sharpnessWarn ? 'warn' : 'pass', m.sharpness, '≥ 100 pass; ≥ 40 warn');
  add('exposure_mean', !Number.isFinite(m.mean) || m.mean < T.meanFailLow || m.mean > T.meanFailHigh ? 'fail' : m.mean < T.meanWarnLow || m.mean > T.meanWarnHigh ? 'warn' : 'pass', m.mean, '40–235 allowed; 70–210 pass');
  add('exposure_clipping', !Number.isFinite(m.clipping) || m.clipping < 0 || m.clipping > T.clippingFail ? 'fail' : m.clipping > T.clippingWarn ? 'warn' : 'pass', m.clipping, '≤ 0.10 pass; ≤ 0.25 warn');
  if (garment) add('background_busy', !Number.isFinite(m.backgroundBusy) || m.backgroundBusy > T.backgroundWarn ? 'warn' : 'pass', m.backgroundBusy, 'outer-border Sobel fraction ≤ 0.12');
  return checks;
}
export function evaluateGarmentPhoto(input: { photoId: Id; mode: Mode; metrics: GivenMetrics; declaration: GarmentDeclaration; manifestConsent: boolean; overrides?: readonly CapabilityRow[] }): QualityReport {
  const d = input.declaration, checks = pixels(input.metrics, true), row = capability(d.photoType, d.category, input.overrides);
  for (const [id, valid] of [ ['decl_single_garment', d.singleGarment], ['decl_front_facing', d.frontFacing], ['decl_not_composite', d.notComposite], ['decl_fully_visible', d.fullyVisible], ['decl_no_people', d.noPeopleInPhoto || d.photoType === 'worn'] ] as const) {
    checks.push({ id, severity: valid ? 'pass' : 'fail', measured: valid ? 'yes' : 'no', threshold: 'required', messageKey: id, source: 'declaration' });
  }
  const allows = capabilityAllows(row, input.mode) && garmentRightsAllow(d.photoType, input.mode, input.manifestConsent);
  checks.push({ id: 'capability', severity: !allows ? 'fail' : row.status === 'unverified' ? 'warn' : 'pass', measured: row.status, threshold: 'supported input and person rights', messageKey: !allows ? 'capability' : row.status === 'unverified' ? 'unverified' : 'capability', source: 'capability' });
  return report(input.photoId, 'garment', checks, row, allows);
}
export function evaluateModelPhoto(input: { photoId: Id; role: 'model' | 'buyer'; mode: Mode; metrics: GivenMetrics; singlePerson: boolean; occupies80Percent: boolean; standingFrontFacing: boolean; faceAndShouldersVisible: boolean; manifestConsent: boolean; synthetic: boolean }): QualityReport {
  const checks = pixels(input.metrics, false);
  for (const [id, valid] of [ ['model_decl_single_person', input.singlePerson && input.occupies80Percent], ['model_decl_pose', input.standingFrontFacing && input.faceAndShouldersVisible], ['model_rights', input.mode === 'live' ? input.manifestConsent : input.synthetic || input.manifestConsent] ] as const) checks.push({ id, severity: valid ? 'pass' : 'fail', measured: valid ? 'yes' : 'no', threshold: 'required', messageKey: id, source: 'declaration' });
  return report(input.photoId, input.role, checks, null, true);
}
