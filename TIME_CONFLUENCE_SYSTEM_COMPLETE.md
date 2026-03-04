# Complete Time Confluence System

## Overview

MarketScannerPros now has **three time confluence engines** that track cycles across all major markets:

1. **Crypto Time Confluence** - UTC anchor, calendar days (24/7)
2. **Equity Time Confluence** - Session anchor, trading days (holidays excluded)
3. **Cross-Market Confluence** - Unified view across crypto + equities + options + economic events

This gives you the **institutional edge** that professional desks use to detect major market moves.

---

## The Three Engines

### 1. Crypto Time Confluence Engine

**Anchor**: UTC midnight (00:00)  
**Cycle Type**: Calendar days  
**Trading**: 24/7 continuous

#### How It Works
Crypto trades continuously, so TradingView candles anchor to **UTC midnight**.

- 1D = 24 hours
- 3D = 72 hours  
- 21D = 504 hours

All cycles are pure multiples of 24 hours.

#### Key Cycles
| Cycle | Score | Meaning |
|-------|-------|---------|
| 3D | +1 | Short-term reversals |
| 5D | +1 | Breakout continuation |
| 7D | +2 | Weekly structural reset |
| 21D | +2 | 3-week cycle |
| 30D | +3 | Monthly close |
| 90D | +4 | Quarterly close |
| 180D | +4 | Half-year pivot |
| 365D | +5 | Yearly close |

#### Usage
```typescript
import { computeCryptoTimeConfluence } from '@/lib/time/cryptoTimeConfluence';

const crypto = computeCryptoTimeConfluence();
console.log('Crypto Score:', crypto.confluenceScore);
console.log('Active Cycles:', crypto.activeCycles);
```

#### API
```bash
# Get crypto confluence
curl http://localhost:3000/api/crypto-time-confluence

# Quick summary
curl http://localhost:3000/api/cross-market-confluence?market=crypto
```

---

### 2. Equity Time Confluence Engine

**Anchor**: Market close (16:00 ET / 21:00 UTC)  
**Cycle Type**: Trading days  
**Trading**: Session-based (weekends/holidays excluded)

#### How It Works
Equities only trade during market hours. TradingView builds candles from **session opens**, not 24-hour time.

**Key Difference**:
- 1D = **1 trading session** (not 24 hours)
- 5D = **1 trading week** (not 5 calendar days)
- 21D = **21 trading sessions** (≈ 1 month, excluding weekends/holidays)

#### Trading Day vs Calendar Day

**Example Timeline**:
```
Calendar:
Fri → Sat → Sun → Mon

Trading Days:
Fri (day 5) → [weekend skip] → Mon (day 6)
```

Weekends and holidays **don't count**.

#### Key Cycles
| Cycle | Trading Days | Score | Meaning |
|-------|--------------|-------|---------|
| 3D | 3 | +1 | Short-term reversals |
| 5D | 5 | +2 | Weekly close |
| 10D | 10 | +1 | 2-week cycle |
| 20D | 20 | +2 | Monthly close (~4 weeks) |
| 21D | 21 | +2 | Full month cycle |
| 42D | 42 | +2 | 2-month cycle |
| 63D | 63 | +4 | Quarterly close (~3 months) |
| 126D | 126 | +4 | Half-year (~6 months) |
| 252D | 252 | +5 | Yearly close (~1 year) |

**Note**: ~252 trading days in a year (52 weeks × 5 days - ~10 holidays)

#### Usage
```typescript
import { computeEquityTimeConfluence } from '@/lib/time/equityTimeConfluence';

const equity = computeEquityTimeConfluence();
console.log('Equity Score:', equity.confluenceScore);
console.log('Trading Day Index:', equity.tradingDayIndex);
console.log('Active Cycles:', equity.activeCycles);
```

#### API
```bash
# Get equity confluence
curl http://localhost:3000/api/cross-market-confluence?market=equity
```

---

### 3. Cross-Market Confluence Engine

**Tracks**:
- Crypto cycles
- Equity cycles
- Options expiry (OPEX)
- Economic calendar events (FOMC, NFP, CPI, etc.)

#### Why This Matters

