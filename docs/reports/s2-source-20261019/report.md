# YouCam S1 assets / F33 / S2 source checkpoint — 19 October 2026

Status: READY FOR SOURCE REVIEW AND FRESH EXACT GRANT REVIEW. F33 is unrun. S2 is a partial, unverified source checkpoint. Live execution is NOT READY. No live result, live pass, S1 completion, S2 completion or release readiness is claimed.

## Identity and preservation

- Checkout: `/Users/johanvaz/Documents/Codex/2026-10-04/i-w/outputs/t3code-data/scratch/hackathon-workflow-20261016/projects/youcam-wt/slot1`.
- New branch: `codex/youcam-s2-fixture-source-20261019-r1`.
- Preserved starting ref: `codex/resume-20261019-s1-checkpoint-r4`, source `936770da4d4c155418b327d3829e901b9638d880`.
- Assets checkpoint: `fbb9fed5d81f96ee60362c3a1c748e5fbe923c9e`. Exact six asset hashes and lengths matched the independently closed r6 receipt, 154,298 bytes total. Its executable source equals tested 936770d. Parent subsequently reported its independent fast-forward integration; this worker did not merge main.
- F33-only source commit: `d32156d`.
- S2 first source and pure-check candidate: `7da22615967ecab6216284d0b4574dc5cd3744d7`.
- App source additions: `c80f69e` (integration preparation and disclosure orientation), `47c5811` (fixture scenario mapping).
- Final source/preparation candidate: `8c6b909ed09c70c0e5cf0fa2bfb3a53030c1d8e6`, including proposed supervisor/caller sources. The later report-only commit is not a tested source revision.
- Every commit includes `Co-Authored-By: GPT-6.1 Sol <gpt-6.1-sol@openai.com>`.

All 103 historical source pins were compared: 101 remain identical; only the authorized S0 `src/server/app.ts` and `src/server/main.ts` changed. All frozen domain/shared source, image metrics/thresholds/raster/normalization/input guards/native adapter, policies, rate limiter, limits, preflight binder, dependencies, lockfile and accepted plan remain unchanged. Existing refs, earlier failure evidence and r6 closure were preserved. No reservation file was written; no descendants were created, no polling/settling was performed.

## Implemented source

F33 is a new focused `tests/img/decode-bounds.test.ts`. It streams a valid small compressed, complete 20,000×20,000 1-bit grayscale PNG using one 2,501-byte scanline and bounded zlib buffers, not a rendered/allocated 400-million-pixel raster. It measures current root RSS plus monotonic process high-water RSS before/after and monotonic elapsed time. It emits measurement in `finally` before assertions, with an increase bound strictly below 200,000,000 bytes. It independently checks pre-native sniff rejection and real normalization rejection; no native result is mocked. It also supplies a complete two-frame APNG and an SVG named `.jpg`. Native execution and generation of these inputs have not occurred. No production image bug is claimed.

S2 additions cover the typed client contract, deterministic finite fixture scenarios/hash-prefix mapping, cancellation/deadline helpers, redaction, HTTPS transport with existing allowlist and vetted DNS lookup, bounded wire parsers and preflight pagination/balance collection. The transport uses two sockets; the runner independently permits one attempt at a time, with a capped queue. Every runner request receives the existing shared limiter's grant. Task POST intent/count and possibly-spent commitment are in the same atomic commit before the client call. Ambiguous POST outcomes have no automatic retry; only received 429 responses enter the existing bounded retry path.

The store uses an O_EXCL owner lock, self-verified owner shutdown, no automatic takeover, fsync/temp/rename/directory-fsync state commits, and one durable state containing jobs, requests and units. Recovery preserves original attempt/batch deadlines, marks unsent attempts released or sent/no-ID attempts uncertain, and installs only GET intent for resumable tasks. Succeeded attempts stay absorbing; startup can mark missing disclosed artifacts without requesting them.

The fixture API source provides DEMO health/banner, synthetic models, garment normalization/evaluation, listings, zero-cost fixture admissions, job reads/cancellation and media served from stored identifiers. Buyer creation/photo/try-on returns 403. Live startup without a key still fails closed; a configured live key reaches an explicit NOT READY refusal, with no fixture fallback or live client construction. Generated media is passed through a burned disclosure band and fixture diagonal watermark. A finite startup/request TTL deletion helper and receipts exist; no personal images or invented consent were used.

## Actual checks and evidence

Exactly one new pure check invocation ran. Absolute Node 24.22.0, direct strip-compatible TS with a scoped `.js`→`.ts` resolve hook, built-in `node:test`, `--test-isolation=none`; no Vitest/transpiler/fork worker. Test graph intentionally imports no filesystem, server, Hono app, Sharp/native image module, HTTP, SQLite or listener.

Command: Node `--import ./scripts/s2-pure-resolve.mjs --test --test-isolation=none tests/unit/s2-fixture-state.node.ts`.

