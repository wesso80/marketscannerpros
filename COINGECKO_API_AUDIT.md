# CoinGecko API Audit Report

**Date:** March 5, 2025  
**Plan:** Analyst (Commercial) — 500,000 calls/month, 500 RPM  
**Current Usage:** 83,813 calls in 5 days (avg ~16,763/day)  
**Projected Monthly:** ~519,653 → **OVER LIMIT by ~20K**  
**Active Users:** 2

---

## Executive Summary

The system is burning through CoinGecko quota at **16,763 calls/day** with only 2 users. The **#1 offender is the background worker** (`worker/ingest-data.ts`), which polls **170 crypto symbols** across 3 tiers with intervals as aggressive as 45 seconds. The worker alone can generate **23,000–49,000 calls/day** depending on market hours. Frontend dashboard widgets contribute an additional **2,000–5,000 calls/day** through aggressive polling. 

**Critical design flaw:** The worker runs as a standalone Node.js process, so Next.js `{ next: { revalidate: N } }` fetch caching has **zero effect** — every scheduled poll is a raw HTTP call to CoinGecko.

---

## A. Crypto Symbol Universe (from migration 026)

| Tier | Symbols | Market Interval | Off-Hours Interval |
|------|---------|----------------|-------------------|
| **Tier 1** | **20** (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, DOT, TRX, TON, SHIB, LTC, BCH, XLM, HBAR, SUI, APT, NEAR) | 45s | 120s |
| **Tier 2** | **50** (MATIC, UNI, ATOM, ARB, OP, ETC, XMR, ALGO, FIL, ICP + 40 more) | 120s | 300s |
| **Tier 3** | **100** (ROSE, IOTA, ZIL, BAT, ZRX, CHR + 94 more) | 600s | 900s |
| **Total** | **170 crypto symbols** | | |

---

## B. Worker — THE #1 OFFENDER (~80% of all calls)

**File:** `worker/ingest-data.ts`  
**Cycle interval:** 60 seconds (continuous loop)  
**CoinGecko function:** `fetchCoinGeckoDaily()` per symbol  

### How it works
Each cycle, the worker iterates all 170 crypto symbols. For each symbol whose `last_fetched_at` exceeds its tier interval, it calls `fetchCoinGeckoDaily()` which does:

1. `getCoinGeckoOHLCRange()` → `/coins/{id}/ohlc/range` (1 API call, 1 retry)
2. If (1) returns no data → `getCoinGeckoMarketChartHistory()` → `/coins/{id}/market_chart` (1 API call, 1 retry)  
3. If (2) returns no data → `getCoinGeckoOHLC(365)` → `/coins/{id}/ohlc` (1 API call, 1 retry)

**Normal case:** 1 call per symbol per refresh  
**Error/fallback case:** Up to 3 calls per symbol (6 with retries)

### Worker Calls Per 24h (Weekday)

**Market Hours (6.5h, 9:30 AM — 4 PM ET):**

| Tier | Symbols | Interval | Fetches/hr | 6.5h subtotal |
|------|---------|----------|-----------|---------------|
| T1 | 20 | 45s (≈every cycle) | 60/hr | **7,800** |
| T2 | 50 | 120s (every 2nd cycle) | 30/hr | **9,750** |
| T3 | 100 | 600s (every 10th cycle) | 6/hr | **3,900** |
| | | | **Subtotal** | **21,450** |

**Off-Hours (17.5h):**

| Tier | Symbols | Interval | Fetches/hr | 17.5h subtotal |
|------|---------|----------|-----------|----------------|
| T1 | 20 | 120s | 30/hr | **10,500** |
| T2 | 50 | 300s | 12/hr | **10,500** |
| T3 | 100 | 900s | 4/hr | **7,000** |
| | | | **Subtotal** | **28,000** |

### **Worker Weekday Total: ~49,450 calls/day (theoretical max)**

**Weekend (all off-hours, 24h):** ~26,880 calls/day

**Monthly projection (22 weekdays + 8 weekend days):**  
`(22 × 49,450) + (8 × 26,880) = 1,087,900 + 215,040 = **~1,302,940 calls/month**`

