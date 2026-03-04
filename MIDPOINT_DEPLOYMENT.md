# Midpoint System Deployment Guide

This guide covers deploying the Time Gravity Map midpoint system to production.

## 🗂️ What's Been Built

The complete midpoint data pipeline includes:

1. **Database Schema** (`migrations/001_timeframe_midpoints.sql`)
   - `timeframe_midpoints` table with DECIMAL(20,8) precision
   - SQL functions for tagging and querying
   - Stats view for monitoring

2. **Service Layer** (`lib/midpointService.ts`)
   - Database operations (store, fetch, tag, cleanup)
   - Batch processing support
   - Statistics tracking

3. **Candle Processor** (`lib/candleProcessor.ts`)
   - Converts OHLCV candles → midpoints
   - Supports Alpha Vantage & CoinGecko formats
   - Real-time tagging updates

4. **API Endpoints** (`app/api/midpoints/route.ts`)
   - GET: Fetch untagged midpoints
   - POST: Store new candle
   - PUT: Update tagging status

5. **Time Gravity Map** (`app/api/time-gravity-map/route.ts`)
   - Uses real database midpoints
   - Decompression timing windows
   - Gravity field calculations

## 🚀 Deployment Steps

### Step 1: Apply Database Migration

Run the migration to create the `timeframe_midpoints` table:

```bash
npm run migrate:midpoints
```

**What it does:**
- Creates timeframe_midpoints table
- Sets up indexes for fast queries
- Creates SQL helper functions
- Creates midpoint_stats view

**Expected output:**
```
🔧 Running Midpoints Migration...

✓ Table does not exist, creating fresh...
📄 Executing migration file: 001_timeframe_midpoints.sql
✓ Migration executed successfully

✓ Table: timeframe_midpoints
✓ Columns: 9
✓ Indexes: 4
✓ Functions created: 3
✓ View created: midpoint_stats

✅ Migration complete!
```

### Step 2: Backfill Historical Data

Populate the database with historical midpoints:

```bash
# Backfill all symbols and timeframes (recommended first run)
npm run backfill:midpoints

# Or backfill specific symbol
npm run backfill:midpoints -- --symbol BTCUSD --timeframe 1D --days 365

# Or backfill specific timeframe
npm run backfill:midpoints -- --timeframe 1H --days 7
```

**What it does:**
- Fetches OHLCV data from CoinGecko
- Converts to midpoints
- Stores in database (batched for performance)
- Rate-limited to respect API limits (1.5s between requests)

**Expected output:**
```
🚀 Starting Historical Midpoint Backfill

Symbols: 10
Timeframes: 4
Total operations: 40

📈 Backfilling BTCUSD (bitcoin)
  📊 Fetching 1H data for BTCUSD (7 days)...
    ✓ Fetched 168 candles
    ✓ Parsed 168 candles
    ✓ Stored 168 midpoints in 2.1s
  Progress: 1/40 operations complete

... (continues for all symbols/timeframes)

📊 BACKFILL SUMMARY
Total Candles Processed: 4,200
Total Midpoints Stored:  4,200
Total Errors:            0
Total Duration:          82.3 minutes
```

**Symbols backfilled:**
- BTCUSD, ETHUSD, SOLUSD, XRPUSD, ADAUSD
- AVAXUSD, DOTUSD, DOGEUSD, LINKUSD, MATICUSD

**Timeframes backfilled:**
- 1H (7 days of data)
- 4H (30 days of data)
- 1D (365 days of data)
- 1W (730 days of data)

### Step 3: Verify Data

Check that data was stored correctly:

```bash
# Connect to your database and run:
SELECT COUNT(*) FROM timeframe_midpoints;

# Check per-symbol stats:
SELECT * FROM midpoint_stats ORDER BY midpoint_count DESC;

# Check recent midpoints for BTCUSD:
SELECT 
  timeframe,
  candle_close_time,
  midpoint,
  is_tagged,
  tagged_at
FROM timeframe_midpoints
WHERE symbol = 'BTCUSD'
ORDER BY candle_close_time DESC
LIMIT 20;
```

### Step 4: Test APIs

Test the midpoint API endpoint:

```bash
# Fetch untagged midpoints for BTCUSD at current price
curl "http://localhost:3000/api/midpoints?symbol=BTCUSD&currentPrice=68000&limit=20"

# Test Time Gravity Map
curl "http://localhost:3000/api/time-gravity-map?symbol=BTCUSD&currentPrice=68000"
```

### Step 5: Integration with Worker

Update your existing data ingestion worker to store midpoints:

**File:** `worker/ingest-data.ts`

