# Phase 1: evidence inventory and reconciliation

**Ticker research page project · prepared 2026-10-07 · read-only review of `main` at `e9f7b77`**

This is the first deliverable of the "one complete ticker research page" proposal. It records what the public site
shows, where each number comes from, and where two views of the same ticker disagree. Nothing here changes the site.

**Scope:** public pages only. The admin section (crypto research, paper accounts, models, audits) stays as it is and
is out of scope. Rule for later phases: no admin-only field may appear in a public response.

---

## 1. AAPL open-interest discrepancy: explained

For the 9 Oct 2026 expiry, AAPL showed:

| | Symbol (`/tools/golden-egg`) | Options analysis (`/tools/options-confluence`, Options terminal) |
|---|---|---|
| Put/call OI ratio | **0.91** | **0.58** |
| Highest put OI | **$220** | **$330** |

**Cause: the two views compute these from different sets of strikes in the same expiry.** It is a definition
difference, not a provider difference. The code shows it directly:

| | Symbol: `lib/goldenEgg/optionsChain.ts` `summarizeChain` | Options analysis: `lib/options-confluence-analyzer.ts` OI analysis |
|---|---|---|
| Put/call ratio | Total put OI ÷ total call OI over **every strike** in the expiry | Totals over strikes **within ±30% of spot only** (±50% on dense, low-OI chains) |
| Highest put (put wall) | The single largest put OI **anywhere in the chain** | The largest OI **within ±15% of spot** (falls back to the nearest 10 strikes) |
| Max pain | Over every strike | Over the ±30% range, and hidden when its reliability check fails |
| Expected move | ATM IV; days counted from the **option quote date** to expiry | ATM IV; days counted from **today's New York date** to expiry (differs whenever quotes are from a previous session) |
| "Bullish/Bearish" label from put/call | Bullish below 0.8, bearish above 1.2 | Bullish below 0.7, bearish above 1.0 |

AAPL was near $333. A $220 put is about 34% below spot. It counts on Symbol (every strike), but the Options analysis
excludes it (outside ±15% for walls, and outside ±30% for the ratio). Deep out-of-the-money puts, often long-dated
hedges, raise the put total, which moves the ratio from 0.58 to 0.91. Both numbers are arithmetically right for their
own definitions; neither page says which definition it uses.

**Recommendation for Phase 2:**
- One shared options-summary function. Each figure is shown **with its strike coverage**, for example
  "Put/call OI 0.58 (strikes within ±30% of $333.63; 9 Oct expiry)". Where useful, also show the full-chain figure,
  labelled as such.
- Drop the bullish/bearish wording from put/call (two different cut-offs for the same label; a ratio is not a direction).
- Expected move in one place, with the day count anchored to the option quote date, and that date shown.

