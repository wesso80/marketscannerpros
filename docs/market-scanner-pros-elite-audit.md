# MarketScanner Pros Elite Audit Report

Audit date: 2026-04-27
Scope reviewed: current workspace, Next.js app routes, API route inventory, admin/private terminal surfaces, scanner/Golden Egg/DVE/backtest/options/AI paths, auth and tier gating patterns, mock/fallback usage, existing audit history, and tenant-isolation script.

Evidence baseline:
- Page routes found: 109 `app/**/page.tsx` routes.
- API routes found: 275 `app/**/route.ts` routes.
- Tenant audit run: `npm run audit:tenant` passed with no obvious unscoped tenant-table API queries found.
- Implementation pass 1 completed: execute-trade LIVE rejection ordering, Golden Egg public contract split, options-scan server gate plus options chain data-truth/candidate-gate diagnostics, scanner DVE exhaustion consumer, admin/operator perimeter/noindex, admin fallback risk removal, morning brief fallback risk removal and Data Truth Layer surfacing, admin Commander hard command-state strip, Time Scanner schedule-model truth, DVE Volatility Phase Card, DVE trap current-price fix, backtest metric realism fixes, Backtest assumptions panel, degraded admin analytics visibility, public AI safety guardrails, scanner VWAP/stale/liquidity rank penalties, scanner rank explanations, core market-data provider status/demo alerts, and scanner UI data-truth/rank-explanation surfacing.
- Regression evidence added: `test/executeTrade.test.ts`, `test/optionsScanGate.test.ts`, `test/optionsDataTruth.test.ts`, `test/optionsCandidateGating.test.ts`, `test/commanderCommandState.test.ts`, expanded `test/timeScannerScheduleModel.test.ts` schedule-boundary coverage, `test/volatilityPhaseCard.test.ts`, `test/backtestAssumptionsPanel.test.ts`, `test/backtestStrategySignals.test.ts`, `test/adminScanContext.test.ts`, `test/backtestEngine.test.ts`, `test/adminAnalyticsDegraded.test.ts`, `test/middlewareOperatorGate.test.ts`, expanded `test/publicAiSafety.test.ts` prompt-injection plus data-binding coverage, `test/scannerScoring.test.ts`, `test/marketDataProviderStatus.test.ts`, and expanded `lib/directionalVolatilityEngine.test.ts` trap coverage.
- This report is strict: a passed script does not prove every data flow is safe, and UI gating is not treated as security.

## 1. Executive Verdict

- Overall platform grade: B-.
- Public educational safety grade: C+.
- Admin terminal grade: B.
- Trader usefulness grade: B+.
- Design quality grade: B-.
- Code quality grade: B-.
- Math/algorithm quality grade: C+.

MarketScanner Pros is not a toy. It has real architecture: scanner engines, DVE, Golden Egg, options context, risk governor logic, journal/portfolio sync, admin morning brief, Commander, Discord bridge, cron jobs, provider diagnostics, and subscription gating. The strongest product direction is the split between public educational analytics and private admin operator intelligence.

The platform is not yet elite or fully compliance-safe. The biggest problems are not lack of features. They are boundary problems: public payloads still contain execution-style concepts, several scores are heuristic but look authoritative, fallback/demo data exists in production-adjacent paths, some admin/operator logic uses fallback account context, and one trade execution endpoint writes a journal row before rejecting LIVE mode.

Critical public scaling blockers:
- Fix LIVE-mode write-before-reject in `app/api/execute-trade/route.ts`.
- Remove or split execution-style Golden Egg API fields from the public Pro Trader API contract in `app/api/golden-egg/route.ts` and `src/features/goldenEgg/types.ts`.
- Verify and enforce Pro Trader server-side gating on `app/api/options-scan/route.ts`.
- Correct scanner/DVE exhaustion scale mismatch in `app/api/scanner/run/route.ts`.
- Keep all public wording educational: no permission, approved, entry, stop, target, trade, recommendation, or direct action language.

Private admin readiness is better, but not done. `app/admin/layout.tsx` client-gates the shell via `/api/admin/verify`; sensitive data depends on API-side `requireAdmin(req)` and operator checks. That can work, but the admin shell itself is not a server-side perimeter. Admin pages must stay noindex, not publicly linked, and every data route must remain server-authenticated.

## 2. Route Inventory

