# Precise Midpoint Data Pipeline - Implementation Guide

## 🎯 Overview

This document explains how **precise candle data is converted into midpoints** for the Time Gravity Map system. Every closed candle (1H, 4H, 1D, etc.) automatically generates a midpoint that's stored in the database and tracked for tagging.

---

## 📊 The Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌─────▼─────┐    ┌─────▼──────┐
   │  Alpha  │      │ CoinGecko │    │   Custom   │
   │ Vantage │      │   OHLC    │    │   Feed     │
   │ (Stocks)│      │  (Crypto) │    │            │
   └────┬────┘      └─────┬─────┘    └─────┬──────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│              CANDLE PROCESSOR (lib/candleProcessor.ts)          │
│                                                                 │
│  • Normalizes timeframes (60min → 1H, daily → 1D)              │
│  • Calculates candle_open_time and candle_close_time           │
│  • Calculates midpoint = (high + low) / 2                      │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│           MIDPOINT SERVICE (lib/midpointService.ts)             │
│                                                                 │
│  • Stores midpoint in PostgreSQL                               │
│  • Prevents duplicates (unique constraint)                     │
│  • Indexes for fast queries                                    │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│               DATABASE (timeframe_midpoints table)              │
│                                                                 │
│  Columns:                                                       │
│  • symbol, timeframe, candle_open/close_time                   │
│  • high, low, midpoint                                         │
│  • tagged (boolean), tagged_at, tagged_price                   │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PRICE UPDATE LOOP                            │
│                                                                 │
│  Every price tick:                                             │
│  1. Check if current price crosses any untagged midpoints      │
│  2. Mark crossed midpoints as "tagged"                         │
│  3. Store tagged_at timestamp and tagged_price                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│      TIME GRAVITY MAP (lib/time/timeGravityMap.ts)              │
│                                                                 │
│  • Fetches untagged midpoints from database                    │
│  • Calculates gravity for each midpoint                        │
│  • Creates gravity zones (clusters)                            │
│  • Generates targets and confidence scores                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Table: `timeframe_midpoints`

```sql
CREATE TABLE timeframe_midpoints (
  id BIGSERIAL PRIMARY KEY,
  
  -- Symbol & Market
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL DEFAULT 'crypto',
  
  -- Timeframe
  timeframe VARCHAR(10) NOT NULL,
  
  -- Candle Data (THIS IS THE PRECISE DATA)
  candle_open_time TIMESTAMPTZ NOT NULL,
  candle_close_time TIMESTAMPTZ NOT NULL,
  high DECIMAL(20,8) NOT NULL,
  low DECIMAL(20,8) NOT NULL,
  midpoint DECIMAL(20,8) NOT NULL,  -- (high + low) / 2
  open_price DECIMAL(20,8),
  close_price DECIMAL(20,8),
  volume DECIMAL(20,8),
  
  -- Tagging Status (Has price hit this midpoint?)
  tagged BOOLEAN DEFAULT FALSE,
  tagged_at TIMESTAMPTZ,
  tagged_price DECIMAL(20,8),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicates: one midpoint per symbol/timeframe/candle
  CONSTRAINT unique_midpoint UNIQUE (symbol, timeframe, candle_close_time)
);
```

**Key Points:**
- **Precision**: Stores exact OHLC data with 8 decimal places
- **Uniqueness**: One midpoint per candle (prevents duplicates)
- **Time Tracking**: Both candle times AND tagged time
- **Tagging**: Boolean flag + timestamp when price hit it

---

## 🔧 Integration with Existing Worker

### Step 1: Add Midpoint Storage to Data Ingestion

In your existing `worker/ingest-data.ts`, add this after fetching candles:

```typescript
import { getCandleProcessor } from '../lib/candleProcessor';

// In your worker loop, after fetching OHLCV data:
async function processSymbol(symbol: string, assetType: 'crypto' | 'stock') {
  // 1. Fetch candles (your existing code)
  const candles = await fetchCandles(symbol, ['1H', '4H', '1D']);
  
  // 2. Store midpoints (NEW)
  const processor = getCandleProcessor();
  
  for (const [timeframe, bars] of Object.entries(candles)) {
    if (bars.length > 0) {
      // Process the most recent closed candle
      const latestCandle = bars[bars.length - 1];
      
      await processor.processCandle(
        symbol,
        timeframe,
        latestCandle,
        assetType
      );
    }
  }
  
  // 3. Update tagging status
  const currentPrice = await getCurrentPrice(symbol);
  await processor.updateTaggingStatus(
    symbol,
    currentPrice * 1.001,  // Allow small tolerance for high
    currentPrice * 0.999   // Allow small tolerance for low
  );
}
```

### Step 2: Backfill Historical Data

Run once to populate historical midpoints:

