import { expect, test } from 'vitest';
import { createHttpClient } from '../../src/youcam/http-client.js';
import type { Transport } from '../../src/youcam/transport.js';
// Both documented File API shapes and the documented poll sample must parse; nothing here reaches the network.
const api = 'https://yce-api-01.makeupar.com', media = 'https://yce-us.s3-accelerate.amazonaws.com';
function client(body: unknown) {
  const transport: Transport = { close() {}, async send() { return { status: 200, headers: { 'content-type': 'application/json' }, bytes: Buffer.from(JSON.stringify(body)) }; } };
  return createHttpClient({ apiKey: 'test-only', baseUrl: `${api}/`, transport, grant: async () => undefined });
}
const call = () => ({ signal: new AbortController().signal });
const files = [{ content_type: 'image/jpg', file_name: 'a.jpg', file_id: 'file-1', requests: [{ method: 'PUT', url: `${media}/demo/ttl30/x`, headers: { 'Content-Length': '10', 'Content-Type': 'image/jpg' } }] }];
const upload = { contentType: 'image/jpg' as const, fileName: 'a.jpg', fileSize: 10 };

test.each([
  ['AI Clothes guide sample ({ status, data: { files } })', { status: 200, data: { files } }],
  ['File API reference ({ files })', { files }],
])('file slots parse from the %s', async (_name, body) => {
  expect(await client(body).createUpload(upload, call())).toEqual({ fileId: 'file-1', put: { method: 'PUT', url: `${media}/demo/ttl30/x`, headers: { 'Content-Length': '10', 'Content-Type': 'image/jpg' } } });
});

test.each([
  ['no files', { status: 200, data: {} }],
  ['two files', { status: 200, data: { files: [...files, ...files] } }],
  ['a non-PUT upload request', { status: 200, data: { files: [{ ...files[0], requests: [{ ...files[0]!.requests[0], method: 'POST' }] }] } }],
])('file slots are refused with %s', async (_name, body) => {
  await expect(client(body).createUpload(upload, call())).rejects.toMatchObject({ kind: 'parse' });
});

test('the documented success poll sample (no error_message) yields the result URL', async () => {
  const body = { status: 200, data: { error: null, results: { url: `${media}/demo/ttl30/result` }, task_status: 'success' } };
  expect(await client(body).getClothTask('task-1', call())).toEqual({ status: 'success', engineError: null, errorMessage: null, resultUrl: `${media}/demo/ttl30/result` });
});

test('a running poll without results or error fields parses as running', async () => {
  expect(await client({ status: 200, data: { task_status: 'running' } }).getClothTask('task-1', call())).toEqual({ status: 'running', engineError: null, errorMessage: null, resultUrl: null });
});
