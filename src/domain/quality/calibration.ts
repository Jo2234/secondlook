import type { PixelMetrics } from './metrics.js';
import { THRESHOLDS as T, THRESHOLDS_VERSION } from './thresholds.js';

// Pre-registered §5.2. No fixture or threshold fitting in response to results.
export const CALIBRATION_BLURS = [0, 1, 2, 4, 8] as const;
export const CALIBRATION_EXPOSURES = [0.2, 0.5, 1, 1.5, 3] as const;
export interface CalibrationObservation { family: 'blur' | 'exposure'; value: number; metrics: PixelMetrics }
export function calibrationFailures(observations: readonly CalibrationObservation[]): string[] {
  const failures: string[] = [];
  for (const [family, values] of [['blur', CALIBRATION_BLURS], ['exposure', CALIBRATION_EXPOSURES]] as const) for (const value of values) {
    const matches = observations.filter(o => o.family === family && o.value === value);
    const name = `${family}-${value}`;
    if (matches.length !== 1) { failures.push(`${name}: expected one observation`); continue; }
    const m = matches[0]!.metrics;
    if (![m.sharpness, m.mean, m.clipping, m.backgroundBusy].every(Number.isFinite) || m.sharpness < 0 || m.mean < 0 || m.mean > 255 || m.clipping < 0 || m.clipping > 1 || m.backgroundBusy < 0 || m.backgroundBusy > 1) { failures.push(`${name}: invalid metrics`); continue; }
    if (family === 'blur') {
      if ((value === 0 || value === 1) && m.sharpness < T.sharpnessWarn) failures.push(`${name}: expected sharpness pass`);
      if ((value === 4 || value === 8) && m.sharpness >= T.sharpnessFail) failures.push(`${name}: expected sharpness fail`);
    } else {
      const exposureFails = m.mean < T.meanFailLow || m.mean > T.meanFailHigh || m.clipping > T.clippingFail;
      if ((value === 0.2 || value === 3) && !exposureFails) failures.push(`${name}: expected exposure fail`);
      if (value === 1 && (exposureFails || m.mean < T.meanWarnLow || m.mean > T.meanWarnHigh || m.clipping > T.clippingWarn)) failures.push(`${name}: expected exposure pass`);
    }
  }
  for (const o of observations) {
    if (!(o.family === 'blur' ? CALIBRATION_BLURS : CALIBRATION_EXPOSURES).some(v => v === o.value)) failures.push(`${o.family}-${o.value}: unregistered observation`);
  }
  return failures;
}
export const CALIBRATION_THRESHOLDS_VERSION = THRESHOLDS_VERSION;
