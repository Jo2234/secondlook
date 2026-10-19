# SecondLook

A private scaffold for a thrift-listing workflow: original garment photos, flat measurements and labelled approximate AI try-on previews. Buyer photo uploads are disabled under PC-1.

Implementation status: S0 scaffold drafted; no dependency installation, fixture rendering, typecheck or runtime verification has been performed. Live integration is planned and unverified. This is not a final contest pass.

## Fixture-mode quick start (after granted installation and implementation)

Use Node ≥24 and pnpm 12.11.2. Installation, fixture rendering and a dev session each require their own workflow grant. Once granted, use `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm fixtures:generate`, and `pnpm dev:fixture`. The UI lands in S3; the current scaffold provides only `/api/health` on 127.0.0.1:5194. Vite uses 127.0.0.1:5195.

Fixture banner: DEMO MODE: sample data. Try-on images here are placeholders, not YouCam results.

Status labels, used only when supported by evidence: `local fixture verified` / `live integration implemented but unverified` / `live integration verified` / `final release gate`. Fixture outputs carry `DEMO FIXTURE · NOT A YOUCAM RESULT`. Live mode never silently falls back to fixtures.

## PC-1 summary

Try it on yourself is turned off in this build. We haven't enabled personal photo uploads yet, because SecondLook can't control how long the AI provider keeps them:

SecondLook deletes its own copies of your photo and the try-on result when you tap Done or Delete now. Otherwise its cleanup removes them about 60 minutes after upload, or when the app next starts if it was stopped.

YouCam (Perfect Corp.), which makes the try-on image, keeps its own copy. Its documentation says uploaded and generated images are stored for 30 days and then removed automatically, and its terms say it generally keeps data for 30 days and may keep information longer where the law requires. SecondLook has no way to delete YouCam's copy sooner.

Enabling buyer upload requires the recorded master disposition and Johan's approval of the frozen copy; an environment variable alone does not enable it. Live person photos require a rights-manifest entry with informed consent. No consent is recorded on Johan's behalf.

## Validation and grants

After G-install completes, `pnpm typecheck` and `pnpm test:pure <up to 3 files>` are free targeted checks. Image/integration tests, a full test run, build, browser and live calls require recorded grants. No live call has occurred. See [the binding plan](docs/implementation-plan.md) and [PC-1](docs/decisions/PC-1-buyer-photo-retention.md).

## Dependencies

Pinned versions are in package.json. Lockfile-derived licensing is pending the two-phase install grant. sharp is Apache-2.0; its bundled dynamically linked libvips is LGPL-3.0-or-later. See docs/licenses.md. Project licence: MIT, Johan (Jo2234), 2026.