```typescript
import { getCandleProcessor, parseCoinGeckoOHLC } from '../lib/candleProcessor';
import { getOHLC } from '../lib/coingecko';

async function backfillMidpoints(symbol: string) {
  const processor = getCandleProcessor();
  
  // Fetch historical data
  const timeframes = ['1H', '4H', '1D', '1W', '1M'];
  
  for (const tf of timeframes) {
    console.log(`Backfilling ${symbol} ${tf}...`);
    
    // Fetch OHLC data (adjust days based on timeframe)
    const days = tf === '1H' ? 7 : tf === '4H' ? 30 : 365;
    const ohlcData = await getOHLC(symbol, days);
    
    const bars = parseCoinGeckoOHLC(ohlcData);
    
    const inserted = await processor.processCandleBatch(
      symbol,
      tf,
      bars,
      'crypto'
    );
    
    console.log(`  ✓ Stored ${inserted} midpoints`);
  }
}

// Run for your symbols
await backfillMidpoints('bitcoin'); // CoinGecko ID
await backfillMidpoints('ethereum');
```

---

## 📡 Real-Time Price Updates

### Update Tagging on Every Price Tick

```typescript
import { getCandleProcessor } from './lib/candleProcessor';

// In your price update handler (WebSocket, polling, etc.):
async function onPriceUpdate(symbol: string, price: number) {
  const processor = getCandleProcessor();
  
  // Check and tag any midpoints that price crossed
  const taggedCount = await processor.updateTaggingStatus(
    symbol,
    price * 1.0005,  // High (0.05% tolerance)
    price * 0.9995   // Low (0.05% tolerance)
  );
  
  if (taggedCount > 0) {
    console.log(`✓ Tagged ${taggedCount} midpoint(s) for ${symbol}`);
  }
}
```

**Why tolerance?**
- Market microstructure noise
- Bid-ask spread
- Prevents missing tags due to rounding

---

## 🎯 Fetching Midpoints for Time Gravity Map

### Method 1: Via API

```javascript
// Fetch untagged midpoints for a symbol
const response = await fetch('/api/midpoints?symbol=BTCUSD&currentPrice=68000&maxDistance=10');
const { data } = await response.json();

// data.midpoints = array of MidpointRecord objects
// data.stats = statistics by timeframe
```

### Method 2: Direct Service Call

```typescript
import { getMidpointService } from './lib/midpointService';

const service = getMidpointService();

const midpoints = await service.getUntaggedMidpoints('BTCUSD', 68000, {
  maxDistancePercent: 10.0,  // Only within 10% of current price
  limit: 100,
  minAge: 5,  // At least 5 minutes old
});

// Use with Time Gravity Map
import { computeTimeGravityMap } from './lib/time/timeGravityMap';
const tgm = computeTimeGravityMap(midpoints, 68000);
```

---

## 🔍 Precision Details

### How Midpoint is Calculated

```typescript
// For each closed candle:
const midpoint = (candle.high + candle.low) / 2;

// Example:
// Candle: High = 68,500, Low = 67,800
// Midpoint = (68,500 + 67,800) / 2 = 68,150
```

### How Candle Times are Determined

```typescript
// For a 1H candle that opened at 12:00:00 UTC
const candleOpenTime = new Date('2025-01-09T12:00:00Z');
const candleCloseTime = new Date('2025-01-09T13:00:00Z');

// For a 1D candle (crypto - UTC midnight)
const candleOpenTime = new Date('2025-01-09T00:00:00Z');
const candleCloseTime = new Date('2025-01-10T00:00:00Z');

// For a 1D candle (equity - session close 16:00 ET)
const candleOpenTime = new Date('2025-01-09T09:30:00-05:00');
const candleCloseTime = new Date('2025-01-09T16:00:00-05:00');
```

### How Tagging is Detected

```typescript
// A midpoint is "tagged" when:
currentPrice >= midpoint && previousPrice < midpoint  // Crossed upward
// OR
currentPrice <= midpoint && previousPrice > midpoint  // Crossed downward

// In practice, we use a tolerance band:
const tolerance = 0.0005; // 0.05%
const isTagged = (
  currentHigh >= midpoint * (1 - tolerance) &&
  currentLow <= midpoint * (1 + tolerance)
);
```

---

## 📊 Data Quality Assurance

### 1. Duplicate Prevention

```sql
-- Unique constraint ensures one midpoint per candle
CONSTRAINT unique_midpoint UNIQUE (symbol, timeframe, candle_close_time)

-- If you try to insert the same candle twice:
-- ON CONFLICT DO UPDATE (updates the existing record)
```

### 2. Data Validation

```typescript
// Candle validation before storage
function validateCandle(candle: OHLCVBar): boolean {
  return (
    candle.high >= candle.low &&
    candle.high >= candle.open &&
    candle.high >= candle.close &&
    candle.low <= candle.open &&
    candle.low <= candle.close &&
    candle.time instanceof Date &&
    !isNaN(candle.time.getTime())
  );
}
```

