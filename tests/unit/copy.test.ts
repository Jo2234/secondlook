import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { COPY, UI_COPY, RETENTION_SHA256 } from '../../src/shared/copy.js';
import { findBannedPhrases, scanProductCopy, type ProductCopySource } from '../../src/shared/banned-phrases.js';
function strings(x: unknown): string[] { return typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : []; }
// Only product documents are scanned: source snapshots and review history stay intact.
const productDocuments = ['README.md', 'docs/submission-draft.md', 'docs/demo-script.md'];
const pendingDocuments = productDocuments.filter(path => !existsSync(path));
function productSources(): ProductCopySource[] {
  return [
    { id: 'COPY values', text: strings(COPY).join('\n') },
    { id: 'copy.ts', text: readFileSync('src/shared/copy.ts', 'utf8') },
    ...productDocuments.filter(existsSync).map(path => ({ id: path, text: readFileSync(path, 'utf8') })),
  ];
}
test('F14/F36 every implemented product copy source passes; final artifacts remain pending', () => {
  expect(scanProductCopy(productSources(), COPY.retention)).toEqual([]);
  expect(productSources().some(s => s.id === 'README.md')).toBe(true);
  // All three product documents now exist and are scanned; rendered UI states are covered by e2e.
  expect(pendingDocuments).toEqual([]);
});
test('F36 mutation of each implemented source is detected, including every product document', () => {
  const sources = productSources();
  for (const target of sources) {
    const mutated = sources.map(source => source.id === target.id ? { ...source, text: source.text + '\nPhotos are kept for 30 days.' } : source);
    expect(scanProductCopy(mutated, COPY.retention).map(issue => issue.source)).toContain(target.id);
    const claim = sources.map(source => source.id === target.id ? { ...source, text: source.text + '\nFits you perfectly.' } : source);
    expect(scanProductCopy(claim, COPY.retention).map(issue => issue.source)).toContain(target.id);
  }
});
test('F36 vendor and local statements must appear together in each product source', () => {
  for (const text of [COPY.retention.local, COPY.retention.vendor]) expect(scanProductCopy([{ id: 'unpaired', text }], COPY.retention)).toEqual([{ source: 'unpaired', issues: ['retention_statements_must_be_paired'] }]);
  for (const source of productSources()) {
    if (source.text.includes(COPY.retention.local) && source.text.includes(COPY.retention.vendor)) {
      expect(scanProductCopy([{ ...source, text: source.text.split(COPY.retention.local).join('') }], COPY.retention).some(x => x.source === source.id && x.issues.includes('retention_statements_must_be_paired'))).toBe(true);
    }
  }
});
test('F14 catches adversarial claims', () => {
  for (const text of ['accurate', 'fits you', 'true-to-size', 'deleted everywhere', 'always completely removes', 'immediately deleted']) expect(findBannedPhrases(text).length).toBeGreaterThan(0);
});
test('F36 frozen retention text hashes match plan paragraphs', () => {
  const plan = readFileSync('docs/implementation-plan.md', 'utf8').split('## 13.')[1]!.split('## 14.')[0]!;
  for (const key of ['local', 'vendor'] as const) {
    const frozen = plan.match(new RegExp('`COPY.retention.' + key + '` = "([^"\n]+)"'))?.[1];
    expect(COPY.retention[key]).toBe(frozen);
    expect(createHash('sha256').update(COPY.retention[key]).digest('hex')).toBe(RETENTION_SHA256[key]);
  }
});

test('live and fixture studio copy passes the product claim lint', () => {
  expect(findBannedPhrases(strings(UI_COPY).join('\n'))).toEqual([]);
  expect(UI_COPY.fixtureOnly).toBe('This seller studio is in demo mode. Results are placeholders, not YouCam results. Live generation is not enabled.');
  expect(UI_COPY.liveBanner).toContain('spends real YouCam units');
  expect(UI_COPY.checkLive).toBe('Check YouCam cost & balance (0 units)');
  expect(UI_COPY.liveUnknown).toContain('Units may have been spent');
});
