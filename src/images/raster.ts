import { measurePixels, type GrayRaster } from '../domain/quality/metrics.js';
import type { GivenMetrics } from '../domain/quality/gate.js';
import { NORMALIZED_MAX_BYTES, NORMALIZE_MAX_SIDE } from '../youcam/limits.js';
import { assertImageMetadata, ImageInputError, inspectImageInput } from './input-policy.js';
import { DECODE_OPTIONS, sharp, withImageDecode } from './native.js';
import { normalizePhoto } from './normalize.js';
import { rgbToRaster } from './raster-core.js';

/** Accept only a bounded normalized JPEG. Decode RGB, then use pure area averaging. */
export async function rasterNormalizedPhoto(input: Uint8Array): Promise<GrayRaster> {
  if (input.length >= NORMALIZED_MAX_BYTES) throw new ImageInputError('image_too_large');
  if (inspectImageInput(input) !== 'jpeg') throw new ImageInputError('image_unsupported');
  const bytes = Buffer.from(input);
  return withImageDecode(async () => {
    try {
      const metadata = await sharp(bytes, DECODE_OPTIONS).metadata();
      assertImageMetadata(metadata, 'jpeg');
      if (Math.max(metadata.width, metadata.height) > NORMALIZE_MAX_SIDE) throw new ImageInputError('image_too_large');
      const { data, info } = await sharp(bytes, DECODE_OPTIONS).toColourspace('srgb').removeAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
      if (info.channels !== 3) throw new ImageInputError('image_invalid');
      return rgbToRaster(data, info.width, info.height);
    } catch (error) {
      if (error instanceof ImageInputError) throw error;
      throw new ImageInputError('image_invalid');
    }
  });
}

/** The gate consumes actual normalized pixels and the corresponding byte/dimension metadata. */
export async function analyzePhoto(input: Uint8Array) {
  const photo = await normalizePhoto(input);
  const raster = await rasterNormalizedPhoto(photo.data);
  const metrics: GivenMetrics = { ...measurePixels(raster), format: photo.original.format, originalBytes: photo.original.bytes,
    normalizedBytes: photo.normalized.bytes, originalWidth: photo.original.width, originalHeight: photo.original.height,
    width: photo.normalized.width, height: photo.normalized.height };
  return { photo, metrics };
}
