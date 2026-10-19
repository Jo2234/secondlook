import { createHash } from 'node:crypto';
import { NORMALIZED_MAX_BYTES, NORMALIZE_MAX_SIDE } from '../youcam/limits.js';
import { assertImageMetadata, ImageInputError, inspectImageInput, type ImageFormat } from './input-policy.js';
import { DECODE_OPTIONS, sharp, withImageDecode } from './native.js';

export interface NormalizedPhoto {
  original: { format: ImageFormat; width: number; height: number; bytes: number; sha256: string };
  normalized: { width: number; height: number; bytes: number; sha256: string };
  data: Buffer;
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** In-memory only: caller stores the JPEG and discards its original buffer (§13).
 * Alpha is composited on white for JPEG; no background removal or garment edits.
 */
export async function normalizePhoto(input: Uint8Array): Promise<NormalizedPhoto> {
  const format = inspectImageInput(input);
  // Snapshot so a caller cannot change the bytes while this decode waits for its slot.
  const bytes = Buffer.from(input);
  return withImageDecode(async () => {
    try {
      const metadata = await sharp(bytes, DECODE_OPTIONS).metadata();
      assertImageMetadata(metadata, format);
      const { data, info } = await sharp(bytes, DECODE_OPTIONS).autoOrient()
        .resize({ width: NORMALIZE_MAX_SIDE, height: NORMALIZE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .toColourspace('srgb').flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
      // sharp strips input metadata by default. Never call keepMetadata/withMetadata.
      if (!data.length || data.length >= NORMALIZED_MAX_BYTES || Math.max(info.width, info.height) > NORMALIZE_MAX_SIDE) throw new ImageInputError('image_too_large');
      return { original: { format, width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: sha256(bytes) },
        normalized: { width: info.width, height: info.height, bytes: data.length, sha256: sha256(data) }, data };
    } catch (error) {
      if (error instanceof ImageInputError) throw error;
      if (error instanceof Error && error.message.includes('Input image exceeds pixel limit')) throw new ImageInputError('image_too_large');
      throw new ImageInputError('image_invalid');
    }
  });
}
