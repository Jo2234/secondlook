import type { YouCamClient } from './client.js';
import { YouCamError } from './client.js';
import type { PreflightRecord } from '../shared/types.js';
import { bindClothV4Cost } from './preflight.js';
import { bounded, systemClock } from './operations.js';
import type { Clock } from './operations.js';
import { PREFLIGHT_DEADLINE_MS } from './limits.js';
export async function collectPreflight(input: { client: YouCamClient; signal: AbortSignal; fenceSeq: number; baseUrl: string; clock?: Clock }): Promise<PreflightRecord> {
  const clock = input.clock ?? systemClock;
  const at = new Date(clock.now()).toISOString();
  if (input.client.mode === 'fixture') return { at, baseUrl: input.baseUrl, fenceSeq: input.fenceSeq, featureCost: { matched: [], costPerTaskCu: 0, status: 'ok' }, balanceCu: 0, ok: true, problems: [] };
  return bounded(input.signal, PREFLIGHT_DEADLINE_MS, async signal => {
    try {
      const skus = await input.client.featureCost({ signal });
      const featureCost = bindClothV4Cost(skus, new URL(input.baseUrl).hostname);
      const balanceCu = await input.client.creditBalance({ signal });
      return { at, baseUrl: input.baseUrl, fenceSeq: input.fenceSeq, featureCost, balanceCu, ok: featureCost.status === 'ok', problems: featureCost.status === 'ok' ? [] : [featureCost.status] };
    } catch (error) {
      if (error instanceof YouCamError && error.errorCode === 'cost_ambiguous') return { at, baseUrl: input.baseUrl, fenceSeq: input.fenceSeq, featureCost: { matched: [], costPerTaskCu: null, status: 'cost_ambiguous' }, balanceCu: null, ok: false, problems: ['cost_ambiguous'] };
      throw error;
    }
  }, clock);
}
