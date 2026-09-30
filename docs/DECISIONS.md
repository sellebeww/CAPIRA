# DECISIONS — architecture decisions

## D1. Product form: PWA (not a native app, not hardware) — for now

| Option | Pros | Cons |
|---|---|---|
| **PWA (chosen)** | One URL, no Play Store; installable to the home screen; offline via service worker; fast iteration; the pure TypeScript engine can be moved to native | Limited, device-dependent camera control (AE/AWB lock, frame rate); `captureTime` uncertain |
| Native Android app (Kotlin + CameraX/Camera2) | Full exposure/WB/focus lock, precise sensor frame rate & timestamps | Heavier distribution, slower iteration, two codebases |
| Hardware device (LED clip + photodiode + presser) | Controlled pressure & light → most accurate | Cost, manufacturing, device certification |

**Rationale:** the project's biggest risk is *whether a phone camera can measure CRT reliably* (the killer assumption). A PWA is the cheapest and fastest way
to answer that across many different phones. The engine is deliberately pure (no DOM) so it can be carried over to native.

**Trigger to move to native:** Phase 1 data shows the `REF_DRIFT`/`REF_LUMA_DRIFT` or `LOW_FPS`/`TIMING_JITTER` gates often fail because the
browser cannot lock AE/AWB or hold the frame rate. **Trigger for a hardware variant:** pressure variation becomes the dominant source of error.

## D2. Stack
Vite + TypeScript + React 19, vite-plugin-pwa (Workbox precaches all assets), Dexie (IndexedDB), Vitest. Hand-written SVG charts (no library)
to keep the bundle small & offline. Hash router (works on static hosting & offline).

## D3. The engine is signal processing, not ML
There is no labelled data to train a model; the signal approach is explainable (curve, thresholds) and testable against synthetic ground truth.

## D4. Post-capture analysis, live frames
Color is read per frame from the stream (canvas), not from compressed video (MediaRecorder alters colors). Timestamps come from rVFC; 30 fps is not assumed.
Zero-phase filters (median + Savitzky-Golay) because analysis runs after the recording finishes.

## D5. CRT estimator
Onset = quadratic hinge fit (noise-robust); CRT = crossing r ≥ X on the isotonic regression from onset. Chosen from the synthetic sweep (VALIDATION.md §2).

## D6. Manual ROI + motion measurement
The user taps the ROI & reference patch; motion is measured with NCC block matching for the `MOTION` gate. Tracking (ROI follows) is optional in Experiment.
