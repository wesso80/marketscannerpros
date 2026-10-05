# Macro — Job 9

Base: `b12d135a64b629061960875df028ddc989ba5072` (batch/oct-wp). Scope: /tools/dashboard?tab=macro. Browser metadata title is deferred to Job 14; page heading is Macro. Shared absent-regime pill is Job 10.

The original view leaked Permission, bullish/bearish, Unknown, Unavailable, N/A, missing-input codes and a directional options label when folds were opened. Missing GDP/CPI/options values could look like measured zeros. Free/anonymous loading could not finish because existing polling is disabled for those tiers.

This presentation-only change groups secondary absent inputs, hides empty top tiles, suppresses the displayed assessment when required observations are absent, and folds supporting detail. Scoring, fetch/polling policy, access copy and legal wording stay unchanged. Free/anonymous now show an honest not-collected state without enabling polling or introducing an access entitlement. The underlying computed gate and AI context are unchanged, even when the presentation suppresses an incomplete assessment.

| State | Before 1280 / 390 | After 1280 / 390 | PNGs |
|---|---|---|---|
| pro populated | 2.046 / 2.403 | 1.245 / 1.487 | [before 1280](before/macro-pro-populated-1280-full.png) · [before 390](before/macro-pro-populated-390-full.png) · [after 1280](after/macro-pro-populated-1280-full.png) · [after 390](after/macro-pro-populated-390-full.png) |
| pro missing | 1.734 / 1.962 | 1.000 / 1.129 | [before 1280](before/macro-pro-missing-1280-full.png) · [before 390](before/macro-pro-missing-390-full.png) · [after 1280](after/macro-pro-missing-1280-full.png) · [after 390](after/macro-pro-missing-390-full.png) |
| pro failed | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/macro-pro-failed-1280-full.png) · [before 390](before/macro-pro-failed-390-full.png) · [after 1280](after/macro-pro-failed-1280-full.png) · [after 390](after/macro-pro-failed-390-full.png) |
| free populated | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/macro-free-populated-1280-full.png) · [before 390](before/macro-free-populated-390-full.png) · [after 1280](after/macro-free-populated-1280-full.png) · [after 390](after/macro-free-populated-390-full.png) |
| anonymous populated | 1.000 / 1.000 | 1.000 / 1.076 | [before 1280](before/macro-anonymous-populated-1280-full.png) · [before 390](before/macro-anonymous-populated-390-full.png) · [after 1280](after/macro-anonymous-populated-1280-full.png) · [after 390](after/macro-anonymous-populated-390-full.png) |

## Eight gates

| Gate | Evidence |
|---|---|
| One verdict above fold | Exactly one in every after case, fully inside viewport. |
| About two screens closed | All ≤1.487 screens. |
| No sideways scroll at 390 | All phone scrollWidth = 390. |
| No fake/empty tools | Missing top metrics hidden, no zero placeholders, failed feed has Try again, Free loading replaced by truthful state. |
| No banned/engine words | Zero hits in closed/expanded/aria/title case-insensitive scans across ten cases. |
| Readable numbers + one source | One SourceLine per case. 4.20%, $23.9T, 0.75x; timestamp uses viewer zone. |
| Screenshots | Twenty before/after PNGs at 1280×800 and 390×844, including Pro missing/failure, Free and anonymous. |
| Naming | Macro page heading; no Golden Egg or Command Center in reviewed view. |

## Validation

Production build and standalone TypeScript passed. 25 tests in macroLayout, economicIndicatorsDaily, crossAssetLiveInputs and dailyPacketMacroFreshness passed (providers mocked). Five helper/callback bodies are byte-identical to base, including computeMacroGate and fetchData. Existing option aggregation and polling conditions remain unchanged. Ten browser cases: zero page errors; all folds closed at capture. Chart retained with measured maturities; absent history never receives synthetic points. Full provider-connected suite not run.

These are isolated fixtures, not live acceptance. All browser API traffic is intercepted and external calls are aborted; no production writes. Before uses a built checkout whose Macro source is byte-identical to the specified batch base. Shared shell differences are unrelated to this page; capture fixtures are identical. Raw observation times, visible/expanded text, geometry, and request records are in each evidence.json. No claims about current market data or live Options validation.

Reproduce from repository root: run the four focused Vitest files; run `node docs/qa/macro-2026-10-05/calculation-parity.cjs`. For screenshots, build the chosen checkout, set TRACK_ROOT and a new TRACK_OUT, then run capture.cjs. Browser/dependency paths in the runner are specific to the builder environment and can be adjusted locally; do not remove network interception.
