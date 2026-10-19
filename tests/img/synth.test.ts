// G-img-0 required. This file is excluded from the pure config.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'vitest';
import { SYNTHETIC_KINDS, syntheticSvg, writeSyntheticFixtures } from '../../src/images/synth.js';
test('synthetic fixtures are byte-stable across two generations with visible DEMO plate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'secondlook-synth-'));
  try {
    const a = join(dir, 'a'), b = join(dir, 'b');
    expect(await writeSyntheticFixtures(a)).toBe(await writeSyntheticFixtures(b));
    for (const kind of SYNTHETIC_KINDS) {
      expect(syntheticSvg(kind)).toContain('>DEMO</text>');
      const bytes = await readFile(join(a, `${kind}.png`));
      expect(bytes.equals(await readFile(join(b, `${kind}.png`)))).toBe(true);
      expect(await sharp(bytes).metadata()).toMatchObject({ format: 'png', width: 768, height: 1024 });
      const platePixels = await sharp(bytes).extract({ left: 18, top: 966, width: 250, height: 44 }).png().toBuffer();
      const plate = await sharp(platePixels).stats();
      expect(plate.channels[0]!.stdev).toBeGreaterThan(10);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
