# Scanner remediation follow-up — 21 September 2026

This batch continues the professional-readiness audit on the Render application. The last fully evidenced production audit rating remains 2/5; these changes do not establish predictive performance or institutional readiness by themselves.

## Changes

- Pro filters run on every evaluated candidate before the 50-result response limit. Sorting also runs before the limit. Direction, quality, capped confidence, factor agreement, ATR volatility, squeeze, relative strength, ADX and preset RSI conditions share one selection contract.
- Responses reconcile evaluated, matched, returned, excluded, unavailable-input and beyond-limit counts. Exclusions record the first failed condition for each symbol so counts do not double-count rows.
- Fast scans preserve all market-data candidates while retaining the existing ten-leader technical-enrichment budget. Missing technical inputs fail the relevant filters. This is not a claim that Fast mode has complete indicator coverage across the provider universe.
- Changing filters or sort invalidates old results and requires another manual scan. Filter controls remain visible before and after a scan. Diamond remains manual-only.
- Requested and tier universe limits are respected in deep crypto and cached equity scans. Deep scans count symbols left unevaluated at the time limit, and coverage uses successful evaluations divided by the selected universe. Cached equity quote fallback calls are included in the reported call count.
- ATR scenario levels require observed positive ATR, a valid price and a directional hypothesis. Missing volatility no longer becomes an invented 2% price estimate. Invalid nonpositive levels are withheld and small-token precision is retained.
- Ranked scanner cards are rendered on mobile for both partial and completed queues. Desktop tables retain the same ranked rows.
- Legacy child-page canonical URLs follow their actual hub destinations, including Macro → Dashboard. Private routes retain noindex.
- Ignored admin research stays outside the default queue but can return to Watch. Completed lifecycles remain terminal.
- The private ARCA response validator covers optional citations and notices, and rejects broker-execution claims there too. Tests now reflect the existing private desk-research contract.
- Layout assertions follow the five-area navigation, shared accessible header props, current research wording and instrument handoffs. They do not reinstate removed UI solely to satisfy old source-string expectations.

## Verification

- Full suite: **1,616 passed, 13 existing skips, zero failures**. All 21 baseline failures are resolved.
- Final focused checks after cap/accounting refinements: **54 passed**.
- New API-level tests exercise a match outside the previous ten-leader cutoff, missing ATR exclusion, requested small-universe limits and invalid-filter rejection before provider fetching.
- New calculation tests cover bullish/bearish 2:1 ATR scenarios, missing data, neutral bias, invalid prices/levels and small-token precision.
- Production build: passed TypeScript and all 400/400 generation tasks using isolated build-only credentials. The build database was intentionally unavailable; no production database was used. Deployment results are recorded in the release pull request.

## Production observations during this pass

Read-only public checks were made against marketscannerpros.app before this batch was deployed:

- `/api/health/status` returned HTTP 200 with healthy database, Redis and aggregate environment checks. This confirms infrastructure checks, not scanner accuracy.
- `/api/health/data` returned HTTP 200 and `stale: false`, but **0 of 7 representative cache keys were populated**. That response cannot establish current market-data coverage.
- `/api/economic-calendar?days=7` returned 13 curated events. Trading Economics and EODHD both reported **NOT_CONFIGURED**. A curated calendar is available; a configured live calendar feed remains outstanding.
- Crypto news, guides and treasury routes require an authenticated workspace. Public requests do not verify their provider payloads.

## Outstanding acceptance gates

1. Configure and verify the live calendar provider; check timestamp, coverage and stale/error behavior for all market feeds using production logs and authenticated payloads.
2. Verify the released scanner with manual live scans and source reconciliation. Fast technical enrichment remains bounded; full indicator coverage and provider-success accounting must be demonstrated separately.
3. Complete the signed-in mobile journey and Scanner → Golden Egg → Terminal → Backtest → Journal/Portfolio reconciliation, including fees, sizing, partial positions and stale prices.
4. Verify authenticated Crypto Intel/Guides, AI evidence grounding, alert recovery and billing journeys.
5. Establish a common funding-period contract and reconcile exchange-session/timeframe edge cases.
6. Validate versioned outcomes over sufficient samples, including fees, slippage, out-of-sample results, liquidity constraints and drawdowns. No software-only change earns a 5/5 trading-quality rating.

The browser audit is currently stopped at a Terms acceptance screen. The browser workflow requires action-time confirmation for that legal acceptance. Render diagnostic tools also require explicit selection of the connected workspace before logs/configuration can be read; it has not been selected implicitly. Existing GitHub-to-Render deployment remains usable.
