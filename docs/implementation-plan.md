# SecondLook: honest AI try-on for one-of-a-kind thrift listings. Implementation plan v1 (awaiting master acceptance)

- **Project key:** `youcam`. **Event:** YouCam API Skin AI & eCommerce VTO Hackathon (Perfect Corp. / Devpost).
- **Deadline:** 2 Nov 2026 11:45 EST = **Tue 3 Nov 2026 00:45 SGT**. Internal tested checkpoint: **Sun 1 Nov 2026 12:00 SGT**.
- **Repo:** `$W/projects/youcam` (main). Private relay target `Jo2234/hackathon-2026-youcam`.
- **Lead:** Opus 5.5 HIGH, thread `b6726a0b-fb08-4a39-969f-5b7758e424b4` (job `control/jobs/youcam-opus.json`). Author of this plan; writes no app code or tests.
- **Implementation:** GPT-6.1 Sol HIGH. **One slot (slot1, integrator)** is allocated initially, after master acceptance of this plan.
- **Accepted decision (frozen):** joint-decisions §5, "thrift try-on, no skin pivot", plus Codex guardrails.
- **Proposed correction pending master review:** PC-1 (`docs/decisions/PC-1-buyer-photo-retention.md`).

`$W` = `/Users/johanvaz/Documents/Codex/2026-10-04/i-w/outputs/t3code-data/scratch/hackathon-workflow-20261016`.

---

## 1. Official requirements and rubric mapping

All sources were re-fetched on **19 Oct 2026 00:56 UTC** (Devpost via `curl -A "Mozilla/5.0 …"`; Perfect Corp. docs via their `.md` / `llms.txt` exports). Snapshots and SHA-256 are in `docs/sources/` (`SHA256SUMS`).

| Source | URL |
|---|---|
| Overview | https://youcam-api-skin-ai-ecommerce.devpost.com/ |
| Rules | https://youcam-api-skin-ai-ecommerce.devpost.com/rules |
| Resources | https://youcam-api-skin-ai-ecommerce.devpost.com/resources |
| Updates | https://youcam-api-skin-ai-ecommerce.devpost.com/updates (no updates posted at fetch time) |
| AI Clothes VTO | https://docs.perfectcorp.com/reference/ai_clothes.md, plus the OpenAPI bundle https://docs.perfectcorp.com/_bundle/reference/ai_clothes.yaml |
| Units | https://docs.perfectcorp.com/reference/unit_system.md, plus `GET /s2s/v2.0/credit/feature-cost` and `GET /s2s/v1.0/client/credit` |
| File API | https://docs.perfectcorp.com/reference/file/paths/~1s2s~1v2.0~1file/post.md |
| Retention / rate limit / errors / webhook | https://docs.perfectcorp.com/develop/{file_retention_period,rate_limit,error_codes,webhook}.md |
| API Terms (last updated Sept 2026) | https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api |

### 1.1 Requirements (rules §4, overview "Requirements")

| Req | Requirement | How SecondLook meets it | Owner/gate |
|---|---|---|---|
| R1 | Working app integrating ≥1 Perfect Corp. YouCam API with clear consumer/eCommerce value; "not surface-level wrappers" | AI Clothes VTO **cloth-v4** (async task + poll), plus the File API (presigned upload), plus the unit APIs (`feature-cost`, `credit`) as pre-spend guards. The value is a seller listing flow for one-of-a-kind items. | slot1; live gates L1–L4 |
| R2 | "Capable of being successfully installed and running consistently … function as depicted in the video" | Pinned lockfile, `pnpm` commands (§11), fixture mode runnable by anyone without a key, live mode with the user's own key | slot1, S5 |
| R3 | New project (or significantly updated) | New repo created in the Submission Period (Sep 29 – Nov 2). First commit 19 Oct 2026. | — |
| R4 | Third-party integrations authorised under their terms | Licence records (§12); image rights manifest (§7) | slot1 + Johan |
| R5 | Repo URL with all source, assets and instructions; public with licence OR private shared with the Devpost support address given in the rules | Private repo; sharing happens at submission | **Release gate RG4 (Johan)** |
| R6 | Text description of features/functionality/value | `docs/submission-draft.md` | lead drafts, Johan approves |
| R7 | Screenshots | `pnpm screenshots` (Playwright, fixture, DEMO-labelled); live screenshots only after L4 | slot1, S4 (heavy grant) |
| R8 | 1–3 min demo video, end-to-end; explains the YouCam API used; shows the project functioning; public on YouTube/Vimeo; **no third-party trademarks or copyrighted music without permission** | Storyboard in §14. Garment photos must not show prominent brand marks (manifest flag `noProminentThirdPartyMarks`). | **RG3 (Johan records/publishes)** |
| R9 | Judges' access "by providing a link to a website, functioning demo, or a test build"; free of charge for testing | Test build = repo + `pnpm dev:fixture` instructions. Public hosting is **not authorized** in this workflow. | **RG5 (Johan decision)** |
| R10 | English materials | All copy is English | — |
| R11 | Rising Star (student only): "at least one member who is a currently enrolled student and provides a valid school-issued email address … at the time of submission"; max one prize per team | Johan opts in at submission | **RG7 (Johan)** |
| R12 | Exit interview + blog article if chosen | Recorded as post-judging human gate | Johan |
| R13 | Eligibility: age of majority; excluded countries listed (Singapore not excluded) | Johan confirms at registration | Johan |

### 1.2 Judging (rules §6). Stage One is pass/fail on theme fit and use of the required APIs. Stage Two uses four equally weighted criteria, with ties broken in the listed order (Tech first).

| Criterion (verbatim gist) | What judges must *see* in SecondLook |
|---|---|
| **Technological Implementation**: "how thoroughly and skillfully … integrate at least one … YouCam API from the … Fashion … category … working, non-trivial" | The full documented lifecycle: File API upload → presigned PUT → cloth-v4 task → bounded polling with deadline → result download inside the 2 h URL window, with one refresh. Typed error mapping of every documented engine/preprocess code to retake guidance. Pre-spend guards: input gate against the documented spec, live `feature-cost`, and a unit ledger with no double-charging retries. A rate limiter under the documented 250/300 s. |
| **Design**: "complete, coherent product experience, not just a technical proof of concept" | Seller wizard → listing page → buyer view, with real empty/loading/error states. Original photo is always first. Disclosure burned into every generated image. |
| **Potential Impact**: "credible, specific case … real problem for a real audience … based on what's demonstrated" | Secondhand sellers usually have one hanger photo of a single-unit item and no model shots. Buyers can't picture it worn. Many resale items can't be exchanged for another size. SecondLook gives a *labelled approximate* preview plus real measurements. **No invented statistics, users or testimonials.** |
| **Quality of Idea**: "creative, non-obvious use … genuine understanding of the problem space" | VTO is usually applied to brand catalogues with model photography. Here it is applied to one-off items. The quality gate stops a seller from spending units on photos the documented spec rejects, and honesty is part of the product (original-first, "approximate", measurements over claims). |

**Theme-fit note (risk, not a pivot):** the overview's *eCommerce VTO* topic text says "what someone wears and how they look are part of the same self-image … what's possible when both capabilities work as one". Rules R1 and Stage One require only **≥1** YouCam API from the listed categories (Fashion included). SecondLook stays clothes-only per the accepted decision; no skin or makeup pivot. If the master later wants a second capability, the only consensus-compatible stretch is cloth-v4 `shoes`/`outer` categories (§2.2), not beauty.

### 1.3 API facts that shape the design (from the snapshots)

1. **Endpoint:** `POST /s2s/v2.0/task/cloth-v4`, then poll `GET /s2s/v2.0/task/cloth-v4/{task_id}`. Server `https://yce-api-01.makeupar.com`. Auth `Authorization: Bearer <key>`. v2/v3 endpoints also exist; we use **v4 only**.
2. **v4 request:**
   - exactly one of `src_file_id` / `src_file_url`;
   - exactly one of `ref_file_id` / `ref_file_url` (`template_id` exists, unused);
   - `garment_category` required, ∈ {`full_body`,`lower_body`,`upper_body`,`shoes`,`auto`,`outer`};
   - optional `change_shoes` (bool, default true; effective for full/lower);
   - optional `filter_multi_person` ∈ {`off`,`normal`,`strict`}, default `off`.

   `*_file_url` "should be publicly accessible". **We use file IDs only** (no public hosting).
3. **Responses:**
   - POST 200 → `{status, data:{task_id}}`;
   - 400 `error_code` ∈ {`InvalidParameters`,`CreditInsufficiency`,`BadRequest`,`InvalidStyleGroup`,`InvalidStyle`};
   - 401; 429.
   - GET 200 → `data.task_status` ∈ {`running`,`success`,`error`}, `data.error` (engine code, nullable), `data.error_message`, `data.results.url` ("Valid for 2 hours");
   - GET 400 InvalidTaskId; 401; **500 TaskTimeout**.
