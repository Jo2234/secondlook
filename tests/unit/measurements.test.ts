import { expect, test } from 'vitest';
import { compareMeasurements, formatMeasurement, measurementProblems, parseMeasurement } from '../../src/shared/measurements.js';
test('A4 unit examples and quarter display', () => {
  expect(parseMeasurement('21.5', 'in')).toBe(546); expect(formatMeasurement(546, 'in')).toBe('21½ in');
  expect(parseMeasurement('52.3', 'cm')).toBe(523); expect(formatMeasurement(523, 'cm')).toBe('52.3 cm');
});
test('reject precision, non-quarter inches and values outside range', () => {
  for (const x of ['1', '201', '52.33', '-5', 'NaN']) expect(parseMeasurement(x, 'cm')).toBeNull();
  expect(parseMeasurement('21.1', 'in')).toBeNull();
});
test('category requirements, sleeve NA and signed client-only differences', () => {
  expect(measurementProblems({ category: 'upper_body', valuesMm: { pit_to_pit: 520, length: 680, shoulder: 450, sleeve: 'na' }, enteredUnit: 'cm', tagSize: null })).toEqual([]);
  expect(measurementProblems({ category: 'lower_body', valuesMm: { waist: 520, rise: 'na' }, enteredUnit: 'cm', tagSize: null })).toContain('rise');
  expect(compareMeasurements({ pit_to_pit: 520, sleeve: 'na' }, { pit_to_pit: 500, sleeve: 400 })).toEqual({ pit_to_pit: 20 });
  expect(formatMeasurement(-20, 'cm', true)).toBe('−2.0 cm');
});
