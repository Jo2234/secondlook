"""PROPOSED ONLY. One exact target root; copied r6 retained-direct-root cleanup, no global claims."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time
ROOT = None

def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(65536), b''):
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

def require_time(receipt, spec):
    if time.monotonic() >= receipt['_rootDeadline']:
        raise RuntimeError('shared root launch/work deadline reached; STOP')

def run_stage(stage, spec, receipt):
    environment = spec['environments'][stage['environmentKey']]
    record = dict(name=stage['name'], argv=stage['argv'], cwd=spec['cwd'], environment=environment,
                  directRootPid=None, nativeExitCode=None, rootReaped=False, stdioClosed=False,
                  streamEOF={'stdout': False, 'stderr': False}, stopCause=None, cleanupErrors=[],
                  signals=[], outputBytes=0, descendantAbsence='NOT_CLAIMED', globalAbsence='NOT_CLAIMED')
    receipt['stages'].append(record)
    child = None
    selector = None
    logs = {}
    started = time.monotonic()
    try:
        require_time(receipt, spec)
        for label in ['stdout', 'stderr']:
            logs[label] = (ROOT / (stage['name'] + '.' + label + '.log')).open('xb')
        child = subprocess.Popen(stage['argv'], cwd=spec['cwd'], env=environment,
                                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=True)
        record['directRootPid'] = child.pid
        record['startedUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        record['rootHandleRetainedBySupervisorPid'] = os.getpid()
        save(receipt)
        print(json.dumps({'started': stage['name'], 'directRootPid': child.pid}), flush=True)
        selector = selectors.DefaultSelector()
        for label in ['stdout', 'stderr']:
            selector.register(getattr(child, label), selectors.EVENT_READ, label)
        while selector.get_map() or child.poll() is None:
            if time.monotonic() - started >= stage['workSeconds']:
                record['stopCause'] = 'work_limit'
                break
            if time.monotonic() >= receipt['_rootDeadline']:
                record['stopCause'] = 'shared_root_deadline'
                break
            for key, _ in selector.select(0.05):
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    record['streamEOF'][key.data] = True
                    selector.unregister(key.fileobj)
                    continue
                room = max(0, spec['limits']['combinedOutputBytes'] - receipt['outputBytes'])
                accepted = chunk[:room]
                logs[key.data].write(accepted)
                logs[key.data].flush()
                receipt['outputBytes'] += len(accepted)
                record['outputBytes'] += len(accepted)
                if len(chunk) > room:
                    record['stopCause'] = 'output_limit_truncated'
                    break
            if record['stopCause']:
                break
        if child.poll() is not None:
            record['nativeExitCode'] = child.returncode
    except BaseException as error:
        record['stopCause'] = 'supervisor_error'
        record['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        record['workSeconds'] = round(time.monotonic() - started, 3)
        # Independent guarded operations only on the retained Popen direct root.
        if child is not None:
            cleanup_end = time.monotonic() + spec['limits']['rootTermSeconds'] + spec['limits']['rootKillReapSeconds']
            captured_wait = child.wait
            try:
                running = False
                try:
                    running = child.poll() is None
                except BaseException as error:
                    record['cleanupErrors'].append('root poll before TERM: ' + type(error).__name__)
                if running:
                    try:
                        child.terminate()
                        record['signals'].append({'target': 'retained_direct_root', 'signal': 'TERM'})
                    except BaseException as error:
                        record['cleanupErrors'].append('root TERM: ' + type(error).__name__)
                try:
                    captured_wait(timeout=max(0, min(spec['limits']['rootTermSeconds'], cleanup_end - time.monotonic())))
                except subprocess.TimeoutExpired:
                    record['earlyRootWaitTimedOut'] = True
                except BaseException as error:
                    record['cleanupErrors'].append('early root wait: ' + type(error).__name__)
                running = False
                try:
                    running = child.poll() is None
                except BaseException as error:
                    record['cleanupErrors'].append('root poll before KILL: ' + type(error).__name__)
                if running:
                    try:
                        child.kill()
                        record['signals'].append({'target': 'retained_direct_root', 'signal': 'KILL'})
                    except BaseException as error:
                        record['cleanupErrors'].append('root KILL: ' + type(error).__name__)
            finally:
                # Always call the captured actual wait, even with zero budget left.
                try:
                    captured_wait(timeout=max(0, cleanup_end - time.monotonic()))
                    record['nativeExitCode'] = child.returncode
                    record['rootReaped'] = True
                except BaseException as error:
                    record['cleanupErrors'].append('final captured root wait/reap: ' + type(error).__name__)
        resources = [('selector', selector)]
        if child is not None:
            resources.extend((label, getattr(child, label)) for label in ['stdout', 'stderr'])
        resources.extend((label + ' log', handle) for label, handle in logs.items())
        for label, resource in resources:
            if resource is not None:
                try:
                    resource.close()
                except BaseException as error:
                    record['cleanupErrors'].append(label + ' close: ' + type(error).__name__)
        record['stdioClosed'] = not record['cleanupErrors']
        record['logSha256'] = {label: digest(ROOT / (stage['name'] + '.' + label + '.log')) for label in logs}
        record['finishedUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        record['acceptedWithinDirectRootScope'] = (record['nativeExitCode'] == 0 and record['rootReaped']
            and record['stdioClosed'] and all(record['streamEOF'].values()) and not record['stopCause'] and not record['cleanupErrors'])
        save(receipt)
        print(json.dumps({'completed': record}), flush=True)
    return record['acceptedWithinDirectRootScope']


def main():
    global ROOT
    parser = argparse.ArgumentParser()
    parser.add_argument('--proposal', required=True)
    parser.add_argument('--proposal-sha256', required=True)
    parser.add_argument('--runner-sha256', required=True)
    parser.add_argument('--grant-file', required=True)
    args = parser.parse_args()
    if digest(args.proposal) != args.proposal_sha256 or digest(__file__) != args.runner_sha256:
        raise RuntimeError('proposal/runner bytes mismatch')
    spec = json.loads(Path(args.proposal).read_text())
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
        if str(Path(alias).resolve(strict=True)) != expected:
            raise RuntimeError('historical installed alias target mismatch')
    budget = 268435456
    named = [(p['path'],p['sha256']) for p in binding['filePins']]
    named += [(retained['runtimeFilePins']['node']['path'],retained['runtimeFilePins']['node']['sha256'])]
    installed = retained['installedFilePins']
    if len(installed) > 1467: raise RuntimeError('installed count bound')
    named += list(installed.items())
    for name, expected in named:
        with Path(name).open('rb') as file:
            size = os.fstat(file.fileno()).st_size
            if size < 0 or size > min(134217728,budget): raise RuntimeError('named body byte cap')
            remaining=size; actual=hashlib.sha256()
            while remaining:
                part=file.read(min(65536,remaining))
                if not part: raise RuntimeError('short named body')
                actual.update(part); remaining-=len(part); budget-=len(part)
            if os.fstat(file.fileno()).st_size != size or actual.hexdigest()!=expected:
                raise RuntimeError('named historical payload mismatch')
    ROOT.mkdir()
    with (ROOT/'execution.claim').open('x') as claim: claim.write(grant['grantId']+'\n')
    for name in ['tmp','cache','xdg-config']: (ROOT/name).mkdir()
    receipt={'grantId':grant['grantId'],'candidate':spec['candidate'],'sourcePinsSha256':spec['sourcePinsSha256'],'outputBytes':0,'stages':[], '_rootDeadline':time.monotonic()+spec['limits']['rootDeadlineSeconds'], 'scopeGuarantee':'retained direct roots only; no descendant/global absence, OS sandbox, loaded-image or publisher proof'}
    accepted=False
    try:
        accepted=run_stage(spec['stageSequence'][0],spec,receipt)
    finally:
        receipt.pop('_rootDeadline',None)
        receipt['acceptedWithinDirectRootScope']=accepted
        save(receipt)
    return 0 if accepted else 1

if __name__ == '__main__':
    sys.exit(main())
