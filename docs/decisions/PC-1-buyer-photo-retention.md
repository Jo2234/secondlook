# PC-1: buyer-photo deletion versus vendor retention. Proposed privacy correction, awaiting master review

- **Status:** PROPOSED. This is a correction that stays compatible with the accepted consensus. It needs master acceptance and does not silently replace anything. The accepted decision (joint-decisions §5, "buyer try-on as a secondary flow, with photos deleted after processing") stays the target. This record narrows *how* the product describes that promise and *when* the flow may be enabled.
- **Author:** YouCam lead, Opus 5.5 HIGH, thread b6726a0b-fb08-4a39-969f-5b7758e424b4, 19 Oct 2026 (SGT). The master raised the same point independently in a correction message on 19 Oct 2026.

## 1. What the accepted decision assumed

Joint decisions §5 and `control/prompts/youcam-lead-specific.md` item 5: buyer "try it on me" as a secondary flow, "with photos deleted after processing".

## 2. What the official sources say (fetched 19 Oct 2026 UTC; snapshots and SHA-256 in `docs/sources/`)

| # | Source (snapshot file) | Exact statement |
|---|---|---|
| S1 | `perfectcorp-develop_file_retention_period-20261019.md` (https://docs.perfectcorp.com/develop/file_retention_period.md) | "Uploaded files and their associated `file_id` values are stored for **30 days**. After an AI task is created, the corresponding `task_id` remains valid for **30 days** … All uploaded and generated images and videos are automatically removed after **30 days**." |
| S2 | `perfectcorp-file-post-20261019.md` and `perfectcorp-reference_unit_system`/File Management index (https://docs.perfectcorp.com/reference/file.md) | The File Management reference lists only `POST /s2s/v2.0/file`. **No delete or purge endpoint is documented** for uploaded files or task results. |
| S3 | `youcam-api-terms-20261019.txt` §12.4 (https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api, "Last updated: September, 2026") | "We generally retain Client Data and AI-generated Content for 30 days after you complete each session of the Service." |
| S4 | same, §3.4 | "Certain features of our Services may identify facial geometry in the photo upload … you shall be responsible for collecting consents from any person in the photo to agree Perfect to process the photo for them." |
| S5 | same, §12.3 | "If Client Data includes personal information, you guarantee that you have obtained the consent of data subjects and have the right to transmit their personal information to us." |
| S6 | same, §11.2.1 | "Perfect will not use User Submissions to develop or improve the Services, unless you explicitly agree to such use." |
| S7 | same, §3.5.4 / §8.8 | Perfect may remove content at its discretion, and may preserve or disclose information when required by law. |
| S8 | same, §4.1 / §2.2 | The service is for adults only, and is not directed at children under 13. |

**Conflict noted (C1):** the cloth-v4 OpenAPI says a `task_id` "is valid to query … for 24 hours" (`perfectcorp-ai_clothes-openapi-20261019.yaml`, `BasicRunTaskResponseV2`), but S1 says the `task_id` remains valid for 30 days. The design assumes the shorter window (24 h) for result retrieval and the longer one (30 days) for vendor-side retention of the person's image. Each assumption is the conservative reading for its own purpose.

## 3. Consequence

We can delete **our own** copies, in memory, on disk and in our store, immediately after processing. We **cannot** delete, or verify the deletion of, the copy that YouCam (Perfect Corp.) holds. The official documents say that copy is retained and automatically removed after about 30 days. So "photos deleted after processing" is true only for our system. Presented as a general promise, it would be false.

## 4. Proposed correction (for master review)

1. **Wording rule:** never say or imply immediate or complete deletion. The allowed claim is in two parts, kept together everywhere they appear (the consent screen, the deletion receipt, the README, the submission text and the video):
   - "SecondLook deletes its own copies of your photo and the try-on result as soon as you finish, or after 60 minutes at most."
   - "YouCam (Perfect Corp.), the AI provider, keeps uploaded and generated images for up to 30 days and then removes them automatically, according to its documentation. SecondLook cannot delete YouCam's copy sooner."
2. **Buyer upload is disabled by default in every mode** (`BUYER_UPLOAD=disabled`, hard default). The server returns `403 buyer_upload_disabled` and the UI shows an explainer. Turning it on needs a recorded disposition `docs/decisions/PC-1-disposition.md` with `decision: enable-buyer-upload`, signed off by the master, with Johan's explicit approval of the retention copy. Configuration alone cannot enable it.
3. **No real-person image is uploaded by self-service in live mode.** In live mode, the person images (the "model" source photos) come only from the rights manifest (`assets/rights/manifest.json`). Each entry records adult status, informed consent to processing by Perfect Corp. *including the 30-day retention*, the scope (development, video, repo), and the consent date. Synthetic generated mannequins are used in fixture mode. Seller self-photos as models are therefore also disabled in live mode under PC-1, for the same retention reason.
4. **The seller flow proceeds** with garment-only photos plus rights-manifest or synthetic model photos. Fixtures are visibly labelled DEMO.
5. **When the buyer flow is later enabled**, it must keep all of these:
   - an 18+ self-attestation;
   - "this is a photo of me";
   - consent copy (the versioned hash is stored, the image is not);
   - `filter_multi_person: "strict"` (no bystanders);
   - EXIF stripped before upload;
   - our copies deleted on "Done", "Delete now", or a 60-minute TTL sweep;
   - a deletion receipt listing exactly what we deleted and what YouCam retains.
6. **Option for the master/Johan to choose (not decided here):**
   - (a) keep the buyer flow fixture-only for the submission and show the disabled explainer in the video;
   - (b) enable it for Johan's own photo only, demonstrating the consent and receipt UX;
   - (c) ask Perfect Corp. about early deletion. This is an organizer/vendor message, so it is **not authorized** in this workflow and is listed only as a user action.

The lead's recommendation is (b) once live access exists, otherwise (a).

## 5. Why this is consensus-compatible

It keeps every accepted element: the buyer flow stays secondary and present, consent and deletion of our copies stay. It changes only a claim that the official sources show cannot be made, and it adds a gate before any real-person upload. It does not pivot the idea, add a skin feature, or drop the seller core.
