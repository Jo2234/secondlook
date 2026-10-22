import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from './env.js';
import type { HealthResponse } from '../shared/types.js';
import { COPY } from '../shared/copy.js';
import { BASE_CAPABILITIES } from '../domain/capabilities.js';
import { THRESHOLDS_VERSION } from '../domain/quality/thresholds.js';
import { INBOUND_MAX_BYTES } from '../youcam/limits.js';
import { ImageInputError } from '../images/input-policy.js';
import { fixtureRoutes, RouteError } from './routes/fixture.js';
import type { Services } from './routes/fixture.js';
import { RuntimeRefused } from './owned-runtime.js';
import { StoreCommitError } from './store.js';
import { createHash } from 'node:crypto';
/** Domain-specific R36 bundle input. No directory, URL resolver or raw app override. */
export interface FixtureUiAssets { readonly index: Uint8Array; readonly css: Uint8Array; readonly script: Uint8Array }
export function createApp(env: AppEnv, services?: Services, fixtureUi?: FixtureUiAssets) {
  const staticMap = new Map<string, { bytes: Uint8Array; mime: string }>();
  if (fixtureUi) {
    if (env.mode !== 'fixture') throw new Error('fixture_ui_requires_fixture');
    for (const [input, paths, size, sha, mime] of [
      [fixtureUi.index, ['/', '/index.html'], 635, '6fbc194cef050a8a71f0d959e5784378f6c2663e00f37670e6680d93d2f13ef8', 'text/html; charset=utf-8'],
      [fixtureUi.css, ['/assets/index-Bj877RsC.css'], 9599, 'b936199abbbe9cfeac17ab8a6192b606edaed3f7fe23f001e46ce493fdb1909d', 'text/css; charset=utf-8'],
      [fixtureUi.script, ['/assets/index-Cs7ljINS.js'], 627467, '0c52aa1b43ce2c636c260edba74a2ed400f02f1b0e3d0333fa4f63146ca2a7dd', 'text/javascript; charset=utf-8'],
    ] as const) {
      if (input.byteLength !== size) throw new Error('fixture_ui_pin_mismatch');
      const bytes = new Uint8Array(input); // Own a bounded copy; later caller mutation cannot change it.
      if (createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error('fixture_ui_pin_mismatch');
      for (const path of paths) staticMap.set(path, { bytes, mime });
    }
  }
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:");
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('Origin');
      const allowed = [env.port, env.vitePort].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
      if (origin && !allowed.includes(origin)) return c.json({ mode: env.mode, error: 'origin_refused' }, 403);
      if (c.req.method !== 'DELETE') {
        const type = c.req.header('Content-Type')?.split(';')[0]?.trim();
        if (type !== 'application/json' && !(c.req.path === '/api/photos' && type === 'multipart/form-data')) return c.json({ mode: env.mode, error: 'invalid_request', issues: [] }, 400);
      }
    }
    await next();
  });
  app.use('*', bodyLimit({ maxSize: INBOUND_MAX_BYTES, onError: c => c.json({ mode: env.mode, error: 'body_too_large' }, 413) }));
  // Same guards and listener as the real API. Exact raw URL suffix excludes query/encoding aliases.
  app.use('*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') {
      const path = c.req.url.slice(c.req.url.indexOf('/', c.req.url.indexOf('://') + 3));
      const asset = staticMap.get(path);
      if (asset) {
        c.header('Content-Type', asset.mime); c.header('Content-Length', String(asset.bytes.byteLength));
        if (c.req.method === 'HEAD') return c.body(null);
        return c.body(new Uint8Array(asset.bytes));
      }
    }
    await next();
  });
  app.get('/api/health', c => c.json({ mode: env.mode, version: '0.0.0', thresholdsVersion: THRESHOLDS_VERSION, buyerUpload: 'disabled', preflight: services?.store.snapshot().preflight ?? null, capabilities: [...BASE_CAPABILITIES] } satisfies HealthResponse));
  app.get('/', c => c.html(`<!doctype html><html lang="en"><meta charset="utf-8"><title>SecondLook</title><body><p role="status">${env.mode === 'fixture' ? COPY.mode.fixture : COPY.mode.live}</p><p>SecondLook API server. Open the Vite UI at http://127.0.0.1:5195.</p></body></html>`));
  if (services) fixtureRoutes(app, env, services);
  // Disabled core applies even to health-only construction and every future enabled disposition.
  for (const path of ['/api/buyer-sessions', '/api/buyer-sessions/:id/photo', '/api/buyer-sessions/:id/tryon']) app.post(path, c => c.json({ mode: env.mode, error: 'buyer_upload_disabled' }, 403));
  app.notFound(c => c.json({ mode: env.mode, error: 'not_found' }, 404));
  app.onError((error, c) => {
    if (error instanceof StoreCommitError) return c.json({ mode: env.mode, error: error.message }, 503);
    if (error instanceof RuntimeRefused) return c.json({ mode: env.mode, error: error.code }, 503);
    if (error instanceof RouteError) return c.json({ mode: env.mode, error: error.message }, error.status);
    if (error instanceof ImageInputError) return c.json({ mode: env.mode, error: error.code }, 422);
    if (error instanceof SyntaxError) return c.json({ mode: env.mode, error: 'invalid_request', issues: [] }, 400);
    if (error.message === 'store_full') return c.json({ mode: env.mode, error: 'store_full' }, 507);
    return c.json({ mode: env.mode, error: 'internal' }, 500);
  });
  return app;
}
