import fc from 'fast-check';
import { expect, test } from 'vitest';
import { listingText } from '../../src/domain/listing.js';
import { scanProductCopy } from '../../src/shared/banned-phrases.js';
import { COPY } from '../../src/shared/copy.js';
import type { Listing } from '../../src/shared/types.js';
test('F14/F36 deterministic listing template has no unsupported claims for 200 listings (seed 20261019)', () => {
  const sellerText = fc.array(fc.constantFrom('Blue', 'tee', 'cotton', 'small', 'mark', 'used', 'vintage'), { minLength: 1, maxLength: 8 }).map(words => words.join(' '));
  fc.assert(fc.property(sellerText, sellerText, fc.integer({ min: 50, max: 2000 }), fc.boolean(), (title, conditionNotes, mm, preview) => {
    const listing: Listing = { id: 'l'.repeat(20), mode: 'fixture', title, conditionNotes, priceText: null, garmentPhotoIds: ['original'], declaration: null, measurements: { category: 'upper_body', valuesMm: { pit_to_pit: mm }, enteredUnit: 'cm', tagSize: 'M' }, tryOnResultIds: preview ? ['generated'] : [], status: 'draft', createdAt: '', updatedAt: '' };
    const text = listingText(listing);
    expect(scanProductCopy([{ id: 'listing template', text }], COPY.retention)).toEqual([]);
    if (preview) expect(text).toContain(COPY.listing.disclosure);
    // Seller text is not rewritten: its unsupported claims produce the planned lint warning.
    expect(scanProductCopy([{ id: 'listing template mutation', text: listingText({ ...listing, conditionNotes: 'Fits you perfectly.' }) }], COPY.retention).length).toBeGreaterThan(0);
  }), { numRuns: 200, seed: 20261019 });
});
