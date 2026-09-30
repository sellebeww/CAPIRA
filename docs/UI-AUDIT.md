# UI and application quality review

Date: 30 September 2026.

## Conclusion

CAPIRA has a good foundation for a **research prototype and demonstration**: local processing, an engine separated from the UI, signal quality checks, simulation labelling, and automated tests. The app **cannot yet be declared ready for clinical use**. Software testing and synthetic signals do not prove camera accuracy on patients.

## Improvements applied

- Consistent design: desktop side navigation, mobile menu and bottom navigation, cards, forms, step indicator, typography, a dark mode that follows the system, and a responsive layout.
- Home: record count, number of exams today, latest records, a three-step guide, and access to simulation and research tools. Figures come from IndexedDB; simulations are included in the counts and clearly labelled.
- History: search by label/complaint/number, exam and simulation filters, empty state, export, and messages for read/delete failures.
- Assessment: numeric validation with accessibility markers, duplicate-save prevention, and a message on save failure. Empty inputs are still allowed and are not treated as normal.
- Camera: a waiting-for-permission state, a camera-unavailable message, retry, stream release when video playback fails, and exposure/white-balance restoration after cancellation.
- Result: handling of invalid IDs, result not found, and failures to read/delete/save manual CRT. A recording that failed to save remains available for retry as long as the scan page is not left.
- Simulation: clearer scenario cards and a retry-save action on failure.
- Annotation: frame reset when the session is cleared, prevention of stale query results overwriting a new session, release/recovery order validation, and CSV export that handles commas, quotes, and newlines.
- Experiment: settings are locked during capture; the frame callback binds the session ID so late conversion results do not land in the next session; frame-save failures are shown.
- CSV import: clear messages for invalid metadata, headers, columns, numbers, partial references, or empty recordings.
- Navigation: page titles, active-page indicator, skip-to-content link, keyboard focus, reduced motion, a not-found page, and a render-error fallback. The prototype and simulation banners stay visible while scrolling.
- Offline status distinguishes development mode, cache not ready, and app ready offline.

## Verification coverage

Final run results: **105 unit tests pass, the production build succeeds, and 17 browser checks pass**, including the offline test. No unhandled JavaScript errors were found in the flows tested.

`npm test` runs 105 unit tests in 9 files, including CSV regressions and annotation-format compatibility. `npm run build` type-checks and produces the bundle with the service worker.

`npm run test:ui` runs browser tests against the development server. `npm run test:ui -- --production` starts its own preview server from the `dist` folder and adds an offline test. The tests use an isolated browser profile and synthetic data, not user data.

Browser coverage:

- Invalid/valid form, qSOFA, save without CRT, manual measurement, referral download.
- Simulation through to the result, the simulation marker, history, search, filters, and JSON export.
- Invalid URL, camera unavailable and retry, and a simulated storage failure.
- Frame annotation, time ordering, quoted CSV export, and session reset.
- Overflow checks on eight pages at widths of 320, 390, 768, 1024, and 1440 pixels.
- Mobile menu, light/dark mode, and unhandled JavaScript errors.
- On the production build: app reload, access to history, simulation, and result storage with the network disabled.

Run results and screenshots are written to `artifacts/` (the report as `ui-checks.json`, plus dashboard screenshots in desktop, mobile, and dark-mobile variants). These are automated browser checks and visual inspection, not an accessibility certification or clinical validation.

The tests recreate these artifacts; they are not tracked in Git.

## Next work

| Priority | Work | Reason |
| --- | --- | --- |
| High | Camera validation on the target phones and a real dataset per `PROTOCOL.md` | Patient accuracy, skin-tone differences, lighting, and camera quality are not yet measured. |
| High | Live tests of camera permission, torch, AE/AWB, FPS, and cancellation on Chrome for Android and Safari on iOS | Headless browsers without a camera do not represent real devices. |
| High | Review data governance before clinical use | Local data is not encrypted storage; clearing browser data erases the history. |
| Medium | Accessibility testing with screen readers and health workers | Focus, labels, and responsiveness have been fixed; user evaluation is still required. |
| Medium | Draft recovery and persistence of attempts that have not been exported | Drafts and the attempt list still live in memory. A refresh/leaving the page can lose them. |
| Medium | Review the service worker update cycle during long measurement sessions | The default automatic update configuration is still used. |
| Medium | Verified referral facility data | Facilities are currently sample/MOCK data. |

This UI revision made no changes to clinical thresholds, the CRT algorithm, or accuracy claims. See `CLAIMS.md`, `VALIDATION.md`, and `PROTOCOL.md` for the limits of the available evidence.
