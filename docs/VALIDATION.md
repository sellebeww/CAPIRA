# VALIDATION — what is and is not proven

**In short:** the engine's *calculation* accuracy has been measured on synthetic signals with a known CRT.
Accuracy on **real cameras** and **patients** is **not measured** — there are no numbers in section 3 until Phase 1 data is collected.
Healthy subjects, even once validated, do not prove the ability to detect critical conditions.

## 1. Ground truth (K7)

1. **Synthetic signals** (`src/engine/synthetic.ts`): a perfusion curve with a known CRT → skin color (3 illustrative palettes) →
   noise, heartbeat pulsation (PPG 1%), light drift, frame jitter/drops. Ground truth is computed in the **same signal space**
   (noise-free signal, 1 ms resolution), so what is tested is the estimator, not the definition.
2. **Blinded frame-by-frame annotation** by ≥2 people (Annotate page → `npm run compare`). Not yet done.

A stopwatch is **not** used as ground truth (human reaction time ~0.2–0.3 s).

## 2. Synthetic results (measured, reproducible)

Command: `npm run accuracy -- --seeds=10` (and `--noiseModel=relative`). 1,620 recordings per noise model:
9 CRT values (1–6 s) × 3 skin tones × 2 curve shapes (exponential/sigmoid) × 3 noise levels × 10 seeds; 3 ms jitter, 1% dropped frames.
Engine configuration: reference-normalized R/G signal, X = 0.9, quadratic hinge onset, CRT from isotonic regression, `minCNR` = 12.

### 2a. Additive (absolute) noise — pessimistic scenario for dark skin

| Group | n | Rejected | MAE CRT | Bias | P95 \|err\| | Bland-Altman 95% | MAE t50 |
|---|---|---|---|---|---|---|---|
| **All (pass gate)** | 1620 | 68.8% | **0.20 s** | +0.02 | 0.60 | **[−0.53, +0.57]** | 0.10 |
| low noise (0.001) | 540 | 33.3% | 0.16 | +0.01 | 0.47 | [−0.42, +0.44] | 0.08 |
| medium noise (0.003) | 540 | 73.0% | 0.30 | +0.04 | 0.82 | [−0.73, +0.82] | 0.14 |
| high noise (0.006) | 540 | **100%** | — | — | — | — | — |
| light skin | 540 | 39.6% | 0.20 | +0.02 | 0.61 | [−0.56, +0.59] | 0.09 |
| medium skin | 540 | 66.7% | 0.20 | +0.02 | 0.54 | [−0.48, +0.53] | 0.10 |
| **dark skin** | 540 | **100%** | — | — | — | — | — |
| CRT < 3 s | 720 | 69.2% | 0.11 | +0.04 | 0.32 | [−0.24, +0.33] | 0.06 |
| CRT ≥ 3 s | 900 | 68.4% | 0.27 | 0.00 | 0.72 | [−0.69, +0.69] | 0.13 |

### 2b. Relative noise (proportional to intensity)

| Group | n | Rejected | MAE CRT | Bias | P95 \|err\| | Bland-Altman 95% | MAE t50 |
|---|---|---|---|---|---|---|---|
| **All (pass gate)** | 1620 | 68.1% | **0.27 s** | +0.06 | 0.69 | **[−0.65, +0.78]** | 0.14 |
| light skin | 540 | 58.9% | 0.27 | +0.07 | 0.69 | [−0.67, +0.81] | 0.13 |
| medium skin | 540 | 65.9% | 0.24 | +0.02 | 0.59 | [−0.59, +0.63] | 0.13 |
| **dark skin** | 540 | **79.6%** | 0.32 | +0.12 | 0.78 | [−0.68, +0.91] | 0.16 |
| CRT < 3 s | 720 | 69.4% | 0.16 | +0.07 | 0.43 | [−0.37, +0.51] | 0.09 |
| CRT ≥ 3 s | 900 | 67.1% | 0.35 | +0.06 | 0.81 | [−0.80, +0.93] | 0.17 |

### Honest interpretation

- **The high rejection rate is intentional**: the sweep deliberately includes noise levels that are too high; the engine rejects instead of guessing.
  The rejection rate here is **not** an estimate of the rejection rate in the field.
- **The skin-tone disparity is real in both models**: blanching contrast is relatively smaller on the dark palette → it is rejected more often
  (79.6–100% vs 39.6–58.9% for light skin). The magnitude depends on the noise model — it must be measured on real cameras and **reported per subject**.
- **CRT@90% is intrinsically sensitive** because the curve is already flat around 90%: error grows for long CRT. **t50** is 2–3× more accurate;
  it is shown as a comparison metric.
- Error drops sharply with CNR: P95 \|err\| ≈ 0.85–0.93 s at CNR 10–15, ≈ 0.61–0.64 at 15–25, ≈ 0.31–0.38 at 25–50.

### Parameter decisions taken from this sweep (provisional)

| Parameter | Value | Rationale |
|---|---|---|
| `minCNR` | 12 | Below 10, P95 error ≈ 1.2–1.5 s (not clinically viable). 12 is a compromise; raise it if real data shows large errors. |
| `onsetModel` | quadratic | Reduces curve-shape bias (MAE t50 0.19 → 0.14 s vs linear, 4 seeds). |
| `fitSource`, `fitSgWindowS` | sg, 0.5 s | Smoothing of 1.0–1.5 s does not improve MAE. |
| CRT estimator | isotonic regression | The "first crossing" estimator is biased faster under noise (CRT 3.5 s read as 2.9 s in an early probe). |

### Latency

- Engine compute (Node, dev laptop — **not a phone**): median 0.9 ms, P95 2.7 ms per analysis.
- **On-phone result latency** (end of recording → result shown) is measured automatically per exam and shown in the Method panel. There are no figures from real devices yet.

## 3. Real cameras (Phase 1) — NO DATA YET

| Metric | Value |
|---|---|
| Number of subjects / recordings | — |
| Winning protocol & signal | — |
| Median CNR per subject | — |
| Rejection rate (overall / per subject / per skin tone) | — |
| SD between repetitions | — |
| MAE, bias, Bland-Altman vs blinded annotation | — |
| Difference between annotators | — |
| On-phone result latency (median, P95) | — |
| Torch / AE lock / AWB lock support / timestamp source per device | — |

Procedure: docs/PROTOCOL.md.

## 4. Automated tests

`npm test`: 105 tests (engine: synthetic accuracy, rejection gates for dark/saturated/blurry/no-blanching/noise/no-release/motion/WB drift/AE drift/low fps/dropped frames/jitter/short baseline, censored sensor; qSOFA all combinations & boundary values; CRT interpretation; referral; storage; simulation scenarios; protocol runner).