4. **Polling:** the docs say "poll the status endpoint at regular intervals (e.g., every 10 seconds) until the task status is `success` or `error`". Webhooks exist but need an HTTPS endpoint we control. **Public hosting is not authorized, so the design is poll-only** (accepted by the master on 19 Oct).
5. **File API:** `POST /s2s/v2.0/file` with `{files:[{content_type,file_name,file_size}]}` returns `file_id` and `requests[{method:"PUT",url,headers}]`. The client PUTs the bytes to that URL with exactly those headers. Images must be <10 MB. The sample uses `content_type: "image/jpg"` (sic).
6. **Input spec (File Specs & Errors table):**
   - Both images: jpg/png, <10 MB, 1024×768 recommended, **512×384 minimum, max side 4096 px**.
   - Target (person): single person, ≥80% of frame, shoulders visible, face fully visible, standing and facing forward.
   - Reference product image: "front-facing product shot of a single garment"; "Do not use composite images (e.g. top and bottom in one photo)"; "**For the lower body, only actual worn outfits are supported, not standalone product images.**"
   - Reference worn photo: one person, clothing fully covers the try-on area, not obstructed.
7. **Doc conflicts (recorded, and resolved conservatively):**
   - **C1:** `task_id` validity is 24 h (OpenAPI) vs 30 days (retention page). We treat results as retrievable for 24 h, and vendor retention of images as 30 days.
   - **C2:** Step 1 says "Upload a high-resolution full-body photo", but the spec table says "upper body only, from the chest upwards". We ask for a standing full-body photo for `full_body`/`lower_body`, and accept chest-up-with-shoulders for `upper_body`/`outer`. Live probe L3 records actual behaviour.
   - **C3:** the AI Clothes page's unit table lists V2.0 = 2 and V3.0 = 2 units and **does not list V4**. V4 cost is unknown until a live `feature-cost` call, which is gate L1.
   - **C4:** flat-lay photos are **not mentioned anywhere**. Status `unverified` until L3.
8. **Units:**
   - `GET /s2s/v2.0/credit/feature-cost` (paged, `page_size` ≤20, `next_token`) returns `skus[{description, amount, unit ∈ {result_image, second}, proc_unit, run_task_url}]`.
   - `GET /s2s/v1.0/client/credit` returns `results[{type, amount_dec, expiry}]`.
   - The hackathon grants 1,000 free units per registered participant via a redeem code. **No purchase, ever.**
9. **Rate limit:** 250 requests / 300 s per IP **and** per token. 429 on excess; ~5 QPS recommended.
10. **Retention:** files and generated images are removed after 30 days. No delete endpoint is documented (see PC-1).
11. **Terms:**
    - §3.4 / §12.3: we must collect consent from any person in a photo.
    - §8.6(t): no dataset creation for training.
    - §11.2.1: Perfect does not use submissions to improve the service without opt-in.
    - §11.3: commercial use of output is not restricted, but there is an IP-risk warning.
    - Adults only.

### 1.4 What SecondLook will never claim

- **Fit:** "fits", "true to size", "your size".
- **Faithful garment rendering:** "exact", "accurate colour/detail/texture", "true-to-life", "photorealistic", "what you see is what you get".
- **Vendor deletion** (PC-1).
- **Impact numbers, return-rate reductions, users or testimonials.**
- **A live result that was actually a fixture.**

All of these are enforced by the copy lint (§10, F14).

---

## 2. Frozen MVP and explicit non-goals

### 2.1 MVP (all must ship)

1. **Seller garment-photo quality gate** (§5.2): deterministic pixel checks, plus the seller's declarations, plus the documented-capability matrix. It decides pass / pass-with-warnings / fail **before any unit is spent**, with retake guidance per failed check.
2. **Measurements** (§5.4): category-specific flat measurements stored in integer mm, cm/in entry and display. An optional *client-only* "compare with a garment you own" panel shows signed differences only.
3. **Async Clothes VTO job** (§5.3, §9): File API upload, task creation, bounded polling, retry policy, deadline, cancel, result download/refresh. Every engine and preprocess error is mapped. Unit preflight, ledger and budget guard.
4. **Original-first comparison and disclosure:**
   - the original seller photo is always first and is the only allowed cover;
   - every generated image has the disclosure **burned into the pixels** and also shown in the UI;
   - fixture results carry "DEMO FIXTURE · NOT A YOUCAM RESULT".
5. **Listing page** (seller preview, plus a buyer view of the same listing).
6. **Buyer "try it on me"** secondary flow. Implemented, but **disabled by default under PC-1**. It shows the honest retention explainer. When enabled by disposition, it has consent, `strict` multi-person filtering, EXIF stripping, local deletion with a receipt, and a 60-minute TTL.
7. **Fixture mode** that works with no key. Visibly DEMO everywhere: a banner, watermarks, and `mode` in every API response.
8. **Live mode** with preflight, an input probe and rights-manifest enforcement. Live mode never falls back to fixtures silently.

### 2.2 Stretch (only after every MVP acceptance test and live gate L4 pass, in this order)

1. `outer` category demo, if L3 shows it works on hanger photos.
2. Shoes (`garment_category: shoes`); input support is unverified, so this needs a probe first.
3. Multiple model photos per listing (more than two).

### 2.3 Non-goals (do not build)

- Skin, makeup, hair or any other YouCam category (**no skin pivot**).
- Fit or size recommendation, size prediction, body measurement from photos.
- Any LLM/agentic text generation. Listing text is deterministic templating, because no LLM key is available and generated text risks claims.
- Webhooks; public hosting; accounts/auth; payments; marketplace integrations (eBay/Depop/Vinted APIs); a mobile app.
- Self-service upload of real-person photos in live mode (PC-1).
- Background removal or editing of garment photos by us; we only normalise them.
- Storing buyer measurements or buyer images beyond the TTL.
- Datasets of any kind (ToS §8.6(t)).

---

## 3. Repository tree and file ownership

Stack: TypeScript, Node ≥24 (machine has v24.22.0), pnpm 12.11, Hono API server, React 19 SPA via Vite, Zod contracts, sharp for image I/O, Vitest + fast-check, Playwright for E2E/screenshots. This is the same stack as the reviewed Qloo project, so the pnpm store and patterns are reused.

Ports: API `127.0.0.1:5194`, Vite `127.0.0.1:5195` (proxy `/api`, `/media`). Both are overridable with `PORT`/`VITE_PORT`.

Only **slot1** exists initially and owns everything. Ownership groups are defined so that later-allocated slots (if the master reallocates) get disjoint paths: **A** = adapter/runner/units, **B** = quality gate/images, **C** = UI, **D** = listing/disclosure/copy/screenshots/docs. Slot1 is always the integrator.

```
youcam/
  package.json  pnpm-lock.yaml  tsconfig.json  vite.config.ts  vitest.config.ts  playwright.config.ts   [slot1]
  .gitignore  .env.example  README.md  LICENSE (MIT, Johan)                                             [slot1]
  docs/
    implementation-plan.md  decisions/*  sources/*  lead-status.md                                       [lead]
    test-report.md  licenses.json  licenses.md  calibration.md  live-evidence.md                        [slot1]
    demo-script.md  submission-draft.md  screenshots/                                                   [lead drafts; slot1 tooling]
  assets/
    rights/manifest.json            # rights records (no images of people committed unless repoDistribution=allowed)  [D]
    rights/manifest.schema.json                                                                          [D]
    demo/                           # synthetic DEMO images only, generated by scripts/gen-fixtures.ts                 [B]
  probes/input-matrix-v1.json       # pre-registered live probe plan (§16, L3)                           [A]
  src/
    shared/
      types.ts                      # §4 types (single source; zod schemas co-located in schemas.ts)    [A]
      schemas.ts                                                                                          [A]
      copy.ts                       # ALL user-facing strings, disclosure + retention copy (versioned)   [D]
      banned-phrases.ts             # §10 F14 lint patterns + allowlisted disclaimers                    [D]
      measurements.ts               # pure: mm conversion, field sets, validation, diff                 [B]
    domain/
      quality/metrics.ts            # pure: luma, laplacian variance, sobel border density, clipping    [B]
      quality/thresholds.ts         # frozen thresholds + THRESHOLDS_VERSION                            [B]
      quality/gate.ts               # pure: evaluateGarmentPhoto / evaluateModelPhoto -> QualityReport  [B]
      capabilities.ts               # documented capability matrix + live overrides merge (pure)        [A]
      job-machine.ts                # pure reducer: TryOnAttempt state machine + invariants             [A]
      ledger.ts                     # pure: unit reservation/settlement/release, budget checks          [A]
      listing.ts                    # pure: readiness, gallery ordering (original-first), template text [D]
      errors.ts                     # engine/preprocess/http code -> UserError mapping                  [A]
    youcam/
      client.ts                     # YouCamClient interface (§4.6)                                     [A]
      http-client.ts                # live implementation (fetch, Node ≥24)                             [A]
      fixture-client.ts             # deterministic scenario simulator (§9.4)                           [A]
      rate-limiter.ts               # token bucket + rolling window                                     [A]
      redact.ts                     # header/URL/log redaction                                          [A]
      preflight.ts                  # feature-cost + credit -> PreflightRecord                          [A]
    images/
      normalize.ts                  # sharp: sniff, autorotate, strip metadata, sRGB, JPEG q90, ≤2048   [B]
      raster.ts                     # sharp -> downscaled grayscale Float32 raster for metrics          [B]
      disclose.ts                   # sharp: burn disclosure band / DEMO watermark                      [D]
      synth.ts                      # deterministic SVG->PNG synthetic mannequins/garments for fixtures [B]
    server/
      main.ts  app.ts  env.ts       # Hono app, env parsing, mode banner, origin check                  [A]
      store.ts                      # JSON file store with atomic writes under DATA_DIR                 [A]
      runner.ts                     # job runner: drives job-machine with client + clock + limiter      [A]
      ttl-sweeper.ts                # buyer-session deletion TTL                                        [A]
      routes/{health,photos,listings,jobs,units,buyer,media}.ts                                         [A]
    web/
      main.tsx  App.tsx  api.ts     # SPA + typed fetch wrapper                                         [C]
      pages/SellerWizard.tsx  ListingPage.tsx  BuyerTryOn.tsx  UnitsPanel.tsx                            [C]
      components/{QualityReport,DeclarationForm,MeasurementsForm,CompareMeasurements,ModelPicker,
                  CostConfirmDialog,JobProgress,Gallery,DisclosureBadge,ModeBanner,ErrorPanel}.tsx      [C]
      styles.css                                                                                        [C]
  scripts/
    gen-fixtures.ts                 # writes assets/demo/*.png deterministically                        [B]
    youcam-preflight.ts             # live, 0 units                                                     [A]
    youcam-probe.ts                 # live, spends units; requires --confirm-units                      [A]
    check-env.ts  screenshots.ts  licenses.ts                                                           [A/D]
  tests/
    unit/**  property/**  contract/** (mock-youcam.ts = documented-contract mock)  server/**  web/**     [owner of module under test]
    e2e/*.spec.ts                                                                                        [C]
  data/  (gitignored; runtime store)
```