| Route | Type | Purpose | Trader Score | Design Score | Code Score | Compliance Score | Decision |
|---|---:|---|---:|---:|---:|---:|---|
| `/` and marketing pages | public | Brand, conversion, education | 5 | 7 | 7 | 7 | REFINE |
| `/pricing` | public | Subscription conversion | 4 | 7 | 7 | 7 | REFINE |
| `/legal`, `/terms`, `/privacy`, `/disclaimer`, `/refund-policy`, `/cookie-policy` | public legal | Legal coverage | 3 | 6 | 7 | 8 | KEEP |
| `/auth`, `/account`, `/after-checkout` | authenticated | Login, account, subscription flow | 4 | 6 | 6 | 6 | REFINE |
| `/dashboard` | authenticated | User hub | 6 | 6 | 6 | 7 | REFINE |
| `/tools/scanner` | public/auth/tiered | Main market scanner | 8 | 7 | 7 | 7 | REFINE |
| `/tools/golden-egg` | pro_trader | Deep symbol evidence packet | 8 | 7 | 6 | 5 | REFINE |
| `/tools/volatility-engine` | pro_trader | DVE page wrapper | 8 | 6 | 7 | 7 | REFINE |
| `/tools/options`, `/tools/options-terminal`, `/tools/options-confluence` | pro_trader | Options context, confluence, terminal | 8 | 6 | 6 | 6 | REFINE |
| `/tools/time-scanner` | pro_trader | Time confluence | 7 | 6 | 6 | 7 | REFINE |
| `/tools/backtest`, `/tools/scanner/backtest` | pro_trader | Hypothetical strategy tests | 7 | 6 | 7 | 7 | REFINE |
| `/tools/portfolio` | pro/pro_trader | Portfolio analytics | 6 | 6 | 7 | 6 | REFINE |
| `/tools/journal`, `/tools/workspace` | pro/pro_trader | Journal and workspace analytics | 7 | 6 | 7 | 6 | REFINE |
| `/tools/research`, `/tools/news`, `/tools/markets`, `/tools/market-movers` | pro/public mix | Research and market context | 6 | 6 | 6 | 7 | MERGE/REFINE |
| `/operator` | admin/operator | Operator dashboard | 8 | 6 | 6 | 8 private | HARDENED; middleware operator perimeter added |
| `/admin/*` | admin | Private founder terminal | 9 | 7 | 7 | 8 private | HARDEN |
| `/api/admin/*` | admin API | Stats, diagnostics, Discord, subscriptions, trials | 8 | n/a | 7 | 8 | HARDEN |
| `/api/operator/*` | admin/operator API | Operator engine scan/approve/learning/replay | 9 | n/a | 6 | 7 | HARDEN |
| `/api/scanner/run` | tiered API | Main scanner engine | 8 | n/a | 7 | 7 | FIX MATH |
| `/api/golden-egg` | pro_trader API | Golden Egg payload | 8 | n/a | 6 | 7 | CONTRACT FIXED; continue wording/data-quality review |
| `/api/backtest` | pro_trader API | Backtest engine | 7 | n/a | 7 | 7 | REFINE |
| `/api/options-scan` | pro_trader API | Options scanner | 8 | n/a | 7 | 7 | SERVER GATE ADDED; chain provider status, spread/liquidity quality, and candidate gate diagnostics now returned and surfaced. |
| `/api/msp-analyst`, `/api/ai/*` | authenticated/tiered AI | AI analyst, memory, feedback, actions | 7 | n/a | 6 | 6 | HARDEN PROMPTS |
| `/api/portfolio`, `/api/journal`, `/api/watchlists` | authenticated API | User data sync | 7 | n/a | 7 | 7 | KEEP WITH TESTS |
| `/api/jobs/*`, `/api/cron/*`, worker routes | cron/internal | Scheduled data and emails | 7 | n/a | 6 | 7 | HARDEN AUTH |
| `/api/webhooks/*` | provider webhook | Stripe and external callbacks | 6 | n/a | 7 | 8 | KEEP |

Route inventory is grouped because the app has 109 pages and 275 API routes. The highest-risk surfaces are not marketing pages; they are payload contracts and server gates behind powerful tools.

## 3. Critical Fixes

| Severity | File | Issue | Impact | Fix |
|---|---|---|---|---|
| Critical | `app/api/execute-trade/route.ts` | LIVE mode was rejected after a journal insert path. | A LIVE request could write a journal entry before returning forbidden. | Fixed: `mode === 'LIVE'` now rejects before governor checks, risk lookups, or persistence. Regression: `test/executeTrade.test.ts`. |
| Critical | `app/api/golden-egg/route.ts` | API payload exposed `permission: 'TRADE'`, `layer2.execution`, entry, stop, targets, and sizing hint semantics. | UI copy could be softened while the API contract still looked like trading instruction. | Fixed: public payload now uses educational `assessment` and `scenario` fields. Continue admin-only execution split if private execution research is reintroduced. |
| High | `app/api/options-scan/route.ts` | First reviewed chunk showed login required but Pro Trader server gate was not confirmed. | Options Terminal is a Pro Trader feature. UI gating alone is bypassable. | Fixed: `hasProTraderAccess(session.tier)` enforced before request body parsing and scanner work. Regression: `test/optionsScanGate.test.ts`. |
| High | `app/api/scanner/run/route.ts` | DVE exhaustion check compared against a duplicated numeric threshold. | Exhaustion risk could drift from the DVE canonical contract. | Fixed: scanner now consumes canonical `HIGH`/`EXTREME` exhaustion labels; `ExhaustionRisk.level` documented as 0-100. |
| High | `app/admin/layout.tsx`, `middleware.ts` | Admin UI shell was client-gated, not middleware/server-gated. | Page shell could be route-guessed, even if APIs were protected. | Fixed: `/admin/*` middleware perimeter, noindex headers, robots disallow, and private admin banner added. Keep API `requireAdmin(req)` checks. |
| High | `lib/directionalVolatilityEngine.ts` | `detectVolatilityTrap` contained a `currentPrice` placeholder and compared strikes to max pain rather than actual price proximity. | Trap score could sound precise while using incomplete gamma proximity logic. | Fixed: trap detection now receives actual current price from `computeDVE`; missing price produces no gamma-wall proximity claim. Regression: `lib/directionalVolatilityEngine.test.ts`. |
| High | `lib/backtest/engine.ts` | Metrics had realism caveats: breakeven counted as loss, Monte Carlo used unseeded `Math.random`, profit factor returned `999` when no losses, time in market could exceed 100% with overlapping trades. | Backtest results could look more precise and repeatable than they were. | Fixed: breakevens are counted separately, no-loss profit factor returns `null` with a label, Monte Carlo uses a deterministic seed, and time in market merges overlapping exposure windows. Regression: `test/backtestEngine.test.ts`. |
| High | `lib/admin/scan-context.ts` | Fallback risk state used default $100,000 context. | Private operator decisions could be influenced by fake account state if portfolio/operator data was unavailable. | Fixed: fallback now returns research-only `WAIT`, zero equity, zero buying power, zero risk unit, and zero sizing. Regression: `test/adminScanContext.test.ts`. |
| Medium | `app/api/admin/stats/route.ts`, `app/api/admin/usage-analytics/route.ts` | Safe query wrappers can hide DB/table failures by returning empty values. | Admin may mistake degraded backend state for real zero activity. | Fixed: both APIs now return `meta.degraded`, failed query names, and warnings; admin pages surface a degradation banner. Regression: `test/adminAnalyticsDegraded.test.ts`. |
| Medium | `src/features/goldenEgg/adapters.ts` | Mock Golden Egg payload contains entry/stop/targets/sizing-like fields. | Fine for development, unsafe if imported into public runtime accidentally. | Keep under dev/test-only import path and add a type-level/public build guard. |

