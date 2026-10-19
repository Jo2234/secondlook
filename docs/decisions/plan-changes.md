# Plan changes

## R56 — retained Store ownership seam (2026-10-19)

Authorized source-only change on exact base326064d22fb947f14d421c4787b46a54dce461d7: retain production Store IO owners/handles/operations before acquire, reject unproved lock closure, add fixed optional fresh logical-write budget and bounded checkpoint reads, and independently join one optional actual-app fetch policy plus IO before positive Store closure. See docs/reports/store-ownership-r56.md. New32-case injected draft is UNRUN; prior assertions unchanged. This file was absent at the base; append-prefix is empty. Private R54 policy/authority sources and every runtime STOP stay frozen. Physical64MiB/native scratch/RSS/global writes are UNKNOWN; revised logical engineering contract is only a master-review proposal. No checks, execution, authority/grant request or first-render readiness claim.

## R57 — preserve pure commit admission failures (2026-10-19)

Authorized exact R56 successor: keep serialized pure callback/bounds/schema/body-cap/closed/health preparation outside retained IO, preserve exact thrown identity without poisoning a healthy owner, publish actual changed commit IO immediately before reservation, and refuse absent numeric safe-open flags. See docs/reports/store-commit-admission-r57.md. Six new pure draft cases are UNRUN; existing32-case draft and prior assertions are unchanged. Independent full R56 review records a separate uncorrected default missing-image recovery regression. All private sources, authority/evidence, original refs and runtime STOPs remain; no execution/grant request or physical quota waiver.

## R59 — preserve known missing-media recovery (2026-10-19)

Authorized source-only successor to exact R57/6fa483b4fb12f1a45f17845d3c2642633049caf9: carry initial pre-handle filesystem ENOENT as an explicit nonmutating read outcome through retained observers, retain ordinary readMedia's original ENOENT outside those observers, and let actual startup recover absence/positive-byte hash mismatch without a catch-all. Post-open read/identity/close and all other IO faults remain sticky UNKNOWN with actual handle/task retention. R57 admission/ordering/safe flags, R55 exact lock proof/close, caps/fresh-only/lifetime seams and input-copy qualification remain preserved. See docs/reports/store-recovery-absence-r59.md. Six new cases are DRAFT_UNRUN; the previous32+6 cases and assertions remain byte-unchanged. Opus R58 delivered no source; this is Sol R59. All private defects, evidence, refs and runtime STOPs remain; no checks, grants or next-stage request.
