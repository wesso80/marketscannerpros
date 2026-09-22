# Candidate release acceptance — 22 September 2026

Code release: `df352f14544b752e553e7f45bdfc0681cd829329`. Published to main after the local Git tree matched the GitHub tree and the production build passed.

Render web deployment: `dep-daovl3jrjlhs73f44lpg`. Worker: `dep-daovl3rrjlhs73f44mlg`. Live acceptance is recorded below as observed.

No trades, watchlist entries, alerts or journal entries are intentionally created by these checks.

## Independent reference snapshot before live acceptance

Quote cross-check: META $741.245, EPS 26.54, P/E 27.92935, market cap $1.9020T, last trade September 22 at 00:15 UTC. The application provider had EPS 26.56 in the earlier audit; that denominator implies approximately 27.91x at $741.25. Small denominator differences must retain source context. ETH reference was $2,734.36 (+2.569% on that feed), so the earlier $2,775 completed-candle value cannot be compared to a later spot quote without a timestamp/basis label.

Worker deployment reached live at 03:49:24 UTC. Web deployment is checked before page acceptance.

Web deployment reached live at **03:51:30 UTC**. Both services are on `df352f1`. No application errors were returned in the checked web startup window (03:51:00–03:51:19) or worker window (03:49:24–03:50:29); these short windows are not soak-test evidence.

## Scanner → candidate inspection

Post-deploy first load completed with **20 visible table rows: 10 equities and 10 crypto**. META ranked first (72, $741.25); ETH was present (38, $2,775.43 on the completed daily basis). The ranked sample explicitly attempted 25 symbols per asset, not the full universe. One crypto row was degraded.

META inspection: RSI 77.8, ADX 54.3, ATR 27.34, 251 daily bars, last completed September 21. Flow is **UNAVAILABLE**, volume ratio/average dollar volume N/A, and agreement is **3/4** rather than falsely counting missing flow. The scanner links retain META/equity/daily into Golden Egg.

## META: live page findings after the first repair release

| Page / evidence | Observed result | Acceptance and follow-up |
|---|---|---|
| Golden Egg verdict | WATCH 54 / C; structure 80, flow 50, momentum 75, risk 60. RSI 77.8, ADX 54.3, ATR 27.34. | Permission no longer claims READY despite a blocker. Whole-packet GOOD and LIVE source badges still overstated missing options; follow-up marks degraded and distinguishes observed, computed and unavailable evidence. |
| Scenario arithmetic | Reference 749.45; stop 700.24; targets 798.66 / 823.26 / 872.47. | Distances reconcile to 1 / 1.5 / 2.5 R. These are conditional model levels, not fills. |
| Deep Analysis | Canonical WATCH 54 and daily indicators agree; volume ratio 2.39. | Canonical narrative is coherent. Percent-change differences retain quote/baseline caveats. Market cap explicitly becomes a provider snapshot. |
| Fundamentals | P/E 27.9083 at 741.25 / EPS 26.56; computed market cap 1.63T; provider cap approximately 1.70T. | P/E arithmetic fixed. Repricing market cap from a possibly incomplete share-class count was not defensible; follow-up retains provider cap with basis warning, rounds multiples and removes conflicting valuation prose. Independent cap reference differs materially and remains unreconciled to issuer share classes. |
| Earnings / fundamentals | Quarter June 30, reported July 29; EPS 6.18 versus provider estimate 7.10; TTM revenue 228.25B, net margin 29.8%, revenue growth 28%. | Internal period consistency only. These were not certified against all issuer filings. |
| Golden Egg options | Oct 16, 25 DTE on provider snapshot; average IV 62%, expected move 16.2%, P/C OI .36; zero quoted coverage; dealer unavailable. | UNUSABLE chain must degrade whole-packet trust. Snapshot date is not intraday quote time. Average-chain IV is different from ATM IV. |
| Options Terminal | Sep 23, 268 contracts / 22 expiries; zero usable bid/ask rows, unverified quote time. | Contract count is not executable coverage. Follow-up removes a remaining LIVE IV badge and clarifies empty quoted-strike results. |
| Options Confluence | WAIT / NOT ALIGNED 24, no contract, but secondary panels still showed conflicting 65/76 scores, synthetic dealer exposure, sizing and default VIX/DXY. | Follow-up suppresses all dependent decision/contract panels while blocked; dealer outputs and unsupported cross-market defaults removed at the API. |
| Intraday chart | 5-minute, 100 bars, loaded-window range 593.35–753 (21.57%); latest 23:55 UTC Sep 21. | Loaded-window/extended-hours labels replace Session. The extreme print is not independently reconciled; follow-up checks symbol, cadence, candle geometry and completion, and flags unusually wide windows. False dealer-gamma overlay removed. |
| Time Gravity | Five verified inputs: 1D, 4H, 2H, 1H, 30m; 57% expected-set coverage; target 743.65, capped confidence 59. | Source candles improved. Countdown still used UTC crypto boundaries; follow-up passes equity asset type through timing and uses regular exchange sessions, DST and early closes. |

