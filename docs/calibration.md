# Quality calibration

THRESHOLDS_VERSION: `q1-2026-10-19` (frozen plan §5.2).

S1 source candidate now implements pixel metrics, area-average raster conversion, bounded normalization and a pre-registered observation checker. **Native image execution and measured calibration remain UNRUN, awaiting G-img-0/G-img-1.** No values below are presented as measured results. Thresholds have not been tuned.

Synthetic set: textured tee, blur σ ∈ {0, 1, 2, 4, 8}; exposure scale ∈ {0.2, 0.5, 1, 1.5, 3}. Variants are created only in a temporary directory at test time and removed after the run. Expected σ0/σ1 pass, σ4/σ8 fail; exposure 0.2 and 3 fail, 1 passes. If any expectation fails, record measured values and stop for the lead; do not alter thresholds.

`tests/img/calibration.test.ts` measures every variant **after JPEG normalization**, prints the complete observation table and failures to the captured test log, then asserts the frozen expectations. Blur expectations apply to sharpness severity; exposure expectations apply to mean/clipping severity. σ2, exposure 0.5 and 1.5 are observations without a pre-registered severity requirement. This is synthetic calibration, never evidence of real-photo performance or live YouCam output.

The pure unit tests use analytic arrays and explicitly invented numeric tables to verify calculations and failure reporting. Those tables are not measured calibration.

Implementation conventions for previously unspecified edge cases:

- sRGB RGB8 luma uses 0.2126R + 0.7152G + 0.0722B without linearisation. Exact source-pixel overlap supplies the area average; the long side is at most 512, the short side rounds to the nearest positive pixel, and small images are not enlarged.
- Laplacian uses population variance over complete 3×3 neighbourhoods, excluding the 1px border. Sobel uses Euclidean magnitude without a divisor, with strict >48 comparison. Its denominator contains only evaluable pixels in the outer `ceil(0.08 × width/height)` band; the 1px image perimeter is excluded from both numerator and denominator. Tiny rasters with no neighbourhood have zero sharpness and zero border density; the quality gate still fails their dimensions/sharpness.
- Transparent PNG pixels composite on white to encode JPEG. This is format normalization, not background removal. All EXIF/XMP/ICC metadata is dropped; pixels convert to sRGB. Original encoded dimensions remain in metadata; normalized dimensions reflect EXIF orientation and downscaling. Only normalized bytes leave the adapter for storage/upload.
- JPEG/PNG magic, inbound bytes, metadata dimensions/pixel area and page count are checked before full pixel decode. PNG IHDR is checked before even native metadata parsing, and APNG `acTL` is refused because sharp's page metadata does not promise APNG detection. The native adapter also enforces 40 million input pixels, 12,000 maximum input side, one shared decode slot, concurrency 1 and cache off.

F17 has a new gated synthetic orientation/GPS/metadata test, plus adapter bounds and decode-slot recovery tests. F33's pure header rejection has unit coverage; the required measured native RSS bound remains a separate unrun acceptance gate. No claim of S1 acceptance is made from source or pure numeric checks alone. PC-1 remains disabled.
