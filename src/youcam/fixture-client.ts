import { YouCamError } from './client.js';
import type { CallOptions, ClothBody, TaskResult, UploadInput, UploadSlot, YouCamClient } from './client.js';
import { checkSignal } from './operations.js';
export const FIXTURE_SCENARIOS = ['ok', 'slow', 'never', 'engine_error_pose', 'region_mismatch', 'no_units', 'rate_limited', 'rate_limited_3', 'post_ambiguous', 'post_transport_error', 'post_5xx', 'url_expired_once', 'url_expired_always', 'get_500_timeout', 'untrusted_media_host'] as const;
export type FixtureScenario = typeof FIXTURE_SCENARIOS[number];
const media = 'https://yce-us.s3-accelerate.amazonaws.com';
/** One client per attempt. Operations are awaited, finite, deterministic and never open sockets. */
export class FixtureClient implements YouCamClient {
  readonly mode = 'fixture' as const;
  private posts = 0; private gets = 0; private files = 0; private downloads = 0; private createdAt = 0;
  private readonly scenario: FixtureScenario; private readonly now: () => number;
  private readonly result: (signal: AbortSignal) => Promise<Uint8Array>;
  constructor(options: { scenario?: FixtureScenario; now: () => number; result: (signal: AbortSignal) => Promise<Uint8Array> }) {
    this.scenario = options.scenario ?? 'ok'; this.now = options.now; this.result = options.result;
  }
  get counts() { return { posts: this.posts, gets: this.gets, files: this.files, downloads: this.downloads }; }
  async createUpload(input: UploadInput, { signal }: CallOptions): Promise<UploadSlot> {
    checkSignal(signal); if (this.files >= 8 || input.fileSize <= 0 || input.fileSize >= 10_000_000) throw new YouCamError('too_large');
    const id = `fixture-file-${++this.files}`;
    return { fileId: id, put: { method: 'PUT', url: this.scenario === 'untrusted_media_host' ? 'https://refused.invalid/put' : `${media}/${id}`, headers: { 'Content-Type': input.contentType, 'Content-Length': String(input.fileSize) } } };
  }
  async putBytes(put: Pick<UploadSlot['put'], 'url' | 'headers'>, bytes: Uint8Array, { signal }: CallOptions): Promise<void> {
    checkSignal(signal); if (!put.url.startsWith(`${media}/`)) throw new YouCamError('policy');
    if (put.headers['Content-Length'] !== String(bytes.length)) throw new YouCamError('parse');
  }
  async createClothTask(_body: ClothBody, { signal }: CallOptions): Promise<{ taskId: string }> {
    checkSignal(signal); this.posts++;
    if (this.posts > 3) throw new YouCamError('policy');
    if (this.scenario === 'no_units') throw new YouCamError('http', { http: 400, errorCode: 'CreditInsufficiency' });
    if (this.scenario === 'rate_limited_3' || this.scenario === 'rate_limited' && this.posts <= 2) throw new YouCamError('http', { http: 429 });
    if (this.scenario === 'post_ambiguous') throw new YouCamError('timeout');
    if (this.scenario === 'post_transport_error') throw new YouCamError('transport');
    if (this.scenario === 'post_5xx') throw new YouCamError('http', { http: 503 });
    this.createdAt = this.now(); return { taskId: 'fixture-task-1' };
  }
  async getClothTask(taskId: string, { signal }: CallOptions): Promise<TaskResult> {
    checkSignal(signal); if (taskId !== 'fixture-task-1') throw new YouCamError('http', { http: 400, errorCode: 'InvalidTaskId' });
    const n = ++this.gets;
    if (this.scenario === 'get_500_timeout' && n <= 4) throw new YouCamError('http', { http: 500, errorCode: 'TaskTimeout' });
    let engineError: string | null = null;
    if (this.scenario === 'engine_error_pose' && n >= 2) engineError = 'error_pose';
    if (this.scenario === 'region_mismatch' && n >= 2) engineError = 'error_apply_region_mismatch';
    const running = this.scenario === 'never' || (this.scenario === 'slow' ? this.now() - this.createdAt < 120_000 : n <= 3);
    return { status: engineError ? 'error' : running ? 'running' : 'success', engineError, errorMessage: null, resultUrl: !engineError && !running ? `${media}/fixture-result-${n}.png` : null };
  }
  async download(url: string, { signal }: CallOptions): Promise<Uint8Array> {
    checkSignal(signal); if (!url.startsWith(`${media}/fixture-result-`)) throw new YouCamError('policy');
    this.downloads++;
    if (this.scenario === 'url_expired_always' || this.scenario === 'url_expired_once' && this.downloads === 1) throw new YouCamError('http', { http: 403 });
    const result = await this.result(signal); checkSignal(signal); return result;
  }
  async featureCost({ signal }: CallOptions) { checkSignal(signal); return []; }
  async creditBalance({ signal }: CallOptions) { checkSignal(signal); return 0; }
}
export function scenarioForHash(hash: string, mapping: Readonly<Record<string, FixtureScenario>>): FixtureScenario {
  const matches = Object.keys(mapping).filter(prefix => /^[0-9a-f]{1,64}$/.test(prefix) && hash.startsWith(prefix)).sort((a, b) => b.length - a.length || a.localeCompare(b));
  return matches.length ? mapping[matches[0]!]! : 'ok';
}