Exact supplied environment: `PATH=/usr/bin:/bin`, `LANG=C`, `LC_ALL=C`, `TZ=UTC`, `CI=true`. Source pinned before launch: 7da22615967ecab6216284d0b4574dc5cd3744d7. Actual root PID 67045; exit 0; 9 tests passed, 0 failed, 0 skipped; elapsed 0.786327 s; combined output 979 bytes. Root actually reaped, stdout/stderr EOF true, both handles closed, no signals/errors. No first-red result occurred. Bounds: 30 s work / 2 MiB combined output / retained-root TERM 2 s then KILL/reap 2 s. Capture output was held in memory, then written after reap/EOF/closure. No second invocation occurred. Receipt and stdout are included alongside this report; original raw evidence and supervisor source remain under the ignored `test-results/` namespace.

The later app/disclosure/integration/proposal source was not tested. The 12 files pinned by the pure check remain unchanged. `git diff --check` passed. Six asset hashes and the historical source hashes were checked read-only. No typecheck, old 68-test suite, normalization/calibration/synth tests, generator, F33/native test, server/contract/filesystem integration, full suite, build, package manager, installation, download, rebuild, key/environment probe, browser, model or live network command ran.

Inherited r6 results apply only to tested source 936770d: tsc exit 0, 20 pure files / 68 tests passed, generator twice byte-identical, synth 1/1. They are not test evidence for the new S2 tree. Cleanup evidence is retained-direct-root only; no global/descendant absence, loaded-image/provenance or OS sandbox claim.

## Truthful remaining coverage and source limitations

- F33 is prepared, not passed; S1 final completion remains pending.
- No new source has a typecheck or server/contract/filesystem/native integration result. The prepared single API integration file is also unrun and is a narrow checkpoint, not S2 acceptance.
- Retry admission and explicit artifact recovery routes intentionally return 503 NOT READY. No enabled buyer flow, consent creation, rights-manifest live admission, live preflight CLI, failpoints, crash/restart integration harness, or contract mock is complete.
- TTL deletion runs only at startup/API requests in this checkpoint; the accepted periodic 60-second sweeper and complete buyer job-reference deletion are pending. Buyer uploads remain disabled, including with a disposition.
- Fixture hash mapping and simulator scenarios exist; the test-only X-Fixture-Scenario route override remains pending. The main path seeds a synthetic model but model quality/manifest integration still needs completion and review.
- The frozen reducer's batch-expiry error code is `deadline`, while the plan calls for `batch_deadline` for an unstarted queued attempt; this is a source-level contract gap for follow-up, not a newly observed test failure. Frozen domain source was not changed.
- Full result-phase deadline/cancellation/crash/failed-artifact behavior, lock race inventory/runtime proofs, state replay, bounds under fault injection, request schema completeness, canary scans, disclosure pixels and all final F4–F40 coverage remain pending. In particular, this narrow fixture integration proposal does not establish them.
- The new pure test is direct-Node and deliberately excluded from the old Vitest `.test.ts` pattern; future test-command integration is pending. No old test gate was weakened or reused.
- Live execution remains blocked even with a key. No fixture/contract result can satisfy L1–L4 or final contest gates.

## Prepared future exact grants — NOT AUTHORIZATION

`f33-grant-proposal.json` and `fixture-api-grant-proposal.json` each name one exact test file, cwd, absolute argv, exact environment, source-pin-map hash, proposed runner/caller source hashes, absent runner/caller/data namespaces, owned writes and cleanup. The accompanying caller-input JSON has a concrete future parent grant path and no argv placeholder. Each target has 30 s work / 2 MiB output / retained-root 2+2 s cleanup, one Node target root with one Vitest thread worker and no fork test workers. No resource cap or old image guard was widened. Native/transpiler descendants are not proven absent.

The proposed one-root Python supervisor mechanically retains the accepted r6 direct-root cleanup function. Its new guards require a fresh unique parent grant/source review, exact source pins and historical installed/runtime byte and alias bindings. Those historical pins are identities, never old authority. No runtime/installed payload hashing or supervisor execution occurred here. One prelaunch body pass retains the old <=1,467 installed-file, <=128 MiB/file and <=256 MiB combined caps; it performs no tree discovery or expansion. Python binding uses the same named -I -B runtime/flags. Source-file hashing/local overhead is not a hard OS time quota.

The proposed caller runs in an existing resident Node caller, holds <=2 MiB in memory, uses a 60-second decision deadline and 5-second retained-root cleanup/close window, and creates its separate namespace/files with O_EXCL only after actual supervisor-root reap, EOF and stdio closure. It never precreates the runner's must-absent namespace/files. All future namespaces were verified absent during preparation and left absent. Parent must recheck the actual current reservation/recipient/exact command and issue a fresh reviewed grant immediately before launch. No heavy check was started or self-granted.

Pin map: `source-pins.json` (131 tracked input files at source candidate 8c6b909). Historical comparison: `original-pin-comparison.json`. Full base-to-source patch: `test-results/s2-source-tools/full-source.diff` in this checkout (source is not exported). Report delivery only is authorized; no source bundle, main merge, publication marker or conversation copy was produced.
