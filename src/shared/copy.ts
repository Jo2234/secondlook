export const COPY_VERSION = "copy2-2026-10-19";
export const COPY = {
  "mode": {
    "fixture": "DEMO MODE: sample data. Try-on images here are placeholders, not YouCam results.",
    "fixtureImage": "DEMO FIXTURE · NOT A YOUCAM RESULT",
    "live": "LIVE YouCam",
    "unverified": "UNVERIFIED INPUT TYPE (DEMO)"
  },
  "units": {
    "check": "Check YouCam units before generating",
    "runCheck": "Run check (free)",
    "costUnknown": "YouCam didn't report a price for AI Clothes try-on v4, so SecondLook won't spend units.",
    "confirm": "This uses about {cost}×{n} = {total} YouCam units. Balance at {time}: {balance}. Budget left: {remaining}.",
    "balanceEstimate": "Balance estimate",
    "confirmButton": "Confirm",
    "cancel": "Cancel"
  },
  "listing": {
    "empty": "No listings yet. Add your first item (one clear photo of the garment on a hanger works best).",
    "previews": "AI try-on previews: approximate",
    "disclosure": "AI-generated preview from YouCam. Fit, size, colour and details may differ from the real item. The original photo is shown first.",
    "tagSize": "Tag size: {size}. Vintage sizes vary, so check the measurements.",
    "original": "Original garment photo"
  },
  "quality": {
    "checking": "Checking photo…",
    "warning": "You can continue; results may be worse.",
    "format": "Export this photo as JPG or PNG.",
    "file_size": "Choose a smaller photo.",
    "min_dimensions": "Use a photo at least 512×384 pixels.",
    "recommended_dimensions": "Use a photo at least 1024×768 pixels for better results.",
    "max_dimensions_normalized": "Resized from {width}×{height}.",
    "aspect_ratio": "Use a less narrow crop.",
    "sharpness": "Retake the photo in focus with the camera held steady.",
    "exposure_mean": "Retake in even lighting without deep shadows or glare.",
    "exposure_clipping": "Avoid large areas of pure black or white.",
    "background_busy": "Use a plain background.",
    "decl_single_garment": "Photograph one garment only.",
    "decl_front_facing": "Photograph the front of the garment.",
    "decl_not_composite": "Do not use composite images.",
    "decl_fully_visible": "Show the whole garment without obstructions.",
    "decl_no_people": "Use a garment-only photo or declare it worn.",
    "capability": "YouCam's try-on supports trousers and skirts only from photos of them being worn. Photograph them worn by a consenting adult.",
    "unverified": "UNVERIFIED INPUT TYPE (DEMO)",
    "blocked": "This input type is blocked. Choose a supported photo type.",
    "model_decl_single_person": "Show a single person occupying at least 80% of the frame.",
    "model_decl_pose": "Stand facing forward with face and shoulders visible.",
    "model_rights": "Use an adult model photo with recorded processing consent and retention disclosure."
  },
  "job": {
    "uploading": "Uploading photos",
    "submitting": "Sent to YouCam",
    "polling": "Generating ({elapsed} s / {deadline})",
    "downloading": "Downloading",
    "done": "Done",
    "cancel": "Stops waiting; units may already be used.",
    "timedOut": "YouCam didn't finish within {n} minutes. Units may have been used. Retry (uses units again) or try later.",
    "uncertain": "We lost the connection while starting the job. YouCam may have charged units. We won't retry automatically.",
    "waiting": "Waiting for YouCam rate limit…",
    "missing": "Result file missing"
  },
  "buyer": {
    "disabled": "Try it on yourself is turned off in this build. We haven't enabled personal photo uploads yet, because SecondLook can't control how long the AI provider keeps them:",
    "pc1": "Read the PC-1 summary in the README.",
    "delete": "Delete now"
  },
  "compare": {
    "disclaimer": "Differences in flat measurements only. This is not a fit or size prediction.",
    "flat": "Measure the garment flat. Double a flat width to compare circumference.",
    "invalid": "Check this value"
  },
  "errors": {
    "units": "YouCam has insufficient units. No new task will be started.",
    "bug": "The request was rejected. Report this problem with the sanitized error code.",
    "key": "YouCam rejected the API key. Check YOUCAM_API_KEY in your local .env (never share it).",
    "wait": "Waiting for YouCam rate limit…",
    "retry": "Try again only after confirming the unit cost.",
    "later": "YouCam did not finish in time. Try later after confirming the unit cost.",
    "pose": "YouCam couldn't find a standing, forward-facing pose in the model photo.",
    "source": "Use a model photo showing the upper body and shoulders.",
    "reference": "Show the whole garment clearly in a non-empty photo.",
    "region": "Match the selected category to the garment and model photo.",
    "people": "Use a photo with only one consenting adult.",
    "size": "The image size was rejected. Report this input-gate problem.",
    "face": "Show the face and shoulders clearly, facing forward.",
    "declined": "YouCam declined to generate this image.",
    "noChange": "Choose a different garment photo; YouCam could not produce a changed image.",
    "ratio": "Use a less narrow crop before retrying.",
    "generic": "YouCam could not generate this image. Check the photos before retrying.",
    "download": "The result could not be downloaded. Units may have been used.",
    "interrupted": "Processing was interrupted. Check the job status before retrying."
  },
  "retention": {
    "local": "SecondLook deletes its own copies of your photo and the try-on result when you tap Done or Delete now. Otherwise its cleanup removes them about 60 minutes after upload, or when the app next starts if it was stopped.",
    "vendor": "YouCam (Perfect Corp.), which makes the try-on image, keeps its own copy. Its documentation says uploaded and generated images are stored for 30 days and then removed automatically, and its terms say it generally keeps data for 30 days and may keep information longer where the law requires. SecondLook has no way to delete YouCam's copy sooner."
  }
} as const;

// SHA-256 of UTF-8 text, without a trailing newline.
export const RETENTION_SHA256 = {
  "local": "720a3dd6961ad5849f29892a80880a78bd895a73987ebe3b4b0889a49a1e5ebc",
  "vendor": "5549c844b8e9da3755be35447d88e3d2350d1110b0e295d865759c22a6d7f66d"
} as const;