`.gitignore` must include: `node_modules/ dist/ data/ .env .env.* !.env.example playwright-report/ test-results/ *.log .DS_Store docs/screenshots/live-*/raw/`.

---

## 4. Types, JSON schemas and API contracts

`src/shared/types.ts` holds the canonical TypeScript. `src/shared/schemas.ts` mirrors it with Zod (`z.infer` equality is asserted in a type test). Every HTTP body is validated with Zod at the boundary. Unknown fields are stripped, and invalid input returns `400 {error:"invalid_request", issues:[…]}`.

### 4.1 Primitives and enums

```ts
type Mode = "fixture" | "live";
type Id = string;                     // ULID-like, [0-9a-z]{20}, generated by crypto.randomUUID-derived helper
type IsoTime = string;                // ISO-8601 UTC
type GarmentCategory = "upper_body" | "outer" | "full_body" | "lower_body";   // MVP; "shoes" is stretch, "auto" never sent
type PhotoType = "hanger" | "mannequin" | "flatlay" | "worn";
type PhotoRole = "garment" | "model" | "buyer";
type CapabilityStatus = "documented" | "documented_unsupported" | "unverified" | "live_ok" | "live_failed";
type Severity = "pass" | "warn" | "fail";
type Unit = "cm" | "in";
```

### 4.2 Photos and quality

```ts
interface StoredPhoto {
  id: Id; role: PhotoRole; mode: Mode;
  source: "seller_upload" | "rights_manifest" | "synthetic" | "buyer_upload";
  rightsId: string | null;            // required when source = rights_manifest
  original: { format: "jpeg" | "png"; width: number; height: number; bytes: number; sha256: string };
  normalized: { width: number; height: number; bytes: number; sha256: string; path: string }; // JPEG, metadata stripped
  createdAt: IsoTime; expiresAt: IsoTime | null;       // buyer photos: createdAt + 60 min
}
interface CheckResult {
  id: QualityCheckId; severity: Severity;
  measured: number | string | null; threshold: string;   // human-readable, e.g. "≥ 100 (warn), ≥ 40 (fail)"
  messageKey: keyof typeof COPY.quality;                 // guidance copy key
  source: "pixel" | "declaration" | "capability" | "doc_spec";
}
type QualityCheckId =
  | "format" | "file_size" | "min_dimensions" | "recommended_dimensions" | "max_dimensions_normalized"
  | "aspect_ratio" | "sharpness" | "exposure_mean" | "exposure_clipping" | "background_busy"
  | "decl_single_garment" | "decl_front_facing" | "decl_not_composite" | "decl_fully_visible"
  | "decl_no_people" | "capability" | "model_decl_single_person" | "model_decl_pose" | "model_rights";
interface QualityReport {
  photoId: Id; role: PhotoRole; verdict: Severity;      // worst severity among checks
  checks: CheckResult[]; thresholdsVersion: string;      // e.g. "q1-2026-10-19"
  capability: { photoType: PhotoType; category: GarmentCategory; status: CapabilityStatus; citation: string } | null;
  spendAllowed: boolean;                                 // verdict !== "fail" && capability allows in current mode
}
interface GarmentDeclaration {
  photoType: PhotoType; category: GarmentCategory;
  singleGarment: boolean; frontFacing: boolean; notComposite: boolean;
  fullyVisible: boolean; noPeopleInPhoto: boolean;       // false allowed only when photoType = "worn"
}
```

### 4.3 Measurements

```ts
type MeasurementField = "pit_to_pit" | "length" | "shoulder" | "sleeve" | "waist" | "hip" | "rise" | "inseam" | "leg_opening";
interface Measurements {
  category: GarmentCategory;
  valuesMm: Partial<Record<MeasurementField, number | "na">>;  // integer mm; "na" e.g. sleeveless
  enteredUnit: Unit; tagSize: string | null;                    // free text ≤ 24 chars
}
// Required fields per category (others optional):
// upper_body/outer: pit_to_pit, length, shoulder, sleeve("na" allowed)
// full_body: pit_to_pit, waist, length            lower_body: waist, rise, inseam, leg_opening
```

### 4.4 Listing, jobs, units

```ts
interface Listing {
  id: Id; mode: Mode; title: string /*≤80*/; conditionNotes: string /*≤500*/; priceText: string | null /*≤20, display only*/;
  garmentPhotoIds: Id[];               // ≥1 required for "ready"; index 0 is cover
  declaration: GarmentDeclaration | null; measurements: Measurements | null;
  tryOnResultIds: Id[];                // GeneratedImage ids; never in garmentPhotoIds
  status: "draft" | "ready";           // computed by listing.readiness(), persisted for display only
  createdAt: IsoTime; updatedAt: IsoTime;
}
interface GeneratedImage {
  id: Id; listingId: Id | null; buyerSessionId: Id | null; jobId: Id; mode: Mode;
  disclosedPath: string;               // ONLY the disclosure-burned version is ever served
  width: number; height: number; label: "ai_tryon_approximate" | "demo_fixture";
  createdAt: IsoTime; expiresAt: IsoTime | null;
}
type JobState =
  | "queued" | "uploading" | "submitting" | "polling" | "downloading"
  | "succeeded" | "failed" | "timed_out" | "uncertain" | "cancelled";
interface TryOnAttempt {
  n: number;                            // 1-based; a user retry creates n+1
  state: JobState; taskId: string | null; srcFileId: string | null; refFileId: string | null;
  postCount: number; getCount: number;  // instrumented for invariants/tests
  submittedAt: IsoTime | null; deadlineAt: IsoTime | null;
  error: UserError | null; ledgerEntryId: Id | null;
  history: { at: IsoTime; from: JobState; to: JobState; reason: string }[];
}
interface TryOnJob {
  id: Id; mode: Mode; listingId: Id | null; buyerSessionId: Id | null;
  garmentPhotoId: Id; modelPhotoId: Id; category: GarmentCategory;
  request: { garment_category: GarmentCategory; change_shoes: false; filter_multi_person: "strict" };
  attempts: TryOnAttempt[]; resultImageId: Id | null; createdAt: IsoTime;
}
interface UserError {
  code: string;                          // our code, e.g. "yc_error_pose", "no_units", "deadline", "uncertain_charge"
  upstream: { http: number | null; errorCode: string | null; engineError: string | null } | null;
  retryable: "no" | "user_confirm";      // nothing engine-side is auto-retried
  messageKey: keyof typeof COPY.errors;
}
interface PreflightRecord {
  at: IsoTime; baseUrl: string;
  featureCost: { matched: { description: string; amount: number; unit: string; proc_unit: number; run_task_url: string }[];
                 costPerTaskUnits: number | null };   // null => cost_unknown
  balanceUnits: number | null;                        // sum of non-expired amount_dec
  ok: boolean; problems: string[];
}
interface LedgerEntry {
  id: Id; jobId: Id; attempt: number; mode: Mode; units: number;
  state: "reserved" | "spent" | "released" | "possibly_spent";
  at: IsoTime; settledAt: IsoTime | null; reason: string;
}
```

### 4.5 HTTP API (Hono, JSON UTF-8)

Every response includes `mode`. Mutating routes require `Content-Type: application/json` (or multipart for uploads) and an `Origin` that is either absent or matches `http://127.0.0.1:<VITE_PORT|PORT>` / `http://localhost:…`; anything else gets 403. Bodies are capped at 25 MB.

