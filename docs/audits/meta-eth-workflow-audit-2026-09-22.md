# META and ETH: live candidate workflow audit

Audit date: 22 September 2026. Live observations began around 02:07 UTC. Browser display timezone: Australia/Sydney. This is a point-in-time software/data audit, not a forecast or an executed trading record.

## Conclusion

**Neither candidate passes an execution-quality evidence review.** META has a strong, extended daily trend; ETH has a bullish but extended daily trend with weaker alignment. Both deserve research attention. Neither has a sufficiently consistent, verified chain of evidence across the application to justify treating its green labels as execution permission.

The platform is **not 5/5 for institutional decision support**. The scanner now returns visible candidates, and several core calculations reconcile. However, materially incorrect timeframes, synthetic positioning, inconsistent permission gates, mislabelled metrics and unreliable performance evidence remain. Successful page loads are not a passing data audit.

I selected **META** from the top of the actual Daily ranked equity queue and **ETH-USD** from the actual Daily crypto results. I retained those identities throughout the review and recorded where the application lost them. No trades, alerts, watchlist entries or journal records were intentionally created.

Scope: the candidate research views and shared context lenses enumerated below, including both scanner replay and the default AIO strategy. Redirects/embedded versions are treated as the same underlying view. This is not a certification of every symbol, expiry, timeframe, strategy, mobile breakpoint, admin/billing screen, or unrelated new-token/DEX discovery module. Unavailable data is an audit outcome, not a successful validation.

## Candidate evidence that reconciles

| Measure | META | ETH-USD | Assessment |
|---|---:|---:|---|
| Daily analysis price | $741.25 | $2,775.43 | Agrees across Scanner, Golden Egg and Deep Analysis; ETH is not consistently a current spot quote. |
| RSI(14) | 77.8 | 72.0 | Agrees across the main daily research views. Both are extended readings. |
| ADX | 54.3 | 39.6 | Main daily views agree; trend-strength measure, not a probability or direction by itself. |
| MACD histogram | 10.870 | 12.638 | Agrees across main daily research views. |
| ATR | $27.34 / 3.69% | $102.18 / 3.68% | Agrees across main daily research views. |
| Golden Egg components | Structure 80, flow 75, momentum 75, risk 60 | Structure 87, flow 56, momentum 64, risk 60 | Weighted results reconcile to approximately 73 and 68. These scores are not success probabilities. |
| Golden Egg result | Aligned 73; LONG; B; READY | Watch 68; LONG; B; WATCHING | META's readiness conflicts with its own extension blocker and other gates. ETH's Watch is more defensible. |
| Primary concern | Approximately 4.3 ATR above the 20-period mean | Approximately 2.6 ATR above the 20-period mean | A strong trend is not sufficient evidence that a new entry has acceptable timing. |

The initial scanner showed META MSP 72 and evidence 75. ETH's queue score was 35, with evidence 67; on a later refresh its detail panel fell to 30/D after volume became unavailable. Golden Egg subsequently obtained volume and showed GOOD. Some of that difference is genuine fetch/coverage variation, but there is no shared snapshot identity explaining the transition to the user.

## Equity workflow: META

