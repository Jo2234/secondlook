# Review clarification R2 — source and acceptance consistency

Author: GPT-6 Astra HIGH, same YouCam lead, 19 October 2026. Quota fallback from Opus 5.5 HIGH; this is not final judging review. Original plan v1.1 at fb61294 remains Opus-authored. Status: proposed to master; application changes await disposition.

## F21: explicit coverage, including deliberately generic guidance

Fresh reads of the official Clothes OpenAPI and general error page match the frozen snapshots byte for byte. OpenAPI SHA-256: 78bf425096e6bc0f2ac85618001ab29a3e940d80b7b0bd8b8492493a90d05d8d. General error page SHA-256: ad99aba8bd227917232637f53153455d065fbf25a4dadb23b28cf860fd6261c8.

Sources: https://docs.perfectcorp.com/_bundle/reference/ai_clothes.yaml and https://docs.perfectcorp.com/develop/error_codes.md . The OpenAPI describes error_download_mask and error_decode_mask as failures to download/decode a mask image. Mapping these to our existing yc_io / retry / user_confirm is an application design decision supported by those descriptions; it does not assert that callers provide masks.

Replace F21's non-generic requirement with explicit, source-complete mapping. Preserve the three deliberate yc_engine entries (error_inference, unknown_internal_error, invalid_parameter), their raw upstream codes and user_confirm policy. Unknown codes also retain raw values and use yc_engine, but are not considered covered merely because fallback exists. Tests must assert own-entry presence for every enumerated documented engine code and the exact expected code, messageKey and retry policy, independently of the production mapping table. Include HTTP response cases and the Clothes reference error tables, not only the EngineErrorCode enum.

The general source page has additional codes absent from §9.3: error_download_video, error_decode_video, error_hair_too_short, error_unexpected_video_duration, error_bald_image and error_unsupport_ratio. To make the promised source coverage honest without extending the clothes product, explicitly map the five video/hair-only codes to yc_engine / generic / user_confirm and retain raw values; these do not authorize video/hair features. Map error_unsupport_ratio to yc_ratio / ratio / user_confirm with copy: "Use a less narrow crop before retrying." Add InvalidAccessToken (the Clothes example) to auth / key / no. HTTP 401 remains auth regardless of body. All other §9.3 mappings stay unchanged. No engine code triggers automatic task POST retry.

## F36: product prose, preserved evidence

F36's blanket all-documents prohibition conflicts with the source snapshots and plan's own discussion. The automated scan covers COPY values, user-visible UI strings, deterministic listing output, README, submission draft and demo script. Keep the vendor statement verbatim and paired with local deletion wording. Preserve quoted sources and historical planning/decision/review evidence without rewriting it to satisfy a product-copy lint. They are not user-facing copy sources. Test a mutation of each covered product document to ensure it cannot silently be omitted. For artifacts not yet implemented, report coverage pending, never pretend the initial README/copy scan satisfies the entire final gate.

Fix the planned §14 buyer narration's unqualified vendor-retention shorthand when writing the demo script: display the full frozen vendor statement and narrate "We distinguish our own deletion from the AI provider's documented retention policy." No buyer enabling or consent is granted.

## F29 and F25: preserve the accepted ledger contract

F29's last sentence about entries created before T is superseded by accepted §5.6 and F37. All unresolved reserved/possibly_spent commitments are deducted regardless of creation date. Only spent entries settled at or before fenceSeq avoid another deduction. Update the example accordingly; do not weaken F37 or remove the safety margin.

F25's assertion that committed cu never decreases across restart contradicts its own before-upload released case. Require instead: no charged/ambiguous commitment is lost or reduced; a provably unsent reservation may be released exactly once; all recoveries preserve the required ledger state and total, and never create another task POST. This makes the recovery test agree with §5.9 and I6.

## S0 review and installation status

S0 604deb0 is structurally reviewed, not accepted as a tested stage. Exact dependency pins, disabled health response, production origin restriction, typed schemas and versioned retention text exist. The worker's dependency-free syntax/JSON/diff checks are reported passing; tsc, Vitest, sharp rendering and application runtime remain unrun. S1 b9ae644 and subsequent drafts are unreviewed application work.

The prior pnpm --version invocation used the Vite+ shim and created a 4,606-byte package-manager-only lockfile. It was preserved in the worker scratch evidence folder and removed from source. No application dependencies or node_modules resulted. The cached pnpm launcher dates from 16 October; this does not prove that no registry metadata fetch occurred on 19 October. Network/cache provenance of that version invocation remains unknown.

For G-install use the already-cached absolute native pnpm binary (after hashing/inspection) rather than the Vite+ shim; no execution before the master grant. G-install-A only resolves a lockfile, with scripts disabled; G-install-B is a separate request after lockfile integrity/provenance review. No build, browser, fixture rendering, live API call or test suite is part of either request unless expressly named.