## 4. Page-by-Page Trader Review

| Page | What Works | What Fails | Elite Upgrade |
|---|---|---|---|
| `/tools/scanner` | The scanner is the core daily workflow. It combines technicals, DVE, derivatives/fundamental context, and compliance metadata. | Scores are heuristic and can look like calibrated probabilities if not explained. | Completed: Data Truth strip plus evidence-first rank explanations now surface provider status, freshness, missing-data penalties, liquidity penalties, and rank reasons in the scanner UI. |
| `/tools/golden-egg` | Strong single-symbol research packet with structure, volatility, options/derivatives, scenario, and missing evidence. | Public page is dense and still structurally close to an execution ticket. API contains execution fields. | Public version: educational evidence packet. Admin version: private execution-style research terminal. Separate payload contracts. |
| `/admin/morning-brief` | Good founder workflow: morning scan, top plays, risk state, learning, scenarios, email rendering, research-only locked setups. | Fixed: separate morning-brief fallback risk path no longer injects fake equity or enabled sizing; screen and email now show risk source, worker freshness, scanner health, and learning/expectancy sample. | Continue adding source badges deeper inside individual play cards as the playbook evolves. |
| `/admin/commander` | Focused private command screen, good for premarket decision discipline. | Fixed: top of page now makes the session state unmistakable before any plays are shown. | Completed: hard command strip derives `GO`, `WAIT`, or `BLOCK` from risk governor, kill switch, fallback risk source, trade budget, and top-play availability; it shows reasons, data age, risk age, source, and allowed next action. |
| `/tools/options-confluence` | Valuable professional concept: gamma, IV, OI, expiry, confluence. | Very large page and likely too much flat density. | Completed first pass: options terminal now exposes chain provider, freshness, average spread, liquid-contract coverage, and candidate gate counts. Next: full options wall table with bid/ask, OI/volume, expiry risk, and educational scenario language. |
| `/tools/options-terminal` | Good terminal direction and Pro Trader positioning. | Several tabs and features overlap with options/confluence/flow pages. | Merge overlapping options pages into a single Options Command Center with tabs and unified state. |
| `/tools/time-scanner` | Time catalyst idea is strong. | Fixed second pass: close calendar now exposes whether schedules use 24/7 crypto UTC boundaries or NYSE equity sessions and has DST, holiday, early-close caveat, week/month boundary, and 1-30D/1-26W/1-12M regression coverage. | Completed: visible schedule model, timezone/session basis, weekend/holiday caveat, early-close limitation, and targeted calendar-boundary tests. Next: build a richer TimeClusterTimeline. |
| `/tools/volatility-engine` | DVE is a strong differentiator. Trap detection now uses actual current price for gamma-wall proximity. | Fixed first pass: page now has a top Volatility Phase Card; thresholds still need calibration/sample-size framing. | Completed: phase age, continuation, exit risk, breakout readiness, trap state, exhaustion, invalidation, and read-limit warnings are visible in one glance. Continue calibration/sample-size work. |
| `/tools/backtest` | Proper Pro Trader gate observed on API and UI. Diagnostics/validation are positive. | Fixed second pass: metrics show an assumptions panel and `/api/backtest` now returns execution assumptions metadata. | Completed: fill model, modeled 5 bps slippage, unmodeled spread/commission/fees/borrow/tax/impact gaps, liquidity limits, survivorship/regime/overfitting risks, sample size, intrabar high/low ambiguity, and Monte Carlo seed are visible in result context. |
| `/tools/portfolio` | Useful analytics if kept descriptive. | Legal risk if wording drifts into allocation advice. | Make all output exposure analytics, not recommendations. Use threshold-based user settings. |
| `/tools/journal` | High value for self-learning and playbook feedback. | Fixed first pass: Journal Intelligence Dock now computes per-playbook R expectancy with minimum-sample badges and 95% confidence intervals. | Continue calibrating playbook learning once larger journal samples exist. |
| `/operator` | Operator page is powerful and aligned with founder workflow. | Fixed: route shell is now middleware-gated to admin/operator sessions and removed from public tools nav. | Continue merging private workflow toward `/admin/operator-terminal` over time. |
| Public marketing pages | Brand and conversion surfaces exist. | Marketing claims must avoid overpromising edge, win rates, and outcome certainty. | Add grounded feature claims: analytics, education, scenarios, historical context, not recommendations. |

## 5. Page-by-Page Design Review

| Page | Visual Grade | Biggest Issue | Fastest Win | Rebuild Needed? |
|---|---|---|---|---|
| `/tools/scanner` | B+ | High-density tables still need careful hierarchy, but the rank reason/data trust layer is now visible. | Continue making provider spread, factor weights, and asset-session labels more explicit. | No |
| `/tools/golden-egg` | B | Dense evidence packet lacks enough public/admin separation. | Convert execution-looking cards to `Reference`, `Invalidation`, `Reaction Zones`. | No, but split contract |
| `/tools/options-confluence` | C+ | Too much technical material in one massive surface. | Create top summary strip and progressive disclosure for chains/walls. | Partial |
| `/tools/options-terminal` | B- | Overlap between options tools makes navigation heavy. | Merge options surfaces into a tabbed command center. | Partial |
| `/tools/time-scanner` | B- | Needs clearer timeline and asset-session model. | Add TimeClusterTimeline. | No |
| `/tools/volatility-engine` | B | First-pass phase read is now visible above the layer panels; formula/data-quality drilldown remains thin. | Add formula/data quality drawer and sample-size framing. | No |
| `/tools/backtest` | B | Metrics now include explicit assumption and sample-quality framing near results. | Add strategy-specific fill/cost metadata and sample-quality warnings from the API payload. | No |
| `/admin/morning-brief` | B+ | Powerful and now has a top Data Truth Layer for risk source, worker cache, scanner health, and learning sample; remaining gap is panel-level source badges on each derived setup. | Add source badges inside every play/review card. | No |
| `/admin/commander` | B+ | Good focus; the harsh lock state is now visible before the workflow cards. | Continue tuning visual hierarchy after live-session screenshots. | No |
| `/dashboard` | C+ | Likely too general compared with tool pages. | Turn into action hub: today, stale data, watchlist, latest research. | Partial |
| Marketing/legal pages | B- | Must avoid hype and stay educational. | Replace performance/edge claims with capability claims. | No |

