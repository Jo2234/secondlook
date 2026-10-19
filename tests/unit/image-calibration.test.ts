import { expect, test } from 'vitest';
import { CALIBRATION_BLURS, CALIBRATION_EXPOSURES, CALIBRATION_THRESHOLDS_VERSION, calibrationFailures, type CalibrationObservation } from '../../src/domain/quality/calibration.js';

// Test contract only: these invented numeric observations are NOT measured calibration results.
const observations = (): CalibrationObservation[] => [
  ...CALIBRATION_BLURS.map(value => ({ family: 'blur' as const, value, metrics: { mean: 128, clipping: 0, backgroundBusy: 0, sharpness: value <= 1 ? 100 : value === 2 ? 60 : 39 } })),
  ...CALIBRATION_EXPOSURES.map(value => ({ family: 'exposure' as const, value, metrics: { mean: value === 0.2 ? 39 : value === 3 ? 236 : 128, clipping: 0, backgroundBusy: 0, sharpness: 100 } })),
];
test('pre-registration has exact parameters/version and accepts a complete conforming observation table', () => {
  expect(CALIBRATION_BLURS).toEqual([0, 1, 2, 4, 8]);
  expect(CALIBRATION_EXPOSURES).toEqual([0.2, 0.5, 1, 1.5, 3]);
  expect(CALIBRATION_THRESHOLDS_VERSION).toBe('q1-2026-10-19');
  expect(calibrationFailures(observations())).toEqual([]);
});
test('missing, duplicated, non-finite and failed expectations are retained as failures', () => {
  expect(calibrationFailures([])).toHaveLength(10);
  const table = observations();
  table[0]!.metrics.sharpness = 99;
  table[3]!.metrics.sharpness = 40;
  table[5]!.metrics.mean = 128;
  table[7]!.metrics.clipping = 0.11;
  expect(calibrationFailures(table)).toEqual(['blur-0: expected sharpness pass', 'blur-4: expected sharpness fail', 'exposure-0.2: expected exposure fail', 'exposure-1: expected exposure pass']);
  table[1]!.metrics.mean = NaN;
  expect(calibrationFailures(table)).toContain('blur-1: invalid metrics');
  expect(calibrationFailures([...observations(), observations()[0]!])).toContain('blur-0: expected one observation');
});
test('analyzer metadata accompanying numeric measurements is not treated as a metric', () => {
  const table = observations().map(o => ({ ...o, metrics: { ...o.metrics, format: 'png', originalBytes: 1000 } }));
  expect(calibrationFailures(table)).toEqual([]);
});
