# Plan changes

## R56 — retained Store ownership seam (2026-10-19)

Authorized source-only change on exact base326064d22fb947f14d421c4787b46a54dce461d7: retain production Store IO owners/handles/operations before acquire, reject unproved lock closure, add fixed optional fresh logical-write budget and bounded checkpoint reads, and independently join one optional actual-app fetch policy plus IO before positive Store closure. See docs/reports/store-ownership-r56.md. New32-case injected draft is UNRUN; prior assertions unchanged. This file was absent at the base; append-prefix is empty. Private R54 policy/authority sources and every runtime STOP stay frozen. Physical64MiB/native scratch/RSS/global writes are UNKNOWN; revised logical engineering contract is only a master-review proposal. No checks, execution, authority/grant request or first-render readiness claim.

## R57 — preserve pure commit admission failures (2026-10-19)

Authorized exact R56 successor: keep serialized pure callback/bounds/schema/body-cap/closed/health preparation outside retained IO, preserve exact thrown identity without poisoning a healthy owner, publish actual changed commit IO immediately before reservation, and refuse absent numeric safe-open flags. See docs/reports/store-commit-admission-r57.md. Six new pure draft cases are UNRUN; existing32-case draft and prior assertions are unchanged. Independent full R56 review records a separate uncorrected default missing-image recovery regression. All private sources, authority/evidence, original refs and runtime STOPs remain; no execution/grant request or physical quota waiver.
