import { readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EnvError } from './env.js';
import type { AppEnv } from './env.js';
import { createApp } from './app.js';
import type { FixtureUiAssets } from './app.js';
import { Store } from './store.js';
import { createNativeHttpOwner } from './native-http-owner.js';
import { Runner } from './runner.js';
import { HttpLifetime } from './http-lifetime.js';
import { newId } from './routes/fixture.js';
import { FixtureClient, FIXTURE_SCENARIOS, scenarioForHash } from '../youcam/fixture-client.js';
import { SlidingLogLimiter } from '../youcam/rate-limiter.js';
import { systemClock } from '../youcam/operations.js';
import { recoverState } from '../youcam/workflow-state.js';
import { analyzePhoto } from '../images/raster.js';
import { discloseImage, fixtureComposite } from '../images/disclose.js';
import { sweepExpired } from './ttl-sweeper.js';
import type { FixtureScenario } from '../youcam/fixture-client.js';
import type { StoredPhoto } from '../shared/types.js';
export interface FixtureSessionOptions {
  fixtureUi?: FixtureUiAssets;
  /** Exactly the existing synthetic model input, never a route/client/Store override. */
  modelFront?: Uint8Array;
  checkpoint?: { requests: 32 | 128; sockets: 8 };
  /** Caller owns ONE original deadline. This factory never exits or renews a grace period. */
  armDeadline(): void;
  clearDeadline(): void;
  removeSignals?(): void;
}
/** Synchronous owner capture; startup, including Store.acquire, starts only after publication. */
export function createFixtureSession(inputEnv: AppEnv, options: FixtureSessionOptions) {
  const env = { ...inputEnv };
  options = { ...options, ...(options.checkpoint ? { checkpoint: { ...options.checkpoint } } : {}) };
  if (env.mode === 'live') throw new EnvError('Live execution is not ready; no fixture fallback');
  if (options.checkpoint && (env.port !== 5194 || env.vitePort !== 5194 || env.buyerUpload !== 'disabled' || env.budgetCu !== 0 || env.apiKey !== null)) throw new EnvError('Invalid private fixture checkpoint');
  if (options.checkpoint && (![32, 128].includes(options.checkpoint.requests) || options.checkpoint.sockets !== 8)) throw new EnvError('Invalid private fixture limits');
  if (env.buyerUploadRefused || env.buyerUpload === 'enabled') console.error('Buyer upload disabled: this source checkpoint implements the disabled core only');
  const shutdown = new AbortController();
  // Copy bounded optional input before startup; default CLI still reads the real existing asset.
  let modelFront: Uint8Array | undefined;
  if (options.modelFront) {
    if (options.modelFront.byteLength !== 40260) throw new Error('fixture_model_pin_mismatch');
    modelFront = new Uint8Array(options.modelFront);
    if (createHash('sha256').update(modelFront).digest('hex') !== '4c51ae712222089addaf433c18cb41511cd5ebdb5c63cfc9f3b756eaae3f9b7d') throw new Error('fixture_model_pin_mismatch');
  }
  let store: Store | undefined, runner: Runner | undefined, limiter: SlidingLogLimiter | undefined;
  let native: ReturnType<typeof createNativeHttpOwner> | undefined, storeClosed = false, startupSettled = false;
  let resolveReady!: () => void, rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.then(() => undefined, () => undefined);
  const http = new HttpLifetime({
    stopAdmission: () => { runner?.stopAdmission(); }, cancel: () => { shutdown.abort(); },
    armDeadline: options.armDeadline,
    joinStartup: () => startup, joinRunner: () => runner?.drain() ?? Promise.resolve(),
    dispose: () => { limiter?.dispose(); },
    closeStore: async () => {
      if (native && !native.status().released) throw new Error('native_release_unproved');
      if (store) { await store.close(); storeClosed = true; }
    },
    clearDeadline: options.clearDeadline, removeSignals: () => { options.removeSignals?.(); },
  });
  const startup: Promise<void> = Promise.resolve().then(async () => {
    // Capture the real Store immediately on acquire fulfillment, before any fallible initializer.
    const acquired = await Store.acquire(env.dataDir); store = acquired;
    const activeLimiter = new SlidingLogLimiter(systemClock); limiter = activeLimiter;
    {
      // Narrow to the captured actual resources, preserving the original workflow below.
      const store = acquired, limiter = activeLimiter;
      if (shutdown.signal.aborted) return;
      // No work from a previous owner is live: lock acquisition preceded this finite cleanup.
      await rm(store.path('tmp'), { recursive: true, force: true });
      const recovery = recoverState(store.snapshot(), new Date().toISOString());
      await store.commit(() => recovery.state);
      await sweepExpired(store, Date.now());
      for (const image of store.snapshot().images) {
        let missing = false;
        try { missing = createHash('sha256').update(await store.readMedia(image.disclosedPath)).digest('hex') !== image.sha256; } catch { missing = true; }
        if (missing && !image.artifactMissing) await store.commit(state => { state.images.find(i => i.id === image.id)!.artifactMissing = true; return state; });
      }
      if (!store.snapshot().photos.some(p => p.source === 'synthetic' && p.role === 'model')) {
        const input = modelFront ?? await readFile('assets/demo/model-front.png'), { photo } = await analyzePhoto(input), photoId = newId(), path = `photos/${photoId}.jpg`;
        const stored: StoredPhoto = { id: photoId, role: 'model', mode: 'fixture', source: 'synthetic', rightsId: null, original: photo.original, normalized: { ...photo.normalized, path }, createdAt: new Date().toISOString(), expiresAt: null };
        await store.writeMedia(path, photo.data); await store.commit(state => { state.photos.push(stored); return state; });
      }
      const rawScenarios: unknown = JSON.parse(await readFile('fixtures/scenarios.json', 'utf8'));
      if (!rawScenarios || typeof rawScenarios !== 'object' || Array.isArray(rawScenarios)) throw new Error('invalid_fixture_scenarios');
      const scenarios: Record<string, FixtureScenario> = {};
      for (const [prefix, scenario] of Object.entries(rawScenarios)) {
        if (!/^[0-9a-f]{1,64}$/.test(prefix) || !FIXTURE_SCENARIOS.includes(scenario as FixtureScenario)) throw new Error('invalid_fixture_scenarios');
        scenarios[prefix] = scenario as FixtureScenario;
      }
      runner = new Runner({ store, limiter, signal: shutdown.signal, taskDeadlineMs: env.taskDeadlineMs,
        client: job => new FixtureClient({ scenario: scenarioForHash(store.snapshot().photos.find(p => p.id === job.garmentPhotoId)!.original.sha256, scenarios), now: systemClock.now, result: async signal => {
          const state = store.snapshot(), model = state.photos.find(p => p.id === job.modelPhotoId)!, garment = state.photos.find(p => p.id === job.garmentPhotoId)!;
          return fixtureComposite(await store.readMedia(model.normalized.path), await store.readMedia(garment.normalized.path), signal);
        } }),
        disclose: async (bytes, job, signal) => {
          const result = await discloseImage(bytes, 'fixture', signal), imageId = newId();
          return { ...result, id: imageId, listingId: job.listingId, buyerSessionId: job.buyerSessionId, jobId: job.id, mode: 'fixture', disclosedPath: `generated/${imageId}.jpg`, label: 'demo_fixture', artifactMissing: false, createdAt: new Date().toISOString(), expiresAt: null };
        },
      });
      if (shutdown.signal.aborted) runner.stopAdmission();
      // Startup recovery is awaited; all admitted resumptions are GET/download only.
      for (const id of recovery.resume) {
        if (shutdown.signal.aborted) break;
        await runner.resume(id);
      }
      if (!shutdown.signal.aborted) {
        const app = createApp(env, { store, runner, signal: shutdown.signal }, options.fixtureUi);
        native = createNativeHttpOwner({
          fetch: request => http.handle<Response>(() => app.fetch(request), () => new Response(JSON.stringify({ mode: env.mode, error: 'server_closed' }), { status: 503, headers: { 'Content-Type': 'application/json' } })),
          fail: error => { rejectReady(error); http.fail(error); }, ready: resolveReady,
          ...(options.checkpoint ? { checkpoint: options.checkpoint } : {}),
        });
        http.attach(native.listener); native.listen(env.port);
      }
    }
  });
  startup.then(() => {
    startupSettled = true;
    if (shutdown.signal.aborted) rejectReady(new Error('fixture_startup_stopped'));
  }, error => { startupSettled = true; rejectReady(error); http.fail(error); });
  return {
    ready, startup,
    get server() { return native?.server; },
    // Read-only bounded status, no raw Store/Runner or alternate admission surface.
    status: () => ({ ...http.status(), startupSettled, storeAcquired: store !== undefined, storeClosed,
      native: native?.status() ?? null, safeClosure: startupSettled && !http.status().failed && (!store || storeClosed) && (!native || native.status().released) }),
    stopAdmission: () => { http.stop(); },
    stop: () => http.stop(), wait: () => http.wait(),
    fail: (error: unknown) => { rejectReady(error); return http.fail(error); },
    // A checkpoint expiry is sticky UNKNOWN; joins remain retained after the deadline.
    expire: () => { const error = new Error('fixture_cleanup_deadline'); const task = http.fail(error); native?.cancel(error); return task; },
  };
}
