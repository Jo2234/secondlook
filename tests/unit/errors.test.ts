import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ENGINE_ERRORS, mapError } from '../../src/domain/errors.js';
const snapshot = readFileSync('docs/sources/perfectcorp-ai_clothes-openapi-20261019.yaml', 'utf8');
const engineBlock = snapshot.split('    EngineErrorCode:')[1]!.split('      description:')[0]!;
const engineCodes = [...engineBlock.matchAll(/^        - ([a-z_]+)$/gm)].map(m => m[1]!);
const tableCodes = [...snapshot.matchAll(/\| ((?:error_|exceed_|unknown_|invalid_)[a-z_]+) \|/g)].map(m => m[1]!);
test('F21 source snapshot codes have explicit mappings (known unresolved mask codes exposed)', () => {
  expect(engineCodes.length).toBeGreaterThan(10);
  // This assertion deliberately exposes the two unmapped mask codes until the lead dispositions §9.3.
  for (const code of new Set([...engineCodes, ...tableCodes])) expect(ENGINE_ERRORS[code], code).toBeDefined();
});
test('F21 unknown raw code is retained while engine and HTTP mappings preserve guidance', () => {
  expect(mapError({ engineError: 'new_engine_code' })).toMatchObject({ code: 'yc_engine', upstream: { engineError: 'new_engine_code' } });
  expect(mapError({ engineError: 'error_pose' })).toMatchObject({ code: 'yc_error_pose', messageKey: 'pose' });
  const httpBlock = snapshot.split('        error_code:')[1]!.split('    EngineErrorCode:')[0]!;
  for (const code of [...httpBlock.matchAll(/^            - ([A-Za-z]+)$/gm)].map(m => m[1]!)) expect(mapError({ http: 400, errorCode: code }).code).not.toBe('yc_engine');
  expect(mapError({ http: 401 }).code).toBe('auth'); expect(mapError({ http: 429 }).code).toBe('rate_limited');
});