### 3. Cleanup Old Data

```typescript
// Remove old tagged midpoints (run monthly)
const service = getMidpointService();
const deletedCount = await service.cleanupOldMidpoints(90); // Keep 90 days
console.log(`Deleted ${deletedCount} old midpoints`);
```

---

## 🚀 Performance Optimization

### 1. Indexes

```sql
-- Fast queries by symbol + timeframe
CREATE INDEX idx_midpoints_symbol_tf 
  ON timeframe_midpoints(symbol, timeframe, candle_close_time DESC);

-- Fast queries for untagged midpoints
CREATE INDEX idx_midpoints_untagged 
  ON timeframe_midpoints(symbol, timeframe, tagged) 
  WHERE tagged = FALSE;
```

### 2. Batch Processing

```typescript
// Instead of one-by-one:
for (const candle of candles) {
  await processor.processCandle(...);  // SLOW
}

// Use batch:
await processor.processCandleBatch(symbol, timeframe, candles, assetType);  // FAST
```

### 3. Connection Pooling

```typescript
// Use a single pool instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,
});

const service = new MidpointService({ pool });
```

---

## 🧪 Testing

### Unit Test: Midpoint Calculation

```typescript
import { MidpointService } from './lib/midpointService';

test('calculates midpoint correctly', () => {
  const midpoint = MidpointService.calculateMidpoint(68500, 67800);
  expect(midpoint).toBe(68150);
});
```

### Integration Test: Store and Retrieve

```typescript
test('stores and retrieves midpoint', async () => {
  const service = getMidpointService();
  
  // Store
  const stored = await service.storeMidpoint({
    symbol: 'TESTBTC',
    timeframe: '1H',
    openTime: new Date('2025-01-09T12:00:00Z'),
    closeTime: new Date('2025-01-09T13:00:00Z'),
    open: 68000,
    high: 68500,
    low: 67800,
    close: 68200,
  }, 'crypto');
  
  expect(stored).not.toBeNull();
  expect(stored.midpoint).toBe(68150);
  
  // Retrieve
  const midpoints = await service.getUntaggedMidpoints('TESTBTC', 68000);
  expect(midpoints.length).toBeGreaterThan(0);
  expect(midpoints[0].midpoint).toBe(68150);
});
```

---

## 📋 Checklist for Production

- [ ] Run database migration: `001_timeframe_midpoints.sql`
- [ ] Backfill historical data for your symbols
- [ ] Integrate `getCandleProcessor()` into data ingestion worker
- [ ] Add price update handler to check/tag midpoints
- [ ] Set up cleanup cron job (monthly)
- [ ] Monitor database size and query performance
- [ ] Add error handling and logging
- [ ] Test with live data before going to production

---

## 🔧 Troubleshooting

### "No midpoints found for symbol"

**Cause:** No candles processed yet  
**Fix:** Run backfill script or wait for worker to process candles

### "Midpoints not being tagged"

**Cause:** Price tolerance too strict  
**Fix:** Increase tolerance to 0.1% or 0.2%

### "Duplicate key violation"

**Cause:** Trying to insert same candle twice  
**Fix:** This is expected - uses `ON CONFLICT DO UPDATE`

### "Database connection timeout"

**Cause:** Too many concurrent queries  
**Fix:** Increase pool size or use connection pooling

---

## 📞 API Reference

### Store Candle / Midpoint

```bash
POST /api/midpoints
Content-Type: application/json

{
  "symbol": "BTCUSD",
  "timeframe": "1H",
  "candle": {
    "time": "2025-01-09T12:00:00Z",
    "open": 68000,
    "high": 68500,
    "low": 67800,
    "close": 68200,
    "volume": 1234.56
  },
  "assetType": "crypto"
}
```

### Fetch Untagged Midpoints

```bash
GET /api/midpoints?symbol=BTCUSD&currentPrice=68000&maxDistance=10&limit=100
```

### Update Tagging Status

```bash
PUT /api/midpoints/tag
Content-Type: application/json

{
  "symbol": "BTCUSD",
  "currentHigh": 68050,
  "currentLow": 67950
}
```

---

## 🎓 Summary

The midpoint pipeline ensures **precision at every step**:

1. ✅ **Source Data**: Real OHLCV from Alpha Vantage / CoinGecko
2. ✅ **Calculation**: Exact midpoint = (high + low) / 2
3. ✅ **Storage**: PostgreSQL with 8 decimal precision
4. ✅ **Tagging**: Real-time detection when price crosses midpoint
5. ✅ **Retrieval**: Fast indexed queries for Time Gravity Map

This creates the **most accurate time confluence system possible** because every midpoint is based on **actual closed candles** from real market data, not estimates or approximations.

---

**Your Time Gravity Map is now powered by precise, real market data.** 🚀
