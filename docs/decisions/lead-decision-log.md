# YouCam lead decision log

| # | Date (SGT) | Decision | Basis |
|---|---|---|---|
| D1 | 19 Oct 2026 | Use cloth-v4 only, via file IDs (never public URLs) | Docs list v4 as current; `*_file_url` must be publicly accessible, and public hosting is not authorized |
| D2 | 19 Oct 2026 | Poll-only, no webhooks | Webhooks need an HTTPS endpoint we control; no public hosting. Master accepted this on 19 Oct. |
| D3 | 19 Oct 2026 | Flat-lay = `unverified` until the pre-registered L3 probe; lower-body product/hanger/flat-lay = blocked | Docs: "front-facing product shot of a single garment"; "For the lower body, only actual worn outfits are supported". Flat-lay is not mentioned (C4). |
| D4 | 19 Oct 2026 | V4 unit cost unknown; live tasks blocked until a `feature-cost` sku for cloth-v4 is seen | The AI Clothes unit table lists only V2/V3 (2 units each) (C3) |
| D5 | 19 Oct 2026 | PC-1 proposed: buyer upload and live real-person self-service upload disabled pending master disposition; never promise vendor deletion | No delete API documented; 30-day retention; ToS §3.4/§12.3/§12.4 |
| D6 | 19 Oct 2026 | No LLM; deterministic listing text | No LLM access; avoids generated fit/faithfulness claims |
| D7 | 19 Oct 2026 | Treat failed-after-task-created attempts as `possibly_spent`; no auto-retry of task creation except on 429/pre-send network errors | Charging of failed tasks is undocumented; avoid double charges |
| D8 | 19 Oct 2026 | Reuse the Qloo-reviewed stack pins plus sharp 0.35.5 | The same machine has already installed and reviewed these versions |
| D9 | 19 Oct 2026 | Theme-fit risk noted (the eCommerce VTO topic text mentions combining beauty and fashion); no beauty/skin addition | Rules require ≥1 API; the accepted decision forbids a skin pivot |
| D10 | 19 Oct 2026 | SPEC R1 accepted into plan v1.1 (finite bounds, ≤3 POSTs/429-only retry, sliding-log limiter, durable admission/recovery, exact SKU binding + host policy, grant classification, PC-1 approved disabled core, explicit pin review) | Master SPEC R1 review; diff in `spec-r1-changes.md` |
| D11 | 19 Oct 2026 | Balance observation fence, fail-closed owner lock with explicit unlock, no post-deadline requests, absorbing succeeded + separate artifact read recovery | Master follow-up consistency items |
| D12 | 19 Oct 2026 | Use `node:https` (not fetch) for live calls so DNS goes through the policy lookup | Avoids a TOCTOU gap in private-address refusal without adding an HTTP dependency |
| D13 | 19 Oct 2026 | Omit the data:unlock executable; stale-lock recovery is quiescent manual only; F40 inventories lock mutations | Master R1 follow-up: an unlock rename races a new starter |
| D14 | 19 Oct 2026 | Same lead switches to GPT-6 Astra HIGH after current Claude usage_limit; original Opus authorship and Sol slot1 retained | User-authorized quota fallback, not final judging pass |
| D15 | 19 Oct 2026 | R2 accepted: explicit documented error coverage; product-copy scan scope; F25 proven-unsent release; F29 fence wording | Master disposition at ca6ea2f; normative plan v1.2. D7 pre-send retry wording was superseded by D10/§5.3; D11 unlock wording was superseded by D13. No automatic task POST retry except received 429. |
