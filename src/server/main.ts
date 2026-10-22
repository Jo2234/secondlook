import { loadEnv, EnvError } from './env.js';
import { StoreLocked } from './store.js';
import { createFixtureSession } from './fixture-session.js';
import { SHUTDOWN_MS } from '../youcam/limits.js';
async function main(): Promise<void> {
  const env = loadEnv();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const signals = ['SIGINT', 'SIGTERM'] as const;
  const session = createFixtureSession(env, {
    armDeadline: () => {
      deadline ??= setTimeout(() => { console.error('shutdown_deadline; ownership not cleanly released'); process.exit(1); }, SHUTDOWN_MS);
    },
    clearDeadline: () => { clearTimeout(deadline); },
    removeSignals: () => { for (const signal of signals) process.removeListener(signal, onSignal); },
  });
  const onSignal = () => { session.stop(); };
  for (const signal of signals) process.once(signal, onSignal);
  await session.wait();
}
main().catch(error => {
  console.error(error instanceof EnvError || error instanceof StoreLocked ? error.message : 'Server lifetime failed; owner lock release not confirmed');
  process.exitCode = error instanceof EnvError || error instanceof StoreLocked ? error.exitCode : 1;
});
