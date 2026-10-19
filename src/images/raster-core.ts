import type { GrayRaster } from '../domain/quality/metrics.js';
import { THRESHOLDS as T } from '../domain/quality/thresholds.js';
import { NORMALIZE_MAX_SIDE } from '../youcam/limits.js';

/** Pure RGB8 → Float32 luma with exact source-pixel overlap (area average).
 * Input is decoded, normalised sRGB; no linearisation, upscaling or alpha channel.
 */
export function rgbToRaster(rgb: Uint8Array, width: number, height: number): GrayRaster {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= NORMALIZE_MAX_SIDE) || rgb.length !== width * height * 3) throw new RangeError('invalid_rgb_raster');
  const scale = Math.min(1, T.rasterLongSide / Math.max(width, height));
  const outWidth = Math.max(1, Math.round(width * scale)), outHeight = Math.max(1, Math.round(height * scale));
  const data = new Float32Array(outWidth * outHeight);
  const sx = width / outWidth, sy = height / outHeight;
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
    const left = x * sx, right = Math.min(width, (x + 1) * sx);
    const top = y * sy, bottom = Math.min(height, (y + 1) * sy);
    let total = 0;
    for (let iy = Math.floor(top); iy < Math.ceil(bottom); iy++) for (let ix = Math.floor(left); ix < Math.ceil(right); ix++) {
      const weight = (Math.min(right, ix + 1) - Math.max(left, ix)) * (Math.min(bottom, iy + 1) - Math.max(top, iy));
      const i = (iy * width + ix) * 3;
      total += weight * (0.2126 * rgb[i]! + 0.7152 * rgb[i + 1]! + 0.0722 * rgb[i + 2]!);
    }
    data[y * outWidth + x] = total / ((right - left) * (bottom - top));
  }
  return { width: outWidth, height: outHeight, data };
}
