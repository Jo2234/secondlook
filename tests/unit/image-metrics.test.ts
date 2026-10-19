import { expect, test } from 'vitest';
import { measurePixels, type GrayRaster } from '../../src/domain/quality/metrics.js';
import { rgbToRaster } from '../../src/images/raster-core.js';

const raster = (width: number, height: number, pixel: (x: number, y: number) => number): GrayRaster => ({ width, height,
  data: Float32Array.from({ length: width * height }, (_, i) => pixel(i % width, Math.floor(i / width))) });

test('constant, clipped and tiny images have analytic mean, inclusive clipping and zero variance', () => {
  expect(measurePixels(raster(8, 8, () => 128))).toEqual({ mean: 128, clipping: 0, sharpness: 0, backgroundBusy: 0 });
  expect(measurePixels({ width: 2, height: 2, data: new Float32Array([5, 250, 6, 249]) })).toEqual({ mean: 127.5, clipping: 0.5, sharpness: 0, backgroundBusy: 0 });
});
test('Laplacian population variance excludes the 1px border (central impulse)', () => {
  const m = measurePixels(raster(5, 5, (x, y) => x === 2 && y === 2 ? 10 : 0));
  expect(m.sharpness).toBeCloseTo(2000 / 9, 10);
  expect(m.mean).toBeCloseTo(0.4, 10);
});
test('Sobel threshold is strict and only the outer 8% band contributes', () => {
  expect(measurePixels(raster(32, 32, x => x * 6)).backgroundBusy).toBe(0); // Sobel=48
  expect(measurePixels(raster(32, 32, x => x * 7)).backgroundBusy).toBe(1); // Sobel=56
  expect(measurePixels(raster(32, 32, (x, y) => x === 16 && y === 16 ? 255 : 128)).backgroundBusy).toBe(0);
});
test('RGB luma uses sRGB coefficients without linearisation or upscaling', () => {
  const r = rgbToRaster(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3, 1);
  expect([r.width, r.height]).toEqual([3, 1]);
  [54.213, 182.376, 18.411].forEach((v, i) => expect(r.data[i]).toBeCloseTo(v, 4));
});
test('non-integer area overlaps average pixels rather than sampling or interpolation', () => {
  const rgb = Uint8Array.from({ length: 768 * 3 }, (_, i) => Math.floor(i / 3) % 3 * 90);
  const r = rgbToRaster(rgb, 768, 1);
  expect([r.width, r.height]).toEqual([512, 1]);
  for (let i = 0; i < r.data.length; i++) expect(r.data[i]).toBeCloseTo(i % 2 ? 150 : 30, 5);
});
test('portrait/landscape scaling preserves constant tone and bounds the long side', () => {
  for (const [width, height] of [[1024, 769], [769, 1024]] as const) {
    const r = rgbToRaster(new Uint8Array(width * height * 3).fill(120), width, height);
    expect([Math.max(r.width, r.height), Math.min(r.width, r.height)]).toEqual([512, 385]);
    expect(measurePixels(r)).toEqual({ mean: 120, clipping: 0, sharpness: 0, backgroundBusy: 0 });
  }
});
test('malformed numeric rasters fail closed before metric evaluation', () => {
  for (const value of [NaN, Infinity, -1, 256]) expect(() => measurePixels(raster(3, 3, () => value))).toThrow('invalid_luma');
  expect(() => measurePixels({ width: 0, height: 1, data: new Float32Array() })).toThrow('invalid_gray_raster');
  expect(() => measurePixels({ width: 3, height: 3, data: new Float32Array(8) })).toThrow('invalid_gray_raster');
  expect(() => rgbToRaster(new Uint8Array(4), 1, 1)).toThrow('invalid_rgb_raster');
  expect(() => rgbToRaster(new Uint8Array(), 2049, 1)).toThrow('invalid_rgb_raster');
});