## 6. Math / Algorithm Findings

| Engine | Function | Status | Issue | Recommended Fix |
|---|---|---|---|---|
| Scanner | `computeScore(...)` in `app/api/scanner/run/route.ts` | Improved | Heuristic score can read like objective probability. Missing evidence, stale-candle, and liquidity-volume rank penalties are now applied and exposed through score quality metadata; final rows now include rank explanation metadata. | Continue with `scoreType: heuristic_confluence`, factor weights, and provider spread metadata where available. |
| Scanner | VWAP calculation in `app/api/scanner/run/route.ts` | Fixed | Scanner VWAP now uses an exchange-session reset for equities and a rolling model for crypto through `lib/scanner/vwap.ts`; liquidity-level VWAP no longer spans prior sessions. | Continue labeling the asset-session model clearly in the UI. |
| Scanner/DVE | DVE exhaustion consumer | Fixed | Scanner now consumes canonical DVE exhaustion labels instead of duplicating threshold math. | Continue adding tests for all scanner rank consumers that use DVE flags. |
| Golden Egg | `buildPayload(...)` scoring | Questionable | Weighted structure/flow/momentum/risk score is clear but not calibrated to outcome probability. | Label as evidence alignment, not confidence. Add calibration only after outcome sample. |
| Golden Egg | Scenario levels | Questionable | ATR stops capped at 15% and targets capped at 30% may produce unrealistic levels across asset classes. | Use asset-class specific caps and display assumptions. |
| DVE | `computeSignalProjection(...)` | Fixed first pass | It gates on minimum sample size and now returns projection quality, dispersion, score, and warning metadata. | Continue deeper historical calibration of thresholds and confidence bands. |
| DVE | `detectVolatilityTrap(...)` | Fixed | Uses actual current price from `computeDVE` to measure gamma-wall proximity; no current price means no gamma-wall proximity claim. | Continue documenting gamma assumptions and data source limitations in the UI. |
| Backtest | Metrics/API payload in `lib/backtest/engine.ts` and `app/api/backtest/route.ts` | Fixed third pass | Breakeven trades, no-loss profit factor, Monte Carlo repeatability, overlapping exposure windows, and execution-assumption payload metadata now have explicit handling. Strategy-level signal formation and intrabar tests completed in `test/backtestStrategySignals.test.ts` (16 tests). | Continue improving strategy-specific SL/TP thresholds over live samples. |
| Operator | `lib/operator/elite-score.ts` | Questionable | Transparent feature importance is good, but weights are heuristic. | Add outcome-calibrated weights after sufficient reviewed trade sample. |
| Admin risk | `lib/admin/scan-context.ts` | Incomplete | Default $100k fallback context can influence operator outputs. | Fallback must be WAIT/BLOCK and never treated as live sizing data. |
| AI | `app/api/msp-analyst/route.ts`, `app/api/ai/copilot/route.ts` | Improved | Data-aware regime inference exists, and public AI routes now get a final safety guardrail, deterministic missing-data binding guardrail, and post-generation direct-advice correction. | Completed: shared public AI guardrail, prompt-injection tests, and missing options/derivatives data-binding tests. Continue adding full model-call mocks for broader route branches as needed. |

## 7. Scanner Audit

Ranking quality: 7/10.

The scanner has a serious foundation: multiple indicators, DVE integration, stablecoin filtering, local demo guardrails, tier limits, compliance metadata, and a table already using safer wording such as `ALIGNED`, `MIXED`, `NOT ALIGNED`, and `Research`.

False positive risks:
- Heuristic score can over-rank symbols when multiple correlated momentum indicators agree; scanner now applies missing evidence, stale data, and liquidity-volume penalties before final ranking.
- DVE exhaustion scale mismatch is fixed and covered by the DVE/scanner audit regressions.
- VWAP session handling is fixed in the scanner route and covered by regression tests.
- Options and derivatives evidence must only affect rank when actually available and fresh.

Missing filters:
- Provider spread metadata for equities/options where available.
- Asset-class-specific volatility regime treatment.
- Completed: rank explanation metadata comparing each returned symbol against the current leader, now surfaced in the scanner table and symbol detail panel.

Required code fixes:
- Normalize DVE exhaustion scale in `app/api/scanner/run/route.ts`.
- Completed: replace cumulative VWAP with session-aware VWAP for equities and rolling VWAP for crypto.
- Completed: return score quality metadata for evidence layer count, missing evidence penalty, stale data penalty, and liquidity-volume penalty.
- Completed: return and display `rankExplanation` metadata with leader gap, strengths, penalties, and warnings.
- Completed: missing options/derivatives score-inflation regression coverage. Core scanner scoring does not consume options-chain evidence, and crypto derivatives boosts now flow through a testable helper that returns zero boost plus `missing_derivatives_evidence_no_score_boost` when funding/OI are absent.

## 8. Golden Egg Audit

Evidence quality: 8/10 for internal research, 5/10 for public contract safety.

Verdict quality: strong concept, weak language boundary. The engine separates structure, flow, momentum, risk, macro/time conflict, and scenario data. That is useful. But public API semantics include `TRADE`, `permission`, `execution`, `entry`, `stop`, `targets`, and `sizingHint`. That is not acceptable for a public educational analytics product, even if the visible UI maps some labels to safer text.