> The observed ~16,763/day is lower than the theoretical max, likely due to:
> - Worker errors/downtime on Render
> - Some symbols returning errors and not being retried quickly
> - Render cold starts/redeploys
> 
> But even at the observed rate: **16,763 × 31 = 519,653/month → OVER BUDGET**

---

## C. Frontend API Routes — Secondary Consumers

### Routes with CoinGecko calls (per request)

| # | Route | CG Functions | CG Calls/Req | Route Cache | Frontend Polling |
|---|-------|-------------|-------------|-------------|-----------------|
| 1 | `/api/crypto/heatmap` | `getMarketData` | **1** | None | 60s |
| 2 | `/api/crypto/market-overview` | `getGlobalData` + `getGlobalMarketCapChart` | **2** | revalidate=300 | 300s |
| 3 | `/api/crypto/new-pools` | Direct fetch (bypasses lib!) | **1** | revalidate=300 | 60s |
| 4 | `/api/crypto/trending` | `getTrendingCoins` + `getSimplePrices` | **2** | revalidate=300 | 300s |
| 5 | `/api/crypto/categories` | `getCoinCategories` | **1** | revalidate=300 | 300s |
| 6 | `/api/market-movers` | `getTopGainersLosers` + `getMarketData` | **2** | revalidate=300 | 300s |
| 7 | `/api/fear-greed-custom` | `getGlobalData` + `getDerivativesTickers` + `getMarketData` | **3** | In-memory 1800s | Varies |
| 8 | `/api/crypto-derivatives` | `getDerivativesTickers` + `getMarketData` | **2** | Redis 60s | On-demand |
| 9 | `/api/funding-rates` | `getAggregatedFundingRates` → derivatives | **1** | In-memory 900s | 300s |
| 10 | `/api/open-interest` | `getAggregatedOpenInterest` + `getMarketData` | **2** | In-memory 600s | 300s |
| 11 | `/api/long-short-ratio` | `getAggregatedFundingRates` → derivatives | **1** | In-memory 600s | On-demand |
| 12 | `/api/quote` (crypto) | `getMarketData` or `getPriceBySymbol` | **1–2** | None | 60s (useLivePrices) |
| 13 | `/api/scanner/run` (crypto) | `getOHLCWithVolume` + `getGlobalData` + `getOHLC` | **3–4** | None | Per scan |
| 14 | `/api/scanner/bulk` (crypto) | `getOHLC` × N + `getMarketData` + `getDerivativesForSymbols` | **Up to ~102** | None | Per scan |
| 15 | `/api/intraday` (crypto) | `getOHLC` | **1** | None | On-demand |
| 16 | `/api/correlation` (crypto) | `getOHLC` × N | **Up to ~10** | Redis 600s | On-demand |
| 17 | `/api/market-focus/candidates` | `getOHLC` × up to 10 | **Up to ~10** | None | On-demand |
| 18 | `/api/time-gravity-map` (crypto) | `getOHLC` × 2 | **2** | None | 30s |

### Frontend Polling Estimate (2 users, ~8h active/day)

Aggressive pollers (60s interval or less):
| Widget | API Route | CG Calls | Polls/hr | Est. Daily (2 users × 8h) |
|--------|-----------|----------|----------|---------------------------|
| CryptoHeatmap | `/api/crypto/heatmap` | 1 | 60 | **960** |
| DominanceWidget | `/api/crypto/market-overview` | 2 | 12* | **192** |
| NewPoolsWidget | `/api/crypto/new-pools` | 1 | 12* | **192** |
| TGM Widget | `/api/time-gravity-map` | 0† | 120 | **0†** |
| useLivePrices | `/api/quote` | 1–2 | 60 | **960–1,920** |

*With `revalidate=300`, only 12 actual CG calls/hr despite 60 polls/hr  
†TGM reads from database, no CG calls unless "Generate" pressed  

