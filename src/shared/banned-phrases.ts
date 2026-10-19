// Scan product copy, never source-code identifiers. Vendor attribution is allowed verbatim.
export const BANNED_PHRASES: readonly RegExp[] = [
  /\b(perfect|true|exact|accurate|guaranteed)[- ](fit|size|sizing)\b/gi,
  /\bfits? (you|like|perfectly|true)\b/gi,
  /\btrue[- ]to[- ](size|life)\b/gi,
  /\b(exact|accurate|faithful|identical|photoreal\w*)\b/gi,
  /\bwhat you see is what you get\b/gi,
  /\b(deleted|erased) (everywhere|permanently|immediately)\b/gi,
  /\bno (one|body) (keeps|stores)\b/gi,
  /\b(guarantee[sd]?|always|permanently|completely)\b.{0,40}\b(delet|remov|eras)/gi,
  /\bimmediately (deleted|removed|erased)\b/gi,
];
export function findBannedPhrases(text: string, allowed: readonly string[] = []): string[] {
  const remaining = allowed.reduce((s, quote) => s.split(quote).join(''), text);
  return BANNED_PHRASES.flatMap(pattern => [...remaining.matchAll(new RegExp(pattern.source, pattern.flags))].map(m => m[0]));
}
export function findRetentionMentions(text: string, vendorQuote: string): string[] {
  return [...text.split(vendorQuote).join('').matchAll(/\b30(?: days|-day)\b/gi)].map(m => m[0]);
}

export interface ProductCopySource { id: string; text: string }
export function scanProductCopy(sources: readonly ProductCopySource[], retention: { local: string; vendor: string }): { source: string; issues: string[] }[] {
  return sources.flatMap(({ id, text }) => {
    const issues = [...findBannedPhrases(text, [retention.vendor]), ...findRetentionMentions(text, retention.vendor)];
    if (text.includes(retention.local) !== text.includes(retention.vendor)) issues.push('retention_statements_must_be_paired');
    return issues.length ? [{ source: id, issues }] : [];
  });
}
