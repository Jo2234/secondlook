# SecondLook: demo video script (target 2:30, limit 1:00–3:00)

Rules: the video must show the project working end to end and explain the YouCam API used. Publish it publicly on YouTube (preferred) or Vimeo. No third-party trademarks, logos or copyrighted music. Only Johan (consenting) appears; garments must have no prominent brand marks.

Record the live segments in live mode with the LIVE banner visible. If live mode is not yet verified, do not record a live segment: use demo mode with its DEMO banner visible and say so out loud.

| Time | Screen | Narration (Johan's own words; this is a guide) |
|---|---|---|
| 0:00–0:15 | A pre-loved jacket on a hanger; SecondLook studio with the LIVE banner | "Secondhand sellers have one photo of a one-off item and no model. SecondLook turns that photo into an honest listing." |
| 0:15–0:40 | Upload the hanger photo. Declare *lower body* first and show it is blocked with the documented reason, then switch to *upper body*, tick the declarations and run the quality check (pass) | "Before spending a single unit, SecondLook checks the photo against YouCam's documented input rules." |
| 0:40–0:55 | Enter flat measurements in cm, save the listing | "Measurements instead of size claims." |
| 0:55–1:15 | Press **Check YouCam cost & balance (0 units)**; point at cost per try-on and balance | "This reads the AI Clothes v4 unit cost and my balance from YouCam's unit API without spending anything." |
| 1:15–1:50 | Pick the consented model photo → review dialog with total units → **Spend N units and generate** → progress: uploading → task submitted → generating → downloading | "Confirming uploads both photos with YouCam's File API, creates a cloth-v4 try-on task, and polls it with a deadline. If the connection drops, SecondLook won't retry on its own." |
| 1:50–2:15 | Gallery: original photo first, then the preview with the burned-in "approximate" label; copy listing text | "The original always comes first. The AI preview is labelled approximate, in the image itself." |
| 2:15–2:30 | Units ledger (spent entry) and the buyer panel explaining why personal uploads are off | "Every unit is tracked. Buyer uploads stay off until we can be clear about how long the provider keeps photos." |
| 2:30–2:40 | Closing card: APIs used — AI Clothes v4, File API, unit cost and balance | "SecondLook: a clearer second look for secondhand fashion." |

Checklist before upload:

- [ ] Length between 1:00 and 3:00.
- [ ] LIVE banner visible during the live segment; no API key, console page or `.env` on screen.
- [ ] No brand logos, other people or copyrighted music.
- [ ] YouTube visibility set to Public; link added to the Devpost form.