| Page or lens | Observed data and outcome | Audit result |
|---|---|---|
| Ranked Scanner → Analysis | Daily breakout/volatility-expansion candidate, bullish, extended; range-break confirmation needed. RSI/ADX/MACD/ATR agree with Golden Egg. 251 completed bars. | **Conditional.** Discovery works. “4/4 evidence agrees” is stronger than the actual entry confirmation. Session dollar volume appears under an average-liquidity label. |
| Golden Egg Verdict | Aligned 73, READY, LONG, with an explicit extension blocker. Reference 741.25; stop 700.24; targets 782.25, 802.76, 843.77. | **Fail readiness.** Level arithmetic is coherent; an unresolved blocker does not govern the displayed permission. |
| Deep Analysis | Canonical score/levels and indicators agree. Volume ratio 2.37x. Price change 11.34% versus Golden Egg/Fundamentals 11.42%. AI repeats the bullish scenario. | **Conditional evidence; fail consistency.** Quote-change bases differ. AI interpretation is not independent confirmation. |
| Fundamentals | Price 741.25, P/E 25.07, EPS 26.56, market cap 1.70T; latest quarter June 2026; target 755.28; next earnings November 4, estimate 6.39. | **Fail valuation coherence.** Price/EPS implies 27.91x, not 25.07x. The reported ratio implies a price near 665.86. Likely mixed snapshot times, not evidence of current cheapness. Filing figures were not independently certified against the issuer filing. |
| Golden Egg Chart | Daily case opens a 5-minute intraday view. 100 bars; chart price 740; change 3.29%; “Session” high 753, low 593.35. | **Fail labelling.** Range, change and VWAP are calculated over the loaded window, which is not necessarily one session. Daily-to-intraday transition needs explicit context. |
| Terminal Close Calendar | Correct equity symbol; equity session schedule shown. Multiple daily periods cluster at 16:00 ET. | **Conditional.** Session/calendar basis needs holiday, early-close and current-time acceptance tests. A calendar cluster is timing context, not directional evidence. |
| Options Terminal: Sep 23 | 268 contracts, no usable two-sided quotes, zero visible tradable rows; nevertheless “LIVE” and 58% coverage. | **Fail execution quality.** Contract count is not quote coverage; retrieval time is not quote observation time. |
| Options Terminal: Oct 16 | Same expiry as Golden Egg; 334 contracts, all without usable two-sided quotes. ATM IV 45.9%; expected move about $89/12.0%; 25 DTE. | **Fail execution quality.** No contract can be selected from this data for a defensible entry/exit cost. “73% coverage” is misleading. |
| Golden Egg Options | Calls chain GOOD, average IV 62%, expected move 16.2%, put/call OI 0.36; IV rank correctly unavailable. | **Fail quality gate.** GOOD ignores the absence of bid/ask coverage. Chain-average IV versus ATM IV is a legitimate methodology difference, not automatically a numerical defect. |
| Options Flow | Analyze Flow returns unavailable: 0% usable bid/ask coverage. | **Pass fail-closed behaviour.** No verified directional flow can be inferred. |
| Options Confluence | Matched Oct 16 run: NOT ALIGNED/F / 24, bearish, 12% expected move, OI P/C 0.26. Yet proposes 740 PUT, a 270 PUT alternative, and September 27 expiry while its OI panel uses October 16. | **Critical contract-identity fail.** September 27 is Sunday and is absent from the listed chain. Expiry recommendations are generated from offsets rather than constrained to the selected/listed expiry. No acceptable option contract established. |
| Capital Pressure | Bullish 100/100 directional score, but TPS 59 below threshold 78; BLOCKED, defensive, NOT ALIGNED. Negative gamma versus Golden Egg positive gamma. | **Conditional.** Blocking permission is appropriate; the extreme directional score and differing gamma models need scope/expiry disclosure. |
| Time Gravity | Target 744.60; confidence 60% with sparse coverage, only 1H/4H. Equity calendar contains midnight-hour closes. | **Fail session identity.** The widget receives/defaults the wrong asset-session context; repeated same-timeframe points are not independent timeframe confirmation. |
| Time Confluence | Bearish, not aligned, score 56, high risk; 741.25 reference, 753 stop, 687.46 target, 4.58R. Supporting MPE reports ADX 30 and IV rank 80. | **Fail evidence consistency.** Reward/risk arithmetic works, but ADX differs and the supposed IV rank is a current-IV heuristic, not measured historical rank. |
| Volatility Engine | URL context ignored until META entered manually. BBWP 88.5, ATR 27.34 agree. Expansion confluence 92, direction 49, no active signal. | **Conditional.** Correct core numbers; coverage measures disagree, and labelled next-regime probabilities are not validated probabilities. |
| Equity Explorer | Price 741.25, Conditional, bullish/strong. “vs SPY +11.42%”; RVOL proxy 0.03x. | **Fail metric definitions.** Source uses META's own daily return as relative strength. RVOL divides shares traded by market cap/1000, not comparable volume. |
| Liquidity Sweep | META 741.25, bearish ACTIVE SWEEP 55; nearest round level 740; ATR 3.5%. 37 of 39 equities labelled active sweeps. | **Conditional, unvalidated.** Pattern timestamp/expiry is missing; an “active” label needs evidence the detected historical pattern remains active now. Not interchangeable with daily trend direction. |
| Research News | META handoff opens an AAPL-oriented feed. | **Fail identity.** Wrong candidate news is not META evidence. |
| Earnings | META November 4, EPS estimate 6.39 agrees with Fundamentals. | **Internal consistency pass only.** Provider schedule is not independently confirmed issuer guidance. |
| Scanner Backtest, before repair | UI says applied 2024–2025/502 bars, but trades begin in 2013 and run through September 2026: 174 trades, displayed +152.7%. | **Critical fail. Reject all displayed performance from that run.** Engine traded the entire fetched history instead of the requested window. |

