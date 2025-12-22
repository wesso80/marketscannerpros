# Global Open Interest Integration Specification

## Overview

This document outlines the options and implementation plan for integrating Global Open Interest (OI) data into MarketScanner Pros. Open Interest represents the total number of outstanding derivative contracts (futures/perpetuals) that have not been settled - a key indicator of market participation and potential volatility.

---

## 1. What is Open Interest?

**Open Interest** = Total number of active futures/perpetual contracts

| OI Trend | Price Trend | Interpretation |
|----------|-------------|----------------|
| ↑ Rising | ↑ Rising | New money entering, bullish continuation |
| ↑ Rising | ↓ Falling | New shorts entering, bearish continuation |
| ↓ Falling | ↑ Rising | Short squeeze / profit taking |
| ↓ Falling | ↓ Falling | Long liquidations / capitulation |

**Why it matters:**
- High OI + price breakout = Strong momentum
- Low OI = Less conviction, potential fake moves
- Sudden OI drop = Liquidations, potential reversal

---

## 2. Available Data Sources

### Option A: Binance Futures API ⭐ RECOMMENDED (Phase 1)

| Feature | Details |
|---------|---------|
| **Cost** | Free |
| **Auth Required** | No (public endpoints) |
| **Coverage** | ~50% of global crypto futures volume |
| **Rate Limit** | 1200 requests/min (IP) |
| **Update Frequency** | Real-time |

**Endpoints:**

```
# Single symbol OI
GET https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT

# All symbols OI with statistics
GET https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=30

# Global Long/Short Ratio
GET https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m

# Top Trader Long/Short Ratio
GET https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=BTCUSDT&period=5m
```

**Response (openInterest):**
```json
{
  "symbol": "BTCUSDT",
  "openInterest": "45123.456",  // In contracts (BTC)
  "time": 1703203200000
}
```

---

### Option B: Bybit API (Free)

| Feature | Details |
|---------|---------|
| **Cost** | Free |
| **Auth Required** | No (public endpoints) |
| **Coverage** | ~15-20% of global volume |
| **Rate Limit** | 120 requests/min |

**Endpoint:**
```
GET https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT
```

---

### Option C: CoinGlass API (Aggregated - Paid)

| Feature | Details |
|---------|---------|
| **Cost** | $49-199/month |
| **Coverage** | All major exchanges aggregated |
| **Unique Data** | Liquidations, funding rates, exchange breakdown |

**Best for:** Production-grade, all-exchange aggregated data

---

### Option D: Coinalyze (Free Tier)

| Feature | Details |
|---------|---------|
| **Cost** | Free tier available |
| **Coverage** | Major exchanges |
| **Rate Limit** | Limited on free tier |

---

### Option E: Build Multi-Exchange Aggregator

Combine Binance + Bybit + OKX for ~80% coverage:

```typescript
const exchanges = [
  { name: 'Binance', weight: 0.50, endpoint: 'fapi.binance.com' },
  { name: 'Bybit', weight: 0.20, endpoint: 'api.bybit.com' },
  { name: 'OKX', weight: 0.15, endpoint: 'www.okx.com' },
];
```

---

## 3. Recommended Approach

### For MarketScanner Pros

| Phase | Data Source | Coverage |
|-------|-------------|----------|
| **Phase 1** | Binance Futures | ~50% (sufficient for trends) |
| **Phase 2** | Add Bybit | ~70% |
| **Phase 3** | CoinGlass (if needed) | 100% aggregated |

---

## 4. Implementation Plan

### Phase 1: Binance Open Interest (1 day)

**API Route:** `/app/api/open-interest/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 300; // 5 minute cache
let cache: { data: any; timestamp: number } | null = null;

// Top coins to track
const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'MATICUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'UNIUSDT',
  'XLMUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT'
];

interface OIData {
  symbol: string;
  openInterest: number;      // In USD
  openInterestCoin: number;  // In base coin
  price: number;
  change24h?: number;        // OI change %
}

export async function GET(req: NextRequest) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    // Fetch OI for all symbols in parallel
    const oiPromises = SYMBOLS.map(async (symbol) => {
      const [oiRes, priceRes] = await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
        fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`)
      ]);
      
      const oi = await oiRes.json();
      const price = await priceRes.json();
      
      const openInterestCoin = parseFloat(oi.openInterest);
      const currentPrice = parseFloat(price.price);
      
      return {
        symbol: symbol.replace('USDT', ''),
        openInterest: openInterestCoin * currentPrice,
        openInterestCoin,
        price: currentPrice,
      };
    });

    const oiData = await Promise.all(oiPromises);
    
    // Calculate totals
    const totalOI = oiData.reduce((sum, d) => sum + d.openInterest, 0);
    const btcOI = oiData.find(d => d.symbol === 'BTC')?.openInterest || 0;
    const ethOI = oiData.find(d => d.symbol === 'ETH')?.openInterest || 0;

    const result = {
      total: {
        openInterest: totalOI,
        formatted: formatUSD(totalOI),
        btcDominance: ((btcOI / totalOI) * 100).toFixed(1),
        ethDominance: ((ethOI / totalOI) * 100).toFixed(1),
      },
      coins: oiData.sort((a, b) => b.openInterest - a.openInterest),
      source: 'binance',
      exchange: 'Binance Futures',
      timestamp: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Open Interest API error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch Open Interest data' },
      { status: 500 }
    );
  }
}