## ETH: live page findings after the first repair release

| Page / evidence | Observed result | Acceptance and follow-up |
|---|---|---|
| Golden Egg / Deep | Spot about 2738.70 versus completed daily close 2775.43; WATCH 56 / C. RSI 72, ADX 39.6, MACD histogram 12.638, ATR 102.18, 360 daily bars. | Different spot and completed-bar prices need their respective basis. Flow was unavailable; follow-up excludes unavailable directional flow from evidence coverage and degrades whole-packet trust. |
| Scenario arithmetic | Reference 2769.35, stop 2585.43, targets 2953.28 / 3045.24 / 3229.17. | Approximately 1 / 1.5 / 2.5 R, consistent with ATR-buffered scenario construction. No trade qualification follows from arithmetic alone. |
| Network fundamentals | Cap/FDV 334.26B, supply 122,070,499, spot volume 25.49B, volume/cap 7.6%, ATH 4946.05; 20-day relative-strength ratio versus BTC 1.026. | Asset-appropriate fields, no invented EPS/P/E. Snapshot times differ; unsupported issuer-style valuation avoided. Follow-up preserves ETH through network links. |
| Intraday chart | Actual 30-minute OHLC, 48 bars, about 2738.99; window 2646.98–2804.42. | Timeframe fixed. Volume, VWAP and liquidity remain unavailable because this feed has no candle volume. Window labels clarified. |
| Crypto Terminal | Three exchanges, six contracts, sampled OI 17.27B, perp volume 33.48B. | Venue/contract distinction correct. Funding average, annualisation and crowding unavailable without rate-period identity. |
| Golden Egg derivatives | Entire section unavailable despite valid sampled OI elsewhere. | Follow-up retains OI and volume independently of missing funding. Labels PARTIAL, neutral context; no OI level is counted as directional-flow confirmation. |
| Capital Pressure | TPS 64 below threshold 68; BLOCKED; remaining API path still generated LONG_LIQ / SHORT_LIQ and positioning clusters at fixed spot offsets. | Follow-up removes fabricated liquidation levels, market-cap-derived OI change and unweighted fake VWAP. Actual observed levels remain descriptive. |
| Time Gravity | 39 sampled targets, five verified timeframes, 100% source-set coverage, target 2737.09, alignment score 72. | Actual UTC close timestamps reconcile; coverage/score are not probabilities. |
| Time Confluence | NOT ALIGNED 29, high risk; reference 2738.06, stop 2740.44, target 2717.14, 8.83 R. | Arithmetic reconciles but the very narrow scenario stop is not proven executable against daily ATR/costs. Raw bearish pull is not an eligible signal. Follow-up fixes minute reconstruction and labels US-equity windows as cross-market context on crypto. |
| Volatility Engine | BBWP 69.4, ADX 39.6, bullish compression-release signal 63; 11 historical outcomes, mean −7.27%, median −5.9%, hit rate 27.3%, dispersion 14%, low quality. | Adverse, small-sample evidence does not validate a long entry. Follow-up uses actual signal-bar OHLC rather than the later spot quote, unifies coverage with Data Quality, and calls heuristic regime weights and historical means what they are. |
| Main Research | ETH URL still showed AAPL-oriented articles, despite News Intelligence routing repair. | Follow-up reads candidate from query, filters relevant ticker scores, retains links and displays publication times. Sentiment is not labelled event impact. |

## Historical scanner results after modeled execution costs

Common settings: Daily, requested January 1 2024–December 31 2025, score threshold 70, stop 2 ATR, target 3 ATR, maximum hold 20 bars, long only, initial capital $10,000. No strategy selection was optimized after seeing the results.

