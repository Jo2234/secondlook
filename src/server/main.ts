import { serve } from '@hono/node-server';
import { readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadEnv, EnvError } from './env.js';
import { createApp } from './app.js';
import { Store, StoreLocked } from './store.js';
import { Runner } from './runner.js';
import { newId } from './routes/fixture.js';
import { FixtureClient } from '../youcam/fixture-client.js';
import { SlidingLogLimiter } from '../youcam/rate-limiter.js';
import { systemClock } from '../youcam/operations.js';
import { recoverState } from '../youcam/workflow-state.js';
import { SHUTDOWN_MS } from '../youcam/limits.js';
import { analyzePhoto } from '../images/raster.js';
import { discloseImage, fixtureComposite } from '../images/disclose.js';
import { sweepExpired } from './ttl-sweeper.js';
import type { StoredPhoto } from '../shared/types.js';
async function main(): Promise<void> {
  const env = loadEnv(); // Missing live key still exits 2 before store/listener/native work.
  if (env.mode === 'live') throw new EnvError('Live execution is not ready; no fixture fallback');
  if (env.buyerUploadRefused || env.buyerUpload === 'enabled') console.error('Buyer upload disabled: this source checkpoint implements the disabled core only');
  const store = await Store.acquire(env.dataDir), shutdown = new AbortController();
  const limiter = new SlidingLogLimiter(systemClock);
  let server: ReturnType<typeof serve> | undefined, runner: Runner | undefined, stopping = false, ready = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    const deadline = setTimeout(() => { console.error('shutdown_deadline; owner lock retained'); process.exit(1); }, SHUTDOWN_MS); deadline.unref();
    shutdown.abort();
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await runner?.drain(); limiter.dispose(); await store.close(); clearTimeout(deadline);
    } catch { console.error('shutdown_failed; owner lock retained'); process.exitCode = 1; }
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { shutdown.abort(); if (ready) void stop(); });
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
    runner = new Runner({ store, limiter, signal: shutdown.signal, taskDeadlineMs: env.taskDeadlineMs,
      client: job => new FixtureClient({ now: systemClock.now, result: async signal => {
        const state = store.snapshot(), model = state.photos.find(p => p.id === job.modelPhotoId)!, garment = state.photos.find(p => p.id === job.garmentPhotoId)!;
        return fixtureComposite(await store.readMedia(model.normalized.path), await store.readMedia(garment.normalized.path), signal);
      } }),
      disclose: async (bytes, job, signal) => {
        const result = await discloseImage(bytes, 'fixture', signal), imageId = newId();
        return { ...result, id: imageId, listingId: job.listingId, buyerSessionId: job.buyerSessionId, jobId: job.id, mode: 'fixture', disclosedPath: `generated/${imageId}.jpg`, label: 'demo_fixture', artifactMissing: false, createdAt: new Date().toISOString(), expiresAt: null };
      },
    });
    // Startup recovery is awaited; all admitted resumptions are GET/download only.
    if (recovery.resume.length) await runner.runBatch(recovery.resume, true);
    if (shutdown.signal.aborted) { await stop(); return; }
    ready = true;
    server = serve({ fetch: createApp(env, { store, runner, signal: shutdown.signal }).fetch, hostname: '127.0.0.1', port: env.port });
  } catch (error) {
    // Keep the owner lock on startup failure: recovery is manual and quiescent.
    shutdown.abort(); limiter.dispose(); await runner?.drain().catch(() => undefined); throw error;
  }
}
main().catch(error => {
  console.error(error instanceof EnvError || error instanceof StoreLocked ? error.message : 'Server startup failed; owner lock may require quiescent recovery');
  process.exitCode = error instanceof EnvError || error instanceof StoreLocked ? error.exitCode : 1;
});
