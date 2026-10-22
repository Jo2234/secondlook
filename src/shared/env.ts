import type { Mode } from './types.js';
import { DEFAULT_BUDGET_UNITS, MAX_BUDGET_UNITS, DEFAULT_TASK_DEADLINE_MS, MIN_TASK_DEADLINE_MS, MAX_TASK_DEADLINE_MS } from '../youcam/limits.js';
export class EnvError extends Error { constructor(message: string, public readonly exitCode = 2) { super(message); } }
export interface AppEnv { mode: Mode; apiKey: string | null; baseUrl: string; budgetCu: number; taskDeadlineMs: number; buyerUpload: 'disabled' | 'enabled'; buyerUploadRefused: boolean; dataDir: string; rightsManifest?: string; port: number; vitePort: number }
function integer(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) throw new EnvError(`Invalid ${name}`);
  return n;
}
// Pure parsing: the I/O wrapper supplies disposition text; this module never reads files.
export function parseEnv(raw: Readonly<Record<string, string | undefined>>, disposition = ''): AppEnv {
  const mode = raw.YOUCAM_MODE || 'fixture';
  if (mode !== 'fixture' && mode !== 'live') throw new EnvError('Invalid YOUCAM_MODE');
  const apiKey = raw.YOUCAM_API_KEY?.trim() || null;
  if (mode === 'live' && !apiKey) throw new EnvError('YOUCAM_MODE=live but YOUCAM_API_KEY is not set');
  const baseUrl = raw.YOUCAM_BASE_URL || 'https://yce-api-01.makeupar.com';
  let u: URL;
  try { u = new URL(baseUrl); } catch { throw new EnvError('Invalid YOUCAM_BASE_URL'); }
  // Production parser never accepts the loopback transport-test exception.
  if (u.protocol !== 'https:' || u.hostname !== 'yce-api-01.makeupar.com' || u.port || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new EnvError('Invalid YOUCAM_BASE_URL');
  const buyer = raw.BUYER_UPLOAD || 'disabled';
  if (buyer !== 'enabled' && buyer !== 'disabled') throw new EnvError('Invalid BUYER_UPLOAD');
  const dispositioned = disposition.split(/\r?\n/).includes('decision: enable-buyer-upload');
  return { mode, apiKey, baseUrl: u.origin, budgetCu: integer(raw.YOUCAM_UNIT_BUDGET, DEFAULT_BUDGET_UNITS, 0, MAX_BUDGET_UNITS, 'YOUCAM_UNIT_BUDGET') * 100,
    taskDeadlineMs: integer(raw.YOUCAM_TASK_DEADLINE_MS, DEFAULT_TASK_DEADLINE_MS, MIN_TASK_DEADLINE_MS, MAX_TASK_DEADLINE_MS, 'YOUCAM_TASK_DEADLINE_MS'),
    buyerUpload: buyer === 'enabled' && dispositioned ? 'enabled' : 'disabled', buyerUploadRefused: buyer === 'enabled' && !dispositioned,
    dataDir: raw.DATA_DIR || (mode === 'live' ? './data-live' : './data'), rightsManifest: raw.YOUCAM_RIGHTS_MANIFEST || undefined, port: integer(raw.PORT, 5194, 1, 65535, 'PORT'), vitePort: integer(raw.VITE_PORT, 5195, 1, 65535, 'VITE_PORT') };
}