**Still unresolved: provider accuracy (outside the code).** The earlier report of a roughly 9× open-interest
difference against an independent source for AAPL 330C / 325P (#334) is about Alpha Vantage's data, not MSP's
arithmetic. Seeing the same values on MSP does not verify them. The read-only harness from #380 must be run against an
independent same-expiry source. Until then the OI figures should carry a visible "provider values not independently
verified" note.

**Also relevant: the realtime options key.** Alpha Vantage returns its artificial sample for `REALTIME_OPTIONS` with the
current key (the plain realtime endpoint needs the 600 or 1200 requests-per-minute plan). The chain then falls back to
`HISTORICAL_OPTIONS`, which is why options observations are dated to the previous session (6 Oct) while the intraday
chart shows 7 Oct prices. Decision needed: a key with that plan, the fair-value endpoint (`REALTIME_OPTIONS_FMV`, which the
code notes this key can use), or previous-session data only (`AV_OPTIONS_REALTIME_ENABLED=false`).

---

## 2. Values that are invented when data is missing (fix before consolidation)

The Phase 1 gate says missing data stays missing. These code paths substitute a value instead:

| Where | What happens | Effect on screen |
|---|---|---|
| `lib/options-confluence-analyzer.ts` `normalizeIV(raw, 0.25)` (default) and `ivAnalysis.currentIV ?? 0.25` (~line 3826) | Missing or zero IV becomes **25%** | Per-contract IV and the estimated Greeks built from it use 25% as if observed |
| same file, Greeks block | Missing provider Greeks are replaced by `estimateGreeks(…)` using that IV and a 5% rate | Estimated Greeks appear beside provider Greeks with no label |
| `components/options-terminal/OptionsConfluenceScanner.tsx` (~line 3679) | `adaptiveScore ?? confidence ?? 50` | Shows **50/100** when nothing was computed |
| `app/tools/golden-egg/page.tsx` line 439 | `confluenceScore ?? confidence ?? 0` | Shows **0/100** when the score is missing |
| Both options summaries | Put/call ratio defaults to **1.0** when there is no call OI | A neutral-looking ratio from no data |
| `app/api/scanner/run/route.ts` (legacy path) | ATR missing → `price × 2%` for levels | Overwritten later for the final row, but still present in the code |

Already fixed in #471: the scanner API refuses forex (it scored placeholder volume), and Markets panels show
"Not available" instead of $0.00.

---

## 3. Composite scores, grades, verdicts and probability-style outputs (Phase 4 list)

These are the competing outputs from the AAPL check, plus the others found on public pages. "Validated" means tested
for predictive value on unseen data.

| Page / component | Shown as | Computed in | What it measures | Validated? |
|---|---|---|---|---|
| Symbol | Assessment (Watch / Ready…), Grade A–F, indicator composite /100 | `lib/goldenEgg/engine.ts`, `lib/scoring/canonical/*` | Indicator agreement; grade = percentile of calibrated expectancy (daily equity/crypto) or raw factor alignment | **No.** The canonical calibration (Sep 2026) found no setup with an out-of-sample edge and the raw factor score uncorrelated with outcomes |
| Symbol | Time confluence /100, candle-close confluence /100 | `lib/time/*` via the Symbol API | How many timeframe closes cluster in a window | No |
| Symbol, Volatility | Breakout readiness /100 | `lib/directionalVolatilityEngine.ts`, `lib/engines/setupClassifier.ts` | Compression + conditions for release; can read 100 while "no active signal" | No |
| Scanner | Score / Agreement /100, MSP, Setup score, lifecycle (Confirming…) | `app/api/scanner/run/route.ts`, `lib/scanner/*`, `lib/analysis/scannerScoreV2.ts`, canonical | Indicator agreement (several engines) | No (labels now say unvalidated, #471) |
| Options analysis / Options terminal | Confluence /100, direction bias, primary strike and expiry confidence /100, institutional intent, cross-asset risk /100 | `lib/options-confluence-analyzer.ts`, `OptionsConfluenceScanner.tsx` | Weighted heuristics over put/call, max pain, IV, flow | No |
| Options terminal | "On hold" / permission states | same | Gate on the heuristics above | No |
| Capital Pressure (Terminal, Markets → Flow) | Confluence score /100, ALIGNED / permission, regime fit, flow align, setup quality, risk metric /100, **"Analytical Probability Matrix"** (continuation / pin / expansion %) | `lib/capitalFlowEngine.ts`, `components/CapitalFlowCard.tsx`, `components/terminal/CapitalPressureView.tsx` | Heuristic scenario weights | No. The Terminal view labels them "Scenario weights · heuristic"; the Markets card still says "Probability Matrix" |
| Deep analysis | Signal + score /100 | `app/api/deep-analysis/route.ts` ("Weighted Probability Engine") | Indicator weighting, shares inputs with Symbol | No. Agreement with Symbol is not independent confirmation |
| Crypto, Crypto explorer | Verdict (ALIGNED…), adaptive confluence /100, structure score /100 | `components/CryptoMorningDecisionCard.tsx`, crypto pages | Heuristic alignment | No |
| News, Economic calendar | News confluence /100, catalyst relevance /100 | news gate, calendar gate | Overlap / relevance heuristics | No |
| Commodities, Macro | Assessment score /100, risk score /100 | commodities and macro pages | Heuristic composites | No |
| Markets movers | "/100 alignment", Aligned / Mixed evidence / Excluded | `components/markets/MoversView.tsx` | Heuristic | No |
| Markets Decision Lens | Verdict from the scanner's level ratio and score | `components/markets/useDecisionLens.ts` | Template levels (1.5/3 ATR) + agreement score | No |
| Signal accuracy, Backtest, Journal | Win rate, ruin probability | backtest and journal modules | The user's own records or simulations | Descriptive of the sample, not a forecast. Keep, with sample size |
| `ProModeDashboard` | Win probability | `lib/signals/probability-engine.ts` | Heuristic | No. **Not mounted on any page** (dead code) |
| `SuggestionsWidget` / `TradeSuggestionCard` | Trade suggestions | | | **Not mounted on any page** (dead code; remove) |

Searches of public pages and components (admin excluded) found `/100` displays in 26 files, "verdict" in 45,
"confidence" in 48, permission words (PASS / BLOCK / permitted) in 28, and "probability" outside disclaimers in 17.
Appendix A lists the score displays.

**Marketing and outbound:**
- `app/tools/options-confluence/head.tsx`: page description "plan higher-probability options trades". Should go.
- `/api/jobs/email-best-opportunities` (email of ranked opportunities), Daily Picks (`/daily-pick`), Daily Radar
  "candidates". These push rankings to users and are the highest-risk outputs under the new approach.

---

## 4. Measured evidence to share in the snapshot (Phase 2 inputs)

These are the observations the AAPL review found most useful. Each needs one definition and its own time basis.

| Metric | Current sources (more than one = must reconcile) | Time basis to show |
|---|---|---|
| Price, change | Quote API (intraday), daily bar close (Symbol, Scanner) | Quote time vs **bar date** (e.g. 6 Oct close $333.63 vs 7 Oct 21:35 AEDT $335.10) |
| Moving averages (20/50/200) | Symbol, Scanner, canonical features (EMA vs SMA differ by tool) | Bar date; name EMA or SMA explicitly |
| ADX, RSI, ATR | Scanner run route indicators, canonical features, `lib/ta/core.ts` (TradingView-matching) | Bar date and timeframe; one implementation (`lib/ta/core.ts`) |
| Volume vs average | Scanner `volumeRatio`, canonical `volumeRatio` | Bar date; reference window stated |
| BBWP / compression | DVE (`lib/directionalVolatilityEngine.ts`) | Bar date; state "release condition met / not met" in words |
| Options: expiry, ATM strike, IV, expected move, put/call, OI walls, max pain | Two implementations (section 1) | **Option quote date** (previous session when realtime is unavailable), strike coverage |
| Greeks | Provider, or estimated (section 2) | Label "provider" or "estimated" |
| Fundamentals | Company overview (Alpha Vantage `OVERVIEW`) | **Reporting period** (fiscal quarter), not the fetch time |
| News | News page, news gate | Publication time; deduplicate articles about the same event |
| Earnings / events | Earnings calendar, economic calendar | Scheduled date and session |

**Shared inputs that look like independent confirmation:** Symbol and Deep analysis read the same indicators. Scanner,
Markets panels and Decision Lens reuse the scanner score. The Evidence summary should count each underlying
observation once.

---

## 5. Gate status (Phase 1 completion)

| Item | Status |
|---|---|
| Same-expiry put/call and OI-wall difference | **Explained** (definitions; section 1) |
| Max pain vs gamma terminology | Max pain is a pain minimisation over OI. Dealer gamma is **estimated** from OI and Greeks, not observed inventory; the Symbol snapshot already sets `dealerGamma: 'Unavailable'`. Needs consistent wording in the Options views (Phase 4) |
| Daily, intraday and options date alignment | **Explained** (realtime key falls back to previous session; section 1). Needs presentation fix (Phase 2) |
| Provider OI accuracy (330C / 325P) | **Unresolved**: needs the #380 harness run against an independent source |
| Invented values when data is missing | **Listed** (section 2), to fix in Phase 2 |
| Missing history: no fabricated ATR, stop or target | Final scanner rows clear levels without ATR. The legacy path's 2% fallback remains in code (section 2) |

---

## Appendix A: public score displays (`/100`), admin excluded

```
app/tools/golden-egg/page.tsx            indicator composite, time confluence, candle-close confluence, final score
app/tools/deep-analysis/page.tsx         signal score
app/tools/scanner/page.tsx               composite explanation
app/tools/macro/page.tsx                 risk score
app/tools/commodities/page.tsx           assessment score
app/tools/crypto/page.tsx                adaptive confluence, verdict
app/tools/crypto-explorer/page.tsx       structure score
app/tools/news/page.tsx                  news confluence
app/tools/economic-calendar/page.tsx     catalyst relevance
components/options/layer1/DecisionCommandBar.tsx    confluence
components/options/OptionsScannerPage.tsx           confidence
components/options-terminal/OptionsConfluenceScanner.tsx  confluence, intent, cross-asset risk, adaptive score (?? 50), strike and expiry confidence
components/CapitalFlowCard.tsx           confluence, regime fit, flow align, setup quality, risk metric, data health, probability matrix
components/terminal/futures/PhantomTimeCard.tsx     phantom charge score
components/terminal/futures/LiquidityParticipationCard.tsx
components/research/NewsIntelligenceCompact.tsx     overlap
components/markets/MoversView.tsx        alignment
components/markets/RightRail.tsx, components/markets/tabs/OverviewTab.tsx   agreement (relabelled in #471)
components/scanner/ScreenerTable.tsx     MSP
components/analysis/CompositeBreakdown.tsx, components/analysis/BuildingInterestPanel.tsx
components/CryptoMorningDecisionCard.tsx
components/TradeSuggestionCard.tsx       (not mounted)
```
