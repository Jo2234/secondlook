import type { PreflightRecord } from '../shared/types.js';
import { EnvError } from '../shared/env.js';
import { YouCamError } from './client.js';
export function preflightSummary(result: PreflightRecord | EnvError | YouCamError): { exitCode: number; text: string } {
  const tail = 'No task was created; 0 units spent.';
  if (result instanceof EnvError) return { exitCode: 2, text: `Environment error. ${tail}` };
  if (result instanceof YouCamError) {
    const reason = result.http === 401 || result.http === 403 ? 'auth' : result.kind;
    return { exitCode: reason === 'auth' ? 4 : reason === 'policy' ? 9 : 5, text: `Preflight failed: ${reason}. ${tail}` };
  }
  const status = result.featureCost.status, units = (cu: number | null) => cu === null ? 'unknown' : (cu / 100).toFixed(2);
  // Descriptions are untrusted vendor text; omit URL-like and control tokens.
  const description = result.featureCost.matched.map(s => s.description.replace(/https?:\/\/\S+|[\x00-\x1f\x7f]/g, ' ').slice(0, 200)).join(', ') || 'none';
  return { exitCode: status === 'ok' ? result.ok ? 0 : 5 : { cost_unknown: 6, cost_ambiguous: 7, cost_invalid: 8 }[status], text: `Feature-cost: ${status}\nCost per cloth-v4 task: ${units(result.featureCost.costPerTaskCu)} units\nMatched SKU: ${description}\nBalance: ${units(result.balanceCu)} units\n${tail}` };
}
