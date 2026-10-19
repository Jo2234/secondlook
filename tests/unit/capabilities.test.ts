import { expect, test } from 'vitest';
import { capability, capabilityAllows, garmentRightsAllow } from '../../src/domain/capabilities.js';
test('F1 standalone lower-body is blocked in both modes and cannot be upgraded', () => {
  for (const mode of ['fixture', 'live'] as const) {
    const row = capability('hanger', 'lower_body', [{ photoType: 'hanger', category: 'lower_body', status: 'live_ok', citation: 'probe' }]);
    expect(row.status).toBe('documented_unsupported'); expect(capabilityAllows(row, mode)).toBe(false);
  }
});
test('flatlay is fixture-only until a live probe; worn person images need rights', () => {
  const row = capability('flatlay', 'upper_body');
  expect(capabilityAllows(row, 'fixture')).toBe(true); expect(capabilityAllows(row, 'live')).toBe(false);
  expect(capabilityAllows(row, 'live', true)).toBe(true);
  expect(garmentRightsAllow('worn', 'live', false)).toBe(false); expect(garmentRightsAllow('worn', 'fixture', false)).toBe(true);
});
test('live failed evidence wins conflicting overrides', () => {
  expect(capability('flatlay', 'upper_body', ['live_ok', 'live_failed'].map(status => ({ photoType: 'flatlay', category: 'upper_body', status: status as 'live_ok' | 'live_failed', citation: 'probe' }))).status).toBe('live_failed');
});