Moderate pollers (300s interval):
| Widget | API Route | CG Calls | Polls/hr | Est. Daily (2 users × 8h) |
|--------|-----------|----------|----------|---------------------------|
| TopMoversWidget | `/api/market-movers` | 2 | 12 | **384** |
| TrendingCoinsWidget | `/api/crypto/trending` | 2 | 12 | **384** |
| DefiStatsWidget | `/api/crypto/defi-stats` | 1 | 12 | **192** |
| MarketOverview | `/api/crypto/market-overview` | 2 | 12 | **384** |

### **Frontend Daily Total: ~3,600–5,400 calls/day**

---

## D. Other CoinGecko Consumers

| File | Usage | Frequency |
|------|-------|-----------|
| `lib/backtest/providers.ts` | `getOHLC` for crypto backtests | On-demand (5min cache) |
| `lib/execution/fetchATR.ts` | `getOHLC` for crypto ATR | On-demand |
| `scripts/backfill-midpoints.ts` | `getOHLC` for bulk backfill | Manual script only |

---

## E. CoinGecko Endpoint Hit Frequency (24h Summary)

| CG Endpoint | Called By | Est. Daily Calls |
|-------------|-----------|-----------------|
| `/coins/{id}/ohlc/range` | Worker (every crypto refresh) | **~12,000–16,000** |
| `/coins/{id}/market_chart` | Worker fallback + frontend | **~500–2,000** |
| `/coins/{id}/ohlc` | Worker fallback + scanner + routes | **~1,000–3,000** |
| `/derivatives` | Routes (45s cache) | **~800–1,920** |
| `/coins/markets` | Heatmap + quotes + market routes | **~500–1,500** |
| `/simple/price` | Quote + trending | **~200–500** |
| `/global` | Dominance + fear-greed | **~100–300** |
| `/search/trending` | Trending widget | **~100–200** |
| `/coins/top_gainers_losers` | Market movers | **~100–200** |
| `/coins/categories` | Category widget | **~100** |
| Other (DeFi, pools, etc.) | Various widgets | **~200–500** |

---

## F. ROOT CAUSES

### 1. Worker Refresh Rates Are Far Too Aggressive
- **Tier 1 at 45s**: Daily OHLC data doesn't change every 45 seconds. The worker fetches 10 years of daily candles on every refresh — the data barely changes.
- **170 crypto symbols**: The universe is too large for the current refresh cadence.
- **No caching in worker**: Next.js `revalidate` has no effect in standalone worker process.

### 2. Cascading Fallback Multiplies Calls
- `fetchCoinGeckoDaily()` tries up to 3 different CG endpoints per symbol on failure.
- `cgFetch()` has up to 3 retries per endpoint.
- Worst case: **12 HTTP requests for a single symbol refresh**.

### 3. Frontend Widgets Poll Independently
- Multiple widgets each make their own CoinGecko calls.
- The crypto heatmap polls `/api/crypto/heatmap` every 60s per user.
- `/api/quote` is called per-symbol with no batching.

### 4. No Global Budget Enforcement
- No daily/hourly call counter exists.
- No circuit breaker based on remaining monthly quota.
- No back-pressure when approaching the 500K limit.

---

## G. RECOMMENDED FIXES (Priority Order)

### FIX 1: Slow Down Worker Refresh Rates (HIGHEST IMPACT)
**Savings: ~35,000–40,000 calls/day**

The worker fetches historical OHLC data that changes **once per day**. There's no need to fetch it every 45 seconds.

```
CURRENT → RECOMMENDED

Tier 1 (market):   45s  → 600s  (10 min)
Tier 1 (offhours): 120s → 1800s (30 min)
Tier 2 (market):   120s → 900s  (15 min)  
Tier 2 (offhours): 300s → 3600s (1 hour)
Tier 3 (market):   600s → 3600s (1 hour)
Tier 3 (offhours): 900s → 7200s (2 hours)
```

This reduces worker from ~49,450 to ~5,200 calls/day.

**Implementation:** Update env vars or defaults in `worker/ingest-data.ts`:
```typescript
const CRYPTO_TIER_REFRESH_INTERVALS: Record<number, number> = {
  1: 600,    // Was 45 → 10 minutes
  2: 900,    // Was 120 → 15 minutes  
  3: 3600,   // Was 600 → 1 hour
};

const CRYPTO_OFFHOURS_TIER_REFRESH_INTERVALS: Record<number, number> = {
  1: 1800,   // Was 120 → 30 minutes
  2: 3600,   // Was 300 → 1 hour
  3: 7200,   // Was 900 → 2 hours
};
```