| Method & path | Body → Response | Notes |
|---|---|---|
| `GET /api/health` | → `{mode, version, thresholdsVersion, buyerUpload:"disabled"\|"enabled", preflight: PreflightRecord\|null, capabilities: CapabilityRow[]}` | |
| `POST /api/photos` (multipart `file`, fields `role`=garment) | → `{photo: StoredPhoto, quality: QualityReport\|null}` | `role=model`/`buyer` rejected here (model photos come from `/api/models`; buyer via buyer routes). Quality is null until a declaration is supplied. |
| `POST /api/photos/:id/evaluate` | `{declaration: GarmentDeclaration}` → `QualityReport` | Pure gate over stored raster metrics + declaration + capability. |
| `GET /api/models` | → `{models: {photoId, label, rightsId, source, synthetic: boolean}[]}` | Fixture: synthetic mannequins. Live: rights-manifest entries with `aiProcessingConsent=true` and an unexpired scope. |
| `POST /api/listings` / `PATCH /api/listings/:id` / `GET /api/listings/:id` / `GET /api/listings` | Listing fields → `Listing` (+ `readiness:{ready:boolean, missing:string[]}`) | PATCH cannot put generated ids into `garmentPhotoIds` (422 `generated_image_not_cover`). |
| `GET /api/units` | → `{preflight, budgetUnits, ledger: LedgerEntry[], committedUnits, remainingBudgetUnits}` | Fixture: simulated cost 0, labelled. |
| `POST /api/listings/:id/tryon` | `{garmentPhotoId, modelPhotoIds: Id[] (1–2), confirmCostUnits: number}` → `{jobs: TryOnJob[]}` | Rejects with 409 `cost_mismatch` if `confirmCostUnits` ≠ cost × N computed now. 402-style 409 `budget_exceeded`, 409 `cost_unknown`, 409 `preflight_stale` (live: >30 min), 409 `quality_failed`, 409 `capability_blocked`, 409 `rights_missing`. All are checked **before** any network call. |
| `GET /api/jobs/:id` | → `TryOnJob` | Browser polls our server every 1 s (local, free). |
| `POST /api/jobs/:id/retry` | `{confirmCostUnits}` → `TryOnJob` | Only from `failed`/`timed_out`/`uncertain`/`cancelled`. Creates attempt n+1 with a new ledger reservation. |
| `POST /api/jobs/:id/cancel` | `{}` → `TryOnJob` | Stops local polling. If a taskId exists, the state is `cancelled` and the ledger entry is `possibly_spent`. |
| `POST /api/buyer-sessions` | `{consentVersion, consentAccepted:true, adultConfirmed:true, isSelfConfirmed:true}` → `{sessionId, expiresAt}` | **403 `buyer_upload_disabled` while PC-1 is not dispositioned (default).** |
| `POST /api/buyer-sessions/:id/photo` · `POST /api/buyer-sessions/:id/tryon` `{listingId, confirmCostUnits}` | | Same 403 gate. |
| `DELETE /api/buyer-sessions/:id` | → `DeletionReceipt` | Always available. Idempotent. |
| `GET /media/:id` | image/jpeg | Only ids present in the store. `Cache-Control: no-store` for buyer media. Serves normalized originals and *disclosed* generated images only. |

```ts
interface DeletionReceipt {
  sessionId: Id; deletedAt: IsoTime;
  deletedLocal: { kind: "buyer_photo" | "generated_image" | "job_record_media_refs"; id: Id; sha256: string }[];
  retainedByVendor: { fileIds: string[]; taskIds: string[]; statement: string /* COPY.retention.vendor */; source: string /* doc URL */ };
}
```

### 4.6 YouCam client contract (`src/youcam/client.ts`)

```ts
interface YouCamClient {
  readonly mode: Mode;
  createUpload(input: { contentType: "image/jpg" | "image/png"; fileName: string; fileSize: number }):
    Promise<{ fileId: string; put: { url: string; headers: Record<string, string>; method: "PUT" } }>;
  putBytes(put: { url: string; headers: Record<string, string> }, bytes: Uint8Array): Promise<void>;
  createClothTask(body: { src_file_id: string; ref_file_id: string; garment_category: GarmentCategory;
                          change_shoes: boolean; filter_multi_person: "strict" }): Promise<{ taskId: string }>;
  getClothTask(taskId: string): Promise<{ status: "running" | "success" | "error"; engineError: string | null;
                                          errorMessage: string | null; resultUrl: string | null }>;
  download(url: string): Promise<Uint8Array>;
  featureCost(): Promise<PreflightRecord["featureCost"]["matched"]>;   // pages until next_token null
  creditBalance(): Promise<number>;
}
// All methods throw YouCamHttpError {kind: "http"|"network_pre_send"|"network_ambiguous"|"timeout"|"parse",
//   http?: number, errorCode?: string, retryAfterMs?: number} — never containing the key or presigned query strings.
```

Content type mapping: JPEG → `"image/jpg"` (verbatim from the docs; if L2 shows a rejection, switch to `image/jpeg` and record it in `live-evidence.md`). Normalized uploads are always JPEG.

---

## 5. Domain states, transitions and invariants

### 5.1 Capability matrix (`src/domain/capabilities.ts`, pure)

`(photoType, category) → {status, citation}`. Base (documented) table:

| photoType \ category | upper_body | outer | full_body | lower_body |
|---|---|---|---|---|
| hanger | documented ("front-facing product shot of a single garment") | documented | documented | **documented_unsupported** ("For the lower body, only actual worn outfits are supported") |
| mannequin | documented (same product-shot rule) | documented | documented | documented_unsupported |
| flatlay | **unverified** (not mentioned; C4) | unverified | unverified | documented_unsupported |
| worn | documented ("Full-body photo as an outfit reference"), **needs rights** | documented, needs rights | documented, needs rights | documented, needs rights |

- **Live overrides** come from `data/capabilities.live.json`, written only by `scripts/youcam-probe.ts` and mirrored to `docs/live-evidence.md`. They can set `live_ok`/`live_failed` for a cell. They can **never** upgrade a `documented_unsupported` cell.
- **Spend rule:**
  - live mode allows `documented` and `live_ok`;
  - `unverified` is allowed only through `youcam-probe`;
  - fixture mode allows `unverified` with the "UNVERIFIED INPUT TYPE (DEMO)" label;
  - `documented_unsupported`/`live_failed` → blocked in all modes, with guidance (e.g. "Hang the item or photograph it worn by a consenting adult").
- **Worn garment photos** contain a person. In live mode they require a rights-manifest entry for that person (PC-1); self-service worn uploads are allowed in fixture mode only.

### 5.2 Quality gate (`src/domain/quality/*`, pure; thresholds frozen in `thresholds.ts`, `THRESHOLDS_VERSION = "q1-2026-10-19"`)

Metrics are computed on the **normalized** image downscaled to a long side of 512 px (area average), grayscale luma Y = 0.2126R + 0.7152G + 0.0722B (sRGB values 0–255, no linearisation; documented choice).

| Check | Rule | Severity |
|---|---|---|
| format | magic bytes JPEG `FF D8 FF` / PNG `89 50 4E 47 0D 0A 1A 0A` only (SVG/HEIC/WebP/GIF → fail with "export as JPG") | fail |
| file_size | original ≤ 25 MB accepted by our server; normalized must be < 10,000,000 bytes (always true at ≤2048 px q90; asserted) | fail |
| min_dimensions | orientation-agnostic: long ≥ 512 **and** short ≥ 384 (documented minimum) | fail |
| recommended_dimensions | long ≥ 1024 and short ≥ 768 | warn |
| max_dimensions_normalized | >4096 is auto-downscaled; we report "resized from W×H" | pass(info) |
| aspect_ratio | long/short > 3.0 | warn (general error code `error_unsupport_ratio` exists) |
| sharpness | variance of 3×3 Laplacian (kernel 0 1 0 / 1 −4 1 / 0 1 0) over the 512-px gray raster, excluding a 1-px border: **< 40 fail, < 100 warn** | fail/warn |
| exposure_mean | mean Y: **< 40 or > 235 fail; < 70 or > 210 warn** | fail/warn |
| exposure_clipping | fraction of pixels with Y ≤ 5 or Y ≥ 250: **> 0.25 fail; > 0.10 warn** | fail/warn |
| background_busy (garment only) | Sobel magnitude > 48 fraction in the outer 8% border band: **> 0.12 warn** (heuristic, never fail) | warn |
| decl_* | the seller declarations in `GarmentDeclaration` must all be true (except `noPeopleInPhoto` when worn); `notComposite=false` → fail citing "Do not use composite images" | fail |
| capability | §5.1 spend rule | fail (blocked) / warn (unverified in fixture) |
| model_* (model photos) | single person, standing front-facing, face and shoulders visible, ≥80% frame; declared in the rights manifest (live) or synthetic (fixture); `model_rights` fails in live without a manifest consent | fail |

**Verdict** = worst severity. `spendAllowed` = verdict ≠ fail ∧ capability permits in mode.

**Calibration** (`docs/calibration.md`, slot1): thresholds are **pre-registered here and are not tuned to make tests pass**.
- Synthetic calibration set from `synth.ts`: textured garment at blur σ ∈ {0, 1, 2, 4, 8} and exposure scale ∈ {0.2, 0.5, 1, 1.5, 3}.
- Expected: σ0/σ1 pass, σ4/σ8 fail, exposure 0.2 & 3 fail, 1 passes.
- If a synthetic expectation fails, record the measured values and **stop**, reporting to the lead. Any threshold change needs a lead decision-log entry and a new `THRESHOLDS_VERSION`.
- Johan's real photos (when available) are logged as observations only.

### 5.3 Try-on attempt state machine (`src/domain/job-machine.ts`, pure reducer `step(attempt, event, now) → {attempt, effects[]}`)

```
queued --start--> uploading --uploads_ok--> submitting --task_created(taskId)--> polling
polling --poll(running)--> polling          polling --poll(success,url)--> downloading --downloaded--> succeeded
polling --poll(error,code)--> failed        polling --deadline--> timed_out
uploading --upload_failed(definitive)--> failed
submitting --post_failed(definitive_no_charge: 400 InvalidParameters/BadRequest/CreditInsufficiency, 401)--> failed
submitting --post_failed(429 | network_pre_send) & retries<3--> submitting (after backoff)
submitting --post_failed(timeout | network_ambiguous | 5xx | 429 after 3 tries)--> uncertain
downloading --download_failed(403/410 expired) & refreshes<1--> polling (one GET for a fresh url) ; else --> failed (code result_download_failed; taskId kept)
any non-terminal --cancel--> cancelled
terminal = {succeeded, failed, timed_out, uncertain, cancelled}
```

