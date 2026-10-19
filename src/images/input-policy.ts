import { DECODE_MAX_PIXELS, DECODE_MAX_SIDE, ORIGINAL_MAX_BYTES } from '../youcam/limits.js';

export type ImageFormat = 'jpeg' | 'png';
export type ImageErrorCode = 'image_too_large' | 'image_unsupported' | 'image_invalid';
export class ImageInputError extends Error {
  constructor(readonly code: ImageErrorCode) { super(code); this.name = 'ImageInputError'; }
}
export interface ImageMetadata { format?: string; width?: number; height?: number; pages?: number }
export function assertDecodeDimensions(width: number | undefined, height: number | undefined): void {
  if (![width, height].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)) throw new ImageInputError('image_invalid');
  if (width! > DECODE_MAX_SIDE || height! > DECODE_MAX_SIDE || width! * height! > DECODE_MAX_PIXELS) throw new ImageInputError('image_too_large');
}
export function assertImageMetadata(metadata: ImageMetadata, sniffed: ImageFormat): void {
  if (metadata.format !== sniffed || (metadata.pages !== undefined && metadata.pages !== 1)) throw new ImageInputError('image_unsupported');
  assertDecodeDimensions(metadata.width, metadata.height);
}
/** Inspect bounded bytes before handing them to a native decoder. Extension/MIME is not trusted. */
export function inspectImageInput(bytes: Uint8Array): ImageFormat {
  if (!bytes.length) throw new ImageInputError('image_invalid');
  if (bytes.length > ORIGINAL_MAX_BYTES) throw new ImageInputError('image_too_large');
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((n, i) => bytes[i] === n)) throw new ImageInputError('image_unsupported');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, first = true;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) throw new ImageInputError('image_invalid');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (first) {
      if (type !== 'IHDR' || length !== 13) throw new ImageInputError('image_invalid');
      assertDecodeDimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      first = false;
    }
    // sharp metadata.pages does not promise APNG support; reject animation at its chunk boundary.
    if (type === 'acTL') throw new ImageInputError('image_unsupported');
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length) throw new ImageInputError('image_invalid');
      return 'png';
    }
    offset = end;
  }
  throw new ImageInputError('image_invalid');
}
