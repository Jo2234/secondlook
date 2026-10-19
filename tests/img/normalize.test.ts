// G-img-1 required; never imported by the pure test layer.
import { expect, test } from 'vitest';
import { sharp } from '../../src/images/native.js';
import { normalizePhoto } from '../../src/images/normalize.js';
import { analyzePhoto } from '../../src/images/raster.js';

test('F17 autorotates pixels and strips synthetic GPS/EXIF/XMP metadata', async () => {
  const raw = Buffer.alloc(80 * 40 * 3);
  for (let i = 0; i < 80 * 40; i++) { raw[i * 3] = i % 80 < 40 ? 240 : 10; raw[i * 3 + 2] = i % 80 < 40 ? 10 : 240; }
  const input = await sharp(raw, { raw: { width: 80, height: 40, channels: 3 } })
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '0/1 0/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '0/1 0/1 0/1' } })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">synthetic-location-only</x:xmpmeta>').jpeg({ quality: 100 }).toBuffer();
  expect(await sharp(input).metadata()).toMatchObject({ orientation: 6 });
  expect((await sharp(input).metadata()).exif).toBeDefined();
  const photo = await normalizePhoto(input), metadata = await sharp(photo.data).metadata();
  expect(photo.original).toMatchObject({ width: 80, height: 40, format: 'jpeg', bytes: input.length });
  expect(metadata).toMatchObject({ format: 'jpeg', width: 40, height: 80, space: 'srgb' });
  for (const key of ['exif', 'xmp', 'iptc', 'icc', 'orientation'] as const) expect(metadata[key]).toBeUndefined();
  const top = await sharp(photo.data).extract({ left: 10, top: 10, width: 10, height: 10 }).stats();
  const bottom = await sharp(photo.data).extract({ left: 10, top: 60, width: 10, height: 10 }).stats();
  expect(top.channels[0]!.mean).toBeGreaterThan(top.channels[2]!.mean + 150);
  expect(bottom.channels[2]!.mean).toBeGreaterThan(bottom.channels[0]!.mean + 150);
});
test('normalization bounds JPEG output, does not upscale, and integrates actual pixels into gate metrics', async () => {
  const input = await sharp({ create: { width: 3000, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const { photo, metrics } = await analyzePhoto(input);
  expect(photo.normalized).toMatchObject({ width: 2048, height: 410 });
  expect(photo.normalized.bytes).toBeLessThan(10_000_000);
  expect(metrics).toMatchObject({ width: 2048, height: 410, originalWidth: 3000, originalHeight: 600, sharpness: 0, mean: 255, clipping: 1, backgroundBusy: 0 });
  const tiny = await sharp({ create: { width: 16, height: 8, channels: 3, background: '#808080' } }).png().toBuffer();
  expect((await normalizePhoto(tiny)).normalized).toMatchObject({ width: 16, height: 8 });
});
test('decode failure releases the image slot for a subsequent valid normalization', async () => {
  await expect(normalizePhoto(new Uint8Array([255, 216, 255, 0]))).rejects.toMatchObject({ code: 'image_invalid' });
  const valid = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).png().toBuffer();
  expect((await normalizePhoto(valid)).normalized.width).toBe(8);
});
