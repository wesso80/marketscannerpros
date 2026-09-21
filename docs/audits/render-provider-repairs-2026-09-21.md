# Render provider and persistence audit — 21 September 2026

This follows PR20. The user selected **My Workspace** for Render diagnostics. Both the web service and ingestion worker were confirmed live on merge commit `7dfc8bd70f52e1c2f4f4d1e0b313a058974ed371`. Deployment success did not imply feed correctness: runtime logs exposed the failures below.

## Confirmed failures and repairs

1. **Derivatives schema mismatch.** The exchange-detail endpoint returns `base`, `last`, `open_interest_usd`, `converted_volume.usd` and `last_traded`. The adapter expected the all-tickers schema (`index_id`, etc.) and discarded every ticker. Logs contained 51 repeated “no usable tickers” errors in the inspected window. The adapter now normalises the actual response, preserves venue identity, funding scale and USD volume, rejects stale/expired observations, deduplicates contracts, and adds a one-minute failure cooldown. Concurrent consumers share one fetch; stale fallback expires after 15 minutes without changing provider timestamps.
2. **Oversized OHLC requests and synthetic fallback.** The worker requested up to 3,650 daily history days in one call. Logs contained 21 provider range-limit errors in the inspected window. It now shares the scanner's two bounded daily windows, up to 360 genuine candles, plus matched daily volume. Close samples and four-day candles are no longer substituted for daily OHLC. The old worker history-days environment setting no longer expands this bounded ingestion path. Dedicated multi-year backfills remain separate work.
3. **Candle timestamp convention.** CoinGecko OHLC timestamps identify candle closes, while the shared bar contract uses candle opens. The adapter subtracts the actual interval before volume joins, completed-candle checks and weekly aggregation. Fixtures now model the provider's real close-time convention.
4. **Historical close presented as current quote.** The crypto worker now obtains provider-stamped spot data for the quote cache. Unknown or stale observations do not overwrite the previous quote. Unknown spot OHLC/change/volume fields remain unavailable. Volume-based computed indicators are withheld if their history has missing volume.
5. **Acceptance persistence.** The production database lacked `disclosure_acceptance`. The old browser gate ignored the HTTP failure and stored acceptance locally. Startup now applies the existing additive, idempotent migration 058 before serving traffic. No acceptance records are fabricated. Both routes use the current disclosure version and authenticated workspace. The client uses the server record, reports save/check failures, and only opens after a successful save. Retrying the same acceptance does not overwrite its original timestamp.
6. **Unavailable derivatives values.** Missing numbers survive the provider and JSON boundaries as unavailable. Display formatters tolerate null without crashing or displaying zero funding. Funding comparisons exclude unavailable values; alert calculations no longer coerce null funding to zero. Exchange counts use distinct venues.

Provider contracts checked against official documentation:

- [Derivatives exchange data](https://docs.coingecko.com/reference/derivatives-exchanges-id)
- [OHLC within a time range](https://docs.coingecko.com/reference/coins-id-ohlc-range)

## Verification

- Focused provider, disclosure, timeframe and Golden Egg tests: **64 passed**.
- Full final suite: **1,641 passed, 13 existing skips, zero failures**.
- Fixed an existing nondeterministic M2 test by supplying the calculation timestamp through the engine's existing parameter. The assertion still compares the entire result.
- Production build before the final formatting follow-up passed. A subsequent build encountered a generated-directory cleanup error; generated output was moved aside and a clean final build started. Final build and deployment outcome are recorded in the release PR.
- React review covered the disclosure request/error states and finite-number rendering boundaries.

## Authenticated production observations before this repair release

- Pro Fast, crypto, universe 100, minimum evidence 70: **81 evaluated, 0 matched, 0 returned, 81 excluded before the response limit**. The other 19 were explicitly excluded from the universe (11 stablecoins, 1 non-ASCII ticker, 7 unscorable).
- Changing filters and sort cleared the previous result without running an automatic scan.
- Pro Fast, crypto, universe 100, volatility sort: **81 evaluated, 10 matched, 10 returned, 71 lacking required factor inputs**. Displayed ATR percentages were descending: 14.4, 9.3, 8.8, 8.0, 7.8, 7.6, 6.8, 6.4, 5.7, 4.6. Fast still enriches only ten leaders; this is not full-universe technical coverage.
- ARB selection preserved symbol, crypto asset type and daily timeframe through Scanner → Golden Egg → Terminal. Terminal's main Backtest navigation also retained that context. No cases, watchlists, alerts or trades were created.
- News displayed 20 timestamped, attributed links. Treasury displayed 180 entities and explicit unavailable cost-basis values. Feed availability is verified; individual publisher claims and entity holdings were not independently reconciled.
- Golden Egg and Terminal correctly exposed missing derivatives data in their detailed sections. Terminal's parent “Lens ready” label is still only a routing status and can be mistaken for feed health.

## Remaining acceptance gates / follow-up defects

- Reconcile the repaired derivatives and worker feeds in production, including partial exchange coverage and common funding periods. Annualisation currently assumes three eight-hour periods per day; no common-period validation has been established.
- Fast mode remains a market-data screen with limited technical enrichment. Pro confidence is affected by risk-mode caps; the distinction between raw evidence and capped eligibility should be clearer.
- Golden Egg model-zone labels state the requested stop-distance multiple even where the 30% price cap changes the achieved multiple. The reference-to-invalidation risk denominator differs from the initial quote-to-stop distance. Displayed R uses the actual levels, but the model description needs reconciliation.
- Treasury metadata currently stamps retrieval time as fresh observation time. The provider's historical valuation/cost basis needs explicit dating and reconciliation, especially for disposed positions. Negative dollar formatting and the 180-row table also need a usability pass.
- The ingestion bars table retains a legacy non-null volume column with a zero fallback. This batch withholds affected computed volume indicators; a versioned history-quality migration and old-cache repair remain necessary before claiming complete data integrity.
- Live economic-calendar credentials, full mobile and Backtest/Journal/Portfolio reconciliation, alert recovery, billing, AI grounding and out-of-sample performance remain open. No alerts, emails, payments or execution flows were triggered during this audit.
- Because the previous disclosure save failed, a browser-local acceptance cannot serve as a database record. Affected users may need to acknowledge the same disclosure once after migration; the repair does not silently recreate consent.

The last fully evidenced production audit rating remains **2/5**. Fixes and passing tests improve reliability; they do not demonstrate trading edge, liquidity-adjusted performance or institutional readiness.
