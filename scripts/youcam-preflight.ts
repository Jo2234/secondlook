import { parseEnv, EnvError } from '../src/shared/env.js';
import { YouCamError } from '../src/youcam/client.js';
import { createHttpClient } from '../src/youcam/http-client.js';
import { createHttpsTransport } from '../src/youcam/transport.js';
import { collectPreflight } from '../src/youcam/preflight-run.js';
import { preflightSummary } from '../src/youcam/preflight-summary.js';
import { SlidingLogLimiter } from '../src/youcam/rate-limiter.js';
import { systemClock } from '../src/youcam/operations.js';
async function main() {
  const env = parseEnv(process.env);
  if (env.mode !== 'live') throw new EnvError('Preflight requires YOUCAM_MODE=live');
  const transport = createHttpsTransport(), limiter = new SlidingLogLimiter(systemClock);
  const controller = new AbortController(), stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const client = createHttpClient({ apiKey: env.apiKey!, baseUrl: env.baseUrl, transport, grant: signal => limiter.acquire(signal), clock: systemClock });
    const result = preflightSummary(await collectPreflight({ client, signal: controller.signal, fenceSeq: 0, baseUrl: env.baseUrl }));
    return { ...result, text: result.text.replaceAll(env.apiKey!, '[redacted]') };
  } finally { limiter.dispose(); transport.close(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
main().catch(error => preflightSummary(error instanceof EnvError || error instanceof YouCamError ? error : new YouCamError('transport'))).then(result => { console.log(result.text); process.exitCode = result.exitCode; });
