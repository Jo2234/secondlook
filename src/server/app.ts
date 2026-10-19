import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from './env.js';
import type { HealthResponse } from '../shared/types.js';
import { INBOUND_MAX_BYTES } from '../youcam/limits.js';
export function createApp(env: AppEnv) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:");
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('Origin');
      const allowed = [env.port, env.vitePort].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
      if (origin && !allowed.includes(origin)) return c.json({ mode: env.mode, error: 'origin_refused' }, 403);
    }
    await next();
  });
  app.use('*', bodyLimit({ maxSize: INBOUND_MAX_BYTES }));
  app.get('/api/health', c => c.json({ mode: env.mode, version: '0.0.0', thresholdsVersion: 'pending-S1', buyerUpload: 'disabled', preflight: null, capabilities: [] } satisfies HealthResponse));
  return app;
}
