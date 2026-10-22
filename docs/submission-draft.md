# SecondLook: Devpost submission draft

Status: draft for Johan's review. Lines marked **[PENDING LIVE]** must be replaced with facts from the live run before submitting. Do not submit those placeholders.

## Project name

SecondLook

## Tagline (≤ 200 characters)

Honest AI try-on previews for one-of-a-kind secondhand listings: original photo first, real measurements, and a YouCam AI Clothes preview clearly labelled approximate.

## Inspiration

Secondhand sellers usually have one hanger photo of a single-unit item and no model shots. Buyers can't picture the piece worn, and many resale items can't be swapped for another size. Virtual try-on is usually built for brand catalogues with professional model photography. We wanted to apply it to one-off pre-loved items without overstating what an AI preview can show.

## What it does

SecondLook is a seller studio for thrift and resale listings:

1. **Photo quality gate before any spend.** The seller uploads one garment photo and declares how it was taken (hanger, mannequin, flat-lay or worn) and the garment category. SecondLook checks the photo against YouCam's documented input rules (size, format, dimensions, sharpness, exposure, plain background, single front-facing garment). Combinations that YouCam's documentation says are unsupported, such as lower-body garments photographed off-body, are blocked with a retake tip, so no units are spent on a photo that would be rejected.
2. **Measurements, not size claims.** Category-specific flat measurements in cm or inches, plus an optional "compare with a garment you own" panel that shows only signed differences.
3. **AI try-on preview with YouCam AI Clothes v4.** The seller picks a consenting model photo. SecondLook first reads the cloth-v4 unit cost and the account balance from YouCam (0 units), then shows a review dialog with the per-try-on cost, the total units to be spent and the balance. Only after the seller confirms does it upload the photos with the File API, create the cloth-v4 task, poll it with a deadline and download the result.
4. **Original first, approximate always labelled.** The original garment photo is the only allowed cover. Generated images carry "AI-generated preview from YouCam · approximate" burned into the pixels and in the UI. Listing text is built only from the seller's saved facts.
5. **Units ledger and uncertain states.** Every request reserves its units, then settles as spent, released or possibly spent. If a connection drops while a task is being created, SecondLook locks writes and says units may have been charged instead of silently retrying.
6. **Privacy-first buyer flow.** A buyer "try it on yourself" flow is designed but switched off in this build, because SecondLook can't control how long the AI provider keeps uploaded photos; the app explains why in plain words.

## How we built it

- **YouCam APIs:** AI Clothes virtual try-on v4 (`POST /s2s/v2.0/task/cloth-v4` and `GET /s2s/v2.0/task/cloth-v4/{task_id}`), the File API (`POST /s2s/v2.0/file` plus the presigned `PUT`), and the unit system (`GET /s2s/v2.0/credit/feature-cost`, `GET /s2s/v1.0/client/credit`).
- **Stack:** TypeScript on Node 24, Hono API server, React 19 + Vite seller studio, sharp for bounded image decoding, zod schemas, Vitest + fast-check + Playwright.
- **Reliability:** a pure job state machine and units ledger; a single-owner durable store with crash recovery; a sliding-window rate limiter under the documented 250 requests / 300 s; HTTPS only to the documented API and media hosts, with DNS checks and no redirects; every documented YouCam error code mapped to seller guidance.
- **Demo mode:** a fixture adapter with synthetic images lets anyone run the whole flow without a key. Everything in demo mode is watermarked "DEMO FIXTURE · NOT A YOUCAM RESULT", and live mode never falls back to demo data.

## Challenges we ran into

- The cloth-v4 unit price isn't listed in the documentation table (which lists v2 and v3), so SecondLook binds the cost from the live feature-cost endpoint and refuses to spend when the price is missing or ambiguous.
- Documentation differs on some input rules (for example full-body versus chest-up target photos), so the quality gate follows the conservative reading and labels unverified input types.
- Handling "did this task start?" honestly: a timeout while creating a task may still have charged units, so the ledger keeps a "possibly spent" state instead of retrying.

## Accomplishments we're proud of

- A complete seller flow where the honest choice is the default: original photo first, measurements over claims, and AI previews labelled approximate in the pixels.
- No unit is spent without a 0-unit cost and balance check and an explicit confirmation of the total.
- **[PENDING LIVE]** Live run: cloth-v4 cost read from feature-cost = `<n>` units per try-on; result generated in `<s>` seconds; units spent `<n>`.

## What we learned

**[PENDING: Johan's own words.]**

## What's next

- Probe which garment photo types YouCam handles well (hanger vs mannequin vs flat-lay) and update the capability table from real results.
- Enable the buyer flow once there is a clear answer on the AI provider's retention for personal photos.
- Export listings to resale marketplaces.

## Built with

typescript, node.js, react, vite, hono, sharp, zod, vitest, playwright, youcam-api, perfect-corp-ai-clothes

## Testing instructions for judges

Demo mode needs no key or account:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev:fixture   # open http://127.0.0.1:5195
```

Live mode uses your own YouCam API key: see "Live mode" in the README. `pnpm youcam:preflight` shows the cloth-v4 unit cost and your balance without spending units.

## Links

- Repository: **[PENDING: URL after Johan chooses public or private-shared hosting]**
- Video: **[PENDING: YouTube URL]**
