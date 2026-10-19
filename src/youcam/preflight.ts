import type { PreflightRecord } from '../shared/types.js';
import { API_HOSTS } from './net-policy.js';
export const CLOTH_V4_PATH = '/s2s/v2.0/task/cloth-v4';
type Sku = PreflightRecord['featureCost']['matched'][number];
export function bindClothV4Cost(skus: readonly Sku[], apiHost: string): PreflightRecord['featureCost'] {
  const matched = skus.filter(sku => {
    try { const u = new URL(sku.run_task_url); return API_HOSTS.includes(apiHost) && u.protocol === 'https:' && u.hostname === apiHost && !u.username && !u.password && !u.port && u.pathname === CLOTH_V4_PATH && !u.search && !u.hash; }
    catch { return false; }
  });
  const result = (status: PreflightRecord['featureCost']['status'], costPerTaskCu: number | null = null) => ({ matched, costPerTaskCu, status });
  if (!matched.length) return result('cost_unknown');
  if (matched.length !== 1) return result('cost_ambiguous');
  const s = matched[0]!;
  if (typeof s.amount !== 'number' || !Number.isFinite(s.amount) || s.amount < 0 || s.amount > 1000 || Math.abs(Math.round(s.amount * 100) - s.amount * 100) > 1e-9 || s.unit !== 'result_image' || !Number.isInteger(s.proc_unit) || s.proc_unit < 1 || s.proc_unit > 1000) return result('cost_invalid');
  return result('ok', Math.round(s.amount * 100));
}
