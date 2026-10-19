import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { evaluateGarmentPhoto, evaluateModelPhoto, type GivenMetrics } from '../../src/domain/quality/gate.js';
import { THRESHOLDS_VERSION } from '../../src/domain/quality/thresholds.js';
import type { GarmentDeclaration } from '../../src/shared/types.js';
const metrics: GivenMetrics = { format: 'jpeg', originalBytes: 100000, normalizedBytes: 90000, width: 1024, height: 768, originalWidth: 1024, originalHeight: 768, sharpness: 150, mean: 130, clipping: .05, backgroundBusy: .05 };
const declaration: GarmentDeclaration = { photoType: 'hanger', category: 'upper_body', singleGarment: true, frontFacing: true, notComposite: true, fullyVisible: true, noPeopleInPhoto: true };
const evaluate = (m: Partial<GivenMetrics> = {}, d: Partial<GarmentDeclaration> = {}) => evaluateGarmentPhoto({ photoId: 'a'.repeat(20), mode: 'fixture', metrics: { ...metrics, ...m }, declaration: { ...declaration, ...d }, manifestConsent: false });
test('A1 supplied sharp, evenly exposed supported garment passes', () => { expect(evaluate()).toMatchObject({ verdict: 'pass', spendAllowed: true }); });
test('F2 minimum dimensions are orientation-agnostic and exact', () => {
  for (const [width, height, severity] of [[511, 384, 'fail'], [512, 383, 'fail'], [512, 384, 'pass'], [384, 512, 'pass']] as const) expect(evaluate({ width, height }).checks.find(c => c.id === 'min_dimensions')?.severity).toBe(severity);
});
test('F3 rule boundaries stay frozen and non-finite metrics fail closed', () => {
  expect(THRESHOLDS_VERSION).toBe('q1-2026-10-19'); expect(readFileSync('docs/calibration.md', 'utf8')).toContain(THRESHOLDS_VERSION);
  for (const [sharpness, verdict] of [[39, 'fail'], [40, 'warn'], [99, 'warn'], [100, 'pass']] as const) expect(evaluate({ sharpness }).verdict).toBe(verdict);
  for (const mean of [39, 236, NaN]) expect(evaluate({ mean }).spendAllowed).toBe(false);
  expect(evaluate({ clipping: .25 }).verdict).toBe('warn'); expect(evaluate({ clipping: .251 }).verdict).toBe('fail');
});
test('declarations, unsupported category and model rights block spending; busy background never fails', () => {
  expect(evaluate({}, { notComposite: false }).spendAllowed).toBe(false);
  expect(evaluate({}, { category: 'lower_body' }).spendAllowed).toBe(false);
  expect(evaluate({ backgroundBusy: .8 }).verdict).toBe('warn');
  expect(evaluateModelPhoto({ photoId: 'a'.repeat(20), role: 'model', mode: 'live', metrics, singlePerson: true, occupies80Percent: true, standingFrontFacing: true, faceAndShouldersVisible: true, manifestConsent: false, synthetic: true }).spendAllowed).toBe(false);
});