**Invariants** (each has a property test):
- **I1:** an attempt has at most one `taskId`. Once set, the reducer emits no `create_task` effect for that attempt.
- **I2:** `postCount ≤ 3`. Auto-retry only after 429 or `network_pre_send`.
- **I3:** terminal states are absorbing. Every event on a terminal attempt is ignored and recorded, and no effects are emitted.
- **I4:** after `deadlineAt`, no `poll` effect is emitted. `getCount ≤ G_max`, where G_max = ⌈(deadline − 5 s)/pollInterval⌉ + backoff retries + 1 refresh. The bound is computed in the test from the schedule.
- **I5:** a retry creates attempt n+1. It never reuses a ledger entry, and requires `confirmCostUnits`.
- **I6:** for every attempt with a `taskId`, the ledger entry is `spent` (success), `possibly_spent` (failed after task creation, timed_out, uncertain, cancelled), or `released` (only for definitive pre-task failures).

**Timing** (env-configurable within bounds; defaults):
- `YOUCAM_TASK_DEADLINE_MS=300000` (allowed 60,000–900,000), measured from `task_created`.
- Poll schedule: first at +5 s, every 5 s until +60 s, then every 10 s (docs' "e.g., every 10 seconds").
- GET failures (429/5xx/network/500 TaskTimeout): exponential backoff 1, 2, 4, 8 … ≤30 s with ±20% jitter. Backoff does not extend the deadline.
- GET 500 TaskTimeout is retried only until the deadline, then → `timed_out`.
- Upload: POST /file and PUT each retry ≤3 on 429/5xx/network (no unit cost is documented for uploads). PUT 403 → request a new upload slot once.

**Rate limiter** (`rate-limiter.ts`, process-wide, all live calls): token bucket at 3 req/s, burst 3, **plus** a rolling window of ≤200 requests / 300 s (margin under 250). Calls wait (FIFO) rather than fail. The fixture client uses the same limiter, so tests are realistic.

**Concurrency:** live mode runs at most 1 in-flight attempt (sequential batches, units conservative). Fixture mode allows ≤3.

### 5.4 Measurements (`src/shared/measurements.ts`, pure)

- **Input:** cm with ≤1 dp → `mm = Math.round(cm × 10)`; inches in ¼ steps with ≤2 dp → `mm = Math.round(in × 25.4)`.
- **Display:** cm = mm/10 to 1 dp; inches = round(mm/25.4 × 4)/4 rendered as e.g. `21¼ in`.
- **Valid range:** 50–2000 mm; otherwise "Check this value". Measured **flat** (copy explains doubling for circumference).
- **Compare panel** (client-only, never sent to the server): the buyer enters the same fields from a garment they own, and sees `this − yours` per field (signed, in the chosen unit), with COPY `compare.disclaimer` = "Differences in flat measurements only. This is not a fit or size prediction."

### 5.5 Listing rules (`src/domain/listing.ts`, pure)

- **ready** ⇔ title non-empty ∧ ≥1 garment photo whose latest QualityReport verdict ≠ fail (capability-blocked photos count as fail) ∧ measurements contain all required fields for the category ∧ a declaration exists. Try-on results are **optional** for readiness.
- **Gallery order:** `garmentPhotoIds` first (cover = index 0), then try-on results in a separate, labelled section. A generated image can never be the cover, in the listing card, or first in DOM order.
- **Listing text template** (deterministic, from fields): title, tag size ("Tag size: M. Vintage sizes vary, so check the measurements."), measurements table, and condition notes (seller text, with a copy-lint *warning* to the seller when it contains banned claims). The footer is COPY `listing.disclosure` whenever try-on results exist.

### 5.6 Units ledger (`src/domain/ledger.ts`, pure, persisted as `data/ledger.jsonl` append-only)

- **reserve(jobId, attempt, units)** succeeds only if `committed + units ≤ YOUCAM_UNIT_BUDGET` (default **120** units; hard max 400). Committed = reserved + spent + possibly_spent. Live mode additionally requires `preflight.balanceUnits ≥ units` from a preflight ≤30 min old.
- **Reservation is atomic in-process:** a single async mutex around read-check-append, plus a startup replay of the ledger file.
- **Settlement:** success → `spent`. Definitive pre-task failure → `released`. Anything after `taskId` that isn't success → `possibly_spent`. The docs do not say whether failed tasks are charged, so we count them conservatively.
- **Fixture mode:** units = 0, entries labelled `mode: fixture`, budget untouched.

### 5.7 Buyer session (disabled under PC-1; implemented and tested)

`created(consent) → photo_uploaded → tryon_running → result_ready → deleted`. The TTL is 60 min from creation. `ttl-sweeper.ts` runs every 60 s, deleting files and `GeneratedImage`s and replacing paths in job records with `null` plus the sha256 (the audit stays, the image does not). "Done"/"Delete now" call DELETE. The receipt (§4.5) always includes `retainedByVendor` when any upload happened.

---

## 6. Error, empty and loading UI states (copy is fixed in `src/shared/copy.ts`)

| Situation | UI |
|---|---|
| Fixture mode | Persistent top `ModeBanner`: "DEMO MODE: sample data. Try-on images here are placeholders, not YouCam results." Each fixture image is watermarked. |
| Live mode, no preflight / stale | Units panel: "Check YouCam units before generating" plus a "Run check (free)" button (calls the preflight route), and the generate button is disabled. |
| `cost_unknown` | "YouCam didn't report a price for AI Clothes try-on v4, so SecondLook won't spend units." |
| Empty listings | "No listings yet. Add your first item (one clear photo of the garment on a hanger works best)." |
| Quality gate running | Skeleton with "Checking photo…" |
| Gate fail | A red row per failed check: what was measured, the threshold, and how to retake. Generation is disabled. |
| Gate warn | An amber row: "You can continue; results may be worse." |
| Capability blocked | E.g. lower-body hanger photo: "YouCam's try-on supports trousers and skirts only from photos of them being worn. Photograph them worn by a consenting adult." Cites the doc. |
| Unverified input (fixture) | Badge "UNVERIFIED INPUT TYPE (DEMO)" |
| Cost confirm | Dialog: "This uses about {cost}×{n} = {total} YouCam units. Balance at {time}: {balance}. Budget left: {remaining}." Buttons: Confirm / Cancel. |
| Job progress | Steps: Uploading photos → Sent to YouCam → Generating (elapsed s / deadline) → Downloading → Done. A cancel button says "Stops waiting; units may already be used." |
| Engine errors | Per-code guidance (§9.3), e.g. `error_pose`: "YouCam couldn't find a standing, forward-facing pose in the model photo." |
| Timed out | "YouCam didn't finish within {n} minutes. Units may have been used. Retry (uses units again) or try later." |
| Uncertain | "We lost the connection while starting the job. YouCam may have charged units. We won't retry automatically." Retry needs confirmation. |
| 401 | "YouCam rejected the API key. Check YOUCAM_API_KEY in your local .env (never share it)." |
| 429 | Transparent waiting ("Waiting for YouCam rate limit…"). After 3 tries → uncertain/failed as per §5.3. |
| Buyer disabled | Panel: "Try it on yourself is turned off in this build. YouCam keeps uploaded photos for up to 30 days, and SecondLook can't delete YouCam's copy sooner, so we haven't enabled personal uploads yet." Links to the PC-1 summary in the README. |
| Listing with try-ons | Section header "AI try-on previews: approximate". Below each image: "AI-generated preview from YouCam. Fit, size, colour and details may differ from the real item. The original photo is shown first." |

---

## 7. Data provenance

| Data | Origin | Stored where | Committed? |
|---|---|---|---|
| Synthetic mannequins/garments | `src/images/synth.ts` (procedural SVG: shapes, stripes, gradient textures, a "DEMO" text plate) | `assets/demo/*.png`, regenerated by `pnpm fixtures:generate` (byte-stable, sha256 listed in `assets/demo/SHA256SUMS`) | yes |
| Fixture try-on results | Composite of the synthetic model plus a garment thumbnail inset, with a diagonal "DEMO FIXTURE · NOT A YOUCAM RESULT" watermark. Deliberately does **not** look like a try-on. | `data/` at runtime | no |
| Real model photos (live) | Only people with a rights-manifest entry: initially **Johan himself**, with informed self-consent including the 30-day vendor retention, or licensed stock whose licence explicitly allows AI processing and video publication | `data/rights/` (gitignored) unless `repoDistribution: "allowed"` | only if allowed |
| Real garment photos (live) | Johan's own garments, photographed by Johan; no people; no prominent third-party logos | `data/` / optionally `assets/live/` if Johan approves | Johan decides |
| Live outputs | YouCam cloth-v4 results, stored with `jobId`, `taskId`, timestamp and preflight id; recorded in `docs/live-evidence.md` (no images or URLs in the doc, only hashes/dims/timestamps) | `data/` | no (screenshots for submission only after Johan approves) |
| Documentation facts | `docs/sources/*` snapshots with sha256 | repo | yes |

`assets/rights/manifest.json` (validated by `manifest.schema.json`):

```json
{ "version": 1, "entries": [ {
  "rightsId": "self-johan-001", "kind": "person_self_consent | person_written_consent | stock_licence | synthetic",
  "subjectIsAdult": true, "aiProcessingConsent": true, "vendorRetentionDisclosed": true,
  "scopes": ["development", "demo_video", "repo"], "repoDistribution": "allowed | local-only",
  "noProminentThirdPartyMarks": true, "licenceUrl": null, "consentRecordedAt": "2026-10-..T..Z",
  "expiresAt": null, "file": "data/rights/self-johan-001.jpg", "sha256": "<hex>", "notes": "" } ] }
```

The server refuses (`rights_missing`) any live upload of a person image whose sha256 doesn't match an entry with `aiProcessingConsent ∧ vendorRetentionDisclosed ∧ subjectIsAdult` and the scope `development`. **Workers never fill in consent fields on Johan's behalf.** The repo ships with the manifest containing **synthetic entries only**.

---

## 8. Model prompts, output validation, repair and refusal

**No LLM is used** (non-goal §2.3). The only model is YouCam's cloth-v4, which takes no prompt.

"Output validation" for cloth-v4:
- the downloaded bytes must sniff as JPEG/PNG;
- they must decode with sharp, with dimensions within 64–8192;
- otherwise → `failed` (`result_invalid`), with no retry.

We do **not** attempt to judge visual faithfulness automatically and never claim it.

"Refusal" behaviour:
- Errors the docs list as content refusals (`error_nsfw_content_detected`, `exceed_nsfw_retry_limits`) map to neutral copy ("YouCam declined to generate this image") with no auto-retry.
- Our server refuses requests that violate gates (§4.5 409s).

---

## 9. Adapter behaviour: fixture versus live

### 9.1 Mode selection (`src/server/env.ts`)

- `YOUCAM_MODE` ∈ {fixture, live}; default **fixture**.
- `live` requires `YOUCAM_API_KEY` to be non-empty. If it's missing, the server **exits with code 2** and the message "YOUCAM_MODE=live but YOUCAM_API_KEY is not set". There is **no fallback to fixture**.
- `YOUCAM_BASE_URL` (default `https://yce-api-01.makeupar.com`; must be https, except `http://127.0.0.1:*` for the contract mock in tests).
- `YOUCAM_UNIT_BUDGET` (default 120), `YOUCAM_TASK_DEADLINE_MS`, `BUYER_UPLOAD` (`disabled` default; `enabled` is honoured only if `docs/decisions/PC-1-disposition.md` exists and contains the line `decision: enable-buyer-upload`; otherwise the server logs a refusal and stays disabled), `DATA_DIR` (default `./data`), `PORT`, `VITE_PORT`.
- `.env` is loaded via Node `--env-file-if-exists=.env` (Node ≥22). `.env.example` has empty values only.
- `check-env.ts` prints **presence** (`YOUCAM_API_KEY: set (length hidden)`), never the value.

### 9.2 Live HTTP client (`http-client.ts`)

- Node global `fetch` with an `AbortSignal.timeout`: 20 s for API calls, 60 s for PUT/download.
- Headers: `Authorization: Bearer ${key}` on API calls only. Never on the presigned PUT or the result download, since those are S3 URLs.
- Classification:
  - DNS/ECONNREFUSED before a request is written → `network_pre_send`;
  - abort or socket reset after write → `network_ambiguous`/`timeout`;
  - non-2xx → `http` with a parsed `error_code`;
  - `Retry-After` honoured (seconds) on 429.
- The response parser is defensive (Zod `.passthrough()` on unknown fields). A missing `data.task_id` → `parse` error → attempt `uncertain` (a task may exist).

### 9.3 Error mapping (`src/domain/errors.ts`), exhaustive over the documented codes

| Upstream | Our code | Retry | Guidance key |
|---|---|---|---|
| 400 CreditInsufficiency | `no_units` | no | units |
| 400 InvalidParameters / BadRequest / InvalidStyle* | `bad_request` | no | report bug (log the sanitized body shape) |
| 401 | `auth` | no | key |
| 429 | (internal backoff) → `rate_limited` | auto (≤3) / user_confirm | wait |
| GET 400 InvalidTaskId | `task_missing` | user_confirm | retry |
| GET 500 TaskTimeout | (backoff until deadline) → `deadline` | user_confirm | later |
| engine `error_pose` | `yc_error_pose` | user_confirm | model pose |
| `error_invalid_src` | `yc_invalid_src` | user_confirm | model must show upper body/shoulders |
| `error_invalid_ref` | `yc_invalid_ref` | user_confirm | garment fully visible / not empty |
| `error_apply_region_mismatch` | `yc_region_mismatch` | user_confirm | category vs photo (e.g. full_body needs a full-body model) |
| `error_multi_person` / `error_multiple_people` | `yc_multi_person` | user_confirm | one person only |
| `exceed_max_filesize` / `error_exceed_max_image_size` / `error_below_min_image_size` | `yc_size` | no (gate bug; log) | size |
| `error_download_image` / `error_decode_image` / `error_upload` | `yc_io` | user_confirm | retry |
| `error_no_face` / `error_face_parsing` / `error_large_face_angle` / `error_no_shoulder` | `yc_face_or_shoulder` | user_confirm | face/shoulders visible, front-facing |
| `error_nsfw_content_detected` / `exceed_nsfw_retry_limits` | `yc_declined` | no | declined |
| `error_editing_failed` ("result too similar to source") | `yc_no_change` | user_confirm | garment too similar / choose a different photo |
| `error_inference` / `unknown_internal_error` / `invalid_parameter` / unknown string | `yc_engine` (raw code kept) | user_confirm | generic |

### 9.4 Fixture client (`fixture-client.ts`)

This is a deterministic simulator. The scenario is selected by the garment photo's `sha256` prefix in `fixtures/scenarios.json`, or by the `X-Fixture-Scenario` header in tests only (ignored unless `NODE_ENV=test`). It honours the same limiter and clock.

| Scenario | Behaviour |
|---|---|
| `ok` (default) | upload ok; running ×3 polls; success; composite DEMO image |
| `slow` | running until 120 s, then success |
| `never` | running forever (→ timed_out) |
| `engine_error_pose` | error `error_pose` on poll 2 |
| `region_mismatch` | `error_apply_region_mismatch` |
| `no_units` | POST 400 CreditInsufficiency |
| `rate_limited` | POST 429 ×2 then ok |
| `post_ambiguous` | POST times out after send (→ uncertain) |
| `url_expired_once` | first download 403, refresh ok |
| `url_expired_always` | → failed `result_download_failed` |
| `get_500_timeout` | GET 500 TaskTimeout ×4 then success |

Fixture `featureCost` returns `[]` and the fixture ledger uses 0 units. **The fixture never fabricates a cloth-v4 price.**

### 9.5 Contract mock (`tests/contract/mock-youcam.ts`)

A local Hono server implementing the **documented** request/response shapes exactly (field names, status codes, the presigned PUT route on the same mock with header assertions). The live `http-client.ts` is tested against it. It is labelled in test names as `documented-contract` and **never cited as live evidence**.

### 9.6 Live scripts

- **`pnpm youcam:preflight`** (0 units): calls `feature-cost` (all pages) and `credit`, writes `data/preflight/latest.json`, and prints a redacted summary (cost per task, balance, sku descriptions). Exit codes: 0 ok, 3 `cost_unknown`, 4 auth, 5 network.
- **`pnpm youcam:probe --plan probes/input-matrix-v1.json --confirm-units <N>`** (spends units):
  - refuses unless preflight ≤30 min old, N equals plan tasks × cost, N ≤ remaining budget, and every image is in the rights manifest;
  - runs sequentially;
  - writes `data/capabilities.live.json` and appends to `docs/live-evidence.md` (task outcome, engine code, dims, sha256, timestamps; no URLs, no images).
- **A visual judgement of whether a probe "looks usable" is a human note by Johan or the lead, recorded as such; it is never automated or scored.**

---

## 10. Acceptance examples and adversarial (falsifying) tests

Test layers:
- `tests/unit` (pure modules);
- `tests/property` (fast-check, `numRuns: 200`, fixed seed `20261019` logged);
- `tests/contract` (http-client vs the documented mock);
- `tests/server` (Hono `app.request` with the fixture client, fake clock via an injected `Clock`, not global timers where possible);
- `tests/web` (React Testing Library + jsdom);
- `tests/e2e` (Playwright, heavy grant).

**Deterministic acceptance examples:**
- **A1:** 1024×768 sharp synthetic hanger top, all declarations true, upper_body → verdict pass, spendAllowed (fixture and live-with-preflight).
- **A2:** listing with that photo plus pit_to_pit 520, length 680, shoulder 450, sleeve "na" (cm entry) → ready.
- **A3:** fixture job `ok` → states queued→uploading→submitting→polling→downloading→succeeded; postCount 1; result labelled `demo_fixture`; the listing gallery has the original first.
- **A4:** 21.5 in → 546 mm → displays `21½ in`. 52.3 cm → 523 mm → `52.3 cm`.

**Falsifying tests** (each would fail if the product were wrong; none mirrors the implementation):

| ID | Test |
|---|---|
| F1 | lower_body + hanger declaration → capability blocked; **zero** client calls (spy) in both modes |
| F2 | 511×384 and 512×383 fail; 512×384 and 384×512 pass min_dimensions |
| F3 | Synthetic σ4 blur fails sharpness, σ0 passes; exposure ×0.2 and ×3 fail. The test also asserts `THRESHOLDS_VERSION` equals the value in this plan and in `docs/calibration.md`. |
| F4 | `post_ambiguous` → attempt `uncertain`, postCount === 1, no further POST after advancing the clock 1 h, ledger `possibly_spent` |
| F5 | `rate_limited` → postCount === 3, one taskId, succeeded |
| F6 | `never` → `timed_out` at deadline (±1 poll interval). getCount ≤ computed G_max. After +1 h, getCount is unchanged. |
| F7 | `url_expired_once` → exactly one refresh GET, succeeded. `url_expired_always` → failed `result_download_failed`, taskId retained. |
| F8 | `no_units` → failed `no_units`, ledger `released`, no retry |
| F9 | Budget 10, cost 4: `Promise.all` of 5 tryon requests → exactly 2 reserved, 3 × 409 `budget_exceeded`, zero network calls for the rejected 3. Ledger replay after a restart gives the same committed total. |
| F10 | Live with the contract mock whose feature-cost lacks a cloth-v4 sku → 409 `cost_unknown`, zero `/file` or `/task` calls |
| F11 | Live with a model photo not in the manifest (or `vendorRetentionDisclosed:false`) → 409 `rights_missing`, zero uploads |
| F12 | Buyer routes → 403 `buyer_upload_disabled` in fixture **and** live by default, and with `BUYER_UPLOAD=enabled` but no disposition file. DELETE still works. |
| F13 | Listing with 2 try-on results: the first `<img>` in DOM order is the original. PATCH with a generated id as cover → 422. Each generated image has a `DisclosureBadge`, **and** the served JPEG has the burned band: the bottom band of height ≥ max(28 px, 6% of h) differs from the raw result (pixel test on a known flat raw image). |
| F14 | Copy lint (`banned-phrases.ts`) over `copy.ts` values, the listing template output for 200 random listings, `README.md`, `docs/submission-draft.md` and `docs/demo-script.md`: no match except the allowlisted disclaimer strings. Patterns include (case-insensitive): `\b(perfect|true|exact|accurate|guaranteed)[- ](fit|size|sizing)\b`, `\bfits? (you|like|perfectly|true)\b`, `\btrue[- ]to[- ](size|life)\b`, `\b(exact|accurate|faithful|identical|photoreal\w*)\b`, `\bwhat you see is what you get\b`, `\b(deleted|erased) (everywhere|permanently|immediately)\b`, `\bno (one|body) (keeps|stores)\b` |
| F15 | Canary: `YOUCAM_API_KEY=yc_CANARY_7f3a`, a full live flow against the contract mock. Then grep every file under DATA_DIR, captured logs, all JSON responses and SSR HTML for the canary and for `X-Amz-Signature`/`Signature=`: **zero hits**. The mock asserts that Authorization is present on API calls and absent on PUT/download. |
| F16 | `YOUCAM_MODE=live` without a key → process exit code 2 (spawned in the test). Fixture: `/api/health.mode === "fixture"`; the banner is rendered; every generated image's label is `demo_fixture` and the watermark pixels are present. |
| F17 | A JPEG with EXIF GPS + Orientation=6 → normalized output has no EXIF/XMP/ICC-other-than-sRGB, and is visually rotated (width/height swapped) |
| F18 | Property: any valid mm 50–2000 → cm display → re-entry round-trips within 1 mm; inches within 3.2 mm |
| F19 | Cancel during polling → no GET after cancel (clock +1 h); state cancelled; ledger possibly_spent |
| F20 | 300 scheduled requests through the limiter (fake clock): no 1 s window has >3 and no 300 s window has >200 |
| F21 | Every documented engine/HTTP code in the snapshot OpenAPI enum and the error tables maps to a non-generic UserError (the test parses `docs/sources/perfectcorp-ai_clothes-openapi-20261019.yaml` enums, so new docs codes would fail it). An unknown code → `yc_engine` with the raw code kept. |
| F22 | The PUT uses exactly the method/URL/headers returned by POST /file (mock asserts Content-Type and Content-Length equality) |
| F23 | Measurements compare panel: no network request contains buyer comparison values (RTL test spying on fetch) |
| F24 | TTL sweep: a buyer session (enabled under a test disposition) is past 60 min → files gone from disk, media 404, the receipt lists the sha256s and the vendor statement and source URL |

---

## 11. Install / run / test / build commands

Run in `$W/projects/youcam` (or the slot worktree). **Heavy** = needs a unique master grant (`control/HEAVY-TASK-PROTOCOL.md`).

| Command | Heavy? | Purpose |
|---|---|---|
| `export PATH="$HOME/.local/share/vite-plus/bin:$PATH"` | — | node/pnpm |
| `pnpm install --frozen-lockfile` (first time: `pnpm install` to create the lockfile) | **yes** | deps |
| `pnpm exec playwright install chromium` | **yes** | browser (store under `$W/cache/youcam/ms-playwright` via `PLAYWRIGHT_BROWSERS_PATH`) |
| `pnpm typecheck` (`tsc --noEmit`) | no | |
| `pnpm test:one tests/unit/<file>` | no (targeted) | |
| `pnpm test` (`vitest run --maxWorkers=1 --no-file-parallelism`) | **yes** (full suite) | |
| `pnpm fixtures:generate` | no | synthetic DEMO assets |
| `pnpm dev:fixture` (`YOUCAM_MODE=fixture concurrently "tsx watch src/server/main.ts" "vite"`) | no | local app |
| `pnpm build` (`vite build && tsc --noEmit`) | **yes** | |
| `pnpm e2e` (`playwright test`, 1 worker) | **yes** | |
| `pnpm screenshots` | **yes** | fixture screenshots → `docs/screenshots/fixture/` |
| `pnpm check:env` | no | presence only |
| `pnpm youcam:preflight` | no (live; 0 units; **gate L1**) | |
| `pnpm youcam:probe …` | no (live; **spends units; gate L3**, lead + master approval of the exact plan) | |
| `pnpm licenses` | no | `pnpm licenses list --json` → `docs/licenses.json` |

---

## 12. Pinned dependencies and licences

Reuse the versions already installed and reviewed in `projects/qloo` (same machine and store), plus sharp. Exact versions are pinned; no `^`/`~`. If a pin fails to resolve, use the nearest patch release and record it in `docs/licenses.md` with the reason.

| Package | Version | Licence |
|---|---|---|
| hono | 4.13.13 | MIT |
| @hono/node-server | 1.19.17 | MIT |
| react / react-dom | 19.3.1 | MIT |
| zod | 4.6.7 | MIT |
| **sharp** | **0.35.5** (verified on npm 19 Oct; `@img/sharp-darwin-x64` 0.35.5 prebuilt) | Apache-2.0. Bundled **libvips** (`@img/sharp-libvips-darwin-x64` 1.3.4) is LGPL-3.0-or-later, dynamically linked prebuilt; record it in licenses.md. |
| typescript | 6.0.3 | Apache-2.0 |
| vite | 7.3.7 | MIT |
| @vitejs/plugin-react | 5.2.0 | MIT |
| vitest | 4.1.12 | MIT |
| fast-check | 4.10.2 | MIT |
| tsx | 4.23.15 | MIT |
| concurrently | 9.2.5 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| @testing-library/react | 16.3.3 | MIT |
| jsdom | 27.4.0 | MIT |
| @types/node / @types/react / @types/react-dom | 24.19.2 / 19.3.0 / 19.3.0 | MIT |

**Contingency:** if sharp's prebuilt binary fails on this Intel macOS 15.7, stop and report to the lead. The approved fallback is `jpeg-js` + `pngjs` (MIT) for decode and encode, with disclosure via a pure-JS raster draw; it needs a lead decision-log entry. No other image library is to be installed. Project code licence: MIT (Johan).

---

## 13. Privacy and secret handling

- **The key:**
  - lives only in the RP local `.env` (chmod 600, gitignored) or the shell env, placed by Johan;
  - is never in chat, commits, logs, test snapshots or the browser;
  - leads/workers check presence only.
- **Redaction** (`redact.ts`): it strips `Authorization` and any presigned query string (`X-Amz-*`, `Signature`, `Expires`) from logs and errors. Error objects are reconstructed, never passed through raw. File IDs and task IDs are not secrets, but they are logged truncated (`first 8…`).
- **Images:**
  - EXIF/XMP/GPS are stripped at normalization;
  - only normalized images are uploaded;
  - originals are discarded after normalization (only sha256 + dims are kept);
  - `filter_multi_person: "strict"` is sent on every task.
- **PC-1:**
  - buyer upload is disabled by default;
  - in live mode no real-person image is uploaded unless it is in the rights manifest with retention disclosed;
  - local deletion receipts;
  - the vendor-retention statement is always shown with our deletion statement.
- **The server** binds `127.0.0.1` only. There is an origin check, no CORS headers, `X-Content-Type-Options: nosniff`, and CSP on the SPA (`default-src 'self'; img-src 'self' blob:`).
- **No analytics or third-party scripts and no fonts from CDNs**, so there's no third-party data flow in the UI.
- **Before every bundle:** a history secret scan (`git log -p | grep -i -E "api[_-]?key|secret|token|password|Bearer "`), with hits reviewed by the lead.

---

## 14. Demo choreography (≤3:00; the video is Johan's release action RG3)

Footage is labelled on-screen: "DEMO (fixture)" or "LIVE YouCam". The live segments require L4. If L4 is not reached, the video uses fixture footage with the DEMO banner visible, plus a spoken statement. Johan decides whether to submit that.

| t | Screen | Narration gist (Johan's voice; draft in `docs/demo-script.md`) |
|---|---|---|
| 0:00–0:15 | A thrift item on a hanger, the listing draft | "Secondhand sellers have one photo of a one-off item, and no model." |
| 0:15–0:45 | Upload a blurry photo → the gate fails sharpness with a retake tip → upload a sharp one → pass. Declare a lower-body hanger photo → blocked with the doc reason. | "Before spending a single unit, SecondLook checks the photo against YouCam's documented input rules." |
| 0:45–1:00 | Measurements in cm, toggle to inches | "Measurements, not size claims." |
| 1:00–1:45 | Pick a consented model (Johan) → cost dialog with live feature-cost and balance → progress (uploading → sent → generating, polling → downloading) → result with the burned disclosure | "This is YouCam's AI Clothes try-on v4: File API upload, an async task, and polling with a deadline and safe retries." |
| 1:45–2:15 | Listing page: original first, the try-on labelled approximate; the compare-with-your-garment differences | "The original always comes first; the AI preview is labelled approximate." |
| 2:15–2:35 | Buyer "Try it on yourself": the disabled explainer (or, if PC-1 is enabled for Johan, consent → result → deletion receipt with the vendor-retention line) | "We tell you exactly what we delete, and what YouCam keeps for 30 days." |
| 2:35–3:00 | Units ledger + architecture card (cloth-v4, File API, feature-cost, credit) | Recap of the YouCam APIs used. Fixture vs live labels. |

No brand logos, copyrighted music or third-party people appear in the footage (R8).

---

## 15. Staged work assignments and integration order (slot1 = integrator; one slot allocated)

Slot1 worktree: `git -C $W/projects/youcam worktree add $W/projects/youcam-wt/slot1 -b codex/slot1-integrator`. Slot1 commits on its branch. The lead reviews each stage (diff + targeted tests). Slot1 then fast-forward-merges into `main` (only slot1 merges). Commit trailer: `Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>`. Each stage ends with a report: commands run with exit codes, test counts, deviations, open questions.

| Stage | Target date (SGT) | Scope | Acceptance (lead review) | Heavy grants |
|---|---|---|---|---|
| **S0 scaffold** | 20 Oct | package.json with exact pins, lockfile, tsconfig strict, configs, `.gitignore`, `.env.example`, `types.ts`+`schemas.ts` (§4 complete), `copy.ts` skeleton with all keys, `banned-phrases.ts` + F14 test, `env.ts` + F16 exit test, `synth.ts` + `gen-fixtures`, README skeleton, `docs/licenses.*` | typecheck clean; targeted tests pass; lockfile committed; no deps beyond §12 | **G-install** (pnpm install) |
| **S1 domain** | 21–22 Oct | measurements (F18, A4), capabilities (F1), quality metrics/gate/thresholds + calibration doc (F2, F3), normalize/raster (F17), job-machine (I1–I6 property tests), ledger (F9 pure part), listing rules (F13 pure part), errors (F21) | all pure tests are green with targeted runs; calibration expectations hold **without threshold edits** | none (targeted) |
| **S2 adapter + server** | 23–24 Oct | rate-limiter (F20), redact, http-client + contract mock (F10, F15, F22), fixture client (all scenarios), runner (F4–F8, F19), preflight, store (atomic writes, ledger replay), routes incl. the buyer 403 gate (F12) and TTL sweeper (F24), disclose (F13 pixel) | server tests green; canary test zero hits | **G-suite-1** (full vitest) at end |
| **S3 UI** | 25–27 Oct | SellerWizard, QualityReport, DeclarationForm, MeasurementsForm, CompareMeasurements (F23), ModelPicker, CostConfirmDialog, JobProgress, Gallery/ListingPage (original-first), BuyerTryOn (disabled explainer + full flow behind the gate), UnitsPanel, ModeBanner, all §6 states | RTL tests; lead exercises `pnpm dev:fixture` via preview/curl | **G-browser-1** (lead/worker preview + e2e smoke) |
| **S4 live tooling + E2E + screenshots** | 28–29 Oct | `youcam-preflight`, `youcam-probe`, `probes/input-matrix-v1.json` (§16), manifest schema + enforcement (F11), e2e specs (seller happy path, gate fail, lower-body block, cost confirm, uncertain path, buyer disabled), `pnpm screenshots` (fixture) | e2e green; screenshots show the DEMO banner | **G-e2e**, **G-build** |
| **S5 docs/hardening** | 30–31 Oct | README (install/run/test/live setup without secrets, PC-1 summary, fixture vs live), `docs/test-report.md`, `docs/live-evidence.md` (if any), fixes from lead review | full gate green on the frozen SHA | **G-suite-final**, **G-build-final** |
| **Checkpoint** | by 1 Nov 12:00 | Lead: secret scan, bundle, exports, `publish-ready.json` last | — | — |

**Live track** (parallel, whenever access exists; each step requires the previous one):
- L1 preflight;
- L2 a single smoke task (1 task × cost; Johan's consented photo + his hanger top, upper_body);
- L3 input probe matrix;
- L4 demo generation batch.

The lead requests each spend from the master with the exact unit count. Slot1 runs them only with the confirmed numbers.

If the master later allocates more slots: slot2 = group B (quality gate + images) from S1, and slot3 = group C (UI) from S3. Their paths are disjoint as per §3. Slot1 remains integrator.

---

## 16. Gates, contingencies and timeboxes

| Gate | Condition to pass | If not passed |
|---|---|---|
| **L0 access** (external) | Johan: Devpost registration → redeem-code email → YouCam API account + email verification → redeem 1,000 units → create an API key → put `YOUCAM_API_KEY` in RP `$W/projects/youcam/.env` himself | Build continues in fixture mode, labelled DEMO. blockers.json B1–B3. |
| **L1 preflight** (0 units) | feature-cost contains a cloth-v4 sku (`run_task_url` ends `/s2s/v2.0/task/cloth-v4`); balance known | `cost_unknown` → no live tasks; report to the master |
| **L2 smoke** (1 task) | rights manifest entry for Johan (consent incl. 30-day retention, recorded by Johan); one upper_body hanger task reaches success or a documented error | Record the outcome; fix the adapter only on contract mismatches (e.g. `image/jpg`) |
| **L3 input probe** (pre-registered, ≤6 tasks) | `probes/input-matrix-v1.json`: (1) hanger upper_body, (2) flat-lay upper_body, (3) flat-lay upper_body second garment, (4) hanger outer, (5) worn upper_body (Johan), (6) hanger full_body dress *only if Johan owns one*. **Flat-lay rule (pre-registered):** `live_ok` only if both #2 and #3 reach `success`; any `error_invalid_ref`/`error_editing_failed`/`error_apply_region_mismatch` on #2 or #3 → `live_failed`, and the UI narrows to hanger/mannequin/worn. Visual usability is a recorded human note, not a metric. | Narrow scope to documented inputs (accepted fallback) |
| **L4 demo batch** | L1–L3 done; exact task list and units approved by the master; total live spend ≤ YOUCAM_UNIT_BUDGET (120) | Video uses fixture footage, labelled |
| **PC-1** | master disposition (+ Johan approval of the retention copy) | Buyer upload stays disabled; the explainer is shown |
| Timeboxes | S0 0.5 d, S1 1.5 d, S2 2 d, S3 2.5 d, S4 1.5 d, S5 1 d. Total spend cap on live probing: 1 day elapsed after L0. | Over a timebox by >50% → the lead re-plans scope (drop stretch first, then the compare panel, then outer) and records it |
| sharp install failure | §12 contingency | |
| YouCam outage/429 storms | Bounded by the limiter and deadline | Fixture continues |

---

## 17. Mandatory contest artifacts checklist (status as of v1)

| Artifact | Status | Owner |
|---|---|---|
| Working repo with source, assets, instructions | planned (S0–S5) | slot1 |
| Repo private + shared with the Devpost support address at submission | **release gate RG4** | Johan |
| Text description (features, functionality, consumer/retail value) | draft at S5 (`docs/submission-draft.md`) | lead → Johan |
| Screenshots | fixture at S4; live after L4 | slot1 |
| 1–3 min video, public YouTube/Vimeo, explains the YouCam API, no third-party marks/music | storyboard §14; **RG3** | Johan |
| Judge access (link / functioning demo / test build) | test build instructions; hosting **RG5** | Johan |
| Rising Star opt-in with school email | **RG7** | Johan |
| English | yes | — |

---

## 18. Release gates (none are authorized now; all are Johan's actions unless stated)

- **RG1:** clean main bundle, relayed by the main Mac to the private repo (verified by the coordinator; a bundle is not an upload).
- **RG2:** live integration verified (L2 minimum, L4 for live video) or honestly labelled fixture-only.
- **RG3:** video recorded/approved/published by Johan.
- **RG4:** repo shared with the Devpost support address.
- **RG5:** judge-access decision (public hosting is not authorized in this workflow).
- **RG6:** Devpost submission by Johan.
- **RG7:** Rising Star email.
- **RG8:** PC-1 disposition.
- **RG9:** optional Social Sharing Bonus (public post; release action; not planned).

**Status labels used everywhere:** `local fixture verified` / `live integration implemented but unverified` / `live integration verified` / `final release gate`.
