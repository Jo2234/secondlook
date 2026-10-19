import { DECODE_OPTIONS, sharp, withImageDecode } from './native.js';
import { assertImageMetadata, ImageInputError, inspectImageInput } from './input-policy.js';
import { checkSignal } from '../youcam/operations.js';
import { COPY } from '../shared/copy.js';
import type { Mode } from '../shared/types.js';
const escapeXml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export async function discloseImage(input: Uint8Array, mode: Mode, signal: AbortSignal): Promise<{ bytes: Buffer; width: number; height: number }> {
  checkSignal(signal); const format = inspectImageInput(input), bytes = Buffer.from(input);
  return withImageDecode(async () => {
    checkSignal(signal);
    const metadata = await sharp(bytes, DECODE_OPTIONS).metadata(); assertImageMetadata(metadata, format);
    const { width, height } = metadata;
    if (width < 64 || height < 64 || width > 8192 || height > 8192) throw new ImageInputError('image_invalid');
    const band = Math.max(28, Math.ceil(height * .06)), font = Math.max(7, Math.floor(Math.min(width / 70, band / 3)));
    const lines = mode === 'fixture' ? ['DEMO FIXTURE · NOT A YOUCAM RESULT', 'Placeholder composite · not a try-on'] : ['AI-generated preview from YouCam · approximate', 'Fit, size, colour and details may differ.'];
    const diagonal = mode === 'fixture' ? `<g transform="translate(${width / 2},${height / 2}) rotate(-28)"><rect x="${-width}" y="-30" width="${width * 2}" height="60" fill="#101820" fill-opacity=".85"/><text x="0" y="8" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(8, Math.floor(width / 35))}" fill="white">${escapeXml(COPY.mode.fixtureImage)}</text></g>` : '';
    const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${diagonal}<rect x="0" y="${height - band}" width="${width}" height="${band}" fill="#101820"/><g font-family="sans-serif" font-size="${font}" fill="white">${lines.map((line, n) => `<text x="8" y="${height - band + (n + 1) * band / 3}">${escapeXml(line)}</text>`).join('')}</g></svg>`);
    const output = await sharp(bytes, DECODE_OPTIONS).autoOrient().toColourspace('srgb').flatten({ background: '#fff' }).composite([{ input: overlay }]).jpeg({ quality: 90 }).toBuffer();
    checkSignal(signal); return { bytes: output, width, height };
  });
}
/** A mannequin and detached garment inset, deliberately not a generated try-on. */
export async function fixtureComposite(model: Uint8Array, garment: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  checkSignal(signal);
  return withImageDecode(async () => {
    const thumbnail = await sharp(garment, DECODE_OPTIONS).resize(220, 300, { fit: 'inside' }).png().toBuffer();
    checkSignal(signal);
    const bytes = await sharp(model, DECODE_OPTIONS).resize(768, 1024, { fit: 'contain', background: '#ddd' }).composite([{ input: thumbnail, left: 520, top: 40 }]).png().toBuffer();
    checkSignal(signal); return bytes;
  });
}