```typescript
import { CandleProcessor } from '../lib/candleProcessor';

const candleProcessor = new CandleProcessor();

// After fetching OHLCV data from CoinGecko/Alpha Vantage:
async function processNewCandle(symbol: string, ohlcv: any) {
  // Your existing logic...
  
  // Add midpoint processing:
  const candle = {
    symbol: symbol,
    timeframe: '1H', // or whatever TF you're processing
    openTime: new Date(ohlcv.timestamp),
    closeTime: new Date(ohlcv.timestamp + 3600000), // +1 hour
    open: ohlcv.open,
    high: ohlcv.high,
    low: ohlcv.low,
    close: ohlcv.close,
    volume: ohlcv.volume
  };
  
  // Store midpoint and check for tags
  await candleProcessor.processCandle(candle);
  
  // Update tagging if price has crossed midpoints
  await candleProcessor.updateTaggingStatus(symbol, ohlcv.close);
}
```

## 📊 Monitoring

### Database Size

Monitor table size growth:

```sql
SELECT 
  pg_size_pretty(pg_total_relation_size('timeframe_midpoints')) as total_size,
  pg_size_pretty(pg_relation_size('timeframe_midpoints')) as table_size,
  pg_size_pretty(pg_indexes_size('timeframe_midpoints')) as indexes_size;
```

### Midpoint Stats

Check tagging statistics:

```sql
SELECT 
  symbol,
  timeframe,
  midpoint_count,
  tagged_count,
  untagged_count,
  ROUND(tagged_percentage, 2) as tagged_pct,
  newest_candle
FROM midpoint_stats
ORDER BY symbol, timeframe;
```

### Cleanup Old Data

Remove midpoints older than 2 years:

```typescript
import { MidpointService } from './lib/midpointService';

const service = new MidpointService();
const deleted = await service.cleanupOldMidpoints(730); // 730 days = 2 years
console.log(`Deleted ${deleted} old midpoints`);
```

## 🔄 Ongoing Maintenance

### Daily Backfill

Run daily to catch up on new data:

```bash
# Backfill just the short timeframes
npm run backfill:midpoints -- --timeframe 1H --days 1
npm run backfill:midpoints -- --timeframe 4H --days 2
```

### Weekly Backfill

Run weekly for longer timeframes:

```bash
npm run backfill:midpoints -- --timeframe 1D --days 7
npm run backfill:midpoints -- --timeframe 1W --days 14
```

### Add to Cron

**Linux/Mac:**
```cron
# Daily at 2 AM UTC
0 2 * * * cd /path/to/app && npm run backfill:midpoints -- --timeframe 1H --days 1

# Weekly on Sunday at 3 AM UTC
0 3 * * 0 cd /path/to/app && npm run backfill:midpoints -- --timeframe 1D --days 7
```

**Windows Task Scheduler:**
Create scheduled tasks to run the npm scripts at regular intervals.

## 🎯 Production Checklist

- [ ] Migration applied successfully
- [ ] Historical data backfilled (4,000+ midpoints)
- [ ] API endpoints returning data
- [ ] Time Gravity Map widget shows data
- [ ] Worker integrated with CandleProcessor
- [ ] Monitoring set up (database size, tagging %)
- [ ] Scheduled backfills configured
- [ ] Cleanup job scheduled (monthly)

## 🐛 Troubleshooting

### Migration Fails

**Error:** "table already exists"
- Safe to ignore if you've run it before
- Functions and indexes will be updated

**Error:** "permission denied"
- Check DATABASE_URL has write permissions
- Verify database user has CREATE TABLE rights

### Backfill Fails

**Error:** "Rate limit exceeded"
- Increase delay between requests (currently 1.5s)
- Use `--symbol` flag to backfill one at a time

**Error:** "No data returned from CoinGecko"
- Check internet connection
- Verify CoinGecko API is accessible
- Some coins may not have full history

### API Returns Empty

**Check:**
1. Migration applied? `SELECT COUNT(*) FROM timeframe_midpoints`
2. Data backfilled? `SELECT * FROM midpoint_stats`
3. Correct symbol? (must match exactly: "BTCUSD" not "btcusd")
4. Price in range? Midpoints must be within 5% of current price

## 📚 Next Steps

1. **Add More Symbols**: Edit `CRYPTO_SYMBOLS` in `scripts/backfill-midpoints.ts`
2. **Add Equities**: Create Alpha Vantage backfill script for stocks
3. **Add Real-time Updates**: Integrate WebSocket feeds for live tagging
4. **Add Alerts**: Notify when price approaches high-gravity midpoints

## 📖 Documentation

- Technical deep-dive: [MIDPOINT_DATA_PIPELINE.md](./MIDPOINT_DATA_PIPELINE.md)
- Integration guide: [MIDPOINT_INTEGRATION_GUIDE.md](./MIDPOINT_INTEGRATION_GUIDE.md)
- Time Gravity Map: [TIME_GRAVITY_MAP.md](./TIME_GRAVITY_MAP.md)

---

**Need Help?** Check the documentation or review the code in:
- `lib/candleProcessor.ts` - Candle processing logic
- `lib/midpointService.ts` - Database operations
- `migrations/001_timeframe_midpoints.sql` - Schema definition
