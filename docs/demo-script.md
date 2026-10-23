# SecondLook: demo video script (target 2:30, limit 1:00–3:00)

Rules: the video must show the project working end to end and explain the YouCam API used. Publish it publicly on YouTube (preferred) or Vimeo. No third-party trademarks, logos or copyrighted music. Garments must have no prominent brand marks.

Demo inputs: both source pictures are AI-generated sample images, made with OpenAI image generation on 23 Oct 2026 with Johan's authorization:
- the model is a fictional adult, not Johan or any real person;
- the jacket is a synthetic, unbranded sample, not a real resale item.

Say this out loud. Keep three kinds of image distinct on screen and in narration: synthetic source inputs, DEMO fixture placeholders, and the actual YouCam result from the live run. Use the title "Sample navy chore jacket (synthetic demo image)", put "Synthetic sample garment generated for this demo. Measurements are illustrative, not taken from a real item." in the condition notes, and call the measurements illustrative.

Record the live segments in live mode with the LIVE banner visible. If live mode is not yet verified, do not record a live segment: use demo mode with its DEMO banner visible and say so out loud.

| Time | Screen | Narration (Johan's own words; this is a guide) |
|---|---|---|
| 0:00–0:15 | The synthetic jacket-on-hanger picture; SecondLook studio with the LIVE banner | "Secondhand sellers have one photo of a one-off item and no model. SecondLook turns that photo into an honest listing. For this demo, the jacket and the model are AI-generated sample images, not a real item or a real person." |
| 0:15–0:40 | Upload the hanger photo. Declare *lower body* first and show it is blocked with the documented reason, then switch to *upper body*, tick the declarations and run the quality check (pass) | "Before spending a single unit, SecondLook checks the photo against YouCam's documented input rules." |
| 0:40–0:55 | Enter illustrative flat measurements in cm (condition notes say they are illustrative), save the listing | "Measurements instead of size claims. These numbers are illustrative because the jacket is a sample image." |
| 0:55–1:15 | Press **Check YouCam cost & balance (0 units)**; point at cost per try-on and balance | "This reads the AI Clothes v4 unit cost and my balance from YouCam's unit API without spending anything." |
| 1:15–1:50 | Pick the model labelled "AI-generated fictional model · sample input, not a real person" → review dialog with total units → **Spend N units and generate** → progress: uploading → task submitted → generating → downloading | "Confirming uploads both photos with YouCam's File API, creates a cloth-v4 try-on task, and polls it with a deadline. If the connection drops, SecondLook won't retry on its own." |
| 1:50–2:15 | Gallery: original photo first, then the YouCam preview with the burned-in "approximate" label; copy listing text | "The original always comes first. This preview came back from YouCam's live API and is labelled approximate, in the image itself. We haven't yet tested results on real resale inventory." |
| 2:15–2:30 | Units ledger (spent entry) and the buyer panel explaining why personal uploads are off | "Every unit is tracked. Buyer uploads stay off until we can be clear about how long the provider keeps photos." |
| 2:30–2:40 | Closing card: APIs used — AI Clothes v4, File API, unit cost and balance | "SecondLook: a clearer second look for secondhand fashion." |

Checklist before upload:

- [ ] Length between 1:00 and 3:00.
- [ ] LIVE banner visible during the live segment; no API key, console page or `.env` on screen.
- [ ] No brand logos, real people or copyrighted music; the synthetic inputs are called synthetic out loud.
- [ ] The live YouCam result shown is the one from the approved live run, not a DEMO placeholder.
- [ ] YouTube visibility set to Public; link added to the Devpost form.
