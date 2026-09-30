# CUTLIST — deliberately not built (or deferred)

| Item | Reason | When to reconsider |
|---|---|---|
| MediaPipe Hand Landmarker | In protocol A the operator's hand plus the slide are in the frame at very close range → detection is prone to fail; adds several MB of assets. Manual ROI + motion measurement (NCC) is simpler and more honest. | If Phase 1 shows manual ROI placement is the main error source. |
| Automatic nail segmentation | Not needed (what is measured is the fingertip pad); a "precise segmentation" claim must not be made. | — |
| Per-pixel heatmap | The ROI overlay + thumbnail already provide transparency; a per-block amplitude map could be added. | After Phase 1 data. |
| "Polish with AI" (LLM) button for referrals | Conflicts with offline-first; the deterministic template is enough. If built: active only when online, never blocks the flow. | Optional. |
| SATUSEHAT sync | Needs API access and regulatory/privacy review. | After clinical validation. |
| Respiratory rate from video | Accuracy risk; manual input. | — |
| omqSOFA score computed | Out of scope; warning only. | If targeting obstetric services. |
| Per-result uncertainty estimate (± s) | Needs calibration on real data; currently replaced by an 80/90/95% + t50 sensitivity analysis. | After Phase 1. |
| Bluetooth export | Web Bluetooth is a poor fit; replaced by Web Share / sms: / copy / download. | — |
| Native Android app (CameraX) | PWA first; go native if AE/AWB lock or frame rate in the browser proves inadequate (see DECISIONS.md). | Post-Phase 1 decision. |
| Processing in a Web Worker | Profiling: analysis <3 ms (laptop), per-frame ROI extraction is light; a worker is not needed. | If cheap phones show frame drops. |
| Pressure sensor / standardized compression device | Pressure force is not controlled in the app (limitation). | Low-cost hardware variant (clip). |
| i18n (regional languages / other languages) | The app is single-language for now. | — |
