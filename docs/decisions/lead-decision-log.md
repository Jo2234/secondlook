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