Missing logic:
- Public/admin payload split.
- Data quality badge at every layer.
- Calibration history for confidence/alignment scores.
- Asset-class-specific risk-level caps.

Public wording fixes:
- `permission` -> `conditionState`.
- `TRADE` -> `ALIGNED` or `ACTIVE_RESEARCH`.
- `entryTrigger` -> `reference condition`.
- `entry` -> `reference level`.
- `stop` -> `invalidation level`.
- `targets` -> `reaction zones`.
- `sizingHint` -> remove from public payload or rename `hypotheticalRiskExample` with strong disclaimer.

Admin upgrades:
- Keep execution-style private labels only under `/admin` and admin APIs.
- Add internal disclaimer: "Internal research terminal only. Outputs are private analytical observations for internal review and are not public financial advice, client recommendations, or brokerage instructions."
- Add raw evidence drawer with stale/missing evidence flags.

## 9. Time Confluence Audit

Closing logic: needs deeper targeted audit. Existing historical audits flagged timezone/session risks in time engines, especially equity sessions, holidays, month/week boundaries, and UTC-vs-ET handling. Those must not be assumed fixed without tests.

Crypto/equity separation: non-negotiable. Crypto is 24/7. Equities require exchange sessions, weekends, holidays, early closes, and DST handling.

Cluster scoring: useful if it weights distance-to-close, timeframe importance, and duplicate close events correctly. Dangerous if it overstates precision.

Timeline quality: should become a first-class UI component, not just text.

Required fixes:
- Unit tests for equity vs crypto close schedules.
- Completed second pass: DST, holiday, early-close caveat, month-end, week-end, and 1-30 day/1-26 week/1-12 month boundary regression coverage in `test/timeScannerScheduleModel.test.ts`.
- Completed first pass: add `scheduleModel: equity_session | crypto_247 | forex_session` to forward close-calendar outputs.
- Completed first pass: show schedule basis, timezone/session model, and caveats in the Time Scanner close-calendar UI.

## 10. DVE Audit

Formula quality: 7/10.

The DVE is one of the more credible engines. It includes BBWP, VHM, regime classification, directional pressure, phase persistence, signal projection, invalidation, breakout readiness, volatility trap, exhaustion, and explainable summaries. `computeSignalProjection(...)` correctly gates projection on minimum sample size before showing historical stats.

Threshold quality: 6/10. The thresholds are plausible but heuristic. They need historical calibration and visible sample sizes. Do not market DVE outputs as predictive certainty.

Missing data handling: decent in places, but not clean enough around optional options/time/liquidity inputs.

Recommended fixes:
- Completed: `detectVolatilityTrap(...)` now uses actual current price from `computeDVE`, with regression tests for near/far gamma-wall behavior.
- Completed first pass: `/tools/volatility-engine` now has a Volatility Phase Card showing phase age, continuation, exit risk, breakout readiness, trap state, exhaustion, invalidation, and read-limit warnings.
- Remove unused `stochMom` or wire it into signal detection deliberately.
- Completed first pass: add `projectionQuality`, `projectionQualityScore`, `dispersionPct`, and `projectionWarning` based on sample size and return dispersion; surface it in the DVE projection card.
- Completed: added strict DVE boundary regressions for BBWP percentile bounds, compression/transition/expansion/climax thresholds, stretched expansion exit risk, missing-input data quality, and exhaustion label boundaries.
- Document whether all DVE sub-scores are 0..1 or 0..100 and enforce with TypeScript branded helpers.

## 11. Options Engine Audit

Greeks: provider and calculated Greeks need explicit source labeling. Users should know whether Greeks are vendor-supplied, estimated, stale, or unavailable.

Gamma: conceptually strong, but gamma exposure assumptions need transparent limitations. Retail-level options chain data does not equal institutional dealer positioning unless assumptions are stated.

IV: IV Rank/percentile is useful but must show lookback window and data source.

OI/volume: OI and volume context is useful. Add stale checks because OI updates differently than price.

Max pain: useful as a reference, not a magnet promise. Public wording should say "max pain reference" or "settlement pressure area", not imply guaranteed pinning.

Liquidity filters: must include bid/ask spread, minimum volume/OI, DTE, and contract price sanity checks before ranking.

Recommended fixes:
- Verify Pro Trader server gate in `app/api/options-scan/route.ts` immediately.
- Completed first pass: add data freshness, provider status, spread, and liquidity/source metadata to `/api/options-scan` and the mapped options terminal payload.
- Completed: candidate eligibility diagnostics now count `ALLOW`/`WAIT`/`BLOCK` candidates and expose spread/OI/volume blockers so thin chains cannot look clean. Continue improving strategy-specific thresholds over live samples.
- Keep public outputs as educational options context; reserve direct action labels for admin-only research.

## 12. Backtest Audit

Look-ahead bias: no confirmed look-ahead bug in the reviewed `app/api/backtest/route.ts` chunk. The route validates body, fetches real data, checks strategy/timeframe compatibility, computes coverage, and returns diagnostics. Still needs strategy-level tests per strategy.

Fill realism: second pass improved. The UI now discloses fill model, modeled 5 bps adverse slippage, unmodeled spread/commission/fee/borrow/tax/impact gaps, liquidity constraints, survivorship/regime/overfitting risks, sample size, intrabar high/low ambiguity, and Monte Carlo seed near the performance metrics. `/api/backtest` now returns `executionAssumptions` metadata with the same fill/cost/liquidity/bias/sample warnings.

Metrics fixed in `lib/backtest/engine.ts`:
- Breakeven trades are counted separately from wins and losses.
- Monte Carlo uses a deterministic seed and returns the seed in the result.
- Profit factor returns `null` with `No losing trades in sample` instead of a fake `999` sentinel when there are no losses.
- Time in market is calculated from merged exposure windows and capped at 100%.

Required warnings:
- Hypothetical educational backtest only.
- Past performance does not indicate future results.
- Results include a simple 5 bps adverse slippage model, but still exclude commissions, liquidity constraints, spread, taxes, borrow costs, market impact, queue priority, and live execution limitations.

