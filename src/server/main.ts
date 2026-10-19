import { serve } from '@hono/node-server';
import { readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadEnv, EnvError } from './env.js';
import { createApp } from './app.js';
import { Store, StoreLocked } from './store.js';
import { Runner } from './runner.js';
import { HttpLifetime } from './http-lifetime.js';
import { newId } from './routes/fixture.js';
import { FixtureClient, FIXTURE_SCENARIOS, scenarioForHash } from '../youcam/fixture-client.js';
import { SlidingLogLimiter } from '../youcam/rate-limiter.js';
import { systemClock } from '../youcam/operations.js';
import { recoverState } from '../youcam/workflow-state.js';
import { SHUTDOWN_MS } from '../youcam/limits.js';
import { analyzePhoto } from '../images/raster.js';
import { discloseImage, fixtureComposite } from '../images/disclose.js';
import { sweepExpired } from './ttl-sweeper.js';
import type { FixtureScenario } from '../youcam/fixture-client.js';
import type { StoredPhoto } from '../shared/types.js';
async function main(): Promise<void> {
  const env = loadEnv(); // Missing live key still exits 2 before store/listener/native work.
  if (env.mode === 'live') throw new EnvError('Live execution is not ready; no fixture fallback');
  if (env.buyerUploadRefused || env.buyerUpload === 'enabled') console.error('Buyer upload disabled: this source checkpoint implements the disabled core only');
  const store = await Store.acquire(env.dataDir), shutdown = new AbortController();
  const limiter = new SlidingLogLimiter(systemClock);
  let runner: Runner | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
  let finishStartup!: () => void;
  const startup = new Promise<void>(resolve => { finishStartup = resolve; });
  const signals = ['SIGINT', 'SIGTERM'] as const;
  const http = new HttpLifetime({
    stopAdmission: () => { runner?.stopAdmission(); }, cancel: () => { shutdown.abort(); },
    armDeadline: () => {
      deadline ??= setTimeout(() => { console.error('shutdown_deadline; ownership not cleanly released'); process.exit(1); }, SHUTDOWN_MS);
    },
    joinStartup: () => startup, joinRunner: () => runner?.drain() ?? Promise.resolve(),
    dispose: () => { limiter.dispose(); }, closeStore: () => store.close(),
    clearDeadline: () => { clearTimeout(deadline); },
    removeSignals: () => { for (const signal of signals) process.removeListener(signal, onSignal); },
  });
  const onSignal = () => { http.stop(); }; // stop observes and retains the same task before returning.
  for (const signal of signals) process.once(signal, onSignal);
  try {
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
      const input = await readFile('assets/demo/model-front.png'), { photo } = await analyzePhoto(input), photoId = newId(), path = `photos/${photoId}.jpg`;
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
      const app = createApp(env, { store, runner, signal: shutdown.signal });
      const server = serve({
        fetch: (...args) => http.handle(() => app.fetch(...args), () => new Response(JSON.stringify({ mode: env.mode, error: 'server_closed' }), { status: 503, headers: { 'Content-Type': 'application/json' } })),
        hostname: '127.0.0.1', port: env.port,
      });
      // Install the bridge in the same turn as serve, before asynchronous bind events.
      http.attach({
        subscribe: events => {
          const onReady = () => { events.ready(); }, onError = (error: Error) => { events.error(error); }, onClose = () => { events.close(); };
          server.on('listening', onReady); server.on('error', onError); server.on('close', onClose);
          if (server.listening) events.ready();
          return () => { server.removeListener('listening', onReady); server.removeListener('error', onError); server.removeListener('close', onClose); };
        },
        close: () => new Promise<void>((resolve, reject) => {
          server.close(error => {
            // joinListener waits for ready/error/close first; this cannot excuse a pending bind.
            if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else resolve();
          });
        }),
      });
    }
  } catch (error) {
    http.fail(error); // Sticky startup failure keeps the lock; cleanup is already observed.
  } finally { finishStartup(); }
  await http.wait(); // Actual startup, listener, disconnected handlers and Runner all joined.
}
main().catch(error => {
  console.error(error instanceof EnvError || error instanceof StoreLocked ? error.message : 'Server lifetime failed; owner lock release not confirmed');
  process.exitCode = error instanceof EnvError || error instanceof StoreLocked ? error.exitCode : 1;
});
