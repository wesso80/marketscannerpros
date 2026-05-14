# CoinGecko Provider Map

## Provider split

CoinGecko owns crypto-native breadth and public market context.

Alpha Vantage remains the default for:
- equities
- equity technical indicators
- stock quotes, fundamentals, and scanner inputs

CoinGecko should be the default for:
- crypto global market overview
- crypto heatmaps and top-coin snapshots
- crypto categories and DeFi aggregates
- crypto trending/search discovery
- crypto derivatives aggregates where the route already labels limitations clearly

## Current route mapping

Use CoinGecko for these routes:
- `/api/crypto/heatmap`
- `/api/crypto/market-overview`
- `/api/crypto/categories`
- `/api/crypto/defi-stats`
- `/api/crypto/trending`
- `/api/funding-rates`
- `/api/open-interest`

Use Alpha Vantage or existing non-CoinGecko providers for these routes:
- equity scanner and indicator routes
- stock quote and intraday routes
- any route that depends on Alpha Vantage-only technical studies

## Widget mapping

Widgets already aligned to CoinGecko-backed routes:
- `CryptoHeatmap` -> `/api/crypto/heatmap`
- `CryptoMorningDecisionCard` -> `/api/crypto/market-overview`, `/api/crypto/trending`, `/api/funding-rates`, `/api/open-interest`
- `CategoryHeatmapWidget` -> `/api/crypto/categories`
- `DefiStatsWidget` -> `/api/crypto/defi-stats`

## Public/Admin exposure rules

Public-safe CoinGecko response metadata may include only:
- `provider`
- `sourceAttribution`
- `planMode`
- `endpointFamily`
- `lastUpdated`
- `freshnessStatus`
- `stale`
- `fallbackUsed`
- `simulationUsed`

Do not expose these fields on public or shared client routes:
- raw provider error payloads
- internal cooldown state
- circuit-breaker state
- provider telemetry counters
- webhook status
- internal operator commentary

## Freshness rules

Every CoinGecko-backed route should include:
- source attribution
- last updated timestamp
- freshness status
- fallback/simulation status

Interpretation:
- `fresh`: snapshot age is within the route's expected cache window
- `delayed`: snapshot age exceeded the target window but is still serviceable
- `stale`: snapshot age materially exceeded the window or only fallback data is available
- `unknown`: upstream timestamp is unavailable, so the route cannot certify freshness

## Derivatives caveat

CoinGecko derivatives data is suitable for monitoring and research context, not execution assumptions. Missing venue-specific fields must remain missing, and derivatives aggregates must stay clearly labeled as multi-exchange snapshots.