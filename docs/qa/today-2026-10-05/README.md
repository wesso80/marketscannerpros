# Today / Overview — Job 10

Base: `c4841fb565e003daff42d4d2111fee0d951b32c8` (batch/oct-wp). Initial review was committed and posted on #387 before edits. The brief described Overview as done, but baseline captures showed duplicate regime summaries and over four phone screens with folds closed; the existing view is now folded without changing its data model.

Today has one stored-picks count summary and one SourceLine, readable score precision and folded observation dates. Scan buttons, scan quota, requests and analytics remain unchanged. Overview's eight statuses become one ChipRow; actual feed failures remain amber. Its existing analysis and evidence remain available inside a closed fold. The absent-regime opt-in is limited to /tools/start and /tools/dashboard. Other routes retain existing behavior.

| View / tier / state | Before 1280 / 390 | After 1280 / 390 | PNGs |
|---|---|---|---|
| start / pro / populated | 1.249 / 1.726 | 1.216 / 1.620 | [before 1280](before/start-pro-populated-1280-full.png) · [before 390](before/start-pro-populated-390-full.png) · [after 1280](after/start-pro-populated-1280-full.png) · [after 390](after/start-pro-populated-390-full.png) |
| start / pro / missing | 1.000 / 1.063 | 1.000 / 1.096 | [before 1280](before/start-pro-missing-1280-full.png) · [before 390](before/start-pro-missing-390-full.png) · [after 1280](after/start-pro-missing-1280-full.png) · [after 390](after/start-pro-missing-390-full.png) |
| start / free / populated | 1.249 / 1.726 | 1.216 / 1.620 | [before 1280](before/start-free-populated-1280-full.png) · [before 390](before/start-free-populated-390-full.png) · [after 1280](after/start-free-populated-1280-full.png) · [after 390](after/start-free-populated-390-full.png) |
| start / free / missing | 1.000 / 1.063 | 1.000 / 1.096 | [before 1280](before/start-free-missing-1280-full.png) · [before 390](before/start-free-missing-390-full.png) · [after 1280](after/start-free-missing-1280-full.png) · [after 390](after/start-free-missing-390-full.png) |
| start / anonymous / populated | 1.425 / 1.974 | 1.393 / 1.867 | [before 1280](before/start-anonymous-populated-1280-full.png) · [before 390](before/start-anonymous-populated-390-full.png) · [after 1280](after/start-anonymous-populated-1280-full.png) · [after 390](after/start-anonymous-populated-390-full.png) |
| start / anonymous / missing | 1.000 / 1.310 | 1.000 / 1.344 | [before 1280](before/start-anonymous-missing-1280-full.png) · [before 390](before/start-anonymous-missing-390-full.png) · [after 1280](after/start-anonymous-missing-1280-full.png) · [after 390](after/start-anonymous-missing-390-full.png) |
| command-center / pro / populated | 3.580 / 5.100 | 1.000 / 1.550 | [before 1280](before/command-center-pro-populated-1280-full.png) · [before 390](before/command-center-pro-populated-390-full.png) · [after 1280](after/command-center-pro-populated-1280-full.png) · [after 390](after/command-center-pro-populated-390-full.png) |
| command-center / pro / missing | 3.351 / 4.836 | 1.000 / 1.404 | [before 1280](before/command-center-pro-missing-1280-full.png) · [before 390](before/command-center-pro-missing-390-full.png) · [after 1280](after/command-center-pro-missing-1280-full.png) · [after 390](after/command-center-pro-missing-390-full.png) |
| command-center / free / populated | 3.518 / 4.950 | 1.000 / 1.460 | [before 1280](before/command-center-free-populated-1280-full.png) · [before 390](before/command-center-free-populated-390-full.png) · [after 1280](after/command-center-free-populated-1280-full.png) · [after 390](after/command-center-free-populated-390-full.png) |
| command-center / free / missing | 3.289 / 4.687 | 1.000 / 1.314 | [before 1280](before/command-center-free-missing-1280-full.png) · [before 390](before/command-center-free-missing-390-full.png) · [after 1280](after/command-center-free-missing-1280-full.png) · [after 390](after/command-center-free-missing-390-full.png) |
| command-center / anonymous / populated | 3.694 / 5.198 | 1.137 / 1.707 | [before 1280](before/command-center-anonymous-populated-1280-full.png) · [before 390](before/command-center-anonymous-populated-390-full.png) · [after 1280](after/command-center-anonymous-populated-1280-full.png) · [after 390](after/command-center-anonymous-populated-390-full.png) |
| command-center / anonymous / missing | 3.465 / 4.935 | 1.090 / 1.562 | [before 1280](before/command-center-anonymous-missing-1280-full.png) · [before 390](before/command-center-anonymous-missing-390-full.png) · [after 1280](after/command-center-anonymous-missing-1280-full.png) · [after 390](after/command-center-anonymous-missing-390-full.png) |

## Eight gates

| Gate | Answer |
|---|---|
| One verdict above first fold | Yes: every after case has exactly one, entirely inside the viewport. |
| About two screens closed | Yes: all 24 after cases under two screens. |
| No sideways scroll at 390 | Yes: all phone document widths =390. |
| No fake/empty tools | Yes: real stored counts, explicit absent-state copy, no Free scan on mount, no fabricated price cards. |
| No banned/advice/engine words | Yes in fixture matrix: zero closed/expanded/title/aria scan hits; the health chip is opened for expanded text. |
| Readable numbers + one source | Yes: one SourceLine per page; 87.1 score, $100.00 quote, 0.0123% funding. Per-observation timestamps remain in detail and the separately dated Radar report. |
| Before/after screenshots | Yes: 48 PNGs at 1280×800 and390×844, Pro/Free/anonymous and populated/missing. |
| Naming | Yes in tested DOM/attributes: Symbol and Overview; existing route names unchanged. |

## Verification

Production build and standalone TypeScript passed. 26 focused tests across todayCompact, freeTierPages, layoutOverview, phase1Core and guideClientBoundary passed. Five calculation/request blocks are byte-identical to base, including Overview calculations/snapshot effects, scan(), refreshUsage(), SavedPicks and RadarPreview data effects. Analytics calls are untouched. Browser page errors: zero. No /api/scanner/run requests on Today, Free or anonymous views. Existing paid Overview ranked-queue requests remain unchanged (eight intercepted POSTs across four Pro cases); those are mocked failures, never live scans. Free allowance remains unchanged. Requests to usage are read-only mocked GETs.

Raw observation times, DOM scans, geometry and API interception records are in evidence.json. Screenshots are isolated fixtures, **not live Render or provider acceptance**. Full provider-connected suite not run. Final before/after fixtures use the correct Radar response schema; the initial review's invalid-response case was a test fixture issue, not a production fault.

## Noticed, not changed

Free/Pro access wording, sign-in/pricing links, legal disclosures, analytics, scoring, provider/polling policy and scan limits are unchanged. Scanner/Options absent-regime pills remain Job 16 and Symbol Job 1. Browser titles are Job 14. The existing global regime strip on Overview is not changed by the route-specific hide option. PriceStamp plain labels and HeatStrip hidden stamps are optional; default behavior on other callers is retained.

Reproduce from root with the five named Vitest files and `node docs/qa/today-2026-10-05/calculation-parity.cjs`. Build the checkout, set TRACK_ROOT and a fresh TRACK_OUT, then run capture.cjs; update local browser/dependency paths as needed. Keep API interception and external-request blocking enabled. Capture before from the base revision with the same fixtures.
