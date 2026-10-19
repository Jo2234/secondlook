# Quality calibration

THRESHOLDS_VERSION: `q1-2026-10-19` (frozen plan §5.2).

Rule evaluation over supplied numbers is drafted. Pixel metrics, normalization and measured calibration are pending S1 image work and G-img-1; no values have been measured and no fixture generation has run. Thresholds have not been tuned.

Synthetic set: textured tee, blur σ ∈ {0, 1, 2, 4, 8}; exposure scale ∈ {0.2, 0.5, 1, 1.5, 3}. Variants are created only in a temporary directory at test time and removed after the run. Expected σ0/σ1 pass, σ4/σ8 fail; exposure 0.2 and 3 fail, 1 passes. If any expectation fails, record measured values and stop for the lead; do not alter thresholds.
