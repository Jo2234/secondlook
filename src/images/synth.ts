import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
sharp.concurrency(1);
sharp.cache(false);
export const SYNTH_VERSION = 'synth1-2026-10-19';
export type SyntheticKind = 'model-front' | 'tee' | 'jacket' | 'dress' | 'trousers';
export const SYNTHETIC_KINDS: readonly SyntheticKind[] = ['model-front', 'tee', 'jacket', 'dress', 'trousers'];
// Procedural shapes only; no real person's likeness and no external resources.
export function syntheticSvg(kind: SyntheticKind): string {
  const garment = {
    tee: '<path d="M280 200 L360 170 Q384 210 408 170 L488 200 L570 350 L500 390 L468 320 L468 690 L300 690 L300 320 L268 390 L198 350 Z"/>',
    jacket: '<path d="M280 180 L350 160 L384 230 L418 160 L488 180 L560 680 L475 690 L450 350 L450 700 L318 700 L318 350 L293 690 L208 680 Z"/><path d="M384 230 V700" stroke="#f0bc66" stroke-width="12"/>',
    dress: '<path d="M300 170 L350 150 Q384 190 418 150 L468 170 L440 400 L540 880 L228 880 L328 400 Z"/>',
    trousers: '<path d="M260 180 L508 180 L520 450 L490 880 L390 880 L384 480 L378 880 L278 880 L248 450 Z"/><path d="M270 230 H500" stroke="#a3b2ca" stroke-width="12"/>',
    'model-front': '<g fill="#c1b5a8" stroke="#75695e" stroke-width="4"><ellipse cx="384" cy="100" rx="48" ry="65"/><path d="M360 156 L408 156 L414 190 L470 205 L500 440 L462 450 L438 300 L440 500 L430 680 L425 945 L375 945 L370 680 L368 560 L362 680 L352 945 L302 945 L308 680 L320 500 L328 300 L304 450 L266 440 L296 205 L354 190 Z"/></g><path d="M348 105 H420 M384 80 V135" stroke="#75695e" stroke-width="3"/>',
  }[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024"><defs><pattern id="weave" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#54759c"/><path d="M0 0 L12 12 M-6 6 L6 18 M6 -6 L18 6" stroke="#b0c1d6" stroke-width="3"/></pattern></defs><rect width="768" height="1024" fill="#b6b4af"/><g fill="url(#weave)" stroke="#37495f" stroke-width="5">${garment}</g><rect x="18" y="966" width="250" height="44" rx="4" fill="#354252"/><text x="36" y="998" font-family="sans-serif" font-size="30" font-weight="bold" fill="#f4e7a7">DEMO</text></svg>`;
}
export async function renderSynthetic(kind: SyntheticKind): Promise<Buffer> {
  return sharp(Buffer.from(syntheticSvg(kind))).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
}
export async function writeSyntheticFixtures(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const sums: string[] = [];
  for (const kind of SYNTHETIC_KINDS) {
    const bytes = await renderSynthetic(kind);
    const name = `${kind}.png`;
    await writeFile(join(directory, name), bytes);
    sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  }
  const manifest = sums.join('\n') + '\n';
  await writeFile(join(directory, 'SHA256SUMS'), manifest);
  return manifest;
}
// Caller owns cleanup. Use a directory under gitignored data/tmp, never assets/demo.
export async function writeCalibrationVariants(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const base = await renderSynthetic('tee');
  for (const sigma of [0, 1, 2, 4, 8]) {
    const pipeline = sharp(base);
    await (sigma === 0 ? pipeline : pipeline.blur(sigma)).png().toFile(join(directory, `blur-${sigma}.png`));
  }
  for (const scale of [0.2, 0.5, 1, 1.5, 3]) await sharp(base).linear(scale, 0).png().toFile(join(directory, `exposure-${scale}.png`));
}