### FIX 2: Add In-Memory Cache to Worker
**Savings: Prevents fallback multiplication**

Cache successful CoinGecko responses in the worker process so fallback chains don't fire on every cycle.

```typescript
// Add to worker/ingest-data.ts
const workerCGCache = new Map<string, { data: AVBar[]; expiresAt: number }>();
const WORKER_CG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchCoinGeckoDaily(symbol: string): Promise<AVBar[]> {
  const cached = workerCGCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  // ... existing fetch logic ...
  workerCGCache.set(symbol, { data: bars, expiresAt: Date.now() + WORKER_CG_CACHE_TTL_MS });
  return bars;
}
```

### FIX 3: Reduce Tier 3 Universe or Disable It
**Savings: ~8,000–15,000 calls/day**

100 Tier 3 coins (ROSE, IOTA, ZIL, etc.) add massive call volume for coins that likely get minimal user attention. Options:
- **Disable Tier 3** entirely (set `enabled = FALSE`)
- **Refresh Tier 3 only once per day** (interval = 86400s)
- **Trim to top 20 Tier 3 symbols**

### FIX 4: Add Global CoinGecko Budget Counter
**Prevents overage**

Track total daily CG calls and enforce a hard cap:

```typescript
// In lib/coingecko.ts
let dailyCallCount = 0;
let dailyResetAt = 0;
const DAILY_BUDGET = 14000; // 500K / 31 days ≈ 16,129 - 10% safety

function checkBudget(): boolean {
  const now = Date.now();
  if (now > dailyResetAt) {
    dailyCallCount = 0;
    dailyResetAt = now + 86400000;
  }
  return dailyCallCount < DAILY_BUDGET;
}

// In cgFetch, before each call:
if (!checkBudget()) {
  console.warn('[CoinGecko] Daily budget exhausted');
  throw new Error('CoinGecko daily budget exceeded');
}
dailyCallCount++;
```

### FIX 5: Frontend Widget Consolidation
**Savings: ~1,000–3,000 calls/day**

- **Batch dashboard data**: Create a single `/api/crypto/dashboard-data` endpoint that fetches all widget data in one CG call batch (using `getMarketData` with all needed IDs).
- **Increase polling intervals**: Heatmap every 5 min instead of 60s. Dominance every 10 min.
- **Use worker-cached data**: Frontend widgets should read from `quotes_latest` / `indicators_latest` tables (populated by worker) instead of making fresh CG calls.

### FIX 6: Fix Derivatives Cache Sharing
The derivatives endpoint returns ~9MB and has a 45s in-memory cache, but each API route instance may have its own cache. Ensure a single shared cache (e.g., Redis) for `getDerivativesTickers()`.

---

## H. Projected Results After Fixes

| Scenario | Daily Calls | Monthly (31 days) | Status |
|----------|------------|-------------------|--------|
| **Current** | ~16,763 | ~519,653 | ❌ OVER |
| **Fix 1 only** (slower worker) | ~5,200 + ~4,000 = ~9,200 | ~285,200 | ✅ SAFE |
| **Fix 1 + Fix 3** (slower + trim T3) | ~3,400 + ~4,000 = ~7,400 | ~229,400 | ✅ COMFORTABLE |
| **All fixes** | ~4,000–6,000 | ~124,000–186,000 | ✅ PLENTY OF HEADROOM |

---

## I. Quick-Win Implementation Order

1. **NOW**: Change worker tier intervals (5 min code change, instant 70% reduction)
2. **NOW**: Add worker-level in-memory cache (prevent fallback chains)
3. **THIS WEEK**: Add daily budget counter to `cgFetch`
4. **THIS WEEK**: Trim Tier 3 universe or set to daily refresh
5. **NEXT WEEK**: Consolidate frontend widgets to use DB cache
6. **NEXT WEEK**: Add Redis cache for derivatives across route instances
