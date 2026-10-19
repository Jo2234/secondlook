import { expect, test } from 'vitest';
import { EnvError, parseEnv } from '../../src/shared/env.js';
test('fixture is the keyless default; empty .env.example values use defaults', () => {
  expect(parseEnv({ YOUCAM_MODE: '', PORT: '' })).toMatchObject({ mode: 'fixture', buyerUpload: 'disabled', port: 5194, budgetCu: 12000, apiKey: null });
});
test('F16 pure live parsing fails closed without exposing values', () => {
  expect(() => parseEnv({ YOUCAM_MODE: 'live' })).toThrow('YOUCAM_MODE=live but YOUCAM_API_KEY is not set');
  try { parseEnv({ YOUCAM_MODE: 'live' }); } catch (e) { expect((e as EnvError).exitCode).toBe(2); }
});
test('F12 enabled without a disposition stays disabled', () => {
  expect(parseEnv({ BUYER_UPLOAD: 'enabled' })).toMatchObject({ buyerUpload: 'disabled', buyerUploadRefused: true });
  expect(parseEnv({ BUYER_UPLOAD: 'enabled' }, 'decision: enable-buyer-upload\n').buyerUpload).toBe('enabled');
  expect(parseEnv({ BUYER_UPLOAD: 'enabled' }, 'not-decision: enable-buyer-upload').buyerUpload).toBe('disabled');
});
test('budget, deadline, ports and API host enforce frozen bounds', () => {
  for (const raw of [{ YOUCAM_UNIT_BUDGET: '401' }, { YOUCAM_TASK_DEADLINE_MS: '59999' }, { PORT: '0' }, { YOUCAM_BASE_URL: 'https://evil.example' }, { YOUCAM_BASE_URL: 'http://127.0.0.1:5194', NODE_ENV: 'test', YOUCAM_TEST_LOOPBACK: '1' }]) expect(() => parseEnv(raw)).toThrow(EnvError);
});
