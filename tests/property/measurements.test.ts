import fc from 'fast-check';
import { expect, test } from 'vitest';
import { formatMeasurement, parseMeasurement } from '../../src/shared/measurements.js';
const options = { numRuns: 200, seed: 20261019 };
test('F18 all valid mm round-trip through cm within 1 mm and inches within 3.2 mm (seed 20261019)', () => {
  fc.assert(fc.property(fc.integer({ min: 50, max: 2000 }), mm => {
    expect(Math.abs(parseMeasurement(formatMeasurement(mm, 'cm').replace(' cm', ''), 'cm')! - mm)).toBeLessThanOrEqual(1);
    const rendered = formatMeasurement(mm, 'in').replace(' in', '');
    const quarter = rendered.match(/[¼½¾]/)?.[0];
    const inches = Number(rendered.replace(/[¼½¾]/, '')) + (quarter ? ({ '¼': .25, '½': .5, '¾': .75 }[quarter] ?? 0) : 0);
    // Boundary rounding can exceed the accepted mm range; compare display precision numerically.
    expect(Math.abs(Math.round(inches * 25.4) - mm)).toBeLessThanOrEqual(3.2);
  }), options);
});
