// PROPOSED ONLY. Import in the caller's existing resident Node runtime; no extra wrapper.
import { spawn } from 'node:child_process';
import { lstat, mkdir, open } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
export async function captureGranted({ argv, cwd, env, callerNamespace, candidate, stageName }) {
  if (!candidate || !stageName) throw new Error('exact_candidate_and_stage_required');
  try { await lstat(callerNamespace); throw new Error('caller_namespace_used'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const started = performance.now(), cap = 2_097_152;
  const buffers = { stdout: [], stderr: [] };
  const streams = Object.fromEntries(['stdout', 'stderr'].map(name => [name, { eof: false, closed: false, errors: [] }]));
  let bytes = 0, exit = null, rootReaped = false, spawned = false, retainedPid = null;
  let stopCause = null, ownershipUnknown = false, targetClosure = null;
  const errors = [], signals = [], timers = [], boundFailures = [];
  let wakeStop, wakeExit, wakeClose, wakeDeadline;
  const stopped = new Promise(resolve => { wakeStop = resolve; });
  const exited = new Promise(resolve => { wakeExit = resolve; });
  const closed = new Promise(resolve => { wakeClose = resolve; });
  const deadline = new Promise(resolve => { wakeDeadline = resolve; });
  const streamClosed = {};
  const streamResolvers = {};
  for (const name of ['stdout', 'stderr']) streamClosed[name] = new Promise(resolve => { streamResolvers[name] = resolve; });
  const stop = cause => { if (!stopCause) stopCause = cause; wakeStop(); };
  const fail = (where, error) => { ownershipUnknown = true; errors.push({ where, error: error?.name ?? 'unknown' }); stop(where); };
  const boundFailure = cause => { if (!boundFailures.includes(cause)) boundFailures.push(cause); stop(cause); };
  const sampleElapsed = where => {
    try {
      const elapsed = performance.now() - started;
      if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('invalid_clock');
      return elapsed;
    } catch (error) { fail(where, error); return null; }
  };
  // Arm the one outer envelope before spawn, never restart it on an exceptional path.
  timers.push(setTimeout(() => { boundFailure('caller_outer_envelope'); wakeDeadline(); }, 60_000));
  timers.push(setTimeout(() => boundFailure('caller_work_deadline'), 55_000));
  let child;
  try { child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { for (const timer of timers) clearTimeout(timer); throw error; }
  // spawn supplies a pid synchronously on success. Retain it before any callback;
  // a later event must match this identity and cannot supply a replacement.
  retainedPid = Number.isInteger(child.pid) && child.pid > 0 ? child.pid : null;
  // Only this exact retained, successfully spawned, unreaped direct handle is signalable.
  const signal = value => {
    try {
      if (retainedPid !== null && !rootReaped && child.pid === retainedPid && child.exitCode === null && child.signalCode === null) {
        const sent = child.kill(value);
        signals.push({ target: 'retained_caller_root', pid: retainedPid, signal: value, sent });
        if (!sent) fail('caller_signal_not_sent', new Error('signal_not_sent'));
      }
    } catch (error) { fail('caller_signal_' + value, error); }
  };
  const bounded = async promise => Promise.race([promise.then(() => true), deadline.then(() => false)]);
  try {
    child.once('error', error => fail('caller_root_error', error));
    child.once('spawn', () => { if (child.pid === retainedPid && retainedPid !== null) spawned = true; else fail('caller_spawn_identity', new Error('identity_mismatch')); });
    child.once('exit', (code, signal) => { exit = { code, signal }; rootReaped = true; wakeExit(); });
    child.once('close', () => { wakeClose(); });
    // Each closure captures its own stream name; EOF, close and error are independent facts.
    for (const name of ['stdout', 'stderr']) {
      child[name].on('error', error => { streams[name].errors.push(error.name); fail(name + '_error', error); });
      child[name].once('close', () => { streams[name].closed = true; streamResolvers[name](); });
      child[name].once('end', () => { streams[name].eof = true; });
    }
    for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
      try {
        const accepted = chunk.subarray(0, Math.max(0, cap - bytes)); bytes += accepted.length;
        if (accepted.length) buffers[name].push(Buffer.from(accepted));
        if (accepted.length !== chunk.length) stop('caller_output_cap');
      } catch (error) { fail(name + '_capture', error); }
    });
    await Promise.race([closed, stopped, deadline]);
  } catch (error) { fail('caller_postspawn', error); }
  finally {
    const workElapsedMs = sampleElapsed('caller_work_clock');
    if (workElapsedMs !== null && workElapsedMs >= 55_000) boundFailure('caller_work_deadline');
    if (workElapsedMs !== null && workElapsedMs >= 60_000) { boundFailure('caller_outer_envelope'); wakeDeadline(); }
    // One guarded cleanup path, also entered for pipe/capture/child errors.
    // TERM is cooperative: Python cleans its retained Node root. This caller never signals Node.
    if (!rootReaped) {
      signal('SIGTERM');
      let wakeGrace;
      const grace = new Promise(resolve => { wakeGrace = resolve; });
      try { timers.push(setTimeout(wakeGrace, 4000)); }
      catch (error) { fail('caller_grace_timer', error); wakeGrace(); }
      try { await bounded(Promise.race([exited, grace])); } catch (error) { fail('caller_early_wait', error); }
      if (!rootReaped) signal('SIGKILL');
    }
    // Independently await actual exit, ChildProcess close and both pipe closes. Zero remaining
    // budget still calls each bounded wait; a clock error cannot prevent these attempts.
    for (const [name, promise] of [['exit', exited], ['close', closed], ['stdout', streamClosed.stdout], ['stderr', streamClosed.stderr]]) {
      try { if (!await bounded(promise)) fail(name + '_closure_unresolved', new Error('deadline')); }
      catch (error) { fail(name + '_final_wait', error); }
    }
    for (const timer of timers) { try { clearTimeout(timer); } catch (error) { fail('caller_clear_timer', error); } }
  }
  // Require an explicit source-bound target closure record, never infer it from Python's exit.
  try {
    const lines = Buffer.concat(buffers.stdout).toString('utf8').trimEnd().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    const proof = last.retainedTargetClosure;
    if (proof?.candidate !== candidate || proof?.stage !== stageName || proof?.rootReaped !== true || proof?.stdioClosed !== true || proof?.ownershipUnknown !== false || !Number.isInteger(proof?.pid) || proof.pid <= 0) throw new Error('target_closure_unproven');
    targetClosure = proof;
  } catch (error) { fail('retained_target_closure', error); }
  const stdioClosed = streams.stdout.closed && streams.stderr.closed;
  // Measure after acknowledgement parsing. A delayed timer is never the acceptance clock.
  const elapsedMs = sampleElapsed('caller_clock');
  if (elapsedMs !== null && elapsedMs > 60_000) boundFailure('caller_outer_envelope');
  const receipt = { pid: retainedPid, spawned, exit, rootReaped, stdioClosed, streams, stopCause, ownershipUnknown, errors,
    targetClosure, outputBytes: bytes, elapsedMs, signals, boundFailures,
    acceptedWithinDirectRootScope: exit?.code === 0 && !stopCause && !ownershipUnknown && boundFailures.length === 0
      && elapsedMs !== null && elapsedMs <= 60_000 && targetClosure?.acceptedWithinDirectRootScope === true,
    qualification: 'retained caller and explicitly reported target roots only; no descendant/global absence or OS resource sandbox proof' };
  if (!rootReaped || !stdioClosed || !streams.stdout.eof || !streams.stderr.eof || ownershipUnknown) {
    const error = new Error('caller output retained in memory only: closure not proven');
    error.receipt = receipt;
    error.capture = { stdout: Buffer.concat(buffers.stdout), stderr: Buffer.concat(buffers.stderr) };
    throw error;
  }
  // Runner namespace is never precreated; separate wx evidence only after proven closure.
  await mkdir(callerNamespace);
  for (const name of ['stdout', 'stderr']) { const file = await open(`${callerNamespace}/${name}.log`, 'wx', 0o600); try { await file.writeFile(Buffer.concat(buffers[name])); } finally { await file.close(); } }
  const file = await open(`${callerNamespace}/receipt.json`, 'wx', 0o600); try { await file.writeFile(JSON.stringify(receipt, null, 2) + '\n'); } finally { await file.close(); }
  return receipt;
}
