# Measurement protocol & Phase 1 experiment (go/no-go)

## 1. In-app measurement protocol (K1)

| Phase | Duration | Rationale |
|---|---|---|
| Rest (baseline) | 2 s | ≥1 s required for the baseline median; 2 s gives margin + a noise estimate. |
| Press | 10 s | ANDROMEDA-SHOCK protocol: press until blanched then hold 10 s (CLAIMS B4). Fleming 2015 suggests 5 s for children — made a parameter (`PROTOCOL_TIMING.pressS`). |
| Release (post-release) | 10 s | Captures CRT up to ~8–9 s with margin to confirm the plateau. If no recovery: the result is **censored** ("did not recover within 10 s"), not a guessed number. |

Total ~22 s (slightly above the proposed 15–20 s because the 10 s press duration follows the primary source).
Audio + vibration cues standardize the **duration** of pressure; the **force** of pressure cannot be controlled (limitation).

## 2. Phase 1 pass criteria (set BEFORE data is collected)

A *protocol × signal* combination is declared **passing** if, on ≥5 healthy subjects with different skin tones
(target: ≥1 Fitzpatrick V–VI subject), with 3 repetitions per subject:

| # | Criterion | Threshold | Measured by |
|---|---|---|---|
| P1 | Blanching contrast: CNR = amplitude / baseline noise SD (per-subject median) | ≥ 10 on ≥ 4 of 5 subjects | `npm run analyze` column "Subjects CNR≥10" |
| P2 | Repeatability: within-subject SD of CRT across repetitions (median) | ≤ 0.5 s | column "SD CRT between repetitions" |
| P3 | Overall rejection rate | ≤ 30%, **and reported per subject** | column "Reject" + per file |
| P4 | Reference drift | `REF_DRIFT` gate passes on ≥ 80% of recordings | per file |
| P5 | Camera | effective fps ≥ 24, dropped frames < 5%, jitter < 10 ms | Method table in the app |
| P6 | Agreement with blinded annotation (≥2 annotators) | 95% limits of agreement within ±1.0 s | `npm run compare` |

**Winner:** the combination that passes P1–P5 with the lowest rejection rate; if tied, the most practical (protocol A > B > C).

**If none pass → honest pivot:** CAPIRA becomes a *semi-automatic standardized CRT timer* (10 s press/release cues + a "color returned" button, already present as "manual CRT") + qSOFA + referral. Claim impact: the product **no longer** claims "objective"; only "standardized" (pressure duration, timing capture, documentation).

## 3. Data collection procedure

1. Deploy over HTTPS, open in Chrome for Android, **Experiment** page.
2. Enter a subject code (no name), choose a protocol. Get the subject's verbal/written consent; enable "Save ROI crops" only if the subject agrees (for annotation).
3. Phone on a stand, subject's hand on a table at heart level, room temperature recorded.
4. Per subject: 3 repetitions × protocols A, B, C (randomize order). Rest ≥1 minute between repetitions on the same finger.
5. Download the CSV → `data/raw/` (gitignored) → `npm run analyze -- data/raw/*.csv`.
6. Annotation: ≥2 annotators on the **Annotate** page (without seeing the engine result) → download the annotation CSV → `npm run compare -- annotations.csv data/raw/*.csv`.
7. Record results in VALIDATION.md §3, including per-subject rejection rate & skin tone. Recalibrate thresholds in `src/engine/params.ts` only with a written reason.

## 4. Candidate signals (compared automatically)

`rg` (R/G), `astar` (CIELab a*), `hue`, `sat` (HSV saturation), `gInv` (1/G). All are normalized against the reference skin patch
(ratio or difference). Provisional default is `rg` — to be re-chosen from Phase 1 data.
