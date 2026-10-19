import { LIMITER_SHORT_WINDOW_MS, LIMITER_SHORT_MAX, LIMITER_LONG_WINDOW_MS, LIMITER_LONG_MAX, LIMITER_QUEUE_MAX, LIMITER_WAIT_MS } from './limits.js';
export interface LimiterClock { now(): number; setTimer(callback: () => void, delayMs: number): unknown; clearTimer(handle: unknown): void }
interface Waiter { deadline: number; resolve: (at: number) => void; reject: (error: Error) => void; signal: AbortSignal | undefined; onAbort: () => void }
export class SlidingLogLimiter {
  private grants: number[] = [];
  private waiters: Waiter[] = [];
  private timer: unknown = null;
  private disposed = false;
  constructor(private readonly clock: LimiterClock) {}
  get queueSize(): number { return this.waiters.length; }
  private prune(now: number): void { this.grants = this.grants.filter(t => t > now - LIMITER_LONG_WINDOW_MS); }
  private nextGrantAt(now: number): number {
    this.prune(now);
    const short = this.grants.filter(t => t > now - LIMITER_SHORT_WINDOW_MS);
    return Math.max(now, short.length >= LIMITER_SHORT_MAX ? short[short.length - LIMITER_SHORT_MAX]! + LIMITER_SHORT_WINDOW_MS : now,
      this.grants.length >= LIMITER_LONG_MAX ? this.grants[this.grants.length - LIMITER_LONG_MAX]! + LIMITER_LONG_WINDOW_MS : now);
  }
  acquire(signal?: AbortSignal): Promise<number> {
    if (this.disposed) return Promise.reject(new Error('limiter_closed'));
    if (signal?.aborted) return Promise.reject(new Error('aborted'));
    const now = this.clock.now();
    if (!this.waiters.length && this.nextGrantAt(now) === now) { this.grants.push(now); return Promise.resolve(now); }
    if (this.waiters.length >= LIMITER_QUEUE_MAX) return Promise.reject(new Error('limiter_queue_full'));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { deadline: now + LIMITER_WAIT_MS, resolve, reject, signal, onAbort: () => {
        const i = this.waiters.indexOf(waiter); if (i < 0) return;
        this.waiters.splice(i, 1); signal?.removeEventListener('abort', waiter.onAbort); reject(new Error('aborted')); this.pump();
      } };
      this.waiters.push(waiter); signal?.addEventListener('abort', waiter.onAbort, { once: true }); this.pump();
    });
  }
  private pump(): void {
    if (this.timer !== null) { this.clock.clearTimer(this.timer); this.timer = null; }
    const now = this.clock.now();
    while (this.waiters.length) {
      const waiter = this.waiters[0]!;
      if (now >= waiter.deadline) { this.waiters.shift(); waiter.signal?.removeEventListener('abort', waiter.onAbort); waiter.reject(new Error('limiter_timeout')); continue; }
      if (this.nextGrantAt(now) > now) break;
      this.waiters.shift(); waiter.signal?.removeEventListener('abort', waiter.onAbort); this.grants.push(now); waiter.resolve(now);
    }
    if (this.waiters.length) {
      const wakeAt = Math.min(this.waiters[0]!.deadline, this.nextGrantAt(now));
      this.timer = this.clock.setTimer(() => { this.timer = null; this.pump(); }, Math.max(0, wakeAt - now));
    }
  }
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.clock.clearTimer(this.timer);
    this.timer = null;
    for (const waiter of this.waiters.splice(0)) { waiter.signal?.removeEventListener('abort', waiter.onAbort); waiter.reject(new Error('limiter_closed')); }
  }
}
