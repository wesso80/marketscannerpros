# Crypto strategy reset — 28 September 2026

Six weeks is not the base holding period or a universal eligibility gate for crypto. The objective is positive expectancy after fees/slippage with bounded drawdowns, including opportunities lasting hours or days. The QNT chart is a discovery failure example, not evidence that the full trough-to-peak return was executable.

## Verified implementation gaps

- The fixed admin watchlists excluded QNT. Major-exchange discovery now finds its CoinGecko ID without requiring static membership.
- Paper selection still uses intraday scores mixed with weekly/daily position levels. The new momentum review does not yet replace this path.
- `positionEngine.markAndMaybeExit` performs full exits at fixed targets. It has no partial exit or trailing-stop state.
- Crypto 15m scans now carry up to 96 completed scanner candles into edge packets. Fixed-stop paper positions replay complete post-entry candles chronologically, with adverse gap fills and stop-first treatment when both levels are touched. The entry-containing candle is excluded and disclosed because its extremes can predate entry. Missing prefixes, gaps, duplicates or changed stops fall back to quote checks with explicit cycle notes. This remains bounded scan-dependent coverage, not independent continuous monitoring; validated journal checkpoints now let longer positions resume from the last fully checked candle after old candles roll out of the window. A gap since that checkpoint still fails closed for candle replay. Checkpoints include the original entry time, side, stop and nearest target; rule changes invalidate them. Checkpoint and mark writes share the existing cycle transaction, and unchanged snapshots do not write duplicate checkpoints. The full-exit model now selects the nearest profitable resting target, including when a later quote crosses several targets.
- R now uses original filled-order risk through a workspace/portfolio-scoped source-order join, independent of the current position stop or quantity. Missing original evidence leaves R unknown. Source-order fill facts must remain immutable; partial fills still need a proper cash/P&L ledger.

## New development direction

1. Discover active, liquid coins on named major venues. Preserve coin identity, actual coverage, price times and reasons for exclusion. A listing does not prove executable depth.
2. Evaluate momentum with completed daily context, 4-hour structure and hourly triggers. Keep early developing setups visible. No completed weekly/monthly alignment requirement. Current SMA/ATR rules are explicit research hypotheses; do not treat them as proven or the only viable strategy.
3. Replay entry alternatives: initial expansion, breakout retest and trend pullback. Include failed breakouts and flat periods, not only QNT or winners. Check whether daily trend requirements delay early reversals.
4. Compare exit alternatives: full structural exit; partial realization plus a trailing runner; volatility/structure-based trailing without partials. Test parameter grids on training periods only, then frozen out-of-sample periods. A model 2R target in the review is a reference scenario, not the selected production exit policy.
5. Build immutable initial risk, partial-fill accounting, realized/unrealized P&L reconciliation, high-water state and a ratcheting stop that never loosens. Separate short-lived setup invalidation from a blanket minimum holding period.
6. Implement chronological price-path monitoring for open positions independent of discovery ranks and scan eligibility. Where OHLC cannot establish stop/target ordering, use conservative ordering and report ambiguity. Never fill at an unattainable price after a gap.
7. Carry one versioned momentum plan through selection, order creation, fill revalidation and exits; do not disguise it as weekly position levels or bypass account/price/liquidity limits. Keep strategy results separate from legacy paper trades.

## Evaluation

Measure net expectancy in R, drawdown, profit factor, exposure time, missed-opportunity reasons, maximum favorable/adverse excursion, and how much favorable excursion is retained at exit. Use quote/spread evidence and pessimistic slippage sensitivity. CoinGecko OHLC has no per-candle volume: no volume confirmation may be manufactured. Prove timestamps/closed-bar handling with replay before connecting new rules to automatic paper orders.

## Current boundary

The discovery and candle-review pages are research only. Existing paper entries still use the legacy strategy. Exit accounting has the original-risk and nearest-target corrections above; momentum entries, independent continuous exit monitoring, trailing stops and partial exits are not yet enabled. Candle-derived exit times are recorded as the candle-close upper bound, with source and ambiguity in the exit journal. BUY/SELL source orders are normalized when resolving original position risk. No real-order execution is introduced.

## Mechanical validation checkpoint — 28 September 2026

Production paper fill and exit functions now debit entry fees, retain the charged amount in the existing scoped fill journal, and include both fees in closed-trade P&L/R. Portfolio realised P&L expenses the entry charge immediately and does not deduct it twice at exit. Legacy fills retain zero entry fees because none were charged. Cash sufficiency includes the entry fee. Manual closes use a transaction and the same portfolio row lock as the scheduled cycle, then re-read balances and open positions.

The isolated round-trip suite exercises the actual order, fill, exit, balance, journal and closure-learning calls against an in-memory persistence boundary: long/short targets, adverse stop gaps, flat manual closes, intrabar target/reversal, and insufficient cash. Additional tests cover fee evidence reload, stale fills, exit checkpoints and manual-close locking. This is deterministic mechanical coverage, not a live database concurrency test, historical strategy backtest or live paper track record. No test trades are inserted into production. The momentum entry/monitoring connection remains unfinished.

## Temporary discovery-only admin scope — 28 September 2026

At the owner's request, `ADMIN_DISCOVERY_ONLY` now defaults to enabled. Set it explicitly to `false` on the web service and private Jarvis cron services to restore the old workflows deliberately. The separate equity pause still applies after restoration.

Middleware permits admin verification and the two existing Crypto Discovery APIs. Other admin pages render a static pause page before their page-specific fetches, and other admin APIs return an explicit 503 pause. Private scan/persist, ARCA cycle/report, edge outcome/matrix, evening packet and operator email jobs return a 200 skipped response before handler/database/provider work to avoid retry storms. Private Jarvis CLI jobs return before loading their data modules. Records are not reset or removed.

Shared/public workloads remain active: market ingestion worker, fundamentals, FRED/M2 ingestion, public signal labelling, public scans, regime workers and customer alert jobs. Render schedules remain configured; private HTTP jobs wake but do no research work. This is an application pause, not suspension of Render resources, and does not promise zero Neon usage or zero Render cron charges. No new automatic discovery collection is enabled; manual discovery/analysis budgets remain unchanged.
