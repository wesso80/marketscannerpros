# Job 16d — WP2 Volatility

Base `44e455eae6b84b2e35abac08a46ca270e38b994e` from `batch/oct-wp`. Draft only; no merge or deployment.

Volatility now opens with one verdict, the existing symbol picker, four measured tiles and one BBWP chart. The detailed evidence, phase, breakout, directional pressure, persistence, signal/invalidation, projection and regime panels are closed folds with summaries from the existing reading. The source appears once, with date-only bar observations retained as session dates instead of invented midnight times.

Inactive signal/projection summaries say “No active signal” instead of presenting default zero quality as a measured result. The existing projection fallback calculation is preserved but labelled “BBWP-based estimate” when ATR is absent. Direction and status labels use plain language; raw codes and decorative all-caps styling are removed from the changed presentation. Scores, conditions, calculations, API behavior and access rules remain unchanged.

## Screens and hard gate

Local production builds at 1280×800 and 390×844. **Mocked/off-session layout evidence, not live market acceptance.** AAPL and BTC fixtures come from the unchanged pure calculation using deterministic 300-bar input. The partial case omits optional inputs and has no bar date. Browser API requests are fulfilled locally; external calls are aborted. Raw UTC observations and request times are preserved. No production auth, consent or provider calls.

| Case | Before 1280 / 390 | After 1280 / 390 | Screenshots |
|---|---|---|---|
| volatility-AAPL | 5.582 / 7.787 | 2.014 / 2.137 | [before 1280](before/volatility-AAPL-1280.png) · [before 390](before/volatility-AAPL-390.png) · [after 1280](after/volatility-AAPL-1280.png) · [after 390](after/volatility-AAPL-390.png) |
| volatility-BTC | 5.582 / 7.746 | 2.014 / 2.137 | [before 1280](before/volatility-BTC-1280.png) · [before 390](before/volatility-BTC-390.png) · [after 1280](after/volatility-BTC-1280.png) · [after 390](after/volatility-BTC-390.png) |
| volatility-partial | 5.546 / 7.707 | 2.049 / 2.152 | [before 1280](before/volatility-partial-1280.png) · [before 390](before/volatility-partial-390.png) · [after 1280](after/volatility-partial-1280.png) · [after 390](after/volatility-partial-390.png) |
| volatility-error | 1.281 / 1.305 | 1.000 / 1.000 | [before 1280](before/volatility-error-1280.png) · [before 390](before/volatility-error-390.png) · [after 1280](after/volatility-error-1280.png) · [after 390](after/volatility-error-390.png) |
| volatility-free | 1.008 / 1.000 | 1.008 / 1.000 | [before 1280](before/volatility-free-1280.png) · [before 390](before/volatility-free-390.png) · [after 1280](after/volatility-free-1280.png) · [after 390](after/volatility-free-390.png) |
| volatility-anonymous | 1.184 / 1.169 | 1.184 / 1.169 | [before 1280](before/volatility-anonymous-1280.png) · [before 390](before/volatility-anonymous-390.png) · [after 1280](after/volatility-anonymous-1280.png) · [after 390](after/volatility-anonymous-390.png) |

| # | Gate | Answer + evidence |
|---|---|---|
| 1 | One verdict above first fold | Yes: one symbol/volatility summary; explicit loading/failure states. The same reading supplies every panel. |
| 2 | About two screens closed | All after cases below the 2.3 maximum; each desktop case no taller than before. Populated cases slightly exceed 2.0 because all eight detail folds and the protected disclosure remain accessible. Counts include shared chrome and the bottom clearance for MSP AI. |
| 3 | No sideways scroll at 390 | Yes: closed and expanded document/body widths are 390. The former page-level overflow hiding is removed. |
| 4 | No fake/empty tools | Existing requested-symbol analysis and retry controls remain. Missing inputs and bar dates are explicit. Inactive projection summaries do not claim zero quality; BBWP fallback is not labelled ATR. |
| 5 | No banned/engine words | Word scan of Pro folds open/closed finds only “probability” in the unchanged disclosure “Heuristic score · not a probability”. Shared regime and protected access wording exceptions are listed below. |
| 6 | Readable numbers + one source line | Yes: e.g. 97.6, 10/100, 100%; one source on populated Pro views, zero for errors/access gates. Date-only bars remain dates; real timestamps use the existing viewer-zone formatter. |
| 7 | Screenshots at 1280 and 390 | Yes: 24 before/after PNGs cover AAPL, BTC, missing inputs/date, request failure, Free and anonymous. |
| 8 | Symbol / Overview / Track naming | Page title is Volatility. Routes and identifiers are unchanged. Protected UpgradeGate still says “Directional Volatility Engine”; replacement proposed below. |

## Verification

18 tests in four files pass: rendered compact layout, one verdict/source/chart, eight initially closed folds, honest missing-input/date states, explicit BBWP fallback label, existing API freshness/cache behavior, stochastic slopes and phase/projection wiring. Production build and TypeScript pass. Zero browser page errors. All visible page buttons measure at least 40px; the phone screenshot shows MSP AI below the controls.

Seven core/API/access files and 40 calculation/fetch blocks are byte-identical to the base. The parity script covers the main fetch and quality expressions, regime forecast, projection ranges, signal criteria, directional component math and phase risk classification. UI text mapping never changes stored readings or inputs. React best-practices review: no new effects, requests, listeners or dependencies; existing request/ref behavior retained; input is labelled; native details preserve keyboard operation.

## Noticed, not changed

- Protected access wording: `UpgradeGate requiredTier="pro" feature="Directional Volatility Engine"` is untouched under Y11. Proposed replacement for Brad: feature="Volatility". This is an explicit naming exception, not an all-pages naming pass.
- “Heuristic score · not a probability” remains unchanged as required for disclosure text. The existing educational banner remains. The requested “General information only, not financial advice.” line is included below the report.
- Existing core heuristic weights and BBWP range fallback are unchanged. This PR corrects their labels and layout; it does not validate or recalibrate the model. Populated screenshots use no active signal; historical active-signal quality logic remains covered by the existing code tests, not claimed live-tested.
- #367 owns shared data-truth/regime issues; its missing-regime banner remains. No provider, scoring, worker, API, pricing, billing, Stripe, analytics, alert delivery, navigation-menu, config or dependency edits.
- #353 remains HOLD for an approved preview of its head with real Pro/Free/anonymous AAPL+NEAR screenshots and Brad's PNG-retention decision. Existing WP1 PNGs are untouched. Reviews/Y10 and About/Y9 decisions remain outstanding.
- The Options live window is not claimed completed. #334's OI discrepancy is unresolved; the read-only harness in #380 has not been run live. The Options/Radar layouts in #395/#396 were externally merged while this branch was being prepared; no merges were performed by this builder.
