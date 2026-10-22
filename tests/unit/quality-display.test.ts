import { describe, expect, test } from 'vitest';
import { COPY } from '../../src/shared/copy.js';
import { findBannedPhrases } from '../../src/shared/banned-phrases.js';
import { formatGuidance, formatMeasured } from '../../src/web/quality-display.js';

describe('quality guidance display', () => {
  test('substitutes original dimensions without changing frozen copy', () => {
    expect(formatGuidance('max_dimensions_normalized', { width: 768, height: 1024 })).toBe('Resized from 768×1024.');
    expect(COPY.quality.max_dimensions_normalized).toBe('Resized from {width}×{height}.');
  });
  test('falls back when either dimension is missing', () => {
    for (const vars of [{}, { width: 768 }, { height: 1024 }]) {
      const text = formatGuidance('max_dimensions_normalized', vars);
      expect(text).toBe("Resized to fit YouCam's limits.");
      expect(findBannedPhrases(text)).toEqual([]);
    }
  });
  test('never leaves a placeholder in guidance', () => {
    for (const key of Object.keys(COPY.quality) as (keyof typeof COPY.quality)[]) {
      expect(formatGuidance(key)).not.toContain('{');
    }
  });
});

describe('quality measured display', () => {
  test.each([
    [1.3333333333333333, '1.33'], [1127.2636658520631, '1,127.26'],
    [0.029454545422285, '0.03'], [1.2, '1.2'], [12, '12'], [0, '0'],
    [-1.256, '-1.26'], [null, '—'], ['768×1024 → 768×1024', '768×1024 → 768×1024'],
    ['1.33333', '1.33333'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatMeasured(value)).toBe(expected);
  });
});
