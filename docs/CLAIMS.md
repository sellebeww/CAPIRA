# CLAIMS — status of every claim

Rule: a medical/statistical claim **may appear** in the UI, README, or pitch only if its status is ✅ and it is quoted with its context.
Checked on 30 Sep 2026 via web search; some sources were only readable as abstracts/summaries (marked). If a better source turns up, update the row.

Legend: ✅ verified (primary source) · ⚠️ partial / needs context · ❓ unverified (do not use) · ❌ remove / wrong

## A. Claims from the original concept (docs/concept.md)

| # | Claim | Status | Notes & sources |
|---|---|---|---|
| A1 | "80% of sepsis deaths are due to pre-hospital delay" | ❓ | No primary source found. Do not use. |
| A2 | "Each hour of delay raises the risk of death by 7.6–8%" | ⚠️ | Kumar et al., *Crit Care Med* 2006;34(6):1589–96. Actual context: in **septic shock**, each hour of delay in **effective antimicrobials** after onset of hypotension (within the first 6 hours) was associated with an **average survival decrease of 7.6%**. Retrospective cohort (1989–2004, 14 ICUs in the US/Canada). Not about fluids, not about CRT, not "risk rises 7.6%". May be used only with this context. [summary](https://clincalc.com/blog/2013/10/kumar-2006-antibiotic-delay-septic-mortality/) |
| A3 | "Blood pressure is a slow indicator; CRT lengthens 30–60 minutes before BP drops" | ❓ | The source for 30–60 minutes was not found. The physiology of compensated shock (peripheral vasoconstriction preceding hypotension) is a general concept, but the **time gap** must not be claimed. |
| A4 | "Manual CRT inter-observer agreement is only 64%" | ⚠️ | The 64% figure was not found. What exists: Anderson et al. 2008 (adult ED, n=209): normal/abnormal category agreement 70%, **kappa 0.38**, wide limits of agreement ([VU repository](https://vuir.vu.edu.au/3476/)); another study kappa 0.27 ([EMJ 2019](https://emj.bmj.com/content/36/8/465)). Use these numbers, not 64%. |
| A5 | "Sepsis mortality in Indonesian district hospitals is 40–60%" | ⚠️ | Meta-analysis of 47 studies (Ghifari, Dewi, Anjani, *J Infect Dev Ctries* 2026;20(5)): 28-day mortality **55.9%** (95% CI 48.7–63.0), in-hospital mortality 67.4%, septic shock 77.5% ([JIDC](https://www.jidc.org/index.php/journal/article/view/21943)). Say "Indonesian hospitals (meta-analysis)", not district hospitals specifically. Source read from the abstract page. |
| A6 | "Sepsis is the #1 cause of death in ICUs worldwide" | ❓ | Not verified. Verified alternative: sepsis-related ~11 million deaths = **19.7% of all global deaths** in 2017 (Rudd et al., *Lancet* 2020;395:200–11) ([IHME](https://www.healthdata.org/news-release/sepsis-associated-1-5-deaths-globally-double-previous-estimate)). |
| A7 | "Sepsis ICU cost IDR 10–30M/day" | ❓ | No source yet. Do not use. |
| A8 | "Postpartum sepsis is one of the top three causes of maternal mortality" | ⚠️ | Ministry of Health 2024 data (via secondary source): eclampsia/hypertension ~23%, hemorrhage ~20–23%, **infection ~5%**, other 44%. Infection is a recorded cause, but its share is small. Needs a primary document (Indonesia Health Profile 2024). |
| A9 | "17.5% of infant & elderly deaths due to sepsis" | ❓ | Not found. Remove. |
| A10 | "Color transition detection accuracy >95% (300 lux)" | ❌ | Made-up figure. Remove. Measured accuracy is in VALIDATION.md. |
| A11 | "150 ms latency" | ❌ | Made-up figure. Result latency is **measured** on the device and stored per exam (`latencyMs`). |
| A12 | "Reduces clinical assessment errors by up to 70%" | ❌ | No data. Remove. |
| A13 | "The *mobile vascular sensing* space is empty / no competitors" | ❌ | Wrong — see section C (prior art). |
| A14 | "Algorithm trained on an Indonesian melanin dataset" | ❌ | The engine is signal processing, not a trained model; there is no dataset. Permitted claim (once done): "calibrated & validated on N subjects across skin-tone range X". |
| A15 | "Detects blood saturation" | ❌ | What is measured is skin color change (reperfusion), not oxygen saturation. |
| A16 | "Pulse oximeter is often normal early in septic shock" | ❓ | Source not yet searched. Do not use as fact. |
| A17 | "Deviation <0.2 s vs stopwatch" (target) | ❌ | A stopwatch is not ground truth (human reaction time ~0.2–0.3 s). Replaced by methodology K7 (VALIDATION.md). |
| A18 | "Early detection via CAPIRA saves billions of rupiah" | ❓ | No data. Do not use. |

## B. Clinical basis used in the app

| # | Claim | Status | Source |
|---|---|---|---|
| B1 | qSOFA: RR ≥22, altered mentation (GCS <15), systolic ≤100; score ≥2 = higher risk of poor outcome in suspected infection outside the ICU | ✅ | Singer et al., *JAMA* 2016;315(8):801–10 (Sepsis-3); Seymour et al., *JAMA* 2016 |
| B2 | SSC 2021 recommends **against** using qSOFA as a single screening tool (compared with SIRS/NEWS/MEWS) | ✅ | Evans et al., *Intensive Care Med / Crit Care Med* 2021 ([PSNet summary](https://psnet.ahrq.gov/issue/surviving-sepsis-campaign-international-guidelines-management-sepsis-and-septic-shock-2021)) |
| B3 | omqSOFA (SOMANZ): systolic <90, RR ≥25, altered mentation | ✅ (secondary) | Bowyer et al., SOMANZ guideline 2017 ([UniMelb](https://minerva-access.unimelb.edu.au/rest/bitstreams/983e9d87-cca6-5b59-a93f-16e6e7ffc157/retrieve)). Used only as a warning, not computed (out of scope). |
| B4 | ANDROMEDA-SHOCK protocol: glass slide on the ventral surface of the distal phalanx of the right index finger, pressure increased until blanching then **held for 10 s**; CRT >3 s is abnormal | ✅ | Protocol NCT03078712 ([PDF](https://cdn.clinicaltrials.gov/large-docs/12/NCT03078712/Prot_000.pdf)) |
| B5 | ANDROMEDA-SHOCK: CRT-targeted vs lactate-targeted resuscitation did **not** significantly reduce 28-day mortality (34.9% vs 43.4%) | ✅ | Hernández et al., *JAMA* 2019;321(7):654–64. Do not claim as evidence that CRT "saves lives". |
| B6 | Children (>7 days): upper limit of normal CRT ~2 s at the finger (4 s at chest/foot); standard method: press the finger for 5 s, room temperature 20–25 °C | ✅ (systematic review) | Fleming et al., *Arch Dis Child* 2015;100(3):239–49 ([ORA Oxford](https://ora.ox.ac.uk/objects/uuid:61e88985-b211-4508-80b9-634721ee4c0e)) |
| B7 | Some pediatric guidelines use CRT **≥3 s** as abnormal (e.g. NICE febrile child) | ⚠️ | Mentioned in the same literature; the NICE/WHO ETAT guideline text has not been read directly. **Conflicts with the 2 s pediatric threshold (K3)** → the threshold is made a parameter and both lines are shown. |
| B8 | CRT varies with age, sex, temperature: upper limit ~2 s for children & adult men, 2.9 s adult women, 4.5 s elderly; rises ~3.3% per decade; rises ~5% per 1 °C drop in body temperature | ✅ (abstract) | Schriger & Baraff, *Ann Emerg Med* 1988;17(9):932–5 |
| B9 | Human reaction time ~0.2–0.3 s (why a stopwatch is not ground truth) | ⚠️ | General psychophysics knowledge; no specific source cited yet. |

## C. Prior art — automated/camera-based CRT measurement (correction of A13)

| Work | Content | Relevance |
|---|---|---|
| Shinozaki et al. (Northwell/Hofstra), ±2019 | Nail compression video in the ED; mean nail-area color → curve → time to reach **90% recovery** as "image analysis CRT"; also a pneumatic compression device ([PMC6501297](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6501297/), [Hofstra](https://academicworks.medicine.hofstra.edu/publications/6140)) | **Very similar** to CAPIRA's CRT definition (X = 0.9). CAPIRA is not the first. |
| Bachour, Dias, Cardoso, arXiv 2102.13611 (2021/2022) | RGB camera + LED + crossed polarizers; green channel; 22 volunteers Fitzpatrick I–VI; ~20% of measurements discarded by a quality filter; ~80% within ±20% of the individual value ([arXiv](https://arxiv.org/abs/2102.13611)) | Supports the "reject if unreliable" approach & the green channel (candidate `gInv`). |
| NCT07473869 | "Smartphone Application for Automated Measurement of CRT" — observational study of ~60 participants vs experts using a glass slide; stratified by skin tone & lighting ([ClinicalTrials.gov](https://clinicaltrials.gov/study/NCT07473869)) | Direct competitor (phone app). Details read from a search summary, not from the registry page. |
| J Clin Monit Comput 2025, doi 10.1007/s10877-025-01271-5 | Appeared in a "smartphone CRT" search; content not yet read (paywall) | Needs reading. |
| Patent JP2018504946A (smartphone-based cyanosis & CRT measuring device) | ([Google Patents](https://patents.google.com/patent/JP2018504946A5/enExample)) | IP risk if commercialized — needs a freedom-to-operate check. |

**Honest position:** CAPIRA is an open, offline, and transparent implementation (curve + quality gate + standardized protocol) for the primary care / DTPK context — **not** the first technology in the field.

## D. Browser technical facts (K9)

| # | Claim | Status | Notes |
|---|---|---|---|
| D1 | `requestVideoFrameCallback` is available in Chrome/Edge 83+, Safari 15.4+, Firefox 132+ | ✅ | [web.dev](https://web.dev/articles/requestvideoframecallback-rvfc) |
| D2 | `captureTime` in rVFC metadata is available for local cameras | ❓ | Documentation focuses on WebRTC. The app records which timestamp source was actually used (`captureTime` / `mediaTime` / `callbackNow`). |
| D3 | "iOS Safari does not support torch" (K9b) | ❌ correction | WebKit reports: torch via `applyConstraints` works since iOS 17.5.x, with a `getSettings` reporting bug fixed Dec 2024 ([WebKit bug 270779](https://bugs.webkit.org/show_bug.cgi?id=270779)). The app still detects it via `getCapabilities()`. |
| D4 | Support for `exposureMode/whiteBalanceMode: 'manual'` on Chrome Android depends on the device | ⚠️ | Not yet tested on real devices. The app records the outcome of applying it (`applied`) per exam. |
