# S0/S1 tested checkpoint — 19 October 2026

Base source: d962f6f8ebf5920427c3d337e94a5facef181d4a. Dependency materialization B1039 is closed/released by the master. No main merge, live call or buyer enabling occurred.

## Executed checks

Pinned Node24.22.0 executed installed TypeScript6.0.3 and Vitest4.1.12 entrypoints directly, without a package manager. Each child received only the explicit PATH/LANG/LC_ALL/TZ/CI/TMPDIR/XDG_CONFIG_HOME map recorded in the receipts. No secret or user configuration was inherited. Work limit30s, combined output2MiB; process censuses1s, TERM/KILL/reap2s each, plus local overhead. Known owned process identities/groups were absent at completion; no signals/errors or source mutation during either check. Sampling is not an exhaustive process-lifetime or OS-sandbox guarantee.

| Check | Result | Time | Raw output |
|---|---|---|---|
| Direct tsc --noEmit | PASS, exit0 | 2.654s | empty |
| tests/unit/errors.test.ts | PASS, 4 tests | combined2.382s | retained |
| tests/unit/job-machine.test.ts | PASS, 11 tests | same run | retained |
| tests/unit/ledger.test.ts | PASS, 6 tests | same run | retained |

Total:21 passed,0 failed,0 skipped in3 named files. First executions both passed. No reruns or application corrections were necessary; no first failure exists to preserve. Exact argv/environment, entrypoint/Node/package JSON hashes, source file hashes, PID/PPID/PGID/birth/load, exits, known child inventory and raw logs are retained under worker scratch small-checks-20261019 and exported checkpoint evidence. No other test file ran.

The three accepted source findings now have targeted runtime evidence: own-property/independent error mapping, bounded shared GET-limiter retry accounting, and single result-refresh termination. The ledger tests cover admission/replay/fence/margin and idempotent unsent release. This does not establish crash/store/transport or final product acceptance.

## This source checkpoint

The raw two-document pnpm-lock.yaml is committed byte-for-byte, SHA256 c942728cd5b9ea8d672dfbb17de5af0ff1e56c9396c88c4e0d97c640965f35d1. No pin/config/threshold/retention/domain/test change. Historical B117/A2/help/0941 evidence stays immutable; future validation uses a new source manifest.

Corrected scripts/licenses.mjs to inventory both manager and application lockfile documents; the old code selected only the first packages section. The new script was source-reviewed, not executed. docs/licenses.json/md were generated using dependency-free Python reads of the raw lockfile and installed package JSON metadata:279 records (15 manager,264 application),189 licence metadata records available,90 pending. No dependency code was imported. Metadata is not licence-notice/legal or payload authenticity review. libvips LGPL-3.0-or-later note retained.

README now records installed dependencies and the limited21-test/typecheck result. Typechecked/tested TS modules/configs and the three test files remain byte-identical to the passing base; subsequent changes are the preserved lockfile, licence script/inventory and documentation. Therefore no broadened/redundant test run was made.

## Pending acceptance

Other pure files are drafted but UNRUN in this task. A separate full-pure grant proposal is required; this is not a full S0/S1 acceptance. Image/fixture/native sharp load, quality raster/normalization/calibration, F16 process startup, store/crash/transport/HTTP/browser/UI/demo/submission/live coverage remain UNRUN or not yet implemented. F25 pure settlement evidence does not substitute for process crash recovery. Final F36 UI/demo/submission coverage is pending. PC-1 remains disabled; no fit claim or real-person consent is added.

Separate proposed full-pure and G-img-0 executions are source drafts only, not grants. Do not run either until a new exact master authorization. No automatic next stage, heavy reservation change or main merge.

## Static inventory (declarations, not runtime passes)

| File | Declared tests | Task result |
|---|---|---|
| tests/img/synth.test.ts | 1 | UNRUN |
| tests/int/env-startup.test.ts | 2 | UNRUN |
| tests/property/job-machine.test.ts | 2 | UNRUN |
| tests/property/listing-copy.test.ts | 1 | UNRUN |
| tests/property/measurements.test.ts | 1 | UNRUN |
| tests/property/rate-limiter.test.ts | 2 | UNRUN |
| tests/unit/capabilities.test.ts | 3 | UNRUN |
| tests/unit/copy.test.ts | 5 | UNRUN |
| tests/unit/env.test.ts | 4 | UNRUN |
| tests/unit/errors.test.ts | 4 | PASS |
| tests/unit/job-machine.test.ts | 11 | PASS |
| tests/unit/ledger.test.ts | 6 | PASS |
| tests/unit/listing.test.ts | 2 | UNRUN |
| tests/unit/measurements.test.ts | 3 | UNRUN |
| tests/unit/net-policy.test.ts | 2 | UNRUN |
| tests/unit/pure-imports.test.ts | 1 | UNRUN |
| tests/unit/quality-gate.test.ts | 4 | UNRUN |
| tests/unit/schemas.test.ts | 2 | UNRUN |
| tests/unit/sku-binding.test.ts | 2 | UNRUN |
