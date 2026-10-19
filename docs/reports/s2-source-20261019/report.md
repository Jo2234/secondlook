# YouCam runner control correction — R1/R2/R3 — 19 October 2026

Status: SOURCE ONLY; all new behavioral checks DRAFT / UNRUN. No grant, execution request, launch, F33 pass, fixture API pass, S1/S2 completion or release readiness. Parent source review remains required.

## Identity and binding

Correction branch: `codex/youcam-runner-r1-r3-source-20261019-r8`, based on clean `0416de4b6f2dbdffd02ee0f13cad5ec4985aa7c7`. The prior source candidate `8c6b909ed09c70c0e5cf0fa2bfb3a53030c1d8e6` and every prior ref remain historical; neither is labelled the current correction candidate.

Before any source edit, the entire original `docs/reports/s2-source-20261019/` directory and both runners were copied to the new ignored scratch snapshot `test-results/youcam-r1-r3-source-correction-20261019-r8/frozen-original/`. Original receipts, patches, failures and namespaces remain untouched. Original report/proposal bytes are frozen there and in Git at 0416de4.

A commit cannot contain its own SHA. Tracked proposal/caller/pin JSON files are deliberately non-executable templates with null candidate/sourceCommit and a draft status that the supervisor rejects. After the final source commit, the ignored sibling `test-results/youcam-r1-r3-source-correction-20261019-r8/prospective/` contains fresh exact copies with the actual clean final HEAD in candidate/sourceCommit, a source map covering final tracked text plus explicitly inherited PNG metadata, and exact runner/caller/proposal hashes. That packet is prospective review material only, with no authority or execution request. It is outside the pinned tree, so no self-hash cycle or later report-only HEAD mismatch is introduced. The packet handoff records the exact final clean commit, map/proposal/caller hashes, changed paths and full correction patch.

## R1: finite admission and cooperative target cleanup

The caller has one original 60,000 ms total envelope. It requests cooperative supervisor TERM by 55,000 ms, permits four seconds for the supervisor's target cleanup, and uses the remaining one second for direct supervisor exit and both pipe-close observations. It never signals the Node target or any group/unknown descendant. Its only signalable handle is the exact retained direct supervisor, with its original pid, before reap. A false/throwing signal is sticky unknown. No interval or refreshed outer deadline was added.

The supervisor installs a flag-only SIGTERM handler before preparation. Repeated TERM cannot raise through cleanup or lose a just-returned Popen handle. Local preparation is capped at 15 seconds in a 50-second local envelope; hash chunks/alias/body loops and final pre-Popen admission check the cutoff. Immediately before Popen it requires at least 35 seconds remaining: 30 seconds target work, 2 seconds TERM wait, 2 seconds KILL/final wait, one second margin. Target work begins before Popen. No target starts on late preparation or a cooperative stop flag. There is no shared cross-process monotonic epoch.

The supervisor retains its actual Popen handle/wait before fallible bookkeeping. Its final stdout line explicitly reports that target's pid, candidate, stage, actual reap, per-stream closure/EOF/errors, sticky unknown and acceptance. Caller validation requires this source-bound closure message; Python exit and pipes alone cannot imply target cleanup. Missing or uncertain acknowledgement preserves absence of the caller namespace and returns an error with the in-memory receipt.

These remain cooperative local deadlines, not a hard OS quota against blocked I/O, a stalled event loop or process startup. No descendant/global absence, native loaded-image/provenance or OS resource sandbox proof is claimed. A hard outer cutoff without a proven target acknowledgement remains unknown and is not accepted.

## R2: one caller failure and final-wait path

Both pipes receive error handlers before data capture starts. Each lexical `const name` has its own EOF, close and error state; no shared-var callback label is used. Stream error and stream close never synthesize EOF. Root errors, pipe errors, capture exceptions, output cap and deadline enter one guarded cleanup path. Signal failures are retained independently. Final exit, ChildProcess close, stdout close and stderr close waits are each attempted under the original envelope even after another wait or signal fails. Unknown is sticky.

Capture remains capped at 2 MiB combined. Separate caller wx evidence is written only after actual supervisor exit/reap, actual EOF and close on both streams, explicit target closure, and no unknown. Failure carries a bounded in-memory receipt without precreating runner/caller paths. A cleanup receipt is not a target success result.

## R3: clock-independent retained final wait

