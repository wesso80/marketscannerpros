# Fear & Greed Index Integration Specification

## Overview

This document outlines the options and implementation plan for integrating Fear & Greed Index functionality into MarketScanner Pros. The Fear & Greed Index is a market sentiment indicator that measures whether investors are being too fearful or too greedy.

---

## 1. Available Data Sources

### Option A: Alternative.me Crypto Fear & Greed Index ⭐ RECOMMENDED

| Feature | Details |
|---------|---------|
| **Cost** | Free |
| **Auth Required** | No |
| **Update Frequency** | Daily |
| **Coverage** | Crypto markets only |
| **Rate Limit** | Generous (no documented limit) |

**Endpoint:**
```
GET https://api.alternative.me/fng/
GET https://api.alternative.me/fng/?limit=30  // Historical data
```

**Response:**
```json
{
  "name": "Fear and Greed Index",
  "data": [
    {
      "value": "73",
      "value_classification": "Greed",
      "timestamp": "1703203200",
      "time_until_update": "43200"
    }
  ]
}
```

**Index Scale:**
| Value | Classification |
|-------|----------------|
| 0-24 | Extreme Fear |
| 25-44 | Fear |
| 45-55 | Neutral |
| 56-75 | Greed |
| 76-100 | Extreme Greed |

**Factors Used:**
- Volatility (25%)
- Market Momentum/Volume (25%)
- Social Media (15%)
- Surveys (15%)
- Bitcoin Dominance (10%)
- Google Trends (10%)

---

### Option B: CNN Fear & Greed Index (Stocks)

| Feature | Details |
|---------|---------|
| **Cost** | No official API |
| **Coverage** | US Stock Market |
| **Update Frequency** | Real-time during market hours |

**Workarounds:**
1. **RapidAPI Unofficial** - ~$10-50/month
2. **Web Scraping** - Fragile, may break
3. **Build Custom** - Use Alpha Vantage data (recommended)

**CNN Factors:**
- Stock Price Momentum (S&P 500 vs 125-day MA)
- Stock Price Strength (52-week highs vs lows)
- Stock Price Breadth (NYSE advancing volume)
- Put/Call Ratio
- Market Volatility (VIX)
- Safe Haven Demand (stocks vs bonds)
- Junk Bond Demand (yield spread)

---

### Option C: Build Custom Index from Alpha Vantage

Use existing Alpha Vantage subscription to create a proprietary index:

```typescript
// Components to aggregate:
const fearGreedComponents = {
  vix: 0.25,           // VIX level
  rsi_spy: 0.20,       // RSI of SPY
  momentum: 0.20,      // 20-day vs 50-day MA
  breadth: 0.15,       // Advancing vs declining
  highsLows: 0.10,     // 52-week highs vs lows
  volume: 0.10         // Volume trend
};
```

---

### Option D: Santiment (Premium Crypto)

| Feature | Details |
|---------|---------|
| **Cost** | $49-199/month |
| **Coverage** | Crypto with on-chain data |
| **Unique Data** | Whale movements, exchange flows |

---

### Option E: LunarCrush (Social Sentiment)

| Feature | Details |
|---------|---------|
| **Cost** | Free tier available |
| **Coverage** | Crypto social sentiment |
| **Unique Data** | Twitter, Reddit, news sentiment |

---

## 2. Recommended Approach

### For MarketScanner Pros

| Market Type | Data Source | Priority |
|-------------|-------------|----------|
| **Crypto** | Alternative.me | Phase 1 |
| **Stocks** | Custom (Alpha Vantage) | Phase 2 |
| **Combined** | Weighted average | Phase 3 |

---

## 3. Implementation Plan

### Phase 1: Crypto Fear & Greed (1 day)

**API Route:** `/app/api/fear-greed/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 3600; // 1 hour cache
let cache: { data: any; timestamp: number } | null = null;

export async function GET(req: NextRequest) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=30');
    const data = await response.json();

    const result = {
      current: {
        value: parseInt(data.data[0].value),
        classification: data.data[0].value_classification,
        timestamp: new Date(parseInt(data.data[0].timestamp) * 1000).toISOString(),
      },
      history: data.data.slice(0, 30).map((d: any) => ({
        value: parseInt(d.value),
        classification: d.value_classification,
        date: new Date(parseInt(d.timestamp) * 1000).toISOString(),
      })),
      source: 'alternative.me',
      market: 'crypto',
    };

    // Update cache
    cache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch Fear & Greed Index' },
      { status: 500 }
    );
  }
}
```

### Phase 2: UI Component

