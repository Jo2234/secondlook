# F33 source preparation

Base tested source: `936770da4d4c155418b327d3829e901b9638d880`. Assets-only checkpoint: `fbb9fed5d81f96ee60362c3a1c748e5fbe923c9e`. The new `tests/img/decode-bounds.test.ts` is unrun and needs a fresh exact image grant. No production image source or bounds changed; no production failure is claimed.

The test streams 20,000 copies of one 2,501-byte scanline through zlib into a capped compressed buffer. It creates a complete non-interlaced grayscale 1-bit PNG (20,000×20,000), valid CRCs, IHDR/IDAT/IEND, without allocating/rendering a 400-million-pixel raster. A separate complete two-frame APNG and SVG named `.jpg` exercise format refusal.

The test records root-process PID, monotonic elapsed nanoseconds, current RSS before generation, root high-water RSS before/after, input byte count and high-water-minus-initial-RSS increase. Measurement is emitted in `finally`, before rejection assertions; the bound is strictly below 200,000,000 bytes. Vitest must use its single thread worker in the same process. This is root-only measurement, not descendant/global native-memory proof. The native adapter is real and unmocked. The independent pre-native sniffer and normalization must both reject the oversized PNG. No Sharp rendering, PNG generation or native test has executed in this source task.