Remaining code fixes:
- Completed third pass: `test/backtestStrategySignals.test.ts` (16 tests) covers signal formation invariants (no-lookahead entry on signal-bar close, loop boundary, end-of-data exit), intrabar stop-before-target priority (source + assumptions metadata), slippage direction/magnitude (source + functional), and end-of-data functional exit verification.
- Continue improving strategy-specific SL/TP thresholds over live samples.

## 13. AI / ARCA Audit

Prompt quality: partially reviewed. `app/api/msp-analyst/route.ts` includes data-aware regime inference and component counting, which is the right direction. The final prompt assembly and output compliance need dedicated tests.

Hallucination risk: medium. Any AI route that receives scanner/page context must be forced to say when data is stale, missing, or not supplied. It must not infer options, macro, or portfolio state from absence.

Public safety: medium risk until prompt tests exist. Public AI must not say buy/sell/hold, enter/exit, should, recommend, guaranteed, permission, trade approved, or direct allocation advice.

Admin usefulness: high potential. Admin ARCA should include structured fields: `verdict`, `evidenceScore`, `missingEvidence`, `riskFlags`, `dataQuality`, and `reasoningTrace`. Keep it private.

Required fixes:
- Completed: shared public AI safety guardrail injected before final user prompts in `app/api/msp-analyst/route.ts` and `app/api/ai/copilot/route.ts`.
- Completed: post-generation direct-advice correction for public AI output.
- Completed: prompt-injection and public-advice regression tests in `test/publicAiSafety.test.ts`.
- Completed: data-binding guardrail and tests require missing options/derivatives data to be acknowledged, not invented.
- Log AI usage and rate-limit by tier consistently.

## 14. Public Compliance Wording Fixes

| File | Finding | Safer Replacement / Status |
|---|---|---|
| `app/api/golden-egg/route.ts` | Fixed: public payload no longer exposes `permission: 'TRADE'`. | Public contract uses `assessment: 'ALIGNED' | 'NOT_ALIGNED' | 'WATCH'`. Keep operator permission admin-only if reintroduced. |
| `app/api/golden-egg/route.ts` | Fixed: public response no longer returns direct `NO_TRADE`/`TRADE` permission states. | Continue using `NOT_ALIGNED`, `WATCH`, and `ALIGNED` as educational scenario alignment language. |
| `src/features/goldenEgg/types.ts` | Fixed: `layer2.execution` removed from public payload type. | Public payload uses `layer2.scenario`; keep `execution` only in future admin-only types. |
| `src/features/goldenEgg/adapters.ts` | Fixed: mock payload no longer contains `entry`, `stop`, `targets`, or `sizingHint`. | Mock payload now uses `referenceLevel`, `invalidationLevel`, `reactionZones`, and hypothetical risk example fields. |
| `app/tools/golden-egg/page.tsx` | `Hypothetical R:R` may look execution-oriented near levels | `Scenario R:R example` with educational disclaimer |
| `components/scanner/ResearchCaseModal.tsx` | Any level wording that implies action | Use `reference`, `reaction`, `invalidation`, `evidence missing` language only |
| Public portfolio/journal pages | Any `good/bad trade`, `reduce`, `keep`, `sell`, `rebalance` wording | Fixed first pass: portfolio controls now use record-oriented labels, portfolio AI payload no longer asks for insights/improvement, and advisory drift falls back to deterministic descriptive output. Continue scanning new portfolio/journal UI additions. |
| AI responses | `you should`, `I recommend`, `buy/sell/hold` | `conditions currently suggest`, `educational observation`, `not a personal recommendation` |
| Backtest result copy | Any implied expected future win rate | `historical hypothetical result over this sample` |

## 15. Admin Isolation Review

| Route/API | Current Protection | Risk | Fix |
|---|---|---|---|
| `/admin/*` pages | Client auth gate via `/api/admin/verify` in `app/admin/layout.tsx` | Shell can be route-guessed; security relies on APIs. | Add middleware/server guard for `/admin`, noindex headers, and internal disclaimer. |
| `/api/admin/verify` | `verifyAdminRequest`, sets `ms_admin`; POST requires admin secret | Good, cookie/session behavior must remain tightly scoped. | Completed: invalid admin secrets do not mint `ms_admin`; valid secrets set httpOnly SameSite=Lax admin sessions; invalid/absent admin cookies do not pass `verifyAdminRequest`. Regression: `test/adminVerify.test.ts`. |
| `/api/admin/stats` | `requireAdmin(req)` | Good access gate; previously degraded silently through safe queries. | Fixed: returns degraded query warnings and dashboard banner when stats are incomplete. |
| `/api/admin/discord/test` | Admin-gated in current findings | Good required route exists per prior brief. | Completed: regression proves response payloads and logs include status/source only and do not leak webhook URLs or secret token segments. |
| `/api/admin/diagnostics/scanners` | Admin or operator allowed | Acceptable private diagnostics. | Completed: regression proves normal non-admin users receive 403 before DB/provider diagnostics run. |
| `/api/operator/engine/scan` | Admin or `isOperator(...)` | Strong private concept, but fallback context can be fake. | Add source badges and conservative fallback lock. |
| `/api/operator/engine/learning` | Admin or operator | Uses placeholder metrics until real trade history. | Return `learningStatus: insufficient_history`, no implied learning until sample exists. |
| `/operator` | Middleware-gated admin/operator page with noindex headers | Previously exposed a route-guessed shell and public nav link. | Fixed: server perimeter, noindex metadata, robots disallow, and public tools nav removal. Regression: `test/middlewareOperatorGate.test.ts`. |

## 16. Mock/Fallback Data Review

