import type { GarmentCategory, MeasurementField, Measurements, Unit } from './types.js';
export const REQUIRED_FIELDS: Record<GarmentCategory, readonly MeasurementField[]> = {
  upper_body: ['pit_to_pit', 'length', 'shoulder', 'sleeve'], outer: ['pit_to_pit', 'length', 'shoulder', 'sleeve'],
  full_body: ['pit_to_pit', 'waist', 'length'], lower_body: ['waist', 'rise', 'inseam', 'leg_opening'],
};
export function validMm(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 50 && value <= 2000; }
export function parseMeasurement(text: string, unit: Unit): number | null {
  if (!(unit === 'cm' ? /^\d+(?:\.\d)?$/ : /^\d+(?:\.\d{1,2})?$/).test(text)) return null;
  const n = Number(text);
  if (unit === 'in' && !Number.isInteger(n * 4)) return null;
  const mm = Math.round(n * (unit === 'cm' ? 10 : 25.4));
  return validMm(mm) ? mm : null;
}
export function formatMeasurement(mm: number, unit: Unit, signed = false): string {
  const sign = mm < 0 ? '−' : signed && mm > 0 ? '+' : '';
  const n = Math.abs(mm);
  if (unit === 'cm') return `${sign}${(n / 10).toFixed(1)} cm`;
  const quarters = Math.round(n / 25.4 * 4);
  return `${sign}${Math.floor(quarters / 4)}${['', '¼', '½', '¾'][quarters % 4]} in`;
}
export function measurementProblems(measurements: Measurements): string[] {
  const problems: string[] = [];
  for (const field of REQUIRED_FIELDS[measurements.category]) {
    const v = measurements.valuesMm[field];
    if (!(validMm(v) || field === 'sleeve' && v === 'na')) problems.push(field);
  }
  for (const [field, value] of Object.entries(measurements.valuesMm)) {
    if (!(validMm(value) || field === 'sleeve' && value === 'na') && !problems.includes(field)) problems.push(field);
  }
  if ((measurements.tagSize?.length ?? 0) > 24) problems.push('tagSize');
  return problems;
}
// Client-only comparison values have no persistence or transport path.
export function compareMeasurements(item: Measurements['valuesMm'], yours: Measurements['valuesMm']): Partial<Record<MeasurementField, number>> {
  const differences: Partial<Record<MeasurementField, number>> = {};
  for (const field of Object.keys(item) as MeasurementField[]) {
    const a = item[field], b = yours[field];
    if (validMm(a) && validMm(b)) differences[field] = a - b;
  }
  return differences;
}