**Component:** `/components/FearGreedGauge.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

interface FearGreedData {
  current: {
    value: number;
    classification: string;
    timestamp: string;
  };
  history: Array<{
    value: number;
    classification: string;
    date: string;
  }>;
  market: string;
}

export default function FearGreedGauge() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/fear-greed')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-32 bg-slate-800 rounded-lg" />;
  if (!data) return null;

  const { value, classification } = data.current;

  const getColor = (val: number) => {
    if (val <= 24) return '#ef4444'; // red - extreme fear
    if (val <= 44) return '#f97316'; // orange - fear
    if (val <= 55) return '#eab308'; // yellow - neutral
    if (val <= 75) return '#84cc16'; // lime - greed
    return '#22c55e'; // green - extreme greed
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4">
        Crypto Fear & Greed Index
      </h3>
      
      <div className="flex items-center gap-6">
        {/* Gauge */}
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 100 50" className="w-full">
            {/* Background arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="#374151"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Value arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke={getColor(value)}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${value * 1.26} 126`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
            <span className="text-3xl font-bold text-white">{value}</span>
          </div>
        </div>

        {/* Details */}
        <div>
          <div 
            className="text-xl font-bold mb-2"
            style={{ color: getColor(value) }}
          >
            {classification}
          </div>
          <div className="text-sm text-slate-400">
            Updated: {new Date(data.current.timestamp).toLocaleDateString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Source: Alternative.me
          </div>
        </div>
      </div>

      {/* Mini sparkline of history */}
      <div className="mt-4 flex items-end gap-1 h-12">
        {data.history.slice(0, 14).reverse().map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t"
            style={{
              height: `${h.value}%`,
              backgroundColor: getColor(h.value),
              opacity: 0.6 + (i / 14) * 0.4,
            }}
            title={`${h.date}: ${h.value}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>14 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}
```

### Phase 3: Stock Market Custom Index (Week 2)

Build proprietary index using Alpha Vantage:

```typescript
// /app/api/fear-greed/stocks/route.ts

interface IndexComponent {
  name: string;
  weight: number;
  value: number; // 0-100 normalized
}

async function calculateStockFearGreed(): Promise<number> {
  const components: IndexComponent[] = [];

  // 1. VIX (Fear when high)
  const vix = await fetchVIX(); // From Alpha Vantage
  const vixScore = Math.max(0, Math.min(100, 100 - (vix - 12) * 3));
  components.push({ name: 'VIX', weight: 0.25, value: vixScore });

  // 2. RSI of SPY
  const rsi = await fetchRSI('SPY');
  const rsiScore = rsi; // RSI is already 0-100
  components.push({ name: 'RSI', weight: 0.20, value: rsiScore });

  // 3. Price vs Moving Average
  const maScore = await calculateMAScore('SPY');
  components.push({ name: 'Momentum', weight: 0.20, value: maScore });

  // 4. Market Breadth
  const breadthScore = await calculateBreadth();
  components.push({ name: 'Breadth', weight: 0.15, value: breadthScore });

  // 5. 52-week Highs vs Lows
  const highLowScore = await calculateHighLow();
  components.push({ name: 'HighsLows', weight: 0.10, value: highLowScore });

  // 6. Volume Trend
  const volumeScore = await calculateVolumeTrend('SPY');
  components.push({ name: 'Volume', weight: 0.10, value: volumeScore });

  // Calculate weighted average
  const totalScore = components.reduce(
    (sum, c) => sum + c.value * c.weight,
    0
  );

  return Math.round(totalScore);
}
```

---

## 4. Database Schema (Optional Caching)

```sql
-- Cache fear/greed readings for historical analysis
CREATE TABLE fear_greed_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market TEXT NOT NULL, -- 'crypto', 'stocks', 'combined'
  value INTEGER NOT NULL,
  classification TEXT NOT NULL,
  components JSONB, -- breakdown of factors
  source TEXT NOT NULL,
  recorded_at DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(market, recorded_at)
);

-- Index for quick lookups
CREATE INDEX idx_fear_greed_market_date ON fear_greed_history(market, recorded_at DESC);
```

---

## 5. Integration Points

### Dashboard Widget
Add to main dashboard as a quick sentiment indicator.

### Scanner Context
Show Fear & Greed alongside scan results to provide market context.

### AI Analyst Integration
Include current Fear & Greed in AI prompts for better analysis:

```typescript
const marketContext = `
Current market sentiment:
- Crypto Fear & Greed: ${cryptoFG.value} (${cryptoFG.classification})
- Stock Fear & Greed: ${stockFG.value} (${stockFG.classification})
`;
```

### Trading Journal
Log market sentiment at time of trade for pattern analysis.

---

## 6. Development Timeline

| Task | Time | Dependencies |
|------|------|--------------|
| Alternative.me API route | 2 hours | None |
| Fear/Greed gauge component | 4 hours | API route |
| Dashboard integration | 2 hours | Component |
| Historical caching | 2 hours | DB migration |
| Stock custom index | 1-2 days | Alpha Vantage |
| AI integration | 2 hours | Both indices |
| **Total Phase 1** | **1 day** | Crypto only |
| **Total Complete** | **3-4 days** | Both markets |

---

## 7. UI Placement Options

1. **Dashboard Header** - Prominent display next to market overview
2. **Sidebar Widget** - Always visible on tools pages
3. **Scanner Results** - Context for buy/sell decisions
4. **Dedicated Page** - `/tools/sentiment` with full analysis

---

## 8. Future Enhancements

- [ ] Push notifications on extreme readings
- [ ] Historical correlation with scanner picks
- [ ] Custom alerts (e.g., "Alert me when Fear < 20")
- [ ] Sector-specific sentiment (Tech, Energy, etc.)
- [ ] Social sentiment integration (Twitter/Reddit)
- [ ] Contrarian signals ("Buy when others are fearful")

---

## Resources

- **Alternative.me API**: https://alternative.me/crypto/fear-and-greed-index/
- **CNN Fear & Greed**: https://www.cnn.com/markets/fear-and-greed
- **Alpha Vantage VIX**: `FUNCTION=TIME_SERIES_DAILY&symbol=VIX`
- **Santiment**: https://santiment.net/
- **LunarCrush**: https://lunarcrush.com/

---

*Document created: December 22, 2025*
*For MarketScanner Pros internal use*
