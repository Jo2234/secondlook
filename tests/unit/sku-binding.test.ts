import { expect, test } from 'vitest';
import { bindClothV4Cost } from '../../src/youcam/preflight.js';
const host = 'yce-api-01.makeupar.com';
const sku = { description: 'cloth-v4', amount: 2, unit: 'result_image', proc_unit: 1, run_task_url: `https://${host}/s2s/v2.0/task/cloth-v4` };
test('F30 exact SKU binding rejects deceptive origins paths query and duplicate matches', () => {
  for (const run_task_url of ['https://evil.example/s2s/v2.0/task/cloth-v4', `https://${host}.evil.com/s2s/v2.0/task/cloth-v4`, `http://${host}/s2s/v2.0/task/cloth-v4`, sku.run_task_url + '/', sku.run_task_url + '?x=1', sku.run_task_url + '#x', sku.run_task_url.replace('v4', 'v3'), `https://user@${host}/s2s/v2.0/task/cloth-v4`]) expect(bindClothV4Cost([{ ...sku, run_task_url }], host).status).toBe('cost_unknown');
  expect(bindClothV4Cost([sku, sku], host).status).toBe('cost_ambiguous');
  expect(bindClothV4Cost([sku], host)).toMatchObject({ status: 'ok', costPerTaskCu: 200 });
});
test('F30 invalid prices and charge dimensions block spending', () => {
  for (const amount of [NaN, -1, 1.234, '2', 1e9, Infinity]) expect(bindClothV4Cost([{ ...sku, amount: amount as number }], host).status).toBe('cost_invalid');
  for (const patch of [{ unit: 'second' }, { proc_unit: 0 }, { proc_unit: 1.5 }, { proc_unit: 1001 }]) expect(bindClothV4Cost([{ ...sku, ...patch }], host).status).toBe('cost_invalid');
});
