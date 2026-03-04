# Midpoint System - Quick Integration Guide

## 🚀 Getting Started in 5 Minutes

### 1. Run Database Migration

```bash
# Apply the midpoints table schema
psql $DATABASE_URL -f migrations/001_timeframe_midpoints.sql
```

### 2. Backfill Historical Data

```typescript
// scripts/backfill-midpoints.ts
import { getCandleProcessor, parseCoinGeckoOHLC } from '../lib/candleProcessor';
import { getOHLC } from '../lib/coingecko';

async function backfill() {
  const processor = getCandleProcessor();
  const symbols = ['bitcoin', 'ethereum', 'solana']; // CoinGecko IDs
  const timeframes = ['1H', '4H', '1D', '1W'];
  
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      console.log(`Backfilling ${symbol} ${tf}...`);
      
      const days = tf === '1H' ? 7 : tf === '4H' ? 30 : 365;
      const ohlcData = await getOHLC(symbol, days);
      const bars = parseCoinGeckoOHLC(ohlcData);
      
      const count = await processor.processCandleBatch(
        symbol.toUpperCase() + 'USD',
        tf,
        bars,
        'crypto'
      );
      
      console.log(`  ✓ Stored ${count} midpoints`);
      await new Promise(r => setTimeout(r, 1000)); // Rate limit
    }
  }
}

backfill();
```

### 3. Integrate with Your Worker

```typescript
// In your existing worker/ingest-data.ts
import { getCandleProcessor } from '../lib/candleProcessor';

// Add this to your existing processSymbol function:
async function processSymbol(symbol: string) {
  // Your existing code to fetch OHLCV data
  const bars = await fetchOHLCVData(symbol, '1H');
  
  // NEW: Store midpoints
  const processor = getCandleProcessor();
  
  if (bars.length > 0) {
    const latestBar = bars[bars.length - 1];
    await processor.processCandle(symbol, '1H', latestBar, 'crypto');
  }
  
  // NEW: Update tagging status
  const currentPrice = bars[bars.length - 1].close;
  await processor.updateTaggingStatus(
    symbol,
    currentPrice * 1.001,
    currentPrice * 0.999
  );
}
```

### 4. Use with Time Gravity Map

```typescript
// In your API or component
import { getMidpointService } from './lib/midpointService';
import { computeTimeGravityMap } from './lib/time/timeGravityMap';

async function getTimeGravityMap(symbol: string, currentPrice: number) {
  // Fetch real midpoints from database
  const service = getMidpointService();
  const midpoints = await service.getUntaggedMidpoints(symbol, currentPrice, {
    maxDistancePercent: 10,
    limit: 100,
  });
  
  // Compute gravity map
  const tgm = computeTimeGravityMap(midpoints, currentPrice);
  
  return tgm;
}
```

---

## 📡 API Endpoints

### Fetch Midpoints

```bash
GET /api/midpoints?symbol=BTCUSD&currentPrice=68000
```

**Response:**
```json
{
  "success": true,
  "symbol": "BTCUSD",
  "currentPrice": 68000,
  "data": {
    "midpoints": [...],
    "count": 24,
    "stats": [
      {
        "timeframe": "1H",
        "total": 168,
        "untagged": 12,
        "tagged": 156,
        "taggedPercent": 92.86
      }
    ]
  }
}
```

### Store New Candle

```bash
POST /api/midpoints
Content-Type: application/json

{
  "symbol": "BTCUSD",
  "timeframe": "1H",
  "candle": {
    "time": "2025-01-09T12:00:00Z",
    "high": 68500,
    "low": 67800,
    "open": 68000,
    "close": 68200
  },
  "assetType": "crypto"
}
```

### Update Tagging

```bash
PUT /api/midpoints/tag
Content-Type: application/json

{
  "symbol": "BTCUSD",
  "currentHigh": 68050,
  "currentLow": 67950
}
```

**Response:**
```json
{
  "success": true,
  "taggedCount": 3,
  "message": "Tagged 3 midpoint(s)"
}
```

### Time Gravity Map (with Real Data)

```bash
GET /api/time-gravity-map?symbol=BTCUSD&price=68000
```

**Response includes:**
```json
{
  "success": true,
  "dataSource": "database",  // "database" | "demo" | "custom"
  "midpointCount": 24,
  "data": {
    "targetPrice": 68495,
    "confidence": 85,
    "zones": [...],
    "alert": "🎯 HIGH PROBABILITY TARGET..."
  }
}
```

---

## 🔧 Service Methods

### MidpointService

```typescript
import { getMidpointService } from './lib/midpointService';

const service = getMidpointService();

// Store single midpoint
await service.storeMidpoint(candle, 'crypto');

// Store batch
await service.storeMidpointBatch(candles, 'crypto');

// Check and tag
const tagged = await service.checkAndTagMidpoints(symbol, high, low);

// Get untagged
const midpoints = await service.getUntaggedMidpoints(symbol, price, {
  maxDistancePercent: 10,
  limit: 100,
});

// Get stats
const stats = await service.getMidpointStats(symbol);

// Cleanup old
await service.cleanupOldMidpoints(90); // days
```

