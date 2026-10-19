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
export function createApp(env: AppEnv, services?: Services) {
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
  app.get('/api/health', c => c.json({ mode: env.mode, version: '0.0.0', thresholdsVersion: THRESHOLDS_VERSION, buyerUpload: 'disabled', preflight: services?.store.snapshot().preflight ?? null, capabilities: [...BASE_CAPABILITIES] } satisfies HealthResponse));
  app.get('/', c => c.html(`<!doctype html><html lang="en"><meta charset="utf-8"><title>SecondLook</title><body><p role="status">${env.mode === 'fixture' ? COPY.mode.fixture : COPY.mode.live}</p><p>Fixture API source checkpoint. Seller UI is pending.</p></body></html>`));
  if (services) fixtureRoutes(app, env, services);
  // Disabled core applies even to health-only construction and every future enabled disposition.
  for (const path of ['/api/buyer-sessions', '/api/buyer-sessions/:id/photo', '/api/buyer-sessions/:id/tryon']) app.post(path, c => c.json({ mode: env.mode, error: 'buyer_upload_disabled' }, 403));
  app.notFound(c => c.json({ mode: env.mode, error: 'not_found' }, 404));
  app.onError((error, c) => {
    if (error instanceof RouteError) return c.json({ mode: env.mode, error: error.message }, error.status);
    if (error instanceof ImageInputError) return c.json({ mode: env.mode, error: error.code }, 422);
    if (error instanceof SyntaxError) return c.json({ mode: env.mode, error: 'invalid_request', issues: [] }, 400);
    if (error.message === 'store_full') return c.json({ mode: env.mode, error: 'store_full' }, 507);
    return c.json({ mode: env.mode, error: 'internal' }, 500);
  });
  return app;
}
