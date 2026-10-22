import { COPY } from '../shared/copy.js';

/** Dimensions must come from the original upload, never the normalized image. */
export function formatGuidance(key: keyof typeof COPY.quality, vars: Record<string, string | number | undefined> = {}): string {
  const template = COPY.quality[key];
  if (key === 'max_dimensions_normalized' && (vars.width === undefined || vars.height === undefined)) {
    return "Resized to fit YouCam's limits.";
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));
}

/** Display only: retain the original values for quality decisions. */
export function formatMeasured(value: number | string | null): string {
  return value === null ? '—' : typeof value === 'number'
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value;
}
