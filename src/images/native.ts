import sharp from 'sharp';
import { DECODE_MAX_PIXELS } from '../youcam/limits.js';
sharp.concurrency(1);
sharp.cache(false);
export { sharp };
export const DECODE_OPTIONS = Object.freeze({ limitInputPixels: DECODE_MAX_PIXELS, failOn: 'error' as const, sequentialRead: true });
let tail: Promise<void> = Promise.resolve();
/** All image adapters share one process-local decode slot. Always release on failure. */
export async function withImageDecode<T>(work: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}
