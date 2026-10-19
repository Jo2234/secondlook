# S2 publication cleanup fault retention — R22

SOURCE ONLY / FIVE DRAFT REGISTRATIONS UNRUN / PARENT REVIEW REQUIRED.
Base is R19 `ff4e814d61cbb527660a956d09483036bbebcee0`; branch is
`codex/resume-20261019-youcam-publication-cleanup-r22`. Main remains
`0f70de34d4d33cf936e4cd1da707b2d7f9a790cb`. This delta changes only Runner,
the SAME publication test file and this new decision. R19 history is preserved.

## Failure and retained boundary

R20-P2-01 identifies a source path, not an observed test failure: cancellation
or the outer attempt timeout wins `bounded`'s stopped race; publication later
rejects; unpublished-media removal rejects; the actual operation constructs
an AggregateError, but `bounded` joins it with `operation.catch(() => undefined)`.
Runner formerly received only an expected cancellation and could return clean.

Runner now owns a per-run fault wrapper outside that race. Presence of the
wrapper, rather than truthiness of its value, distinguishes no failure from
`throw undefined`. Unexpected publication rejection is retained before awaiting
cleanup. A cleanup rejection retains an AggregateError with BOTH original
publication and cleanup values in order, even when equal or undefined. The
first unexpected publication fault is not replaced by a later Store fence.
Expected publication abort/timeout with successful cleanup creates no fault.

A successfully persisted reducer deadline outcome may have no published image.
Its separate `!published` cleanup catches and retains every rejection before
rethrowing, including a cleanup rejection shaped like a YouCamError. Therefore
an outer timeout/cancel cannot turn that failed removal into a known clean run.
This branch has source coverage here; no additional test registration or
deadline timing control is added.

After `bounded` joins actual work, Runner retains outer unexpected and
settlement/Store-fence errors. Its final tmp cleanup is still awaited; any
new failure is aggregated after the first retained fault, not substituted for
it. Finally throws the retained value even on the early deadline return path.
OwnedRuntime therefore receives a real rejected execution after actual work
and tmp cleanup have settled. Its unchanged execution handler installs the
sticky fence before releasing ownership. Owned zero means joined, not success;
drain still rejects and admission stays fenced.

Publication selection/persistence and deletion proof are unchanged. A later
abort after successful selection does not itself create a fault or reverse a
genuinely persisted success. No published reference is rolled back. Store
unknown/failure still prevents deletion; retained execution failure does not
grant Store-close, retry, reconciliation or orphan deletion authority.

## One appended fault regression — DRAFT_UNRUN

The original four registrations, fixtures, assertions, real clocks and resources
are unchanged byte for byte. One new explicit registration uses production
Runner/OwnedRuntime/Store, real image operations, the existing first-GET
PublicationClient and forwarding Store wrappers. It holds the actual fulfilled
own media write, cancels through the production route, then holds the exact
generated-path removal and rejects it with one controlled Error. Nonmatching
removal paths forward to the real Store; no successful persistence is faked.

A test-local forwarding wrapper around the existing private `run` method
observes and rethrows the SAME real rejection to the existing OwnedRuntime
callback. It introduces no production observer/API. The callback wrapper
likewise rethrows the original publication abort. Assertions require identity
of both errors in the actual execution AggregateError, outstanding owned=1 and
unsettled drain while removal is held, then actual tmp completion, execution
fence, owned=0, drain rejection, repeated sticky admission refusal without
calling an admission commit, unchanged cancelled/possibly_spent provider facts,
no generated image/job/listing references, unchanged durable JSON and original
media, and retained exact unpublished bytes plus owner lock.

The new scope is `${YOUCAM_INT_DATA_DIR}/publication-cleanup-fault/data`, within
the future target data root. It requires fresh absence and is never reused.
Cleanup releases both gates, stops/aborts, joins, and independently disposes the
limiter. Only `runner_fenced` with exact execution job, owned=0, observed real
run failure and tmp completion is recognized as an expected completed join.
Source proof: OwnedRuntime.drain awaits every batch.done before checking its
fence; execution rejection fences then releases; run rejection follows finally.
Every other result remains failure/unknown. The first test failure, including
undefined, is retained. Even when assertions succeed, this deliberately faulted
Store is NEVER closed and its namespace/file/lock are NEVER removed. An expected
fault assertion is not an ordinary successful cleanup or recovery claim.

## Prospective exact scopes, not grants

Five sequential real first polls plus limiter/native/fsync work may exceed a
30-second one-file target. Propose TWO distinct future scopes, once each:

1. Original four only, `--testNamePattern=^DRAFT publication: (?:cancel during controlled download retains observed task and cost|cancel during controlled disclosure publishes no references|cancel after own media sync removes only the unpublished file|abort after Store callback chooses publication returns durable success)$`.
2. New one only, `--testNamePattern=^DRAFT publication cleanup fault: cancelled owned media rejection fences after actual join$`.

Both target only `tests/int/publication-cancel-checkpoint.test.ts`; one threads
worker, no file parallelism, bail 1; 30 s target/CPU, shared 5 s cleanup, 1024 MiB
heap, 2 MiB output and unchanged 20,000 ms per-test timeouts. The selectors are
disjoint and fixed, not retries or hidden broader targets. Old four can still
exceed 30 s; stop/report, never tune clocks/budgets/assertions. Detailed proposed
argv/environment/namespaces/write boundaries are in the handoff JSON. No scope
was launched, reserved, granted, absence-checked or prepared here. Historical
grants, failure evidence and opaque private vectors are not reusable authority.

## Evidence limits

R21 strict zero diagnostics applies only to old exact ff4, historically. R22 has
no target import, parser/AST, compiler, test or runtime result. Five drafts,
zero executions, zero observed passes/failures. Git/source/whitespace inspection
cannot establish compilation, timing or behavior. Operations, Store,
OwnedRuntime, domain, route, UI, original checkpoint, thresholds and clock
controls are frozen. Partial writes, uncertain commits/crashes, reference leases,
unlink directory sync and broader orphan reconciliation remain unresolved.

No main merge, readiness acceptance, grant/reservation, descendants, model/network
or runtime work, source-project/conversation export or self-settlement. UI
generation, buyer and live remain disabled. HackerRank is deferred/reminder-only
24 Oct. Parent collects/reviews and owns independent inactive/pending-zero and
T3 settle verification. Only own handoff MD/JSON are exported as reports.