META's Golden Egg risk distance is 741.25 − 700.24 = **41.01**. Target distances of about 41.00, 61.51 and 102.52 represent approximately **1R, 1.5R and 2.5R**. These are coherent model scenarios; the audit does not validate them as profitable targets.

## Crypto workflow: ETH

| Page or lens | Observed data and outcome | Audit result |
|---|---|---|
| Ranked Scanner → Analysis | Actual Daily candidate. Price 2775.43, RSI 72, ADX 39.6. A later read has missing volume and DEGRADED/D30, but still “4/4 agree”, including flow. | **Fail evidence completeness.** Missing volume must not remain affirmative flow confirmation. |
| Golden Egg Verdict | Watch 68, LONG/B; 360 daily bars, GOOD, 20-day dollar liquidity 14.66B. Reference 2806.08; stop 2622.16; targets 2990.01/3081.97/3265.90. | **Conditional.** Math and extension warning reconcile; data trust overstates coverage of the whole research packet. |
| Deep Analysis | Same daily indicators, score and model levels. Volume ratio 1.86x. Shows +0.00% versus Golden Egg +3.09%. AI says a decrease in score would improve confluence. | **Fail change basis and AI reasoning.** The quoted logical inversion is incorrect. Neutral sentiment also does not establish “no significant impact expected.” |
| Crypto Fundamentals | Market cap/FDV 334.65B, circulating supply 122,067,646; spot volume 25.28B; 7d +9.0%, 30d +13.2%; ATH 4946.05. No corporate EPS/PE invented. | **Partial pass.** Asset-appropriate fields; price/supply/market-cap snapshots are not synchronized. Funding annualisation remains unsupported. |
| Golden Egg Chart | Displays 5 Min, 48 bars, price 2747.46, average volume 0, liquidity Thin, VWAP exactly 2747.46. | **Critical timeframe/volume fail.** One-day CoinGecko OHLC is 30-minute candles. Missing volume is filled with zero; fallback last price masquerades as VWAP. |
| Crypto Terminal | Spot about 2741.74, cap 334.52B, volume 25.31B. Two contracts on one venue yield OI 4.54B, but heading says “2 Exchanges”. Funding average 0.0095%, annualised 10.4%. | **Fail scope/rate labelling.** Two contracts are not two venues. Funding interval is not supplied, so an eight-hour annualisation is not established. |
| Golden Egg Derivatives | OI 7.65B, two venues, funding median 0.0090%, annualised 9.9%, volume 11.97B. | **Conditional OI snapshot; fail funding basis.** Different venue samples explain some differences but cannot be compared as whole-market totals. |
| Capital Pressure | TPS 62 below 68, BLOCKED. Positive gamma; model strikes 2733.80/2817.06 labelled put/call-heavy. | **Critical synthetic-evidence fail.** Source fabricates missing crypto clusters at spot ×0.985/1.015 and assigns put/call-heavy labels. This is not observed options positioning or liquidation data. |
| Time Gravity | Spot 2743.36, target 2741.80, “100% confidence (sparse data)”; only 30m/daily inputs. “1D” points occur every four hours. | **Critical timeframe fail.** Source passes auto-granularity 30-day OHLC (four-hour candles) into a daily midpoint processor. Repeated 30m points cannot justify 100% independent-timeframe confidence. |
| Time Confluence | Bearish, not aligned 57, high risk; current 2743.36, stop 2757.94, target 2708.33; 2.40R. | **Conditional math; unreliable upstream.** R/R reconciles, but timing interpretations inherit inconsistent series and timeframe inputs. |
| Crypto Asset Explorer | Price 2743.98, +2.90%, bullish/100% aligned/permission Aligned; top gate says hard blocks, missing OI and delayed funding. OI overlay 17.31B. | **Fail permission precedence.** The top gate and asset permission disagree. Seven-day relative strength −0.88% vs BTC is a different horizon from Golden Egg's 20-day ratio 1.026. |
| Crypto Command | Cap 2.91T, BTC dominance 58.8%, ETH 11.5%; regime/breadth/funding/OI-trend gate unavailable. | **Conditional.** Missing values are clearly shown, but “High-Quality Setups Only” is still attached to top percentage gainers. Market movement is not setup quality. |
| Crypto Heatmap | ETH around 2744, +3.02%; market-wide performance context. Comparable funding and OI change correctly unavailable. | **Partial pass.** Useful context. Retrieval freshness and legacy migrated assets still require cleanup. |
| Derivatives Dashboard | ETH OI 17.31B, explicitly a top-three-venue sample. 24h comparison, funding, long/short and verified liquidations unavailable; scenarios withheld. | **Pass withholding behaviour.** Cannot validate an ETH derivatives trade; coverage disclosure is substantially better than Terminal/Golden Egg. |
| Crypto Intel | Broad market news with relative ages; ETH handoff initially selects BTC treasury. ETH selected manually. | **Conditional.** Broad news is useful context, but not automatically ETH-specific evidence. Headlines were not individually fact-checked. |
| ETH Treasury | 7,997,294.23 ETH, 21.94B total value, 34 entities, 6.55% of supply. Missing cost basis shown unavailable; observation-date warning displayed. | **Internal arithmetic/disclosure pass.** Holdings/current valuation are not realised P&L. No filing-level verification of all 34 entities. |
| Volatility Engine | Symbol lost on handoff; manual ETH run: BBWP69.4, bullish direction29, compression-release-up65. Historical projection −7.27%, hit27.3%, 11 samples, dispersion14%, average5.1 bars. | **Low-quality research only.** Page correctly warns that the projection is unstable. It does not validate a long entry; Golden Egg's brief summary needs the same sample-quality warning. |
| Research News | ETH handoff also opens AAPL-oriented news. | **Fail identity.** Crypto Intel contains more suitable context. |
| Liquidity Sweep | ETH 2775.43, change +0.46%, bearish ACTIVE SWEEP 57, ATR 1.4%; “PDH” 2772.97. 22 of 24 returned coins marked active. | **Critical timeframe fail.** Auto-granularity 30-day OHLC is four-hour data, but code treats adjacent bars as days and five bars as a week. The displayed change is not a verified 24-hour return. |
| Equity options pages | Crypto Terminal intentionally exposes a crypto mechanics path instead of an equity chain. | **Not applicable.** No verified ETH options/Deribit integration was established; equity-style option-contract conclusions must not be transferred to ETH. |