The supervisor freezes one cleanup end at cleanup entry, capped by the original local envelope, and never refreshes it. Clock exceptions/nonfinite readings are guarded independently; absent clock knowledge supplies zero remaining timeout. The captured actual early wait and final wait are called separately from timeout calculation, including timeout zero. Poll, TERM, early wait, KILL and final wait failures remain sticky unknown; a later successful wait can record actual reap but cannot erase that uncertainty. Reaped or mismatched handles cannot be signalled. Every selector/pipe/log close is independently attempted before evidence writes. Per-stream EOF, actual closed state and errors are separate facts. Fallible elapsed-time or evidence bookkeeping cannot bypass the retained-root cleanup attempts.

No product/server/image source, existing tests/assertions, thresholds, shared schemas, dependency/lock pins or installed bindings changed. Historical installed/runtime byte vectors were not followed or hashed. Future exact granted preparation retains their old count/size/alias bounds; old identities supply no authority.

## Check status and prospective proposals

There were zero target launches, zero behavioral test executions and zero descendants in this correction. Source/Git/JSON operations and Python AST-as-data inspection are the only validation permitted. No target import/parser, Node target runtime, Python runner runtime, fake harness, tsc, Vitest, build, browser, listener, database, network, OS probe, package manager, installation, download or rebuild ran. No installed/executable/native/model/PNG artifact body hash was computed. A separate source-text pin map distinguishes inherited PNG metadata from newly computed text hashes.

`caller-boundary-draft.json` and `supervisor-boundary-draft.json` are at most one prospective injected-boundary draft per language, both UNRUN; no harness has been implemented or invoked. Their cases cover late admission, repeated TERM, per-stream error/EOF/close attribution, zero-budget actual waits, clock/poll/signal/close errors, sticky unknown, identity mismatch and missing target acknowledgement. They are not execution requests.

F33 and fixture API exact prospective packet proposals still select one existing test file each, one max worker, threads pool, no file parallelism, bail 1, 30-second work, 2 MiB combined output and 2+2-second target cleanup. Original proposed runner/caller/data namespaces are preserved and never created or reserved. New grant IDs and future grant paths identify this correction packet; no grant file is created. Parent must review the actual clean commit and exact packet before considering any fresh reservation/recipient/command/environment read or grant. No execution is requested now.

## Preserved coverage limits

Exactly nine pure successes are historical evidence at `7da22615967ecab6216284d0b4574dc5cd3744d7`, not results of this correction. The twelve receipt-pinned files and original evidence are unchanged. Older r6 typecheck/68 pure/generator/synth results apply to tested `936770d`, not the S2 tree. Later main/disclosure/integration/control source remains untested.

F33 is prepared, not generated/decoded/executed/passed; S1 remains incomplete. The API proposal is only a narrow no-listener in-process fixture checkpoint for happy garment gating, buyer disabled, sequential replay/conflict and durable ambiguous POST. It does not establish concurrency, crash/restart, cancellation, result success, live transport, canary or S2 acceptance. No native RSS result is available.

Retry and explicit artifact recovery remain 503 NOT READY. Enabled buyer/consent creation, rights-manifest live admission, live preflight CLI, failpoints, crash/restart harness and contract mock remain incomplete. Periodic 60-second TTL and complete buyer job-reference deletion are pending. Test header scenario override and model quality/manifest integration remain pending. Frozen domain batch-expiry `deadline` versus planned `batch_deadline` remains a gap.

Result publication and terminal success/settlement occur in separate commits, leaving cancellation/crash reconciliation pending. Download phase bounds depend on reducer events rather than an independent phase timer. Admission is durable before queue capacity acquisition, so queue-full recovery must be resolved before general S2 admission acceptance. Request-schema completeness, state replay, lock races, fault-injected bounds, disclosure pixels, canary and full F4–F40 coverage remain pending. The direct-Node pure test's broader command integration remains pending.

Live startup remains fail closed with or without a key and constructs no live client/fallback. Static main imports the native adapter before loadEnv, so no before-native-load claim is made. No fixture/contract source or result satisfies L1–L4 or final contest gates.

## Terminal handoff scope

This is a finite source-only correction. Preserve all refs, old receipts/failures and frozen guards. No reservation mutation, self-grant, main integration, publication, submission, source-project export or conversation copy. The parent collects/reviews the terminal result and alone settles after terminal/no-active/pending-zero verification; this child does not self-settle or assert unrelated process state. Full correction patch and pin/proposal packet stay in scratch; only the final human-readable report may be saved for automatic delivery.
