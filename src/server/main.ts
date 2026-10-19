import { serve } from '@hono/node-server';
import { loadEnv, EnvError } from './env.js';
import { createApp } from './app.js';
try {
  const env = loadEnv();
  if (env.buyerUploadRefused) console.error('BUYER_UPLOAD enable refused: PC-1 disposition missing');
  // S0 serves health only. Store ownership and runner lifecycle land in S2.
  const server = serve({ fetch: createApp(env).fetch, hostname: '127.0.0.1', port: env.port });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
} catch (error) {
  console.error(error instanceof EnvError ? error.message : 'Server startup failed');
  process.exitCode = error instanceof EnvError ? error.exitCode : 1;
}
