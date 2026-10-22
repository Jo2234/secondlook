import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

function parentPid(pid: number): number {
  try { return Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim()); }
  catch { return 0; }
}
function ownedByRunner(pid: number): boolean {
  const seen = new Set<number>();
  while (pid > 1 && !seen.has(pid)) {
    if (pid === process.pid) return true;
    seen.add(pid); pid = parentPid(pid);
  }
  return false;
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}
export default async function teardown() {
  const root = process.env.SECONDLOOK_E2E_TEMP_ROOT;
  if (!root) throw new Error('Missing owned fixture temp root');
  // Global teardown precedes Playwright's webServer teardown. Join our server
  // before removing its lock namespace, rather than forcing an unclean close.
  let pids: number[] = [];
  try {
    pids = execFileSync('lsof', ['-t', '-iTCP:5194', '-iTCP:5195', '-sTCP:LISTEN'], { encoding: 'utf8' })
      .trim().split(/\s+/).filter(Boolean).map(Number);
  } catch (error) {
    if ((error as { status?: number }).status !== 1) throw error;
  }
  for (const pid of pids) {
    if (!ownedByRunner(pid)) throw new Error(`Refusing to stop unrelated listener ${pid}`);
  }
  // Stop the API first; concurrently stops Vite after the API has joined.
  // Signalling both would let concurrently send a second SIGTERM mid-close.
  let apiPid: number | undefined;
  if (pids.length) {
    try { apiPid = Number(execFileSync('lsof', ['-t', '-iTCP:5194', '-sTCP:LISTEN'], { encoding: 'utf8' }).trim()); }
    catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
  }
  const first = apiPid || pids[0];
  if (first && pids.includes(first) && alive(first)) process.kill(first, 'SIGTERM');
  const deadline = Date.now() + 10_000;
  while (pids.some(alive) && Date.now() < deadline) await setTimeout(100);
  if (pids.some(alive)) throw new Error('Fixture server did not finish shutdown; retaining its data root');
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`Removed fixture temp root: ${root}; exists=${fs.existsSync(root)}`);
}