| File | Mock/Fallback Found | Risk | Action |
|---|---|---|---|
| `app/api/golden-egg/route.ts` | Local demo Golden Egg payload when live data fails and demo allowed outside production or with `LOCAL_DEMO_MARKET_DATA=true` | Improved | Now returns provider status metadata and emits a critical production demo alert when `LOCAL_DEMO_MARKET_DATA=true` is enabled in production. |
| `app/tools/golden-egg/page.tsx` | Fallback symbols list and local demo warning | Low/Medium | Accept fallback symbols for UI convenience; keep demo warning strong. |
| `src/features/goldenEgg/adapters.ts` | `getGoldenEggMockPayload()` with realistic execution-style scenario | Medium | Keep test/dev only and prevent import into production public pages. |
| `app/api/operator/engine/learning/route.ts` | `placeholderMetrics` with zeros and note | Medium | Label as insufficient history; do not show as model learning result. |
| `lib/admin/scan-context.ts` | Default $100,000 fallback account/risk context | High | Use WAIT/BLOCK only; never represent as live account state. |
| `lib/admin/morning-brief.ts` | Fallback learning and core fallback symbols | Medium | Keep, but every derived output must show source and downgrade confidence; fallback risk is now zero-equity, WAIT-only, and no-sizing. |
| `app/api/admin/usage-analytics/route.ts` | `safe(... fallback: [])` | Medium | Fixed: returns degraded metadata and usage analytics page warns that empty charts may mean unavailable data, not zero activity. |
| `lib/avRateGovernor.ts` | In-memory fallback if Redis unavailable | Medium | Accept for resilience, but admin diagnostics must warn Redis unavailable and rate limit coordination degraded. |
| `lib/directionalVolatilityEngine.ts` | `currentPrice` placeholder in trap logic | High | Replace with real current price or remove the claim. |

## 17. UI Component Recommendations

| Component | Purpose | Where Used |
|---|---|---|
| `MarketStatusStrip` | One-line state: regime, risk-on/off, data status, provider health | Dashboard, scanner, admin morning brief, Commander |
| `DataFreshnessBadge` | Show LIVE/DELAYED/CACHED/STALE/UNAVAILABLE/SIMULATED and age | Every market output, scanner rows, Golden Egg, options, DVE |
| `RegimeBadge` | Consistent regime vocabulary and colors | Scanner, Golden Egg, AI, DVE, admin |
| `ConfluenceMeter` | Evidence alignment, not probability | Scanner, Golden Egg, options, research modal |
| `EvidenceStack` | What supports, conflicts, missing | Golden Egg, ResearchCaseModal, AI truth panel |
| `RiskFlagPanel` | Show invalidation, stale data, macro conflict, risk lock | Golden Egg, admin Commander, portfolio |
| `AdminOnlyBanner` | Private internal research disclaimer | Every `/admin/*` page |
| `EducationalDisclaimerCard` | Standard public legal framing | Public tools, AI, backtest, portfolio/journal |
| `StaleDataWarning` | Prominent degradation banner | Any provider failure or cache fallback |
| `ScannerRankTable` | Explainable ranking table with reason codes | `/tools/scanner`, admin brief |
| `SymbolIntelligenceCard` | Compact symbol evidence summary | Dashboard, watchlists, morning brief |
| `TimeClusterTimeline` | Visual close clusters and countdowns | Time scanner, Golden Egg, admin |
| `VolatilityPhaseCard` | Compression/expansion/trap/exhaustion state | DVE, Golden Egg, scanner details |
| `OptionsWallTable` | Strikes, OI, volume, spread, gamma/max pain reference | Options terminal/confluence |
| `AITruthPanel` | What AI knows, does not know, sources, stale data | MSP Analyst, ARCA, admin AI |

## 18. Testing Plan

Unit tests:
- Completed: scanner score missing evidence, stale candle, and liquidity-volume penalty regressions.
- Scanner DVE exhaustion scale.
- Completed: session-aware VWAP for equities and rolling/session VWAP for crypto.
- DVE BBWP percentile, compression, expansion, phase persistence, trap detection, exhaustion.
- Completed: `detectVolatilityTrap(...)` with actual current price.
- Completed first pass: DVE Volatility Phase Card wiring and copy regression for phase age, continuation, exit risk, breakout, trap, exhaustion, invalidation, and read-limit warnings.
- Completed first pass: DVE projection quality now grades historical projection samples by sample count and dispersion, with UI warnings beside expected move/hit-rate metrics.
- Completed second pass: Time Confluence DST spring/fall checks, holiday skip, early-close caveat, month-end, week-end, 1-30 day, 1-26 week, and 1-12 month close-boundary regressions in `test/timeScannerScheduleModel.test.ts`.
- Completed: options assumption regressions cover IV rank as contextual evidence only, missing max-pain/gamma coverage as unknown, dealer-gamma partial evidence, stale candidate blocking, impossible quotes, spread/liquidity filters, and thin-chain warnings.
- Backtest win/loss/breakeven, profit factor, seeded Monte Carlo, drawdown, time in market.
- Completed first pass: Backtest assumptions panel shows fill model, slippage/spread/commission gaps, liquidity limits, survivorship/regime/overfitting risks, sample size, and Monte Carlo seed near performance metrics.
- Completed second pass: `/api/backtest` returns `executionAssumptions` payload metadata distinguishing modeled 5 bps slippage from unmodeled spread, commissions, fees, liquidity, survivorship, and intrabar path limitations.
- Completed: admin stats and usage analytics degraded metadata when DB queries fail.
- Completed: admin Commander command-state strip shows `GO`/`WAIT`/`BLOCK`, data age, risk age, source, kill switch, reasons, and allowed next action.
- Completed: AI prompt-injection/public-advice guardrails, missing options/derivatives data-binding guardrails, and output correction.
- Completed: role/tier helper regressions cover canonical tier normalization, AI limits, Pro access, Pro Trader-only UI helpers, scanner/free exceptions, portfolio limits, `FREE_FOR_ALL_MODE` production guardrails, and temporary Pro Trader bypass expiry/production blocking.