| Metric | META | ETH |
|---|---:|---:|
| Applied evaluation window | Jan 2 2024–Dec 31 2025 | Apr 9 2024–Dec 31 2025 |
| Applied bars / provider | 502 / Alpha Vantage | 632 / CoinGecko |
| Trades / winners | 28 / 14 | 25 / 8 |
| Total return | +33.2% | −34.1% |
| Ending equity, rounded | $13,320 | $6,592 |
| Win rate | 50.0% | 32.0% |
| Profit factor | 1.57 | 0.69 |
| Bar-close maximum drawdown | 16.6% | 42.9% |
| Sharpe / CAGR | 1.01 / 15.42% | −0.52 / −21.40% |
| Average winner / loser | $654.88 / −$417.72 | $961.96 / −$653.15 |

The displayed assumptions were opened and checked. Entries use the next open, 5 bps adverse slippage per fill, fixed per-leg commission assumptions, adverse gap-stop fills, and next-open signal/timeout exits. If stop and target both occur in one bar, stop wins. Open positions are marked at available bar closes including estimated exit costs. Intrabar drawdown, spread, depth, funding/borrow, stressed liquidity, tax and broker-specific fees are not fully modeled. The 2024–2025 requested dates are no longer replaced by the entire fetched history. ETH evaluation starts later because available pre-evaluation warmup is shorter.

The old Realised Balance / Realised Drawdown labels were residual UI defects; follow-up chooses Marked Equity / Bar-close Drawdown when that is the actual calculation basis.

These are technical-indicator proxy tests, not a replay of historical MSP options, funding, news or permission packets. Both samples are small and neither establishes a general predictive edge. The earlier default AIO tests in the original audit were negative (META 7 trades −3.4%; ETH 5 trades −8.8%); both were rerun on b820a36 and reproduced those negative outcomes. Their statistics remain explicitly realised-balance-only, unlike the scanner engine’s marked-equity statistics.

## Explorer and crypto intelligence acceptance

ETH Explorer now shows Not aligned with disabled dependent workflow actions when the market evidence gate is incomplete, despite bullish structure. Its sampled OI was 17.30B; the missing input is comparable OI change, not the absolute OI level. The follow-up makes this distinction and labels its 100/100 structural score separately from permission. Both explorer pages are updated to read the candidate symbol directly from the research URL; crypto previously expected only a coin-ID parameter and equity required manual entry.

Crypto Intelligence correctly selected ETH treasury automatically. Holdings were 7,997,294.23 ETH across 34 entities, 6.55% of supply, approximately $21.89B at that later snapshot. Missing cost basis remains unavailable; observation-date and value-versus-cost limitations are visible. News remains explicitly broad crypto context, not verified ETH-specific conclusions.

## Liquidity-sweep source acceptance

A fresh crypto scan returned 24 symbols and 21 latest-candle sweep observations. ETH showed 2779.17, completed September 21, previous-day high/low 2645.81 / 2568.10 and prior-calendar-week levels 2655.71 / 2361.16. A fresh equity scan showed META 741.25, completed September 21, previous-day high/low 690.15 / 660.80, ATR 3.5%, bullish context. These now use completed daily candles and date their observation. The crypto daily endpoint close differs slightly from the scanner's earlier 2775.43 snapshot and is not represented as an identical observation. The high sweep hit rate still requires false-positive/outcome study; a latest-bar pattern is not proof of a stop hunt or a profitable reversal.

## Follow-up release gate

200 focused regression tests passed across the two focused groups (a stale-label expectation was updated and its 21-test file passed on rerun), including signal OHLC identity, independent OI availability, options eligibility, valuation, completed candles, marked equity and exchange-session schedules. The final production build passed, including TypeScript and all 400 static-generation tasks. Follow-up code was pushed to main as `b820a365fd6044ac45e0355db284828258492b6a`; the GitHub tree matched the tested local staged tree `6b99063863a443e0ae4d1237e9e7c3ce3583f00c`. Render web `dep-dap0938473hc739qni30` reached live at 04:34:13 UTC; worker `dep-dap093g473hc739qniv0` reached live at 04:32:15 UTC. Post-release browser observations must be recorded separately from these pre-publication findings.

## Remaining evidence required

The software must continue to withhold claims when timestamps, comparable histories or executable quotes are absent. Provider quote-time/IV history/funding-period coverage requires actual data access, not a fallback number. The META extended-hours extreme print and cross-provider market-cap scope need independent reconciliation. Broad account-role, notification, broker/portfolio and device acceptance, sustained availability, full as-of replay and forward/out-of-sample evaluation are separate gates still outstanding. This report does not certify every integration or a 5/5 institutional trading system.