Professional desks know that **the biggest moves happen when multiple markets align**.

**Example High-Confluence Event**:
```
BTC 21D close         +2
SPX 21D close         +2
Monthly OPEX          +3
FOMC meeting          +5
────────────────────
Total Score:         12 🚨 EXTREME
```

This clustering creates **massive volatility expansion**.

#### Options Expiry Cycles
| Type | Score | Frequency | Details |
|------|-------|-----------|---------|
| Weekly OPEX | +1 | Every Friday | Minor impact |
| Monthly OPEX | +3 | 3rd Friday | Standard expiry |
| Quarterly OPEX | +5 | Mar/Jun/Sep/Dec | Major "OpEx" |
| Yearly OPEX | +7 | December | Leaps expiry |

#### Economic Events
| Event | Score | Impact |
|-------|-------|--------|
| FOMC Meeting | +5 | Fed rate decisions |
| Non-Farm Payrolls | +4 | Employment data |
| CPI Release | +4 | Inflation data |
| GDP Release | +4 | Economic growth |
| PPI Release | +3 | Producer inflation |
| Retail Sales | +3 | Consumer spending |

#### Usage
```typescript
import { computeCrossMarketConfluence } from '@/lib/time/crossMarketConfluence';

const cross = computeCrossMarketConfluence();

console.log('Total Score:', cross.totalConfluenceScore);
console.log('Crypto contribution:', cross.cryptoContribution);
console.log('Equity contribution:', cross.equityContribution);
console.log('Options contribution:', cross.optionsContribution);
console.log('Economic contribution:', cross.economicContribution);

// Check all active events
cross.activeEvents.forEach(event => {
  console.log(`${event.label}: ${event.hoursAway}h (score: ${event.score})`);
});
```

#### API
```bash
# Full cross-market analysis
curl http://localhost:3000/api/cross-market-confluence

# Quick summary
curl http://localhost:3000/api/cross-market-confluence?summary=true
```

---

## Confluence Scoring System

### Score Thresholds

| Score | Level | Description | Action |
|-------|-------|-------------|--------|
| 0-2 | LOW | Minimal confluence | Standard trading |
| 3-5 | MEDIUM | Moderate edge | Watch for setups |
| 6-9 | HIGH | Strong confluence | Prepare for volatility |
| 10-14 | HIGH+ | Multi-market alignment | Reduce size or wait |
| ≥15 | EXTREME | Cross-market cluster | Major move expected |

### Calculation Logic

**Single Market** (Crypto or Equity):
```
Score = Σ (cycle scores for cycles closing within 48h)

Example:
3D + 21D + 30D = 1 + 2 + 3 = 6 (HIGH)
```

**Cross-Market**:
```
Total Score = Crypto Score + Equity Score + Options Score + Economic Score

Example:
Crypto 21D:     +2
Equity 20D:     +2
Monthly OPEX:   +3
FOMC:           +5
──────────────
Total:          12 (EXTREME)
```

---

## Real-World Examples

### Example 1: Crypto Only (Medium)
```
Active: 3D + 5D
Score: 1 + 1 = 2
Level: LOW
Action: Minor crypto time edge, watch BTC for small moves
```

### Example 2: Equity Only (High)
```
Active: 5D + 21D + 63D (quarterly)
Score: 2 + 2 + 4 = 8
Level: HIGH
Action: Major SPX cycle close, watch for volatility
```

### Example 3: Cross-Market (Extreme) 🚨
```
Crypto 30D:         +3
Equity 63D (Qtr):   +4
Quarterly OPEX:     +5
CPI Release:        +4
────────────────
Total:              16
Level: EXTREME

Alert: "🚨 EXTREME CROSS-MARKET CONFLUENCE"
Action: Reduce positions, wait for decompression, or trade with tight stops
```

---

## Trading Strategy Integration

### Pre-Entry Checklist

Before entering any trade, check:

1. **Crypto Score** (if trading crypto)
2. **Equity Score** (if trading stocks/indices)
3. **Cross-Market Score** (always)
4. **Economic Calendar** (next 48h)

### Position Sizing Matrix

