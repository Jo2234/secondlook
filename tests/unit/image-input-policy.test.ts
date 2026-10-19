import { expect, test } from 'vitest';
import { assertImageMetadata, inspectImageInput } from '../../src/images/input-policy.js';

// Structural header-only inputs, never decoded or written as image fixtures.
function png(width: number, height: number, chunks: string[] = []): Uint8Array {
  const bytes = new Uint8Array(8 + 25 + chunks.length * 12 + 12), view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  view.setUint32(8, 13); bytes.set([73, 72, 68, 82], 12); view.setUint32(16, width); view.setUint32(20, height);
  [...chunks, 'IEND'].forEach((type, i) => bytes.set(Array.from(type, c => c.charCodeAt(0)), 33 + i * 12 + 4));
  return bytes;
}
test('sniff only JPEG/PNG magic, independent of supplied file extension', () => {
  expect(inspectImageInput(new Uint8Array([255, 216, 255, 0]))).toBe('jpeg');
  expect(inspectImageInput(png(512, 384))).toBe('png');
  expect(() => inspectImageInput(new TextEncoder().encode('<svg/>'))).toThrow('image_unsupported');
  expect(() => inspectImageInput(new Uint8Array())).toThrow('image_invalid');
});
test('header size/area/animation refusals happen without native decode', () => {
  expect(() => inspectImageInput(png(20000, 20000))).toThrow('image_too_large');
  expect(() => inspectImageInput(png(10000, 5000))).toThrow('image_too_large');
  expect(() => inspectImageInput(png(512, 384, ['acTL']))).toThrow('image_unsupported');
  expect(() => inspectImageInput(new Uint8Array(25_000_001))).toThrow('image_too_large');
  const broken = png(512, 384); new DataView(broken.buffer).setUint32(33, 100000);
  expect(() => inspectImageInput(broken)).toThrow('image_invalid');
});
test('decoded metadata enforces one page, matching format and bounded integral dimensions', () => {
  expect(() => assertImageMetadata({ format: 'jpeg', width: 8000, height: 5000, pages: 1 }, 'jpeg')).not.toThrow();
  for (const metadata of [
    { format: 'jpeg', width: 512, height: 384, pages: 2 },
    { format: 'webp', width: 512, height: 384 },
  ]) expect(() => assertImageMetadata(metadata, 'jpeg')).toThrow('image_unsupported');
  expect(() => assertImageMetadata({ format: 'jpeg', width: 12001, height: 1 }, 'jpeg')).toThrow('image_too_large');
  for (const width of [0, -1, NaN, 1.5, Infinity]) expect(() => assertImageMetadata({ format: 'jpeg', width, height: 384 }, 'jpeg')).toThrow('image_invalid');
});
