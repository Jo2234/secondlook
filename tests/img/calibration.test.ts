// G-img-1 required. Failure records measured values; no threshold edits or automatic retries.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { CALIBRATION_BLURS, CALIBRATION_EXPOSURES, CALIBRATION_THRESHOLDS_VERSION, calibrationFailures, type CalibrationObservation } from '../../src/domain/quality/calibration.js';
import { writeCalibrationVariants } from '../../src/images/synth.js';
import { analyzePhoto } from '../../src/images/raster.js';

test('F3 pre-registered synthetic blur/exposure calibration on normalized pixels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'secondlook-calibration-'));
  try {
    expect(CALIBRATION_THRESHOLDS_VERSION).toBe('q1-2026-10-19');
    expect(await readFile('docs/calibration.md', 'utf8')).toContain('`q1-2026-10-19`');
    expect(await readFile('docs/implementation-plan.md', 'utf8')).toContain('q1-2026-10-19');
    await writeCalibrationVariants(dir);
    const observations: CalibrationObservation[] = [];
    for (const [family, values] of [['blur', CALIBRATION_BLURS], ['exposure', CALIBRATION_EXPOSURES]] as const) for (const value of values) {
      const { metrics } = await analyzePhoto(await readFile(join(dir, `${family}-${value}.png`)));
      observations.push({ family, value, metrics });
    }
    const failures = calibrationFailures(observations);
    console.log(JSON.stringify({ kind: 'measured_synthetic_calibration', thresholdsVersion: CALIBRATION_THRESHOLDS_VERSION, observations, failures }));
    expect(failures, 'STOP: retain measurements and request lead disposition; never tune to pass').toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
