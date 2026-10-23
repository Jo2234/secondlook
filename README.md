# SecondLook

**Honest AI try-on previews for one-of-a-kind secondhand listings, built on the YouCam AI Clothes API.**

Thrift and resale sellers usually have one hanger photo of a single-unit item and no model shots. Buyers can't picture the piece worn, and many resale items can't be exchanged for another size. SecondLook is a local seller studio that turns that one photo into a listing with:

- the **original photo always first** (the only allowed cover image);
- **flat measurements** in cm or inches instead of size claims;
- an **AI try-on preview from YouCam**, clearly labelled *approximate*, with the disclosure burned into the image pixels;
- a **photo quality gate** that checks the garment photo against YouCam's documented input rules *before any unit is spent*;
- an **explicit unit cost review**: live cost and balance are read from YouCam first, and nothing is generated until the seller confirms how many units it will spend.

## YouCam APIs used

| API | Endpoint | Used for |
|---|---|---|
| AI Clothes virtual try-on v4 | `POST /s2s/v2.0/task/cloth-v4`, `GET /s2s/v2.0/task/cloth-v4/{task_id}` | Async try-on task, polled with a deadline |
| File API | `POST /s2s/v2.0/file` + presigned `PUT` | Uploading the garment and model photos |
| Unit system | `GET /s2s/v2.0/credit/feature-cost`, `GET /s2s/v1.0/client/credit` | 0-unit preflight: cloth-v4 unit cost and account balance before spending |

Every documented error code is mapped to seller guidance (`src/domain/errors.ts`). Requests are rate-limited under the documented 250 requests / 300 s, follow no redirects, and only reach the documented API and media hosts (`src/youcam/net-policy.ts`).

## Quick start (demo mode, no API key needed)

Requirements: Node ≥ 24 and pnpm 12.11.2 (`corepack enable` provides it).

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev:fixture
# open http://127.0.0.1:5195
```

Demo mode uses synthetic sample images and a local fixture adapter. It shows the banner *"DEMO MODE: sample data. Try-on images here are placeholders, not YouCam results."* and every placeholder is watermarked **DEMO FIXTURE · NOT A YOUCAM RESULT**. Demo mode never contacts YouCam and spends nothing.

Try it: upload `assets/demo/jacket.png`, declare *hanger photo · upper body* and tick the photo declarations, run the quality check, add a title and measurements, save, pick the synthetic mannequin and confirm the 0-unit demo request.

## Live mode (real YouCam AI Clothes try-on)

Live mode uses **your own** YouCam API key and units. Live mode never falls back to demo data.

1. Create a free YouCam API account at <https://yce.perfectcorp.com/ai-api>, create an API key, and check your unit balance in the API console.
2. Configure `.env` (never commit it):
   ```bash
   cp .env.example .env && chmod 600 .env
   # YOUCAM_MODE=live
   # YOUCAM_API_KEY=<your key>
   # YOUCAM_UNIT_BUDGET=20      # hard cap on units this app may commit (default 120, max 400)
   ```
   Live data is kept in `./data-live` (separate from demo data in `./data`).
3. Add a consented model photo. Person photos are only accepted from a local **rights manifest** (`data-live/rights/manifest.json`, format in `docs/rights-manifest.example.json`). An entry is used only if the subject is an adult who consented to AI processing and was told how long YouCam keeps uploaded images (see Privacy), and the file's SHA-256 matches. Buyers cannot upload photos in this build (see Privacy).
   An AI-generated picture of a fictional adult can be used instead, as a `synthetic_generated` entry. That entry type has no consent fields; it needs `fictionalNoRealSubject` and `depictsAdult` set to true, the generator name, and a provenance file (in the manifest folder) that lists the same generator and the file's SHA-256. The studio labels such models as AI-generated sample inputs.
4. Check cost and balance without spending anything:
   ```bash
   pnpm youcam:preflight   # GET feature-cost + GET credit only; creates no task, spends 0 units
   ```
   Exit codes: 0 ok · 2 configuration (check `YOUCAM_MODE`/`YOUCAM_API_KEY`) · 4 key rejected · 5 network/timeout · 6–8 cloth-v4 cost missing/ambiguous/invalid (live generation stays blocked) · 9 network policy.
5. `pnpm dev`, open <http://127.0.0.1:5195>, press **Check YouCam cost & balance (0 units)**, build the listing, pick the consented model and review the unit total before confirming.

## Honesty rules the product enforces

- The original photo comes first; generated images can never become the cover.
- Generated images carry *"AI-generated preview from YouCam · approximate"* in the pixels and in the UI.
- No fit, size or colour-matching claims; a copy lint (`src/shared/banned-phrases.ts`) blocks them in the UI text.
- No invented statistics, users or testimonials.
- Live mode sends each photo upload (one File API slot request and one upload per photo) and the try-on task request once. There is no automatic retry or upload-slot refresh; a failure stops the attempt and releases the reserved units if no task was created. Status polling continues normally while a task runs.
- If a request's outcome is unknown (e.g. the connection drops while starting a task), the UI locks writes, says units may have been charged, and never retries automatically.

## Privacy

Try it on yourself is turned off in this build. We haven't enabled personal photo uploads yet, because SecondLook can't control how long the AI provider keeps them:

SecondLook deletes its own copies of your photo and the try-on result when you tap Done or Delete now. Otherwise its cleanup removes them about 60 minutes after upload, or when the app next starts if it was stopped.

YouCam (Perfect Corp.), which makes the try-on image, keeps its own copy. Its documentation says uploaded and generated images are stored for 30 days and then removed automatically, and its terms say it generally keeps data for 30 days and may keep information longer where the law requires. SecondLook has no way to delete YouCam's copy sooner.

Decision record: [PC-1](docs/decisions/PC-1-buyer-photo-retention.md).

## Tests

```bash
pnpm typecheck
pnpm test          # pure unit/property + image + integration suites
pnpm screenshots   # Playwright drive of the demo flow; writes docs/screenshots/fixture/
pnpm build
```

Integration tests run each file against a fresh temporary data directory. No test contacts YouCam; live-path tests use an in-process fake transport that serves the documented response shapes.

## Architecture

- `src/web` — React seller studio (Vite, `127.0.0.1:5195`).
- `src/server` — Hono API (`127.0.0.1:5194`): single-owner durable store, try-on runner, routes.
- `src/youcam` — HTTPS transport with host/DNS policy, typed API client, rate limiter, preflight cost binding, demo fixture client.
- `src/domain` — pure logic: quality gate, capability matrix, job state machine, units ledger (reserve → spent / released / possibly spent).
- `src/images` — bounded decoding/normalisation (sharp) and disclosure overlays.

Design and contract: [docs/implementation-plan.md](docs/implementation-plan.md). Official API/rules snapshots with SHA-256: `docs/sources/`.

## Licence

MIT © 2026 Johan (Jo2234). Dependency licences: [docs/licenses.md](docs/licenses.md) (sharp is Apache-2.0; its bundled libvips is LGPL-3.0-or-later).
