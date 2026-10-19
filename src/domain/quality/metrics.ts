import { THRESHOLDS as T } from './thresholds.js';

export interface GrayRaster { width: number; height: number; data: Float32Array }
export interface PixelMetrics { sharpness: number; mean: number; clipping: number; backgroundBusy: number }

/** §5.2: sRGB luma, population Laplacian variance, and unnormalised Sobel. */
export function measurePixels({ width, height, data }: GrayRaster): PixelMetrics {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= T.rasterLongSide) || data.length !== width * height) throw new RangeError('invalid_gray_raster');
  let sum = 0, clipped = 0;
  for (const y of data) {
    if (!Number.isFinite(y) || y < 0 || y > 255) throw new RangeError('invalid_luma');
    sum += y;
    if (y <= T.clipLow || y >= T.clipHigh) clipped++;
  }
  const bandX = Math.ceil(width * T.borderFraction), bandY = Math.ceil(height * T.borderFraction);
  let count = 0, lapMean = 0, lapM2 = 0, borderCount = 0, busyCount = 0;
  // Both kernels need a complete 3×3 neighbourhood. No invented padded edge pixels.
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const lap = data[i - width]! + data[i - 1]! - 4 * data[i]! + data[i + 1]! + data[i + width]!;
    count++;
    const delta = lap - lapMean;
    lapMean += delta / count;
    lapM2 += delta * (lap - lapMean);
    if (x < bandX || x >= width - bandX || y < bandY || y >= height - bandY) {
      const gx = -data[i - width - 1]! + data[i - width + 1]! - 2 * data[i - 1]! + 2 * data[i + 1]! - data[i + width - 1]! + data[i + width + 1]!;
      const gy = -data[i - width - 1]! - 2 * data[i - width]! - data[i - width + 1]! + data[i + width - 1]! + 2 * data[i + width]! + data[i + width + 1]!;
      borderCount++;
      if (Math.hypot(gx, gy) > T.sobelMagnitude) busyCount++;
    }
  }
  // Tiny images have no kernel support: zero sharpness fails the frozen gate.
  return { mean: sum / data.length, clipping: clipped / data.length, sharpness: count ? lapM2 / count : 0, backgroundBusy: borderCount ? busyCount / borderCount : 0 };
}
