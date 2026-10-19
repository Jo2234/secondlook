import { YouCamError } from './client.js';
import type { LimiterClock } from './rate-limiter.js';
export interface Clock extends LimiterClock { sleep(ms: number, signal: AbortSignal): Promise<void> }
export const systemClock: Clock = {
  now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  sleep: (ms, signal) => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new YouCamError('aborted')); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new YouCamError('aborted')); };
    const timer = setTimeout(finish, Math.max(0, ms)); signal.addEventListener('abort', abort, { once: true });
  }),
};
export function checkSignal(signal: AbortSignal): void { if (signal.aborted) throw new YouCamError('aborted'); }
/** Clears the deadline timer on every outcome; composed signals carry parent cancellation. */
export async function bounded<T>(signal: AbortSignal, ms: number, work: (signal: AbortSignal) => Promise<T>, clock: Clock = systemClock): Promise<T> {
  checkSignal(signal);
  if (ms <= 0) throw new YouCamError('timeout');
  const controller = new AbortController();
  const timer = clock.setTimer(() => controller.abort(new YouCamError('timeout')), ms);
  const composed = AbortSignal.any([signal, controller.signal]);
  let abort!: () => void;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(new YouCamError(controller.signal.aborted && !signal.aborted ? 'timeout' : 'aborted'));
    composed.addEventListener('abort', abort, { once: true });
  });
  const operation = Promise.resolve().then(() => { checkSignal(composed); return work(composed); });
  try { return await Promise.race([operation, stopped]); }
  finally {
    clock.clearTimer(timer); composed.removeEventListener('abort', abort);
    // Retain ownership until cancellation-aware work has settled, including native work's after-check.
    if (composed.aborted) await operation.catch(() => undefined);
  }
}