function formatUSD(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}
```

### Phase 2: UI Component

**Component:** `/components/OpenInterestWidget.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

interface OIData {
  total: {
    openInterest: number;
    formatted: string;
    btcDominance: string;
    ethDominance: string;
    change24h?: number;
  };
  coins: Array<{
    symbol: string;
    openInterest: number;
    price: number;
  }>;
  exchange: string;
}

interface OpenInterestWidgetProps {
  compact?: boolean;
  showBreakdown?: boolean;
  className?: string;
}

export default function OpenInterestWidget({ 
  compact = false, 
  showBreakdown = true,
  className = '' 
}: OpenInterestWidgetProps) {
  const [data, setData] = useState<OIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/open-interest')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-lg ${compact ? 'p-3 h-16' : 'p-6 h-48'} ${className}`} />
    );
  }

  if (!data) return null;

  // Compact version
  if (compact) {
    return (
      <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <div className="text-xs text-slate-400">
                Global Open Interest
                <span className="ml-1 text-blue-400/70">(Binance)</span>
              </div>
              <div className="font-bold text-white">
                {data.total.formatted}
              </div>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-amber-400">BTC: {data.total.btcDominance}%</div>
            <div className="text-blue-400">ETH: {data.total.ethDominance}%</div>
          </div>
        </div>
      </div>
    );
  }

  // Full version
  return (
    <div className={`bg-slate-800/50 rounded-xl p-6 border border-slate-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          📊 Global Open Interest
        </h3>
        <span className="text-xs text-slate-500">{data.exchange}</span>
      </div>

      {/* Total OI */}
      <div className="text-center mb-6">
        <div className="text-4xl font-bold text-white mb-2">
          {data.total.formatted}
        </div>
        <div className="flex justify-center gap-4 text-sm">
          <span className="text-amber-400">
            BTC {data.total.btcDominance}%
          </span>
          <span className="text-blue-400">
            ETH {data.total.ethDominance}%
          </span>
          <span className="text-slate-400">
            Alts {(100 - parseFloat(data.total.btcDominance) - parseFloat(data.total.ethDominance)).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Top coins breakdown */}
      {showBreakdown && (
        <div className="space-y-2">
          <div className="text-sm text-slate-400 mb-2">Top by Open Interest</div>
          {data.coins.slice(0, 5).map((coin, i) => (
            <div key={coin.symbol} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-4">{i + 1}</span>
                <span className="font-medium text-white">{coin.symbol}</span>
              </div>
              <div className="text-right">
                <div className="text-white">
                  ${(coin.openInterest / 1e9).toFixed(2)}B
                </div>
                <div className="text-xs text-slate-500">
                  ${coin.price.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Phase 3: Add 24h Change Tracking

Track OI changes over 24 hours using Binance historical endpoint:

```typescript
// Fetch 24h OI history
const histRes = await fetch(
  `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=24`
);
const history = await histRes.json();

// Calculate 24h change
const current = history[history.length - 1].sumOpenInterest;
const dayAgo = history[0].sumOpenInterest;
const change24h = ((current - dayAgo) / dayAgo) * 100;
```

---

## 5. Additional Endpoints (Phase 2+)

### Long/Short Ratio

```typescript
// Global accounts long/short ratio
GET https://fapi.binance.com/futures/data/globalLongShortAccountRatio
  ?symbol=BTCUSDT
  &period=5m
  &limit=1

// Response
{
  "symbol": "BTCUSDT",
  "longShortRatio": "1.5234",  // >1 = more longs
  "longAccount": "0.6034",     // 60.34% long
  "shortAccount": "0.3966",    // 39.66% short
  "timestamp": 1703203200000
}
```

### Funding Rates

```typescript
GET https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1

// Response
{
  "symbol": "BTCUSDT",
  "fundingRate": "0.0001",     // 0.01% per 8h
  "fundingTime": 1703203200000
}
```

### Liquidations (WebSocket)

```typescript
// Subscribe to liquidation stream
wss://fstream.binance.com/ws/!forceOrder@arr
```

---

## 6. Database Schema (Optional Caching)

```sql
-- Store OI snapshots for historical analysis
CREATE TABLE open_interest_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  open_interest_usd DECIMAL NOT NULL,
  open_interest_coin DECIMAL NOT NULL,
  price DECIMAL NOT NULL,
  long_short_ratio DECIMAL,
  funding_rate DECIMAL,
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_oi_symbol_date ON open_interest_history(symbol, recorded_at DESC);

-- Aggregated totals
CREATE TABLE open_interest_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  total_oi_usd DECIMAL NOT NULL,
  btc_dominance DECIMAL,
  eth_dominance DECIMAL,
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(exchange, recorded_at)
);
```

---

## 7. Integration Points

### Scanner Context
Show OI alongside scan results - high OI + strong signal = higher conviction.

### AI Analyst Integration
Include OI data in prompts:

```typescript
const marketContext = `
Current Open Interest Data:
- Total OI: ${oi.total.formatted}
- BTC OI: ${btcOI} (${oi.total.btcDominance}% dominance)
- 24h OI Change: ${oi.total.change24h > 0 ? '+' : ''}${oi.total.change24h}%
- Long/Short Ratio: ${longShortRatio}

OI rising with price = bullish continuation
OI falling with price rising = potential reversal
`;
```

### Trading Journal
Log OI at time of trade for pattern analysis.

---

## 8. Development Timeline

| Task | Time | Dependencies |
|------|------|--------------|
| Binance OI API route | 3 hours | None |
| OpenInterestWidget component | 4 hours | API route |
| Scanner integration | 1 hour | Component |
| 24h change tracking | 2 hours | API route |
| Long/Short ratio | 2 hours | API route |
| Funding rate display | 1 hour | API route |
| Historical caching (DB) | 3 hours | DB migration |
| **Total Phase 1** | **~1 day** | Basic OI display |
| **Total Complete** | **~2-3 days** | Full metrics suite |

---

## 9. UI Placement Options

1. **Scanner Page** - Next to Fear & Greed for full market context
2. **Dashboard Header** - Quick glance at market participation
3. **Dedicated Derivatives Page** - `/tools/derivatives` with OI, funding, liquidations
4. **Individual Coin View** - Show OI when scanning specific symbol

---

## 10. Future Enhancements

- [ ] Multi-exchange aggregation (Bybit, OKX)
- [ ] Liquidation heatmaps
- [ ] Funding rate arbitrage alerts
- [ ] OI divergence signals (OI up, price down = warning)
- [ ] Historical OI charts
- [ ] Whale position tracking
- [ ] Exchange flow monitoring

---

## 11. Interpretation Guide (For Users)

### Open Interest Signals

| Signal | Meaning | Action |
|--------|---------|--------|
| OI ↑ + Price ↑ | New longs entering | Trend continuation likely |
| OI ↑ + Price ↓ | New shorts entering | Downtrend may continue |
| OI ↓ + Price ↑ | Shorts covering | Watch for exhaustion |
| OI ↓ + Price ↓ | Longs liquidating | Capitulation, watch for bottom |
| Sudden OI spike | Major event / news | Expect volatility |
| OI at ATH | Maximum leverage | Correction risk high |

### Long/Short Ratio

| Ratio | Meaning |
|-------|---------|
| > 1.5 | Heavily long, potential squeeze down |
| 1.0 - 1.5 | Balanced to slightly bullish |
| < 1.0 | More shorts, potential squeeze up |
| < 0.7 | Extreme shorts, high squeeze risk |

### Funding Rate

| Rate | Meaning |
|------|---------|
| > 0.1% | Longs paying shorts, bullish sentiment |
| 0% - 0.1% | Neutral |
| < 0% | Shorts paying longs, bearish sentiment |
| > 0.3% | Extreme, expect correction |

---

## Resources

- **Binance Futures API**: https://binance-docs.github.io/apidocs/futures/en/
- **Bybit API**: https://bybit-exchange.github.io/docs/v5/intro
- **CoinGlass**: https://www.coinglass.com/
- **Coinalyze**: https://coinalyze.net/

---

*Document created: December 22, 2025*
*For MarketScanner Pros internal use*
