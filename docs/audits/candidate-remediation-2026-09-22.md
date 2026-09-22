# META / ETH audit remediation — 22 September 2026

This follows `meta-eth-workflow-audit-2026-09-22.md`. Implementation status is not proof of deployed acceptance or predictive edge. No trades were placed.

| Workstream | Change | Verification status |
|---|---|---|
| Candle identity | CoinGecko close timestamps and actual cadence; complete UTC aggregation; reject finer bars labelled daily | Regression passed; deployed acceptance pending |
| Intraday volume | Missing volume stays unavailable; no fabricated VWAP or rolling-24h volume substituted for candle volume | Regression passed; deployed acceptance pending |
| Time Gravity | Verified crypto and equity OHLC targets; session-anchored complete equity aggregates; distinct-timeframe confidence; manual refresh | Regression passed; deployed acceptance pending |
| Equity sessions | New York timezone, DST, holidays, early closes and Saturday New Year rule | Regression passed |
| Liquidity sweeps | Real daily candles, calendar-week levels, active wick must occur on latest completed candle | Regression passed; deployed acceptance pending |
| Golden Egg | Any unresolved primary blocker downgrades trade readiness | Regression passed; deployed acceptance pending |
| Options | Real listed expiry, matching side/strike, positive bid/ask coverage, actual IV coverage, missing quote-time gate | Regression passed; deployed acceptance pending |
| IV history | Rank/percentile unavailable without comparable historical IV; no invented 25% current IV | Historical dataset still required |
| Capital flow | Remove synthetic crypto call/put walls and inferred dealer gamma | Regression passed; deployed acceptance pending |
| Funding | Withhold cross-contract aggregate/annualisation without interval identity; distinguish contracts and venues | Provider interval data still required |
| Fundamentals | P/E uses displayed price and reported EPS. Market cap retains its provider snapshot basis; unverified share-class counts are not used to reprice total company value | Regression passed; deployed acceptance pending |
| Explorer metrics | Remove false SPY-relative-return and RVOL formulas | Genuine matched histories still required |
| Research handoffs | DVE, News, Options and Crypto Intel retain candidate identity | Implementation verified; deployed acceptance pending |
| Narrative/calendar | Remove score-direction inversion, stale AI summaries, inferred earnings sessions and unsupported current calendar regime | Implementation verified; deployed acceptance pending |
| Backtest execution | Next-open entry, adverse slippage, per-leg commission, gap stops, next-open signal exits, marked open positions | Regression passed; deployed acceptance pending |
| Historical validity | Identify scanner as technical proxy; disclose sample limits | Full as-of MSP replay and out-of-sample validation remain outstanding |
| Operational acceptance | Initial release df352f1 built, published and live on Render web+worker; live META/ETH retest found additional defects | Follow-up release and verification recorded in candidate-release-verification-2026-09-22.md |

## Provider contracts

CoinGecko's [OHLC contract](https://docs.coingecko.com/reference/coins-id-ohlc) describes automatic 30-minute, four-hour and four-day resolutions depending on range; daily/hourly requests must be explicit and validated. OHLC lacks candle volume and uses close timestamps. A rolling volume sample is not a candle volume.

The [NYSE calendar](https://www.nyse.com/trade/hours-calendars) defines regular hours, holiday closures and scheduled early closes. Saturday New Year does not close the preceding Friday. The application still needs calendar maintenance for exceptional unscheduled closures.

## Honest remaining limits

A missing provider observation cannot be repaired by assigning a plausible number. The release must show unavailable and block any dependent claim. A 5/5 readiness claim additionally needs sustained provider availability, timestamped usable options quotes, reconciled historical data, user acceptance across roles/devices, and out-of-sample evidence; this implementation pass alone cannot establish those.

## Release verification

- 121 focused tests passed before the final corrections.
- Full suite: 1,742 passed, 13 skipped, one source-text calendar assertion failed. The explicit unconfigured-provider guard was restored alongside the stronger empty/unconfirmed-evidence guard; its 9-test suite then passed.
- Final candle, options, valuation, next-open execution, marked-equity and production-audit gates: 45 passed. This includes removal of invented snapshot times and dealer exposure.
- TypeScript passed. Production build and live Render acceptance are recorded below when complete.

### Material behavior changes

Funding averages/annualisation and dealer gamma now show unavailable when their required source contracts are absent. Crypto volume-based scalping/quant indicators require real interval OHLCV rather than relabelled CoinGecko data. Time Gravity bypasses legacy stored targets and builds from confirmed source candles; unavailable timeframes reduce coverage. Historical scanner figures will change because costs, entry timing, gap stops, capital availability and open-position valuation are now applied.

### Remaining acceptance beyond this code release

The original broader audit also calls for paid/free account and tenant isolation checks, real notification delivery/idempotency, portfolio opening capital and external-cashflow reconciliation, broker-compatible derivative valuation, accessibility across devices, and operational soak monitoring. Existing automated checks cover parts of these, but this candidate release does not certify every external integration or account role. Full as-of multi-source scanner replay, comparable IV/funding history, verified earnings/filing sources and out-of-sample forward evidence still need actual datasets and observation time.

Final full-suite rerun: 1,743 passed, 13 skipped, one existing Monte Carlo stress case exceeded its 5-second timeout under concurrent build load. Its entire 13-test file passed in isolation. The additional options decision-precedence gate then passed 18 focused checks: no quotes, missing IV, unavailable expiry or unverified quote timing now propagate WAIT through the quality badge, entry timing and trade snapshot.

A full production build passed with build-only placeholder settings (no runtime secrets or live database). The final build after the decision-precedence adjustment also passed: compilation, TypeScript, and all 400 static-generation tasks. No synthetic provider credentials or local build output are deployed.

The GitHub release tree was compared byte-for-byte by Git tree hash with the staged local source before publication. Deployed page acceptance follows in the release evidence supplement.

### Live acceptance follow-up

The first release was not treated as blanket acceptance. Live navigation exposed residual unsafe options panels, synthetic liquidation levels in another API path, main Research still loading AAPL, unverified market-cap repricing, and equity countdowns using crypto boundaries. The follow-up removes these paths, restores sampled crypto OI independently of unavailable funding, propagates trust degradation, and corrects DVE signal-bar identity and historical-statistic labels. The release supplement records the actual page readings, adverse backtest evidence and limits.