## Follow-up live acceptance (b820a36)

- META Options Confluence: the entire result is now the WAIT / evidence-incomplete panel. No usable two-sided quotes; state STALE, observation UNKNOWN_REALTIME, OI expiry September 25 as context only, contract withheld, permission blocked, dealer positioning unavailable. The contradictory score/sizing/price-path panels are absent.
- Initial worker error-log window after 04:32:15 UTC returned no errors. The web window contained one generic `Backtest error` at 04:34:20 UTC; its current logging call discards the underlying exception details, so this is not a clean-error-window certification. Backtest UI is rechecked below.

- Golden Egg META: WATCH 52 / C, Data DEGRADED with explicit unusable-quote reason; quote OBSERVED, derived layers COMPUTED, options UNUSABLE. Daily equity timing shows 20:00 UTC and session closed.
- Golden Egg ETH: WATCH 54 / C, Data DEGRADED; sampled OI 17.27B, perp volume 33.51B across 3 venues is restored as PARTIAL context. Funding/annualisation remain unavailable and are excluded from directional confirmation. UTC daily close is exactly 00:00. Its DVE summary now identifies the adverse 11-sample historical mean/hit rate instead of calling it an expected forecast.

- META Fundamentals: P/E 27.91, provider cap $1.70T, elevated-multiple wording and explicit snapshot/valuation basis verified. The later Equity Explorer check still showed provider P/E 25.07; final parity patch applies the same valuation helper there.
- META chart: Window High/Low/VWAP labels, 100-bar loaded range, extended-hours warning, unusually wide-range warning and unavailable dealer overlay verified. The 593.35 low remains an unresolved source-print reconciliation, not silently changed.
- ETH Capital Pressure: synthetic liquidation/positioning clusters are absent. Actual hourly-derived EQH/EQL/UTC-window levels remain. Permission is blocked. A leftover static aligned-strategy list under that blocker is removed by the final parity patch, and displayed weighting is zero when blocked.
- Candidate Research: META correctly displays ticker-relevant dated articles; ETH correctly retains its identity but returned no articles through the old crypto-news path. Final parity patch uses Alpha Vantage’s explicit CRYPTO:ETH identity, bounds the request, removes topic-only substitution, and distinguishes provider failure from a successful empty result. Five request/response contract tests passed.
- Explorer handoffs: META and ETH both load automatically from the candidate URL. ETH structure score is labelled 100/100 separately from Not aligned permission; missing comparable OI change is distinguished from its observed absolute OI.
- ETH DVE: both input coverage surfaces now agree at 89%; signal-bar close is 2775.43, open/low 2644.73 and high 2804.42, rather than a later spot quote. Projection is labelled historical mean, low quality, 11 samples; regime weights are explicitly heuristic.
- META scanner backtest rerun reproduced +33.2% / 28 trades with Marked Equity and Bar-close Drawdown labels. AIO META reproduced −3.4% / 7 trades (PF .82); AIO ETH reproduced −8.8% / 5 trades (PF .23). No browser backtest error was reproduced in these checks. The generic earlier server error remains unidentified; final patch preserves sanitized diagnostic text for future investigation.

- META Time Gravity now shows no active overnight equity decompression windows and regular-session first closes (09:35 ET for 5m, 10:30 ET for 1h, 16:00 ET daily). Its calendar column measures elapsed time from the day anchor; the final text correction labels it From anchor, not a live countdown. Coverage remains 57% with unavailable 6h/8h/weekly inputs.
- Ranked Scanner after b820a36 again rendered 20 rows, 10 equities and 10 crypto, without the former missing-table/crypto-timeout incident. Limited-universe warnings remain visible; one returned crypto row is degraded.
- Options Terminal IV and chain badges are now degraded with quote-time warnings and 0% quoted coverage. The final text correction also removes a hard-coded +0.00% underlying price change when that feed does not provide change.

### Final parity corrections

A small final follow-up addresses residual Equity Explorer P/E, candidate-specific crypto news routing, blocked-flow strategy wording, missing backtest diagnostics, and the two time/change labels above. Five new provider contract tests passed; the targeted rerun totals 38 passing tests (33 repeat existing gates, five new). The production build passed. Two final text-only availability/calendar label corrections were made afterward and receive an additional TypeScript check; Render builds the complete final tree before live acceptance.