ETH's Golden Egg reference-to-stop distance is **183.92**. Target distances of 183.93, 275.89 and 459.82 reconcile to approximately **1R, 1.5R and 2.5R**. This differs from the scanner's 1-ATR preliminary stop because they are different model constructions, not necessarily arithmetic errors. They need clear labels and a preserved case snapshot.

## Shared research context

| Page | Outcome |
|---|---|
| Sectors | Communication Services/XLC +3.88%, leading the displayed sectors; relevant supporting context for META. Weekly/monthly/YTD explicitly absent. Sector weights have no visible as-of basis. |
| Cross-Market | Explicitly labelled static educational relationships, not live readings. Appropriate disclosure; do not count as contemporaneous confirming signals. |
| Economic Calendar | Basic view omits important country/timezone/source-quality detail. Missing forecast/actual values cannot support surprise analysis. |
| Calendar Intelligence | Better disclosure: live provider NOT_CONFIGURED; curated seed; 0 live, 8 missing and 60 unconfirmed events. Source links and local-time conversion present. Nonetheless Risk-On/Compression/Stable labels remain beside the unavailable-data warning. Treat as schedule context only. |
| News Intelligence | Says no news from the last 24 hours and current sentiment unavailable, yet retains an AI bullish AAPL/MSFT/GOOGL summary. Stale AI narrative must not override the current-data gate. |

## Source reconciliation

The quoted numbers were captured at different moments. A later ETH quote near 2744 cannot, by itself, prove an earlier 2775 quote was wrong. The stronger defect is that the code prioritises a completed-series price and stamps it with retrieval time, then presents it alongside current market-cap/change fields as a live quote. Source observation time, candle close, retrieval time and valuation snapshot must be distinct.