### CandleProcessor

```typescript
import { getCandleProcessor } from './lib/candleProcessor';

const processor = getCandleProcessor();

// Process single candle
await processor.processCandle(symbol, timeframe, bar, assetType);

// Process batch
await processor.processCandleBatch(symbol, timeframe, bars, assetType);

// Update tagging
await processor.updateTaggingStatus(symbol, high, low);

// Get for TGM
const midpoints = await processor.getMidpointsForTGM(symbol, price);
```

---

## 📊 Database Queries

### Get Untagged Count by Timeframe

```sql
SELECT 
  timeframe,
  COUNT(*) as untagged_count
FROM timeframe_midpoints
WHERE symbol = 'BTCUSD'
  AND tagged = FALSE
GROUP BY timeframe
ORDER BY timeframe;
```

### Find Nearest Untagged Midpoint

```sql
SELECT *
FROM timeframe_midpoints
WHERE symbol = 'BTCUSD'
  AND tagged = FALSE
ORDER BY ABS(midpoint - 68000)
LIMIT 1;
```

### Check Tagging Rate

```sql
SELECT 
  symbol,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE tagged = TRUE) as tagged,
  ROUND(
    COUNT(*) FILTER (WHERE tagged = TRUE)::DECIMAL / COUNT(*) * 100,
    2
  ) as tag_rate
FROM timeframe_midpoints
GROUP BY symbol;
```

---

## 🎯 Real-World Example

### Complete Integration Flow

```typescript
// 1. Your existing data ingestion
async function ingestBTCData() {
  // Fetch from CoinGecko
  const ohlcData = await getOHLC('bitcoin', 7);
  const bars = parseCoinGeckoOHLC(ohlcData);
  
  // 2. Store midpoints
  const processor = getCandleProcessor();
  await processor.processCandleBatch('BTCUSD', '1H', bars, 'crypto');
  
  // 3. Get current price
  const currentPrice = bars[bars.length - 1].close;
  
  // 4. Update tagging
  await processor.updateTaggingStatus(
    'BTCUSD',
    currentPrice * 1.001,
    currentPrice * 0.999
  );
  
  // 5. Generate Time Gravity Map
  const midpoints = await processor.getMidpointsForTGM('BTCUSD', currentPrice);
  const tgm = computeTimeGravityMap(midpoints, currentPrice);
  
  // 6. Check for high-confidence setups
  if (tgm.confidence >= 80 && tgm.topZone?.activeDecompressionCount > 0) {
    console.log('🎯 HIGH PROBABILITY SETUP!');
    console.log(`Target: ${tgm.targetPrice}`);
    console.log(`Confidence: ${tgm.confidence}%`);
    console.log(`Alert: ${tgm.alert}`);
    
    // Send notification, execute trade, etc.
  }
}

// Run every hour
setInterval(ingestBTCData, 60 * 60 * 1000);
```

---

## ⚡ Performance Tips

1. **Batch Processing**: Use `processCandleBatch()` for historical data
2. **Limit Queries**: Use `maxDistancePercent` to reduce query size
3. **Clean Old Data**: Run cleanup monthly to keep database lean
4. **Index Usage**: Queries use indexes automatically
5. **Connection Pool**: Reuse the same pool instance

---

## 🐛 Common Issues

### "No midpoints returned"

```typescript
// ❌ Wrong
const midpoints = await service.getUntaggedMidpoints('BTC', 68000);

// ✅ Correct - use exact symbol
const midpoints = await service.getUntaggedMidpoints('BTCUSD', 68000);
```

### "Midpoints not updating"

```typescript
// Make sure you're calling this on every price tick:
await processor.updateTaggingStatus(symbol, currentHigh, currentLow);
```

### "Demo data still showing"

```typescript
// ❌ Wrong
fetch('/api/time-gravity-map?symbol=BTC&price=68000&useDemo=true')

// ✅ Correct - fetch real data
fetch('/api/time-gravity-map?symbol=BTCUSD&price=68000')
```

---

## 📋 Deployment Checklist

- [x] Database migration applied
- [x] Historical data backfilled
- [x] Worker updated to store midpoints
- [x] Price update handler added
- [x] API tested with real data
- [x] Time Gravity Map using database
- [x] Cleanup cron job scheduled
- [x] Monitoring setup for data quality

---

## 📞 Quick Reference

| What | Where | How |
|------|-------|-----|
| Store candles | `lib/candleProcessor.ts` | `processCandle()` |
| Fetch midpoints | `lib/midpointService.ts` | `getUntaggedMidpoints()` |
| Update tags | `lib/candleProcessor.ts` | `updateTaggingStatus()` |
| Database | `migrations/001_timeframe_midpoints.sql` | `psql -f` |
| API | `/api/midpoints` | GET/POST/PUT |
| TGM with real data | `/api/time-gravity-map` | `?symbol=X&price=Y` |

---

**You now have a complete, precise midpoint pipeline.** 🎯

Every candle → Exact midpoint → Real-time tagging → Time Gravity Map