| Confluence | Position Size | Reasoning |
|-----------|---------------|-----------|
| Low (0-2) | 100% standard | Normal market conditions |
| Medium (3-5) | 100% standard | Some confluence, but manageable |
| High (6-9) | 50-75% | Time compression building |
| Extreme (≥10) | 25-50% OR wait | Major decompression window |

### Best Setups (3-Factor Confluence)

Institutional traders wait for:

1. **High Time Confluence** (score ≥ 6)
2. **Price at Key Level** (support/resistance, Fibonacci, etc.)
3. **Momentum Confirmation** (breakout, reversal pattern)

**When all 3 align** → Highest probability setup.

---

## API Reference

### Crypto Confluence
```bash
GET /api/crypto-time-confluence
GET /api/crypto-time-confluence?symbol=BTC
GET /api/crypto-time-confluence?upcomingOnly=true
```

### Equity Confluence
```bash
GET /api/cross-market-confluence?market=equity
```

### Cross-Market Confluence
```bash
# Full analysis
GET /api/cross-market-confluence

# Quick summary
GET /api/cross-market-confluence?summary=true

# Crypto only
GET /api/cross-market-confluence?market=crypto

# Equity only
GET /api/cross-market-confluence?market=equity
```

### Response Format

```json
{
  "success": true,
  "market": "all",
  "timestamp": "2026-03-04T12:00:00.000Z",
  "totalConfluenceScore": 12,
  "confluenceLevel": "extreme",
  "isExtremeConfluence": true,
  "description": "EXTREME cross-market confluence...",
  "alert": "🚨 EXTREME CROSS-MARKET CONFLUENCE...",
  "breakdown": {
    "crypto": 3,
    "equity": 4,
    "options": 5,
    "economic": 0
  },
  "activeEvents": [
    {
      "type": "crypto",
      "label": "Crypto 30D",
      "score": 3,
      "hoursAway": 12.5,
      "isHighPriority": true,
      "details": "BTC/crypto 30D cycle close"
    },
    {
      "type": "equity",
      "label": "Equity 63D",
      "score": 4,
      "hoursAway": 18.2,
      "isHighPriority": true,
      "details": "SPX/equity 63D cycle close (2 trading days)"
    },
    {
      "type": "options",
      "label": "Quarterly OPEX",
      "score": 5,
      "hoursAway": 24.0,
      "isHighPriority": true,
      "details": "Quarterly OPEX (OpEx) - 2026-03-05"
    }
  ]
}
```

---

## File Structure

```
lib/time/
├── cryptoTimeConfluence.ts    # Crypto engine (UTC anchor, calendar days)
├── equityTimeConfluence.ts    # Equity engine (session anchor, trading days)
└── crossMarketConfluence.ts   # Cross-market aggregator

app/api/
├── crypto-time-confluence/route.ts      # Crypto API
└── cross-market-confluence/route.ts     # Unified API

components/
└── CryptoTimeConfluenceWidget.tsx       # Crypto widget (can be extended)

test/
└── crypto-time-confluence.test.ts       # Tests
```

---

## Why This Beats TradingView

TradingView shows you **single-market technicals**.

MarketScannerPros shows you **cross-market time confluences**.

**What TradingView doesn't tell you**:
- When crypto 21D + equity 21D + OPEX align
- Trading day index for equity cycles
- Options expiry impact on underlying
- Economic event clustering

**What MSP can detect**:
```
BTC 21D close    (Crypto)
SPX 21TD close   (Equity)
Monthly OPEX     (Options)
CPI Release      (Economic)

→ This cluster = institutional repositioning window
→ Major market move likely
```

This is **how the pros trade**.

---

## Next Steps

1. **Test the APIs**: Try each endpoint
2. **Integrate into Scanner**: Add time confluence scoring
3. **Build Widgets**: Create dashboard views
4. **Set Alerts**: Notify when score ≥ 10
5. **Backtest**: Validate historical confluence events

---

## Support

For questions:
- See individual engine source files for detailed comments
- Check test files for usage examples
- Review API responses for data structure

**Remember**: Time confluence is a **timing accelerator** and **risk filter**, not a directional signal. Always combine with price action, volume, and fundamentals.

---

*MarketScannerPros - Institutional-grade cross-market time analysis*
