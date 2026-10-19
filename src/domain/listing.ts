import type { GeneratedImage, Listing, ListingReadiness, QualityReport } from '../shared/types.js';
import { measurementProblems } from '../shared/measurements.js';
import { COPY } from '../shared/copy.js';
export function readiness(listing: Listing, reports: Readonly<Record<string, QualityReport | undefined>>, generatedIds: ReadonlySet<string> = new Set()): ListingReadiness {
  const missing: string[] = [];
  if (!listing.title.trim()) missing.push('title');
  if (!listing.declaration) missing.push('declaration');
  if (!listing.measurements || listing.measurements.category !== listing.declaration?.category || measurementProblems(listing.measurements).length) missing.push('measurements');
  if (!listing.garmentPhotoIds.some(id => !generatedIds.has(id) && reports[id]?.verdict !== 'fail' && reports[id]?.spendAllowed === true)) missing.push('garment_photo');
  if (listing.garmentPhotoIds.some(id => generatedIds.has(id))) missing.push('generated_image_not_cover');
  return { ready: missing.length === 0, missing };
}
export function validateOriginalIds(ids: readonly string[], generatedIds: ReadonlySet<string>): boolean { return ids.every(id => !generatedIds.has(id)); }
export function galleryOrder(listing: Pick<Listing, 'garmentPhotoIds' | 'tryOnResultIds'>, generated: readonly GeneratedImage[]) {
  const generatedIds = new Set(generated.map(image => image.id));
  return { originals: listing.garmentPhotoIds.filter(id => !generatedIds.has(id)), previews: listing.tryOnResultIds.filter(id => generatedIds.has(id)) };
}
export function listingText(listing: Listing): string {
  return [listing.title, listing.measurements?.tagSize ? COPY.listing.tagSize.replace('{size}', listing.measurements.tagSize) : '',
    listing.measurements ? Object.entries(listing.measurements.valuesMm).map(([field, mm]) => `${field}: ${mm === 'na' ? 'N/A' : `${(mm ?? 0) / 10} cm`}`).join('\n') : '',
    listing.conditionNotes, listing.tryOnResultIds.length ? COPY.listing.disclosure : ''].filter(Boolean).join('\n\n');
}
