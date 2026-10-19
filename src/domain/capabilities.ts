import type { CapabilityRow, CapabilityStatus, GarmentCategory, Mode, PhotoType } from '../shared/types.js';
export const INPUT_SPEC_CITATION = 'https://docs.perfectcorp.com/reference/ai_clothes.md';
export const PHOTO_TYPES: readonly PhotoType[] = ['hanger', 'mannequin', 'flatlay', 'worn'];
export const CATEGORIES: readonly GarmentCategory[] = ['upper_body', 'outer', 'full_body', 'lower_body'];
export const BASE_CAPABILITIES: readonly CapabilityRow[] = PHOTO_TYPES.flatMap(photoType => CATEGORIES.map(category => ({ photoType, category,
  status: (category === 'lower_body' && photoType !== 'worn' ? 'documented_unsupported' : photoType === 'flatlay' ? 'unverified' : 'documented') as CapabilityStatus,
  citation: INPUT_SPEC_CITATION,
})));
export function capability(photoType: PhotoType, category: GarmentCategory, overrides: readonly CapabilityRow[] = []): CapabilityRow {
  const base = BASE_CAPABILITIES.find(row => row.photoType === photoType && row.category === category)!;
  if (base.status === 'documented_unsupported') return { ...base };
  const matches = overrides.filter(row => row.photoType === photoType && row.category === category);
  // Conflicting evidence fails closed; only probe outcomes can override a supported cell.
  const override = matches.find(row => row.status === 'live_failed') ?? matches.find(row => row.status === 'live_ok');
  return { ...(override ?? base) };
}
export function capabilityAllows(row: CapabilityRow, mode: Mode, probe = false): boolean {
  return row.status === 'documented' || row.status === 'live_ok' || row.status === 'unverified' && (mode === 'fixture' || probe);
}
export function garmentRightsAllow(photoType: PhotoType, mode: Mode, manifestConsent: boolean): boolean {
  return photoType !== 'worn' || mode === 'fixture' || manifestConsent;
}
