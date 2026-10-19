import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ENGINE_ERRORS, HTTP_ERRORS, mapError } from '../../src/domain/errors.js';
import type { UserError } from '../../src/shared/types.js';
import { createAttempt, step } from '../../src/domain/job-machine.js';
type Expected = readonly [code: string, messageKey: UserError['messageKey'], retryable: UserError['retryable']];
// Test-owned normative expectations: do not derive these from production table values.
const expectedEngine: Record<string, Expected> = {
  error_pose: ['yc_error_pose', 'pose', 'user_confirm'],
  error_invalid_src: ['yc_invalid_src', 'source', 'user_confirm'],
  error_invalid_ref: ['yc_invalid_ref', 'reference', 'user_confirm'],
  error_apply_region_mismatch: ['yc_region_mismatch', 'region', 'user_confirm'],
  error_multi_person: ['yc_multi_person', 'people', 'user_confirm'],
  error_multiple_people: ['yc_multi_person', 'people', 'user_confirm'],
  exceed_max_filesize: ['yc_size', 'size', 'no'],
  error_exceed_max_image_size: ['yc_size', 'size', 'no'],
  error_below_min_image_size: ['yc_size', 'size', 'no'],
  error_download_image: ['yc_io', 'retry', 'user_confirm'],
  error_decode_image: ['yc_io', 'retry', 'user_confirm'],
  error_download_mask: ['yc_io', 'retry', 'user_confirm'],
  error_decode_mask: ['yc_io', 'retry', 'user_confirm'],
  error_upload: ['yc_io', 'retry', 'user_confirm'],
  error_no_face: ['yc_face_or_shoulder', 'face', 'user_confirm'],
  error_face_parsing: ['yc_face_or_shoulder', 'face', 'user_confirm'],
  error_large_face_angle: ['yc_face_or_shoulder', 'face', 'user_confirm'],
  error_no_shoulder: ['yc_face_or_shoulder', 'face', 'user_confirm'],
  error_nsfw_content_detected: ['yc_declined', 'declined', 'no'],
  exceed_nsfw_retry_limits: ['yc_declined', 'declined', 'no'],
  error_editing_failed: ['yc_no_change', 'noChange', 'user_confirm'],
  error_unsupport_ratio: ['yc_ratio', 'ratio', 'user_confirm'],
  error_inference: ['yc_engine', 'generic', 'user_confirm'],
  unknown_internal_error: ['yc_engine', 'generic', 'user_confirm'],
  invalid_parameter: ['yc_engine', 'generic', 'user_confirm'],
  error_download_video: ['yc_engine', 'generic', 'user_confirm'],
  error_decode_video: ['yc_engine', 'generic', 'user_confirm'],
  error_hair_too_short: ['yc_engine', 'generic', 'user_confirm'],
  error_unexpected_video_duration: ['yc_engine', 'generic', 'user_confirm'],
  error_bald_image: ['yc_engine', 'generic', 'user_confirm'],
};
const expectedHttp: Record<string, Expected> = {
  CreditInsufficiency: ['no_units', 'units', 'no'],
  InvalidParameters: ['bad_request', 'bug', 'no'], BadRequest: ['bad_request', 'bug', 'no'],
  InvalidStyleGroup: ['bad_request', 'bug', 'no'], InvalidStyle: ['bad_request', 'bug', 'no'],
  InvalidAccessToken: ['auth', 'key', 'no'], InvalidTaskId: ['task_missing', 'retry', 'user_confirm'], TaskTimeout: ['deadline', 'later', 'user_confirm'],
};
const snapshot = readFileSync('docs/sources/perfectcorp-ai_clothes-openapi-20261019.yaml', 'utf8');
const reference = readFileSync('docs/sources/perfectcorp-reference_ai_clothes-20261019.md', 'utf8');
const general = readFileSync('docs/sources/perfectcorp-develop_error_codes-20261019.md', 'utf8');
const engineBlock = snapshot.split('    EngineErrorCode:')[1]!.split('      description:')[0]!;
const enumCodes = [...engineBlock.matchAll(/^        - ([a-z_]+)$/gm)].map(m => m[1]!);
const tableCodes = (text: string) => [...text.matchAll(/^\s*\| ((?:error_|exceed_|unknown_|invalid_)[a-z_]+) \|/gm)].map(m => m[1]!);
const mapped = ([code, messageKey, retryable]: Expected, upstream: UserError['upstream']): UserError => ({ code, messageKey, retryable, upstream });
test('F21 every enum and both source tables has an own entry with independent exact guidance', () => {
  expect(enumCodes.length).toBeGreaterThan(10); expect(tableCodes(reference).length).toBeGreaterThan(5); expect(tableCodes(general).length).toBeGreaterThan(20);
  for (const code of new Set([...enumCodes, ...tableCodes(snapshot), ...tableCodes(reference), ...tableCodes(general)])) {
    expect(Object.hasOwn(expectedEngine, code), `missing test expectation: ${code}`).toBe(true);
    expect(Object.hasOwn(ENGINE_ERRORS, code), `missing production own entry: ${code}`).toBe(true);
    expect(mapError({ engineError: code })).toEqual(mapped(expectedEngine[code]!, { http: null, errorCode: null, engineError: code }));
  }
});
test('F21 HTTP codes and documented response statuses preserve exact guidance; 401 dominates any body', () => {
  const enumBlock = snapshot.split('        error_code:')[1]!.split('    EngineErrorCode:')[0]!;
  const documented = [...enumBlock.matchAll(/^            - ([A-Za-z]+)$/gm)].map(m => m[1]!);
  const examples = [...reference.matchAll(/"error_code": "([A-Za-z]+)"/g)].map(m => m[1]!);
  expect(documented).toHaveLength(5); expect(examples).toContain('InvalidAccessToken');
  for (const code of new Set([...documented, ...examples, 'InvalidTaskId', 'TaskTimeout'])) {
    expect(Object.hasOwn(HTTP_ERRORS, code), code).toBe(true);
    const http = code === 'TaskTimeout' ? 500 : code === 'InvalidAccessToken' ? 401 : 400;
    expect(mapError({ http, errorCode: code })).toEqual(mapped(expectedHttp[code]!, { http, errorCode: code, engineError: null }));
  }
  const post = readFileSync('docs/sources/perfectcorp-cloth-v4-post-20261019.md', 'utf8');
  const get = readFileSync('docs/sources/perfectcorp-cloth-v4-get-20261019.md', 'utf8');
  expect([...post.matchAll(/^## Response (\d+):/gm)].map(m => Number(m[1]))).toEqual([200, 400, 401, 429]);
  expect([...get.matchAll(/^## Response (\d+):/gm)].map(m => Number(m[1]))).toEqual([200, 400, 401, 500]);
  expect(mapError({ http: 429 })).toEqual(mapped(['rate_limited', 'wait', 'user_confirm'], { http: 429, errorCode: null, engineError: null }));
  for (const engineError of ['error_pose', '__proto__']) expect(mapError({ http: 401, errorCode: 'BadRequest', engineError })).toEqual(mapped(['auth', 'key', 'no'], { http: 401, errorCode: 'BadRequest', engineError }));
});
test('F21 adversarial inherited keys and unknown codes return complete fallback with raw code retained', () => {
  for (const code of ['constructor', 'toString', '__proto__', 'new_engine_code']) {
    expect(mapError({ engineError: code })).toEqual(mapped(['yc_engine', 'generic', 'user_confirm'], { http: null, errorCode: null, engineError: code }));
    expect(mapError({ http: 400, errorCode: code })).toEqual(mapped(['yc_engine', 'generic', 'user_confirm'], { http: 400, errorCode: code, engineError: null }));
  }
  for (const code of ['error_inference', 'unknown_internal_error', 'invalid_parameter']) expect(Object.hasOwn(ENGINE_ERRORS, code)).toBe(true);
});
test('F21 no documented engine code permits automatic task POST retry', () => {
  const at = '2026-10-19T00:00:00.000Z';
  let a = createAttempt(1, 'entry');
  for (const event of [{ type: 'start' }, { type: 'uploads_ok', srcFileId: 's', refFileId: 'r' }, { type: 'limiter_granted', request: 'task_post' }, { type: 'task_created', taskId: 'task' }] as const) a = step(a, event, at).attempt;
  a = step(a, { type: 'poll_due' }, '2026-10-19T00:00:05.000Z').attempt;
  a = step(a, { type: 'limiter_granted', request: 'task_get' }, '2026-10-19T00:00:05.000Z').attempt;
  for (const code of Object.keys(expectedEngine)) {
    const result = step(a, { type: 'poll_error', code }, '2026-10-19T00:00:05.001Z');
    expect(result.attempt.state).toBe('failed'); expect(result.attempt.postCount).toBe(1);
    expect(result.effects.filter(e => e.type === 'request' || e.type === 'request_grant')).toEqual([]);
  }
});
