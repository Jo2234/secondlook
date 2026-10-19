import fc from 'fast-check';
import { expect, test } from 'vitest';
import { SlidingLogLimiter, type LimiterClock } from '../../src/youcam/rate-limiter.js';
class Clock implements LimiterClock {
  time = 0; serial = 0; timers = new Map<number, { at: number; callback: () => void }>();
  now() { return this.time; }
  setTimer(callback: () => void, delayMs: number) { const id = ++this.serial; this.timers.set(id, { at: this.time + delayMs, callback }); return id; }
  clearTimer(handle: unknown) { this.timers.delete(handle as number); }
  advance(ms: number) { const target = this.time + ms; for (;;) { const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > target) break; this.time = next[1].at; this.timers.delete(next[0]); next[1].callback(); } this.time = target; }
}
test('F20 600 requests obey both sliding windows (200 runs, seed 20261019)', async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 400000 }), { minLength: 20, maxLength: 20 }), async gaps => {
    const clock = new Clock(), limiter = new SlidingLogLimiter(clock), granted: number[] = [];
    for (const gap of gaps) {
      clock.advance(gap);
      const pending = Array.from({ length: 30 }, () => limiter.acquire().then(t => { granted.push(t); }, e => { expect(e.message).toBe('limiter_timeout'); }));
      clock.advance(30000); await Promise.all(pending);
    }
    let shortStart = 0, longStart = 0;
    for (let i = 0; i < granted.length; i++) {
      const t = granted[i]!;
      while (granted[shortStart]! <= t - 1000) shortStart++;
      while (granted[longStart]! <= t - 300000) longStart++;
      expect(i - shortStart + 1).toBeLessThanOrEqual(3); expect(i - longStart + 1).toBeLessThanOrEqual(200);
    }
    limiter.dispose(); expect(clock.timers.size).toBe(0);
  }), { numRuns: 200, seed: 20261019 });
});
test('F20 bounded queue wait timeout and abort cleanup', async () => {
  const clock = new Clock(), limiter = new SlidingLogLimiter(clock);
  // Exhaust the long window in fake time while respecting the short window.
  for (let i = 0; i < 200; i++) { if (i && i % 3 === 0) clock.advance(1000); await limiter.acquire(); }
  const pending = Array.from({ length: 32 }, () => limiter.acquire().catch(e => e.message as string));
  await expect(limiter.acquire()).rejects.toThrow('limiter_queue_full');
  clock.advance(30000); expect(await Promise.all(pending)).toEqual(Array(32).fill('limiter_timeout'));
  const controller = new AbortController(); const abort = limiter.acquire(controller.signal); controller.abort(); await expect(abort).rejects.toThrow('aborted');
  expect(limiter.queueSize).toBe(0); expect(clock.timers.size).toBe(0); limiter.dispose();
});
