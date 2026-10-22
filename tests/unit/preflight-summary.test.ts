import { expect, test } from 'vitest';
import { preflightSummary } from '../../src/youcam/preflight-summary.js';
import { YouCamError } from '../../src/youcam/client.js';
import { EnvError } from '../../src/shared/env.js';
import type { PreflightRecord } from '../../src/shared/types.js';
const record: PreflightRecord = { at: '2026-10-23T00:00:00Z', baseUrl: 'https://yce-api-01.makeupar.com', fenceSeq: 0, featureCost: { status: 'ok', costPerTaskCu: 125, matched: [{ description: 'Cloth v4', amount: 1.25, unit: 'result_image', proc_unit: 1, run_task_url: 'https://yce-api-01.makeupar.com/s2s/v2.0/task/cloth-v4' }] }, balanceCu: 10000, ok: true, problems: [] };
test('preflight summary formats units and omits endpoint URLs', () => {
  const result = preflightSummary(record);
  expect(result.exitCode).toBe(0);
  expect(result.text).toContain('1.25 units'); expect(result.text).toContain('100.00 units'); expect(result.text).toContain('Cloth v4'); expect(result.text).toContain('No task was created; 0 units spent.'); expect(result.text).not.toContain('https://');
});
test('preflight exit codes cover environment, auth, transport, cost and policy failures', () => {
  for (const [error, code] of [[new EnvError('secret'), 2], [new YouCamError('http', { http: 401 }), 4], [new YouCamError('http', { http: 403 }), 4], [new YouCamError('transport'), 5], [new YouCamError('timeout'), 5], [new YouCamError('policy'), 9]] as const) expect(preflightSummary(error).exitCode).toBe(code);
  for (const [status, code] of [['cost_unknown', 6], ['cost_ambiguous', 7], ['cost_invalid', 8]] as const) expect(preflightSummary({ ...record, ok: false, featureCost: { ...record.featureCost, status, costPerTaskCu: null } }).exitCode).toBe(code);
  expect(preflightSummary(new EnvError('secret')).text).not.toContain('secret');
});
