export const THRESHOLDS_VERSION = 'q1-2026-10-19';
export const THRESHOLDS = Object.freeze({ minLong: 512, minShort: 384, recommendedLong: 1024, recommendedShort: 768,
  maxNormalizedSide: 4096, aspectWarn: 3, sharpnessFail: 40, sharpnessWarn: 100,
  meanFailLow: 40, meanFailHigh: 235, meanWarnLow: 70, meanWarnHigh: 210,
  clippingFail: 0.25, clippingWarn: 0.10, backgroundWarn: 0.12,
  rasterLongSide: 512, borderFraction: 0.08, sobelMagnitude: 48, clipLow: 5, clipHigh: 250,
});
