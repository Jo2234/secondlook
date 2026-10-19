import { expect, test } from 'vitest';
import { galleryOrder, readiness, validateOriginalIds } from '../../src/domain/listing.js';
import type { GeneratedImage, Listing, QualityReport } from '../../src/shared/types.js';
const listing: Listing = { id: 'l'.repeat(20), mode: 'fixture', title: 'Tee', conditionNotes: '', priceText: null, garmentPhotoIds: ['original'], declaration: { photoType: 'hanger', category: 'upper_body', singleGarment: true, frontFacing: true, notComposite: true, fullyVisible: true, noPeopleInPhoto: true }, measurements: { category: 'upper_body', valuesMm: { pit_to_pit: 520, length: 680, shoulder: 450, sleeve: 'na' }, enteredUnit: 'cm', tagSize: null }, tryOnResultIds: [], status: 'draft', createdAt: '', updatedAt: '' };
const reports = { original: { verdict: 'pass', spendAllowed: true } as QualityReport };
test('A2 ready does not require a try-on result and rejects missing quality', () => {
  expect(readiness(listing, reports).ready).toBe(true); expect(readiness(listing, {}).ready).toBe(false);
});
test('F13 originals precede separate previews and generated ids cannot be cover', () => {
  const generated = [{ id: 'ai1' }, { id: 'ai2' }] as GeneratedImage[];
  expect(galleryOrder({ garmentPhotoIds: ['ai1', 'original'], tryOnResultIds: ['ai1', 'ai2'] }, generated)).toEqual({ originals: ['original'], previews: ['ai1', 'ai2'] });
  expect(validateOriginalIds(['ai1'], new Set(['ai1', 'ai2']))).toBe(false);
  expect(readiness({ ...listing, garmentPhotoIds: ['ai1'] }, reports, new Set(['ai1'])).missing).toContain('generated_image_not_cover');
});
