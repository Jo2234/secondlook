// F33 only. Requires a fresh exact image grant. No render of the 400M-pixel input.
import { once } from 'node:events';
import { createDeflate, deflateSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { normalizePhoto } from '../../src/images/normalize.js';
import { inspectImageInput } from '../../src/images/input-policy.js';

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii'), body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function ihdr(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(13); bytes.writeUInt32BE(width, 0); bytes.writeUInt32BE(height, 4);
  bytes[8] = 1; // Valid 1-bit grayscale, compression/filter method 0, non-interlaced.
  return chunk('IHDR', bytes);
}
async function compactLargePng(): Promise<Buffer> {
  // Exactly 20,000 scanlines of filter byte 0 + 2,500 packed grayscale bytes.
  // Retain a single 2,501-byte row, a bounded zlib stream and its small compressed output.
  const stream = createDeflate({ level: 9, chunkSize: 16_384 });
  const parts: Buffer[] = []; let count = 0;
  const collect = (async () => {
    for await (const value of stream) {
      const bytes = Buffer.from(value as Uint8Array); count += bytes.length;
      if (count > 128_000) throw new Error('unexpected_compressed_size');
      parts.push(bytes);
    }
  })();
  const row = Buffer.alloc(2_501);
  try {
    for (let y = 0; y < 20_000; y++) if (!stream.write(row)) await once(stream, 'drain');
    stream.end(); await collect;
    return Buffer.concat([signature, ihdr(20_000, 20_000), chunk('IDAT', Buffer.concat(parts)), chunk('IEND', Buffer.alloc(0))]);
  } finally { stream.destroy(); await collect.catch(() => undefined); }
}
function animatedPng(): Buffer {
  const control = Buffer.alloc(8); control.writeUInt32BE(2, 0);
  const frame = (sequence: number) => {
    const bytes = Buffer.alloc(26); bytes.writeUInt32BE(sequence, 0); bytes.writeUInt32BE(1, 4); bytes.writeUInt32BE(1, 8);
    bytes.writeUInt16BE(1, 20); bytes.writeUInt16BE(10, 22); return chunk('fcTL', bytes);
  };
  const raster = deflateSync(Buffer.from([0, 0]));
  const second = Buffer.alloc(4 + raster.length); second.writeUInt32BE(2, 0); raster.copy(second, 4);
  return Buffer.concat([signature, ihdr(1, 1), chunk('acTL', control), frame(0), chunk('IDAT', raster), frame(1), chunk('fdAT', second), chunk('IEND', Buffer.alloc(0))]);
}

test('F33 rejects a complete compact 20,000×20,000 PNG before native decoding with root HWM growth <200 MB', async () => {
  // Node maxRSS is the process high-water mark in KiB. It is monotonic and includes
  // this Vitest thread in the retained root; it is not a descendant/global RSS sum.
  const started = process.hrtime.bigint(), baseline = process.memoryUsage.rss(), beforeHwm = process.resourceUsage().maxRSS * 1024;
  let error: unknown, size = 0, sniffError: unknown;
  try {
    const png = await compactLargePng(); size = png.length;
    try { inspectImageInput(png); } catch (value) { sniffError = value; }
    try { await normalizePhoto(png); } catch (value) { error = value; }
  } finally {
    const peak = process.resourceUsage().maxRSS * 1024;
    // Emit measurement even if generation/normalization/assertions fail. No native result is mocked.
    console.log(JSON.stringify({ evidence: 'F33-root-hwm', pid: process.pid, baselineRssBytes: baseline, beforeHwmBytes: beforeHwm, peakBytes: peak,
      increaseBytes: peak - baseline, elapsedNs: String(process.hrtime.bigint() - started), inputBytes: size }));
    expect(peak).toBeGreaterThanOrEqual(beforeHwm);
    expect(peak - baseline).toBeLessThan(200_000_000);
  }
  expect(size).toBeGreaterThan(100); expect(size).toBeLessThan(128_000);
  // The independent pre-native inspection rejects the header; normalize must agree.
  expect(sniffError).toMatchObject({ code: 'image_too_large' });
  expect(error).toMatchObject({ code: 'image_too_large' });
}, 15_000);

test('F33 rejects a complete two-frame APNG and an SVG supplied as a JPEG', async () => {
  await expect(normalizePhoto(animatedPng())).rejects.toMatchObject({ code: 'image_unsupported' });
  const renamedJpeg = { name: 'renamed.jpg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>') };
  expect(renamedJpeg.name).toMatch(/\.jpg$/);
  await expect(normalizePhoto(renamedJpeg.bytes)).rejects.toMatchObject({ code: 'image_unsupported' });
});
