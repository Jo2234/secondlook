# S1 crop measurement correction — 19 October 2026

Base candidate: `d3f98d0d672f3b810ebc4eb35d4a309e061b19eb` on preserved branch `codex/resume-20261019-s1-images`.
Correction branch: `codex/resume-20261019-s1-crop-oracle`.

## Original execution remains failed

Master closed grant `heavy-youcam-resume-s1-images-slot1-20261019-r2` as FAILED.
The final-source TypeScript root PID 62408 exited 0. The normalization root PID 62410 exited 1 on the first F17 assertion at original line 22: `expected 124.50625 to be greater than 274.975`. The other two tests had no recorded completion; calibration was UNRUN. Runner PID 62406 exited 1. Actual direct roots were reaped, stdio was closed, with no signals or cleanup errors. This is direct-root evidence only.

Immutable receipt and normalize log remain under the master scratch directory at `resume-20261019-child/youcam-s1/direct-root-image-batch/`.
Receipt SHA256: `56e862f72992d05beee1d3223891aa073222a8960c109508753cf13713c0fa29`.
Normalize log SHA256: `7b08aec11cb3be898a2a39d0524895f665caaba5929f5f89e56bd6d6399f42ec`.
Neither old evidence nor its consumed grant/claim is changed or reused.

## Source correction

The parent's primary-source review identifies a Sharp API test-oracle error: [`stats()` documentation](https://sharp.pixelplumbing.com/api-input/#stats) says statistics come from the original input; pipeline operations must first be materialized. No network request was made in this correction task.

`tests/img/normalize.test.ts` now writes each extracted region to an in-memory lossless PNG buffer and measures that buffer through a new Sharp instance. The synthetic EXIF/GPS/XMP fixture, input and output dimensions, exact top/bottom regions, metadata checks and both red-versus-blue `>150` contrast assertions are unchanged. Product normalization, raster/metrics/gates, thresholds, synth, fixtures, packages and configuration are unchanged.

## Validation ledger and next request

- Source inspection and diff checks only in this correction scope; no target, Sharp, Vitest, image or native execution before a new exact master grant.
- Corrected normalization: UNRUN; proposed exactly once, then calibration exactly once only if normalization succeeds. Calibration is still UNRUN. First failure stops; preserve measurements; no tuning or retry.
- Each stage: 30 seconds; shared work budget: 60 seconds; combined output: 2 MiB. Vitest threads, one worker, no file parallelism, bail 1. Reuse the reviewed direct-root runner by source copy into a fresh scratch namespace.
- No new type annotations, overload families or external APIs are introduced: Buffer-returning `png().toBuffer()` and `sharp(Buffer).stats()` already occur in this test file. The base's final-source TypeScript run exited 0. A fresh typecheck is not requested; that prior pass is not relabelled as a check of the changed candidate.
- Full pure/image acceptance, G-img-0 synthesis reproducibility, F33 measured RSS/decode integration, later S2/S3 work and live/release gates remain separate. No main merge, publication or submission is authorized here.

The exact changed-candidate source map, installed-file pins, runner/proposal hashes, argv/environment/limits and required fresh grant fields are prepared after this source commit under `resume-20261019-child/youcam-s1-crop-oracle-r1/`. A proposal alone is not permission. The parent owns heavy allocation, collection, review and settlement.
