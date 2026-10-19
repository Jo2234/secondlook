import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { COPY, RETENTION_SHA256 } from '../../src/shared/copy.js';
import { findBannedPhrases, findRetentionMentions } from '../../src/shared/banned-phrases.js';
function strings(x: unknown): string[] { return typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : []; }
test('F14 product copy and README avoid unsupported claims', () => {
  for (const text of [...strings(COPY), readFileSync('src/shared/copy.ts', 'utf8'), readFileSync('README.md', 'utf8')]) {
    expect(findBannedPhrases(text, [COPY.retention.vendor])).toEqual([]);
    expect(findRetentionMentions(text, COPY.retention.vendor)).toEqual([]);
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
