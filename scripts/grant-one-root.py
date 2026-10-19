"""PROPOSED ONLY. Exact retained direct root, finite admission and guarded cleanup; UNRUN."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time
ROOT = None
STOP_REQUESTED = False
PREPARATION_END = None
SUPERVISOR_END = None


def request_stop(signum, frame):
    # A second TERM cannot interrupt cleanup or lose a just-returned Popen handle.
    global STOP_REQUESTED
    STOP_REQUESTED = True


def clock():
    value = time.monotonic()
    if not math.isfinite(value):
        raise RuntimeError('nonfinite clock')
    return value


def require_preparation():
    if STOP_REQUESTED or clock() >= PREPARATION_END:
        raise RuntimeError('preparation admission closed; no target launch')


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(65536), b''):
            require_preparation()
            result.update(chunk)
    return result.hexdigest()


def write_json(path, value, exclusive=False):
    with Path(path).open('x' if exclusive else 'w') as target:
        json.dump(value, target, indent=2)
        target.write('\n')


def save(receipt):
    temporary = ROOT / 'receipt.json.tmp'
    write_json(temporary, receipt)
    temporary.replace(ROOT / 'receipt.json')


def run_stage(stage, spec, receipt):
    environment = spec['environments'][stage['environmentKey']]
    record = dict(name=stage['name'], argv=stage['argv'], cwd=spec['cwd'], environment=environment,
                  directRootPid=None, nativeExitCode=None, rootReaped=False, stdioClosed=False,
                  streamEOF={'stdout': False, 'stderr': False},
                  streamClosed={'stdout': False, 'stderr': False}, streamErrors={'stdout': [], 'stderr': []},
                  stopCause=None, cleanupErrors=[], ownershipUnknown=False, boundFailures=[],
                  signals=[], outputBytes=0, descendantAbsence='NOT_CLAIMED', globalAbsence='NOT_CLAIMED')
    receipt['stages'].append(record)
    child = None
    captured_wait = None
    retained_pid = None
    selector = None
    logs = {}
    started = None
    work_end = None

    def check_end(now, end, name):
        # Known exhaustion is sticky and separate from clock/operation uncertainty.
        if now is not None and end is not None and now >= end:
            if name not in record['boundFailures']:
                record['boundFailures'].append(name)

    def problem(where, error):
        record['ownershipUnknown'] = True  # Sticky even if a later operation succeeds.
        record['cleanupErrors'].append(where + ': ' + type(error).__name__)

    def sample(where):
        try:
            return clock()
        except BaseException as error:
            problem(where, error)
            return None

    def remaining(end, maximum):
        now = sample('cleanup clock')
        check_end(now, end, 'cleanup_deadline')
        check_end(now, SUPERVISOR_END, 'supervisor_envelope')
        return 0 if end is None or now is None else max(0, min(maximum, end - now))

    def signal_retained(method, name):
        try:
            # Never adopt a pid, group, replacement or mismatched handle. A failed poll
            # leaves only this exact retained, not-yet-reaped direct handle eligible.
            if child.pid != retained_pid:
                raise RuntimeError('retained handle identity mismatch')
            if not record['rootReaped'] and child.returncode is None:
                method()
                record['signals'].append({'target': 'retained_direct_root', 'pid': retained_pid, 'signal': name})
        except BaseException as error:
            problem('root ' + name, error)

    try:
        for label in ['stdout', 'stderr']:
            logs[label] = (ROOT / (stage['name'] + '.' + label + '.log')).open('xb')
        require_preparation()
        started = clock()
        # Final admission immediately before Popen. 15s preparation in a 50s local
        # envelope leaves >=35s for 30s target + 2s TERM + 2s KILL/wait and 1s margin.
        if STOP_REQUESTED or started >= PREPARATION_END or SUPERVISOR_END - started < 35:
            raise RuntimeError('insufficient reserved target and cleanup allowance')
        work_end = started + stage['workSeconds']
        child = subprocess.Popen(stage['argv'], cwd=spec['cwd'], env=environment,
                                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=True)
        # Capture before any clock, receipt, selector or stdio bookkeeping can fail.
        captured_wait = child.wait
        retained_pid = child.pid
        record['directRootPid'] = retained_pid
        record['rootHandleRetainedBySupervisorPid'] = os.getpid()
        save(receipt)
        print(json.dumps({'started': stage['name'], 'directRootPid': retained_pid}), flush=True)
        selector = selectors.DefaultSelector()
        for label in ['stdout', 'stderr']:
            selector.register(getattr(child, label), selectors.EVENT_READ, label)
        while True:
            if STOP_REQUESTED:
                record['stopCause'] = 'cooperative_supervisor_TERM'
                break
            if clock() >= work_end:
                record['boundFailures'].append('work_deadline')
                record['stopCause'] = 'work_limit'
                break
            if not selector.get_map() and child.poll() is not None:
                break
            for key, _ in selector.select(0.05):
                label = key.data
                try:
                    chunk = os.read(key.fd, 65536)
                except BaseException as error:
                    record['streamErrors'][label].append(type(error).__name__)
                    raise
                if not chunk:
                    record['streamEOF'][label] = True
                    selector.unregister(key.fileobj)
                    continue
                room = max(0, spec['limits']['combinedOutputBytes'] - receipt['outputBytes'])
                accepted = chunk[:room]
                logs[label].write(accepted)
                logs[label].flush()
                receipt['outputBytes'] += len(accepted)
                record['outputBytes'] += len(accepted)
                if len(chunk) > room:
                    record['stopCause'] = 'output_limit_truncated'
                    break
            if record['stopCause']:
                break
    except BaseException as error:
        record['stopCause'] = 'supervisor_error'
        problem('supervisor work', error)
    finally:
        # The first cleanup sample fixes the only cleanup end. It is never refreshed.
        # If the clock is broken, all waits are still invoked with timeout=0.
        cleanup_start = sample('cleanup start clock')
        cleanup_end = None if cleanup_start is None else min(SUPERVISOR_END, cleanup_start + 4)
        check_end(cleanup_start, work_end, 'work_deadline')
        check_end(cleanup_start, SUPERVISOR_END, 'supervisor_envelope')
        record['workSeconds'] = None if started is None or cleanup_start is None else round(cleanup_start - started, 3)
        if child is not None:
            try:
                try:
                    child.poll()
                except BaseException as error:
                    problem('root poll before TERM', error)
                signal_retained(child.terminate, 'TERM')
                timeout = remaining(cleanup_end, 2)
                try:
                    captured_wait(timeout=timeout)
                    record['nativeExitCode'] = child.returncode
                    record['rootReaped'] = True
                except subprocess.TimeoutExpired:
                    record['earlyRootWaitTimedOut'] = True
                except BaseException as error:
                    problem('early captured root wait', error)
                try:
                    child.poll()
                except BaseException as error:
                    problem('root poll before KILL', error)
                signal_retained(child.kill, 'KILL')
            finally:
                # Timeout computation is guarded separately from this actual wait.
                timeout = remaining(cleanup_end, 2)
                try:
                    captured_wait(timeout=timeout)
                    record['nativeExitCode'] = child.returncode
                    record['rootReaped'] = True
                except BaseException as error:
                    problem('final captured root wait/reap', error)
        resources = [('selector', selector)]
        if child is not None:
            resources.extend((label, getattr(child, label)) for label in ['stdout', 'stderr'])
        resources.extend((label + ' log', handle) for label, handle in logs.items())
        for label, resource in resources:
            if resource is not None:
                try:
                    resource.close()
                    if label in record['streamClosed']:
                        record['streamClosed'][label] = resource.closed is True
                except BaseException as error:
                    if label in record['streamErrors']:
                        record['streamErrors'][label].append(type(error).__name__)
                    problem(label + ' close', error)
        record['stdioClosed'] = all(record['streamClosed'].values())
        finished = sample('work elapsed clock')
        check_end(finished, cleanup_end, 'cleanup_deadline')
        check_end(finished, SUPERVISOR_END, 'supervisor_envelope')
        record['stageElapsedSeconds'] = None if started is None or finished is None else round(finished - started, 3)
        if STOP_REQUESTED and not record['stopCause']:
            record['stopCause'] = 'cooperative_supervisor_TERM'
        record['acceptedWithinDirectRootScope'] = (record['nativeExitCode'] == 0 and record['rootReaped']
            and record['stdioClosed'] and all(record['streamEOF'].values()) and not record['stopCause']
            and not record['ownershipUnknown'] and not record['cleanupErrors']
            and not record['boundFailures'] and finished is not None and cleanup_end is not None
            and finished < cleanup_end and finished < SUPERVISOR_END)
        # Evidence failures happen only after every owned resource cleanup attempt.
        save(receipt)
        print(json.dumps({'completed': record}), flush=True)
    return record['acceptedWithinDirectRootScope']


def main():
    global ROOT, PREPARATION_END, SUPERVISOR_END
    signal.signal(signal.SIGTERM, request_stop)
    origin = clock()
    PREPARATION_END = origin + 15
    SUPERVISOR_END = origin + 50
    parser = argparse.ArgumentParser()
    parser.add_argument('--proposal', required=True)
    parser.add_argument('--proposal-sha256', required=True)
    parser.add_argument('--runner-sha256', required=True)
    parser.add_argument('--grant-file', required=True)
    args = parser.parse_args()
    if digest(args.proposal) != args.proposal_sha256 or digest(__file__) != args.runner_sha256:
        raise RuntimeError('proposal/runner bytes mismatch')
    spec = json.loads(Path(args.proposal).read_text())
    if (spec.get('status') != 'PROPOSED_NOT_AUTHORIZED_NOT_EXECUTED' or not isinstance(spec.get('candidate'), str)
        or len(spec['candidate']) != 40 or spec.get('sourceCommit') != spec['candidate']):
        raise RuntimeError('only a postcommit exact candidate proposal is eligible for review')
    if (spec['limits'] != dict(rootDeadlineSeconds=30, combinedOutputBytes=2097152, rootTermSeconds=2, rootKillReapSeconds=2,
                              preparationSeconds=15, supervisorEnvelopeSeconds=50, launchReserveSeconds=35)
        or len(spec['stageSequence']) != 1 or spec['stageSequence'][0]['workSeconds'] != 30):
        raise RuntimeError('fixed target/cleanup/admission bounds mismatch')
    ROOT = Path(spec['namespace'])
    if str(Path.cwd()) != spec['cwd']:
        raise RuntimeError('actual cwd mismatch')
    observed = dict(os.environ)
    optional = observed.pop('__CF_USER_TEXT_ENCODING', None)
    if optional not in (None, '0x1F6:0x0:0x0') or observed != spec['outerEnvironment']:
        raise RuntimeError('observed environment mismatch; values withheld')
    grant = json.loads(Path(args.grant_file).read_text())
    required = {key: spec[key] for key in ['project', 'candidate', 'cwd', 'namespace', 'sourcePinsSha256', 'stageSequence', 'environments', 'limits', 'allowedWrites', 'outerEnvironment']}
    required.update(authorized=True, heavySlotAuthorized=True, grantId=spec['requestedGrantId'], proposalSha256=args.proposal_sha256, runnerSha256=args.runner_sha256)
    if any(type(grant.get(key)) is not type(value) or grant.get(key) != value for key,value in required.items()):
        raise RuntimeError('fresh exact parent grant missing')
    review = grant.get('rootSourceReview', {})
    if review.get('accepted') is not True or review.get('proposalSha256') != args.proposal_sha256 or review.get('runnerSha256') != args.runner_sha256 or not review.get('reviewer'):
        raise RuntimeError('fresh parent source review missing')
    if ROOT.exists() or os.path.lexists(ROOT):
        raise RuntimeError('consumed/precreated runner namespace')
    if any(os.path.lexists(path) for path in spec['otherMustBeAbsent']):
        raise RuntimeError('consumed/precreated caller/data namespace')
    if digest(spec['sourcePinsPath']) != spec['sourcePinsSha256']:
        raise RuntimeError('source pin map changed')
    pins = json.loads(Path(spec['sourcePinsPath']).read_text())
    if pins['candidate'] != spec['candidate'] or pins.get('sourceCommit') != spec['candidate']:
        raise RuntimeError('source map candidate mismatch')
    for relative, expected in pins['files'].items():
        if digest(Path(spec['cwd']) / relative) != expected['sha256']:
            raise RuntimeError('source pin mismatch: ' + relative)
    # Historical runtime/installed receipt identities only; read exact named bodies once,
    # after the new grant. No installed tree discovery or loaded-image provenance claim.
    pin_source = spec['historicalBinding']
    if digest(pin_source['path']) != pin_source['sha256']:
        raise RuntimeError('historical binding bytes mismatch')
    retained = json.loads(Path(pin_source['path']).read_text())
    binding = retained['runtimeBinding']
    if sys.executable != binding['expectedSysExecutable'] or not sys.dont_write_bytecode or any(getattr(sys.flags,k,None) != v for k,v in binding['expectedFlags'].items()):
        raise RuntimeError('runtime entry binding mismatch')
    for alias, expected in retained['installedAliasTargets'].items():
        require_preparation()
        if str(Path(alias).resolve(strict=True)) != expected:
            raise RuntimeError('historical installed alias target mismatch')
    budget = 268435456
    named = [(p['path'],p['sha256']) for p in binding['filePins']]
    named += [(retained['runtimeFilePins']['node']['path'],retained['runtimeFilePins']['node']['sha256'])]
    installed = retained['installedFilePins']
    if len(installed) > 1467: raise RuntimeError('installed count bound')
    named += list(installed.items())
    for name, expected in named:
        require_preparation()
        with Path(name).open('rb') as file:
            size = os.fstat(file.fileno()).st_size
            if size < 0 or size > min(134217728,budget): raise RuntimeError('named body byte cap')
            remaining=size; actual=hashlib.sha256()
            while remaining:
                require_preparation()
                part=file.read(min(65536,remaining))
                if not part: raise RuntimeError('short named body')
                actual.update(part); remaining-=len(part); budget-=len(part)
            if os.fstat(file.fileno()).st_size != size or actual.hexdigest()!=expected:
                raise RuntimeError('named historical payload mismatch')
    require_preparation()
    ROOT.mkdir()
    with (ROOT/'execution.claim').open('x') as claim: claim.write(grant['grantId']+'\n')
    for name in ['tmp','cache','xdg-config']: (ROOT/name).mkdir()
    receipt={'grantId':grant['grantId'],'candidate':spec['candidate'],'sourcePinsSha256':spec['sourcePinsSha256'],'outputBytes':0,'stages':[], 'scopeGuarantee':'retained direct roots only; no descendant/global absence, OS sandbox, loaded-image or publisher proof'}
    accepted=False
    try:
        accepted=run_stage(spec['stageSequence'][0],spec,receipt)
    finally:
        receipt['acceptedWithinDirectRootScope']=accepted
        save(receipt)
        # Last stdout line is a narrowly scoped explicit acknowledgement to the caller.
        stage = receipt['stages'][0] if receipt['stages'] else {}
        print(json.dumps({'retainedTargetClosure': dict(candidate=spec['candidate'], stage=stage.get('name'),
            pid=stage.get('directRootPid'), rootReaped=stage.get('rootReaped', False),
            stdioClosed=stage.get('stdioClosed', False), ownershipUnknown=stage.get('ownershipUnknown', True),
            streamEOF=stage.get('streamEOF'), streamErrors=stage.get('streamErrors'),
            boundFailures=stage.get('boundFailures'),
            acceptedWithinDirectRootScope=stage.get('acceptedWithinDirectRootScope', False))}), flush=True)
    return 0 if accepted else 1

if __name__ == '__main__':
    sys.exit(main())
