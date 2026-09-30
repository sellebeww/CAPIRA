# Revised one-pager (measured/verified figures only)

Replaces §17 of the original concept. Every figure refers to a row in CLAIMS.md or VALIDATION.md.

## 🟢 Impact version

- **Problem:** sepsis is linked to ~11 million deaths (19.7% of global deaths, 2017 — Rudd, *Lancet* 2020). In Indonesian hospitals, 28-day mortality for sepsis/septic shock is 55.9% (meta-analysis of 47 studies, 2026).
- **Gap at primary care:** CRT is checked by counting in one's head; inter-observer agreement is low (kappa 0.38 in 209 adult ED patients — Anderson 2008).
- **Users:** nurses/midwives at Pustu & DTPK Puskesmas.
- **Product:** 3 steps — vital signs (qSOFA), standardized camera CRT scan, referral draft. Fully offline.
- **What we promise:** a CRT measurement that is *standardized, documented, and honest about data quality* — not a diagnosis.

## 🔵 Technical version

- **Engine:** signal processing (not a trained model): skin-reference-normalized R/G ratio, zero-phase filters, hinge-fit onset, CRT from isotonic regression, 18 quality gates.
- **Calculation accuracy (synthetic signals, 1,620 recordings/noise model):** MAE 0.20–0.27 s; Bland-Altman ±0.5–0.8 s on results that pass; for CRT <3 s ±0.24–0.5 s.
- **Fail-safe:** dark, saturated, blurry, motion, AE/WB drift, no blanching, no release → rejected with a reason (105 unit tests).
- **Compute:** analysis <3 ms (P95, laptop). On-phone latency is measured per exam — figures to follow.
- **Offline:** PWA, 12 assets precached (~750 KB), no CDN, verified with the network disabled.

## What we do NOT claim

Accuracy on patients · sepsis/shock detection · "X minutes earlier" timing · "first in the world" (prior art exists: Shinozaki et al., Bachour et al., app study NCT07473869).

## Next step

Phase 1 go/no-go on ≥5 healthy subjects across skin tones with pre-written pass criteria (PROTOCOL.md) → if it fails, pivot to a standardized CRT timer.