Integration tests:
- Completed first sweep: Pro Trader API gate regressions cover Golden Egg, Backtest family, Options Scan, DVE/Volatility Engine, Confluence Scan, Deep Analysis, Flow, Evolution, Trade Proposal, and workflow routes using the canonical `hasProTraderAccess` helper before body parsing where applicable. `/api/dve` now has a server-side Pro Trader gate.
- Public user cannot call admin APIs.
- Completed: non-admin/invalid-secret requests cannot access `/api/admin/verify` admin session behavior.
- LIVE execute-trade request writes no journal row.
- Expired/cancelled subscription loses server-side access.
- Stale provider data displays stale badge.
- Local demo market data never appears as real output in production.
- AI refuses direct buy/sell/hold/personal advice request.
- Completed: Discord admin test sends message and never leaks webhook URL.

Manual QA:
- Mobile scanner table and research modal.
- Golden Egg public educational packet.
- Admin Golden Egg/Commander/morning brief private workflow.
- Options command center on desktop and mobile.
- Time scanner timeline around market close and weekends.
- DVE page with missing options/time data.
- Portfolio/journal wording audit. Completed first pass: journal playbook expectancy now exposes thin/developing/minimum-met sample status, R expectancy intervals, win-rate intervals, and historical-only warnings in the Review dock. Portfolio first pass complete: public controls are record-oriented and portfolio AI summaries have deterministic descriptive fallback if advisory language appears.
- Pricing/onboarding/legal disclaimers.
- Admin diagnostics degraded provider state. Remaining manual pass: capture desktop/mobile screenshots for scanner detail, Golden Egg, Options terminal, Morning Brief email, admin diagnostics, portfolio/journal wording, and stale/degraded data banners.
- Morning/evening email rendering and unsubscribe/legal footer where needed.

## 19. Final Priority Roadmap

### Fix Immediately
1. Completed: Move LIVE-mode rejection before any journal persistence in `app/api/execute-trade/route.ts`.
2. Completed: Remove or split Golden Egg public execution payload fields in `app/api/golden-egg/route.ts` and `src/features/goldenEgg/types.ts`.
3. Completed: Verify/add Pro Trader server-side gate in `app/api/options-scan/route.ts`.
4. Completed: Correct DVE exhaustion scale in scanner scoring.
5. Completed: Add admin route perimeter/noindex treatment for `/admin/*` and verify all admin APIs use server checks.
6. Completed: Harden `/operator/*` with middleware operator perimeter, noindex treatment, and public nav removal.

### Fix Before Paid Scaling
1. Completed: Add public AI compliance tests and prompt-injection guardrails.
2. Completed: Add session-aware VWAP plus missing-evidence and stale-data rank penalties.
3. Completed: Add liquidity-volume rank penalties for equities/crypto and avoid fake forex volume scoring; provider spread metadata still belongs with options/equity data-source work.
4. Completed: Harden core scanner/Golden Egg fallback/demo data behavior with production alerts and provider status metadata.
5. Completed: Fix DVE volatility trap placeholder.
6. Completed: Make backtest metrics reproducible and more honest.
7. Completed for core scanner and Golden Egg outputs: add provider data status metadata. Continue extending the same helper to remaining market endpoints as they are touched.

### Elite Trader Upgrade
1. Build a unified morning command layer: regime, top aligned research, locked setups, data freshness, news, risk state, and next checks. Current implementation has the data-truth and command-state layers; next UI consolidation is component extraction plus reducing overlapping options/research screens.
2. Completed for scanner API rows: add explainable ranking metadata with leader gap, strengths, penalties, and warnings. Continue surfacing this in UI tables/cards.
3. Add outcome-calibrated playbook learning after enough journal samples. Current playbook expectancy displays minimum-sample status and confidence intervals; true self-learning calibration should wait for enough labeled closed trades and signal outcomes.
4. Merge overlapping options pages into one Options Command Center.
5. Add source-quality weighting to every engine.

### Design Upgrade
1. First three passes completed: added shared `MarketStatusStrip`, `DataFreshnessBadge`, `EvidenceStack`, and `RiskFlagPanel` under `components/market/`; wired scanner Data Truth/status badges; migrated Golden Egg's evidence stack, data-truth strip, and invalidation/risk flags; then migrated the Volatility Engine/DVE summary layer to shared data-truth, evidence, and risk components. Next pass should migrate Options Terminal and admin Morning Brief local variants.
2. Convert public Golden Egg from execution-like layout to educational evidence packet.
3. Add TimeClusterTimeline and VolatilityPhaseCard.
4. Reduce repeated tool pages and merge overlapping options/research views.
5. Make mobile scanner/options tables readable as stacked intelligence cards.

## 20. Final Verdict

Safe enough publicly: not yet. The public side has strong disclaimers and some safer UI language, but payloads and concepts still include execution-style trading semantics. Public safety requires stricter API contracts, wording cleanup, AI tests, and demo/fallback hardening.

Powerful enough privately: close. The admin morning brief, Commander, risk/learning integration, email flow, diagnostics, and operator APIs are genuinely useful. The missing piece is hard perimeter treatment and uncompromising source/data quality labels.

Trader-grade enough: promising but not elite yet. The architecture can support a serious premarket workflow. The engines need sharper calibration, better stale/missing data penalties, and clearer explanations for why a setup ranks highly.

Visually elite enough: not yet. It is professional in many places but still too fragmented. The fastest path to elite is not more pages; it is a unified terminal-grade component system and fewer overlapping tools.

Technically reliable enough: improving, but critical fixes remain. The tenant audit script passed, which is good. The high-risk issues are now more specific: execute-trade ordering, Golden Egg payload semantics, options-scan tier verification, DVE scale/placeholder logic, fallback data truthfulness, and backtest metric honesty.

Bottom line: MarketScanner Pros has the bones of a serious professional analytics system. To become elite, it needs stricter boundaries: public educational outputs must be safer and less execution-like; admin outputs can be stronger but must be fully locked down; all scores must tell the truth about data quality, sample size, and uncertainty.