[CoinGecko's official OHLC contract](https://docs.coingecko.com/reference/coins-id-ohlc) confirms that automatic one-day candles are 30 minutes, automatic 3–30-day candles are four hours, and timestamps identify candle closes. That directly supports the chart and Time Gravity defects. [CoinGecko ETH historical data](https://www.coingecko.com/en/coins/ethereum/historical_data) showed a September 21 close of 2775.17, close to the application's 2775.43 daily basis; the tiny difference is not evidence of fabrication.

An independent finance quote during the audit returned META 741.245, change 11.33759%, EPS26.54 and P/E27.92935. This supports the price and the approximately 27.9x implied current P/E. The issuer's June-quarter filing was not accessible for a complete primary-source verification, so revenue, EPS, analyst counts and earnings-date precision remain provider observations rather than independently certified facts.

## Repairs completed in this audit

Commit **94a07d2017ddb9674e4521b4fda8a50796a3ef05**:

- Scanner historical trades/scores now stay inside the requested inclusive dates; earlier bars are only indicator warmup. Coverage reflects the actual evaluated bars. Invalid dates/ranges and empty evaluation windows are rejected.
- Deep Analysis and Options Research no longer implicitly create paper trades when research is run.
- Pro crypto histories run within a bounded budget with per-symbol exclusions. Twenty-four-hour market volume no longer fills missing candle volume in that path.
- Scanner requests retain supported horizons, including 30m; unsupported horizons are rejected. Derivative OI uses validated, deduplicated observed USD values; unverifiable funding intervals/positioning changes are withheld in the scanner summary.

Validation: production build passed; targeted suites passed. Full suite: 1,733 passed, 13 skipped, one Monte Carlo stress-test timeout under concurrent load. The entire 13-test Monte Carlo file passed in isolation. This is not a claim that every financial formula in the application is validated.

## What prevents a 5/5

1. **Correct the source contracts first:** actual candle cadence everywhere, completed/open-bar identity, unit-correct measured volume, real observation timestamps and stable venue/expiry coverage. Remove or explicitly quarantine all synthetic positioning/IV-rank/liquidation claims.
2. **Make one permission gate authoritative:** a missing required input or unresolved blocker must govern all child panels and AI summaries. “Aligned”, “READY” and “blocked” must not coexist for the same scoped decision.
3. **Preserve the research case:** symbol, asset class, timeframe, expiry and snapshot identity through every handoff. Compare like periods and label deliberate intraday/context transitions.
4. **Validate historical methodology beyond the repaired dates:** the scanner replay is a technical-score proxy, not a full replay of the current multi-source MSP decision engine. It still needs explicit execution costs, fill/gap assumptions, mark-to-market risk, and out-of-sample/forward evidence before performance claims.
5. **Expose concise reasons and missing evidence:** users need the governing blocker, next check and source age close to the verdict. Remove unrelated metrics and duplicated competing interpretations from the decision path.

The next release should prioritise the critical candle/volume/positioning defects before visual polish. A 5/5 rating requires repeatable acceptance runs with clean data and decision consistency, plus operational observation over time; it cannot be earned by relabelling this report.

## Post-deploy verification

Repair 94a07d2 is live on Render: web deployment `dep-daouj4o473hc739p7h1g` finished 02:39:13 UTC; worker deployment `dep-daouj50473hc739p7htg` finished 02:37:00 UTC.

The completed META October 16 Options Confluence test returned NOT ALIGNED/F / 24, high risk. Its risk-distance calculation of approximately 0.3R is consistent with the underlying reference/stop/target, but the contract recommendation is rejected: selected OI expiry October 16 versus generated expiry Sunday September 27. The page simultaneously displays confidence 24, adaptive 65, setup 72 and composite 68 without making their different purposes sufficiently clear. “IV Rank 65%” remains a heuristic, “Fill Quality 1.00” is not supported by the empty bid/ask chain, and an invalidation above spot is worded as “price loses” the level. A displayed risk-product equation evaluates to zero because of a gate, but omits that gate from the displayed multiplication. Long-gamma and negative-gamma panels coexist. These are outstanding defects, not repaired by the historical-date fix.

**META historical recheck passed the date-window test.** Requested January 1, 2024–December 31, 2025; actual trading dates January 2, 2024–December 31, 2025; 502 bars. Parameters: Daily scanner proxy, score ≥70, stop 2 ATR, target 3 ATR, maximum 20 bars, long-only, initial $10,000. Result: 28 trades, 14 wins/14 losses, +43.6% gross model return, profit factor1.77, realised drawdown11.6%, Sharpe1.11, CAGR19.85%, average winner714.12 and loser−402.59. These are diagnostic model outputs, not validated live-scanner returns: fills/costs and realised-only risk remain limitations. The previous 174-trade/+152.7% result is invalid for these dates and must not be compared as an improvement or deterioration in strategy performance.

The original observations above remain preserved even where a repair changes the outcome.

**ETH historical recheck passed the date boundary, but not full requested coverage.** The same January 2024–December 2025 request and scanner parameters yielded an actual April 9, 2024–December 31, 2025 evaluation window, 632 daily bars. Limited fetched history consumed the earlier period as the 200-bar warmup. Result: 25 trades, 9 wins / 16 losses, −20.9% gross model return, PF 0.83, realised drawdown 39.4%, Sharpe −0.14, CAGR −12.66%, average winner $1,159.79 and loser −$782.84. Trade history was checked across both pages. This provides no positive historical support for the long scanner proxy in that window. It is not directly comparable with META's longer applied period. CoinGecko historical OHLC lacks volume; this scanner replay does not yet surface that missing input sufficiently, and it is not a replay of the current full scanner.

The Options Research source review also found a second automatic promotion path through workflow events. A follow-up removes implicit `trade.plan.created` events while retaining research evidence packets, preventing this page from creating plan-driven alerts/journal drafts or execution merely because a confidence threshold is reached.

**ETH default Strategy engine:** MSP Day Trader AIO (Score 5+), Daily, requested 2024–2025, 731 reported bars: 5 trades (2 wins / 3 losses), −8.8%, PF 0.23, realised drawdown 11.5%, Sharpe −0.84. Its diagnostics label the run invalidated and flag low sample size/negative expectancy. Five trades cannot establish a statistically dependable edge. This is a separate strategy engine, not the 25-trade scanner proxy, and its returns must not be merged with that test.

**META default Strategy engine:** same AIO/Daily/2024–2025 configuration: 7 trades (2 wins / 5 losses), −3.4%, PF 0.82, realised drawdown 11.5%, Sharpe −0.11; diagnostics 25/100, invalidated, low sample size/negative expectancy. This does not confirm the positive scanner-proxy result. Distinct rules, long/short participation, sizing and cost assumptions prevent a direct strategy comparison. No parameter search or cherry-picking was performed to produce a better-looking result.

| Diagnostic historical run | Actual evaluation coverage | Trades | Return displayed | PF | Research conclusion |
|---|---|---:|---:|---:|---|
| META scanner proxy | Jan 2, 2024–Dec 31, 2025 | 28 | +43.6% | 1.77 | Positive gross model result; not an execution or full-scanner validation. |
| ETH scanner proxy | Apr 9, 2024–Dec 31, 2025 | 25 | −20.9% | 0.83 | Negative result; missing earlier warmup coverage and volume caveats. |
| META default AIO strategy | 2024–2025, 502 bars | 7 | −3.4% | 0.82 | Negative, underpowered sample; no confirmed edge. |
| ETH default AIO strategy | 2024–2025, 731 bars | 5 | −8.8% | 0.23 | Negative, underpowered sample; no confirmed edge. |

## Reproduction map

| Finding | Source location |
|---|---|
| Historical date window fixed | `app/api/backtest/scanner/route.ts`; `lib/backtest/scannerBacktest.ts`; `test/scannerBacktestWindow.test.ts` |
| Crypto chart wrong interval / missing-volume VWAP | `app/api/intraday/route.ts`; `app/tools/intraday-charts/page.tsx` |
| Four-hour candles stored as daily midpoints | `app/api/time-gravity-map/route.ts` |
| Four-hour candles used for daily sweep levels | `app/api/liquidity-sweep/route.ts` |
| Synthetic crypto clusters and gamma interpretation | `lib/capitalFlowEngine.ts`, `buildCryptoClusters` and crypto gamma branch |
| Unsupported historical IV rank / generated expiry dates | `lib/options-confluence-analyzer.ts`, IV analysis and `selectExpirationFromConfluence`; `app/api/market-pressure/route.ts` |
| False SPY-relative strength / dimensionally invalid RVOL | `app/tools/equity-explorer/page.tsx` |
| Live quote timestamps and mixed bases | `lib/goldenEggFetchers.ts`, `fetchPrice` |
| Permission computed before blocker | `lib/goldenEgg/engine.ts` |
| Automatic plan promotion removed | `app/tools/options-confluence/page.tsx`; downstream side effects in `app/api/workflow/events/route.ts` |

Raw evidence: `candidate-evidence-2026-09-22.md`, `candidate-evidence-2026-09-22-part2.md`, and subsequent capture supplement. These retain the actual displayed wording and values for review.
