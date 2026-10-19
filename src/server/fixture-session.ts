import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EnvError } from './env.js';
import type { AppEnv } from './env.js';
import { createApp } from './app.js';
import type { FixtureUiAssets } from './app.js';
import { Store, StoreIOOwner, captureCheckpointStorePolicy, recoverStoreArtifact } from './store.js';
import type { CheckpointStorePolicy } from './store.js';
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
export interface OwnedFetchPolicy {
  fetch(request: Request): Promise<Response>;
  stopAdmission(): void;
  /** Joins only its own resources; never session.stop/wait or Store.close. */
  join(): Promise<void>;
}
export interface FixtureSessionOptions {
  fixtureUi?: FixtureUiAssets;
  /** Exactly the existing synthetic model input, never a route/client/Store override. */
  modelFront?: Uint8Array;
  checkpoint?: { requests: 32 | 128; sockets: 8 };
  checkpointStore?: CheckpointStorePolicy;
  /** One captured wrapper around the actual app, restricted to checkpoint32/8. */
  createFetchPolicy?: (next: (request: Request) => Promise<Response>) => OwnedFetchPolicy;
  /** Caller owns ONE original deadline. This factory never exits or renews a grace period. */
  armDeadline(): void;
  clearDeadline(): void;
  removeSignals?(): void;
}
/** Synchronous owner capture; startup, including Store.acquire, starts only after publication. */
export function createFixtureSession(inputEnv: AppEnv, options: FixtureSessionOptions) {
  const env = { ...inputEnv };
  options = { ...options, ...(options.checkpoint ? { checkpoint: { ...options.checkpoint } } : {}),
    ...(options.checkpointStore ? { checkpointStore: captureCheckpointStorePolicy(options.checkpointStore) } : {}) };
  if (env.mode === 'live') throw new EnvError('Live execution is not ready; no fixture fallback');
  if (options.checkpoint && (env.port !== 5194 || env.vitePort !== 5194 || env.buyerUpload !== 'disabled' || env.budgetCu !== 0 || env.apiKey !== null)) throw new EnvError('Invalid private fixture checkpoint');
  if (options.checkpoint && (![32, 128].includes(options.checkpoint.requests) || options.checkpoint.sockets !== 8)) throw new EnvError('Invalid private fixture limits');
  if ((options.checkpointStore || options.createFetchPolicy) && (env.mode !== 'fixture' || options.checkpoint?.requests !== 32 || options.checkpoint.sockets !== 8)) throw new EnvError('Invalid owned checkpoint');
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
  // Strongly captured BEFORE acquire starts, including a rejecting acquisition.
  const io = new StoreIOOwner(options.checkpointStore);
  let policy: OwnedFetchPolicy | undefined, policyAttempted = false, policyJoined = false, ioJoined = false;
  let noPolicyAcquired: boolean | null = null;
  const retainedFaults: unknown[] = [];
  let retainedTasks: Promise<void>[] = [], retainedResults: PromiseSettledResult<void>[] = [];
  let native: ReturnType<typeof createNativeHttpOwner> | undefined, storeClosed = false, startupSettled = false;
  let resolveReady!: () => void, rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.then(() => undefined, () => undefined);
  const http = new HttpLifetime({
    stopAdmission: () => {
      // Seal both synchronously, independently, before cancel/deadline can reenter.
      let failed = false;
      for (const seal of [() => runner?.stopAdmission(), () => policy?.stopAdmission()]) {
        try { seal(); } catch (error) { failed = true; retainedFaults.push(error); }
      }
      if (failed) throw new Error('fixture_admission_seal_UNKNOWN');
    }, cancel: () => { shutdown.abort(); },
    armDeadline: options.armDeadline,
    joinStartup: () => startup, joinRunner: () => runner?.drain() ?? Promise.resolve(),
    joinRetained: async () => {
      // No callback returns/awaits this session lifetime. IO join does not close the Store.
      retainedTasks = [Promise.resolve().then(async () => {
        if (policy) { await policy.join(); noPolicyAcquired = false; policyJoined = true; }
        else if (!policyAttempted) { noPolicyAcquired = true; policyJoined = true; }
        else throw new Error('fixture_policy_acquisition_UNKNOWN');
      }), Promise.resolve().then(async () => { await io.join(); ioJoined = true; })];
      retainedResults = await Promise.allSettled(retainedTasks);
      for (const result of retainedResults) if (result.status === 'rejected') retainedFaults.push(result.reason);
      if (retainedFaults.length) throw new Error('fixture_retained_join_UNKNOWN');
    },
    dispose: () => { limiter?.dispose(); },
    closeStore: async () => {
      if (native && !native.status().released) throw new Error('native_release_unproved');
      if (!policyJoined || !ioJoined || retainedFaults.length) throw new Error('fixture_retained_join_unproved');
      if (store) { await store.close(); storeClosed = true; }
    },
    clearDeadline: options.clearDeadline, removeSignals: () => { options.removeSignals?.(); },
  });
  const startup: Promise<void> = Promise.resolve().then(async () => {
    // Capture the real Store immediately on acquire fulfillment, before any fallible initializer.
    const acquired = await Store.acquire(env.dataDir, io); store = acquired;
    const activeLimiter = new SlidingLogLimiter(systemClock); limiter = activeLimiter;
    {
      // Narrow to the captured actual resources, preserving the original workflow below.
      const store = acquired, limiter = activeLimiter;
      if (shutdown.signal.aborted) return;
      store.assertFreshCheckpoint(); // before cleanup/recovery/sweep/seed/resume decisions
      // No work from a previous owner is live: lock acquisition preceded this finite cleanup.
      await store.cleanStartupTmp();
      const recovery = recoverState(store.snapshot(), new Date().toISOString());
      await store.commit(() => recovery.state);
      await sweepExpired(store, Date.now());
      for (const image of store.snapshot().images) {
        await recoverStoreArtifact(store, image, await store.readMediaOutcome(image.disclosedPath));
      }
      if (!store.snapshot().photos.some(p => p.source === 'synthetic' && p.role === 'model')) {
        const input = modelFront ?? await readFile('assets/demo/model-front.png'), { photo } = await analyzePhoto(input), photoId = newId(), path = `photos/${photoId}.jpg`;
        const stored: StoredPhoto = { id: photoId, role: 'model', mode: 'fixture', source: 'synthetic', rightsId: null, original: photo.original, normalized: { ...photo.normalized, path }, createdAt: new Date().toISOString(), expiresAt: null };
        await store.writeMedia(path, photo.data); await store.commit(state => { state.photos.push(stored); return state; });
      }
      const rawScenarios: unknown = JSON.parse(options.checkpointStore
        ? await io.readFixtureScenarios() : await readFile('fixtures/scenarios.json', 'utf8'));
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
        if (options.createFetchPolicy) {
          policyAttempted = true;
          policy = options.createFetchPolicy(request => Promise.resolve(app.fetch(request)));
        }
        // A synchronous policy factory may reenter stop before returning its owner.
        if (shutdown.signal.aborted) { policy?.stopAdmission(); return; }
        native = createNativeHttpOwner({
          fetch: request => http.handle<Response>(() => policy ? policy.fetch(request) : app.fetch(request), () => new Response(JSON.stringify({ mode: env.mode, error: 'server_closed' }), { status: 503, headers: { 'Content-Type': 'application/json' } })),
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
      policyAcquired: policy !== undefined, policyAttempted, noPolicyAcquired, policyJoined, ioJoined,
      io: io.status(), retainedFaults: retainedFaults.length, retainedJoins: retainedResults.length,
      native: native?.status() ?? null, safeClosure: startupSettled && !http.status().failed && policyJoined && ioJoined
        && !retainedFaults.length && io.status().released && !io.status().unknown && io.status().pending === 0 && io.status().handles === 0
        && (!store || storeClosed) && (!native || native.status().released) }),
    stopAdmission: () => { http.stop(); },
    stop: () => http.stop(), wait: () => http.wait(),
    fail: (error: unknown) => { rejectReady(error); return http.fail(error); },
    // A checkpoint expiry is sticky UNKNOWN; joins remain retained after the deadline.
    expire: () => { const error = new Error('fixture_cleanup_deadline'); const task = http.fail(error); native?.cancel(error); return task; },
  };
}
