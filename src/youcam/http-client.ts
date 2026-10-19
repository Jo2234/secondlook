import { z } from 'zod';
import type { CallOptions, ClothBody, UploadInput, UploadSlot, YouCamClient } from './client.js';
import { YouCamError } from './client.js';
import { HTTP_ERRORS } from '../domain/errors.js';
import type { Transport, TransportRequest } from './transport.js';
import { classifyUrl } from './net-policy.js';
import { CLOTH_V4_PATH } from './preflight.js';
import { DOWNLOAD_TIMEOUT_MS, FILE_POST_TIMEOUT_MS, GET_TIMEOUT_MS, JSON_MAX_BYTES, PREFLIGHT_BACKOFF_MS, PREFLIGHT_GET_RETRIES, PREFLIGHT_MAX_PAGES, PREFLIGHT_PAGE_SIZE, PUT_TIMEOUT_MS, RESULT_MAX_BYTES } from './limits.js';
import type { Clock } from './operations.js';
import { systemClock } from './operations.js';
const text = z.string().min(1).max(4096);
const slotSchema = z.object({ files: z.array(z.object({ file_id: text, requests: z.array(z.object({ method: z.literal('PUT'), url: text, headers: z.record(z.string(), z.union([z.string(), z.number()])) })).length(1) })).length(1) });
const taskSchema = z.object({ data: z.object({ task_id: text }) });
const pollSchema = z.object({ data: z.object({ task_status: z.enum(['running', 'success', 'error']), error: z.string().nullable(), error_message: z.string().nullable(), results: z.object({ url: text }).nullable() }) });
const skuSchema = z.object({ description: z.string(), amount: z.number(), unit: z.string(), proc_unit: z.number(), run_task_url: z.string() });
const costSchema = z.object({ result: z.object({ skus: z.array(skuSchema).max(PREFLIGHT_PAGE_SIZE), next_token: text.nullable() }) });
const creditSchema = z.object({ results: z.array(z.object({ type: z.enum(['ApiSubsToken', 'ApiPaygToken']), amount_dec: z.number().finite().min(0).max(1_000_000), expiry: z.number().finite() })).max(10_000) });
export function createHttpClient(options: { apiKey: string; baseUrl: string; transport: Transport; grant: (signal: AbortSignal) => Promise<unknown>; clock?: Clock }): YouCamClient {
  const { transport } = options, clock = options.clock ?? systemClock;
  if (!options.apiKey || !classifyUrl(options.baseUrl, 'api').allowed || new URL(options.baseUrl).pathname !== '/' || new URL(options.baseUrl).search || new URL(options.baseUrl).hash) throw new YouCamError('policy');
  const api = new URL(options.baseUrl).origin;
  async function send(input: Omit<TransportRequest, 'signal'>, { signal }: CallOptions) {
    // Runner/preflight grants task and upload operations. Feature/credit GETs grant per page/retry below.
    const response = await transport.send({ ...input, signal });
    if (response.status < 200 || response.status >= 300) {
      let code: string | undefined;
      try { const body = JSON.parse(Buffer.from(response.bytes).toString('utf8')); if (typeof body.error_code === 'string' && Object.hasOwn(HTTP_ERRORS, body.error_code)) code = body.error_code; } catch { /* status is still definitive */ }
      const raw = response.headers['retry-after'], seconds = typeof raw === 'string' ? Number(raw) : NaN;
      throw new YouCamError('http', { http: response.status, ...(code ? { errorCode: code } : {}), ...(Number.isFinite(seconds) ? { retryAfterMs: Math.min(30_000, Math.max(1000, seconds * 1000)) } : {}) });
    }
    return response;
  }
  async function json<T>(path: string, schema: z.ZodType<T>, call: CallOptions, body?: unknown): Promise<T> {
    const response = await send({ url: api + path, destination: 'api', method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${options.apiKey}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: Buffer.from(JSON.stringify(body)) }), timeoutMs: body === undefined ? GET_TIMEOUT_MS : FILE_POST_TIMEOUT_MS, maxBytes: JSON_MAX_BYTES }, call);
    try { return schema.parse(JSON.parse(Buffer.from(response.bytes).toString('utf8'))); } catch { throw new YouCamError('parse'); }
  }
  async function read<T>(path: string, schema: z.ZodType<T>, call: CallOptions): Promise<T> {
    for (let n = 0; n <= PREFLIGHT_GET_RETRIES; n++) {
      await options.grant(call.signal);
      try { return await json(path, schema, call); }
      catch (error) {
        if (n === PREFLIGHT_GET_RETRIES || call.signal.aborted || error instanceof YouCamError && (error.kind === 'policy' || error.kind === 'parse' || error.http === 401)) throw error;
        await clock.sleep(PREFLIGHT_BACKOFF_MS[n]!, call.signal);
      }
    }
    throw new YouCamError('transport');
  }
  return {
    mode: 'live',
    async createUpload(input: UploadInput, call) {
      const result = await json('/s2s/v2.0/file', slotSchema, call, { files: [{ content_type: input.contentType, file_name: input.fileName, file_size: input.fileSize }] });
      const slot = result.files[0]!, put = slot.requests[0]!;
      if (!classifyUrl(put.url, 'media').allowed) throw new YouCamError('policy');
      return { fileId: slot.file_id, put: { method: put.method, url: put.url, headers: Object.fromEntries(Object.entries(put.headers).map(([k, v]) => [k, String(v)])) } };
    },
    async putBytes(put: Pick<UploadSlot['put'], 'url' | 'headers'>, bytes, call) {
      await send({ url: put.url, destination: 'media', method: 'PUT', headers: put.headers, body: bytes, timeoutMs: PUT_TIMEOUT_MS, maxBytes: JSON_MAX_BYTES }, call);
    },
    async createClothTask(body: ClothBody, call) { return { taskId: (await json(CLOTH_V4_PATH, taskSchema, call, body)).data.task_id }; },
    async getClothTask(id, call) {
      const { data } = await json(`${CLOTH_V4_PATH}/${encodeURIComponent(id)}`, pollSchema, call);
      return { status: data.task_status, engineError: data.error, errorMessage: null, resultUrl: data.results?.url ?? null };
    },
    async download(url, call) {
      const response = await send({ url, destination: 'media', method: 'GET', headers: {}, timeoutMs: DOWNLOAD_TIMEOUT_MS, maxBytes: RESULT_MAX_BYTES }, call);
      const type = response.headers['content-type'];
      const bytes = response.bytes;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
      if (!(jpeg && type === 'image/jpeg' || png && type === 'image/png')) throw new YouCamError('parse');
      return bytes;
    },
    async featureCost(call) {
      const skus: z.infer<typeof skuSchema>[] = [], seen = new Set<string>(); let token: string | null = null;
      for (let page = 0; page < PREFLIGHT_MAX_PAGES; page++) {
        const query = new URLSearchParams({ page_size: String(PREFLIGHT_PAGE_SIZE), ...(token === null ? {} : { starting_token: token }) });
        const response = await read(`/s2s/v2.0/credit/feature-cost?${query}`, costSchema, call);
        skus.push(...response.result.skus); token = response.result.next_token;
        if (token === null) return skus;
        if (seen.has(token)) throw new YouCamError('parse', { errorCode: 'cost_ambiguous' });
        seen.add(token);
      }
      throw new YouCamError('parse', { errorCode: 'cost_ambiguous' });
    },
    async creditBalance(call) {
      const { results } = await read('/s2s/v1.0/client/credit', creditSchema, call);
      let cu = 0;
      for (const entry of results) {
        if (Math.abs(Math.round(entry.amount_dec * 100) - entry.amount_dec * 100) > 1e-9) throw new YouCamError('parse');
        if (entry.expiry > clock.now()) cu += Math.round(entry.amount_dec * 100);
      }
      if (!Number.isSafeInteger(cu)) throw new YouCamError('parse'); return cu;
    },
  };
}
