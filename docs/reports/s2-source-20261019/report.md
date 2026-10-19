# YouCam measured expiry correction — R4 — 19 October 2026

Status: SOURCE ONLY, ready for independent parent source review. All behavioral checks, both boundary drafts, F33 and fixture API remain DRAFT / UNRUN. No execution request, reservation, grant, S1/S2 completion or live readiness.

## Identity and preservation

New branch `codex/youcam-runner-expiry-source-20261019-r9` starts at clean `4d92e7d3a20a246cd00881b8743ae156d5c94ea9`. Prior 4d92, 0416de4 and all original refs remain unchanged. Before editing, the full 26-file 4d92 ignored correction packet, including prospective proposals and frozen originals, was copied byte-for-byte to workflow `resume-20261019-child/youcam-runner-expiry-r9-source/preserved-4d92-packet/`. Tracked reports and both control sources were separately preserved there. Original ignored files are never overwritten.

The final clean source commit is bound externally after commit in that new workflow folder's `prospective/` and `handoff.json`. Tracked proposal/caller/source-pin templates retain null candidate/sourceCommit and ineligible draft status. The external map pins the complete final tracked tree, with five PNG metadata identities inherited without artifact-body reads. It never pins itself or an external report, avoiding self-hash cycles.

## R4 correction

The supervisor now latches known exhausted work, cleanup and supervisor bounds in `boundFailures`, independently of sticky `ownershipUnknown` and operation errors. Remaining time at/past the original frozen cleanup end records failure before returning zero. Cleanup entry checks original work/envelope ends, and the final guarded sample after every resource close checks original cleanup/envelope ends before acceptance. Equality is exhausted for these exclusive ends. Late exit 0 can update actual native exit/reap/closed facts but cannot remove the latch or produce bounded acceptance. Clock exceptions/nonfinite readings remain sticky unknown and still supply zero wait budget.

The captured early and final actual Popen waits remain independent and unconditional for a retained child, including timeout zero. Poll/TERM/KILL errors and every selector/pipe/log close retain their existing independent handling. No handles, signals, observers, process scans or providers were added. Actual closure and bounded acceptance are different facts; the target acknowledgement also discloses boundFailures without relaxing any existing source/candidate/stage/pid/reap/stdio/unknown check.

The caller separately records work/envelope failure. A guarded cleanup-entry sample checks the original 55,000-ms cutoff; the final guarded sample occurs after acknowledgement parsing. Acceptance explicitly requires known elapsed <=60,000 ms and no latched bound failure, even when the deadline callback was never serviced. Clock errors still set sticky unknown. The original exit/ChildProcess-close/stdout-close/stderr-close awaits, EOF guards and independent error handling remain. Proven actual closure may permit a nonpassing cleanup receipt; it cannot imply target or bounded success.

All original limits remain: 15-second preparation, 50-second local supervisor envelope, 35-second admission reserve, 30-second target work, 2+2-second target cleanup, 55-second caller stop and original 60-second caller envelope with 4-second cooperative cleanup/1-second final allowance. No end is renewed or widened. These are cooperative source bounds, not hard OS scheduling, blocked-I/O, descendant/global absence or loaded-image guarantees.

## Validation status

Optional pure helper checks were not adopted. No production helper module or test harness was added, and neither control source nor any extracted definition was imported/executed. Both existing seven-case boundary drafts preserve their original cases and append five R4 descriptions each (12 per language), covering before/equal/after ends, late zero-wait success, expiry recovery, clock errors and late callbacks. These are descriptions, not successful tests. Existing test-report.md and historical pure receipts remain byte-identical; no historical success is upgraded.

Validation is static source/Git/JSON inspection and Python AST parsing as data only. No native F33, fixture API, Vitest, Sharp, Hono, server/parser target, typecheck, PM/install/network/build/browser/model/buyer execution occurred. No runtime/package/binary/PNG body pin reads or hashes. Source case counts and exact final proposal/caller/pin hashes/modes are returned in the external packet. New runtime results remain UNRUN.

Product, server, UI, F33 assertions, all tests/configuration, thresholds, frozen S1/shared/domain/dependency/lock pins and the accepted plan are unchanged. No unrelated coordinator-ui worktree was read. Future F33 and narrow fixture API proposals preserve exact target argv/env/write paths, namespaces and historical bindings. Fresh unique r9 future grant identifiers are metadata only; no grant files are created. The parent must independently review this final commit/packet and perform fresh reservation/recipient/source checks before any separately authorized launch.

## Preserved coverage limits

Exactly nine pure successes are historical evidence at `7da22615967ecab6216284d0b4574dc5cd3744d7`, not results of this correction. The twelve receipt-pinned files and original evidence are unchanged. Older r6 typecheck/68 pure/generator/synth results apply to tested `936770d`, not the S2 tree. Later main/disclosure/integration/control source remains untested.

F33 is prepared, not generated/decoded/executed/passed; S1 remains incomplete. The API proposal is only a narrow no-listener in-process fixture checkpoint for happy garment gating, buyer disabled, sequential replay/conflict and durable ambiguous POST. It does not establish concurrency, crash/restart, cancellation, result success, live transport, canary or S2 acceptance. No native RSS result is available.

Retry and explicit artifact recovery remain 503 NOT READY. Enabled buyer/consent creation, rights-manifest live admission, live preflight CLI, failpoints, crash/restart harness and contract mock remain incomplete. Periodic 60-second TTL and complete buyer job-reference deletion are pending. Test header scenario override and model quality/manifest integration remain pending. Frozen domain batch-expiry `deadline` versus planned `batch_deadline` remains a gap.

Result publication and terminal success/settlement occur in separate commits, leaving cancellation/crash reconciliation pending. Download phase bounds depend on reducer events rather than an independent phase timer. Admission is durable before queue capacity acquisition, so queue-full recovery must be resolved before general S2 admission acceptance. Request-schema completeness, state replay, lock races, fault-injected bounds, disclosure pixels, canary and full F4–F40 coverage remain pending. The direct-Node pure test's broader command integration remains pending.

Live startup remains fail closed with or without a key and constructs no live client/fallback. Static main imports the native adapter before loadEnv, so no before-native-load claim is made. No fixture/contract source or result satisfies L1–L4 or final contest gates.

## Finite source handoff

Full scoped diff, preservation audit, current source case counts, final commit and exact postcommit F33/API proposals/caller inputs/source pins/modes remain under the new workflow folder. Only the human-readable final report may be exported for automatic delivery. No main merge, publication, project export, history rewrite or conversation copy. Zero owned target launches and zero descendants delegated; no global process claim. Parent collects/reviews the finite result and independently verifies terminal/no-active/pending-zero before normal settlement. This child does not self-settle or start follow-on work.
