# Crypto strategy reset — 28 September 2026

Six weeks is not the base holding period or a universal eligibility gate for crypto. The objective is positive expectancy after fees/slippage with bounded drawdowns, including opportunities lasting hours or days. The QNT chart is a discovery failure example, not evidence that the full trough-to-peak return was executable.

## Verified implementation gaps

- The fixed admin watchlists excluded QNT. Major-exchange discovery now finds its CoinGecko ID without requiring static membership.
- Paper selection still uses intraday scores mixed with weekly/daily position levels. The new momentum review does not yet replace this path.
- `positionEngine.markAndMaybeExit` performs full exits at fixed targets. It has no partial exit or trailing-stop state.
- Exit checks use a current sampled price, not the intervening candle path. They can miss an intracycle stop/target touch. The full-exit model now selects the nearest profitable resting target, including when a later quote crosses several targets.
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

The discovery and candle-review pages are research only. Existing paper entries still use the legacy strategy. Exit accounting has the original-risk and nearest-target corrections above; momentum entries, candle-path exits, trailing stops and partial exits are not yet enabled. No real-order execution is introduced.
