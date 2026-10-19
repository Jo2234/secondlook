// PROPOSED ONLY. Import in the caller's existing resident Node runtime; do not start an extra wrapper.
import { spawn } from 'node:child_process';
import { lstat, mkdir, open } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
export async function captureGranted({ argv, cwd, env, callerNamespace }) {
  try { await lstat(callerNamespace); throw new Error('caller_namespace_used'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const started = performance.now(), cap = 2_097_152;
  const buffers = { stdout: [], stderr: [] }, eof = { stdout: false, stderr: false };
  let bytes = 0, exit = null, rootReaped = false, stopCause = null, childError = null;
  const signals = [], timers = [];
  const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = cause => {
    if (stopCause) return; stopCause = cause;
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); signals.push('TERM retained caller root'); }
    timers.push(setTimeout(() => { if (!rootReaped) { child.kill('SIGKILL'); signals.push('KILL retained caller root'); } }, 2000));
  };
  timers.push(setTimeout(() => stop('caller_work_deadline'), 60_000));
  for (const name of ['stdout', 'stderr']) {
    child[name].on('data', chunk => {
      const accepted = chunk.subarray(0, Math.max(0, cap - bytes)); bytes += accepted.length;
      if (accepted.length) buffers[name].push(Buffer.from(accepted));
      if (accepted.length !== chunk.length) stop('caller_output_cap');
    });
    child[name].once('end', () => { eof[name] = true; });
  }
  child.once('error', error => { childError = error.name; });
  child.once('exit', (code, signal) => { exit = { code, signal }; rootReaped = true; });
  await new Promise((resolve, reject) => {
    const final = setTimeout(() => { stop('caller_close_deadline'); reject(new Error('caller root/stdio closure unresolved; preserve namespace absence')); }, 65_000);
    timers.push(final); child.once('close', () => { clearTimeout(final); resolve(); });
  }).finally(() => { for (const timer of timers) clearTimeout(timer); });
  const stdioClosed = child.stdout.closed && child.stderr.closed;
  const receipt = { pid: child.pid, exit, rootReaped, stdioClosed, eof, stopCause, childError, outputBytes: bytes, elapsedMs: performance.now() - started, signals,
    qualification: 'retained caller root only; no descendant/global absence or OS resource sandbox proof' };
  if (!rootReaped || !stdioClosed || !eof.stdout || !eof.stderr) throw new Error('caller output retained in memory only: closure not proven');
  // Runner namespace and must-absent runner files are never precreated by this caller.
  // All caller writes occur only after root exit/reap plus EOF/stdio closure.
  await mkdir(callerNamespace);
  for (const name of ['stdout', 'stderr']) { const file = await open(`${callerNamespace}/${name}.log`, 'wx', 0o600); try { await file.writeFile(Buffer.concat(buffers[name])); } finally { await file.close(); } }
  const file = await open(`${callerNamespace}/receipt.json`, 'wx', 0o600); try { await file.writeFile(JSON.stringify(receipt, null, 2) + '\n'); } finally { await file.close(); }
  return receipt;
}
