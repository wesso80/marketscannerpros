# Crypto Time Confluence Engine

## Overview

The Crypto Time Confluence Engine is an institutional-grade timing system that tracks crypto market cycles from 1 to 365 days, all anchored to the daily UTC close at 00:00 (11:00 AM Sydney time).

This system helps identify high-probability volatility expansion windows by detecting when multiple important time cycles close simultaneously.

## How It Works

### Daily Close Anchor

For TradingView crypto charts, **every higher timeframe derives from the daily close at 00:00 UTC**.

- **UTC Midnight** = Daily close for crypto
- **Sydney Time (UTC+11)** = 11:00 AM local time
- **New York Time (UTC-5)** = 7:00 PM previous day

All higher timeframe cycles (3D, 7D, 30D, 90D, 365D) are multiples of this daily close.

### The 4 Cycle Tiers

#### 1-7 Day Micro Cycle
| Cycle | Meaning | Score |
|-------|---------|-------|
| 3D | Short-term trend reversals | +1 |
| 5D | Breakout continuation | +1 |
| 7D | Weekly structural reset | +2 |

#### 8-30 Day Monthly Cycle
| Cycle | Meaning | Score |
|-------|---------|-------|
| 14D | Mid-cycle reset (RSI style) | +1 |
| 21D | 3-week cycle (important) | +2 |
| 30D | Monthly close | +3 |

#### 31-90 Day Macro Rotation
| Cycle | Meaning | Score |
|-------|---------|-------|
| 45D | Momentum expansion | +2 |
| 60D | 2-month cycle reset | +2 |
| 90D | Quarterly close | +4 |

#### 91-365 Day Institutional Cycle
| Cycle | Meaning | Score |
|-------|---------|-------|
| 180D | Half-year macro pivot | +4 |
| 365D | Yearly close | +5 |

### Confluence Scoring

The engine calculates a **confluence score** by summing the scores of all cycles closing within the next **48 hours**.

**Alert Threshold**: Score ≥ 6

**Confluence Levels**:
- **Extreme** (≥10): Multiple major cycles aligning. Massive decompression window likely.
- **High** (6-9): Strong confluence. Watch for breakout/breakdown.
- **Medium** (3-5): Moderate time edge. Some cycle alignment.
- **Low** (0-2): Minimal confluence. Low time compression.

### High-Probability Confluence Nodes

The most important cycles to track:
```
3D, 5D, 7D, 14D, 21D, 30D, 45D, 60D, 90D, 180D, 365D
```

When **multiple** of these align (e.g., 21D + 30D + 45D), expect **volatility expansion**.

## Usage

### 1. Import the Engine

```typescript
import {
  computeCryptoTimeConfluence,
  getUpcomingHighPriorityCycles,
  formatTimeRemaining,
  CONFLUENCE_ALERT_THRESHOLD,
} from '@/lib/time/cryptoTimeConfluence';
```

### 2. Calculate Confluence

```typescript
const confluence = computeCryptoTimeConfluence();

console.log('Confluence Score:', confluence.confluenceScore);
console.log('Level:', confluence.confluenceLevel);
console.log('Alert:', confluence.alert);

// Check active cycles (next 48h)
confluence.activeCycles.forEach(cycle => {
  console.log(`${cycle.cycle}: ${cycle.hoursToClose.toFixed(1)}h (score: ${cycle.score})`);
});
```

### 3. Use the React Widget

```tsx
import CryptoTimeConfluenceWidget from '@/components/CryptoTimeConfluenceWidget';

export default function Dashboard() {
  return (
    <div>
      <CryptoTimeConfluenceWidget 
        autoRefresh={true}
        refreshInterval={60000}
      />
    </div>
  );
}
```

### 4. Call the API Endpoint

**GET Request** (single check):
```bash
curl http://localhost:3000/api/crypto-time-confluence
```

**GET with symbol** (check if BTC should alert):
```bash
curl http://localhost:3000/api/crypto-time-confluence?symbol=BTC&minScore=6
```

**GET upcoming only**:
```bash
curl http://localhost:3000/api/crypto-time-confluence?upcomingOnly=true
```

**POST Request** (batch check multiple symbols):
```bash
curl -X POST http://localhost:3000/api/crypto-time-confluence \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["BTC", "ETH", "SOL"],
    "minScore": 6,
    "requireHighPriority": true
  }'
```

### 5. Example Response

```json
{
  "success": true,
  "timestamp": "2026-03-04T12:30:00.000Z",
  "nextDailyClose": "2026-03-05T00:00:00.000Z",
  "hoursToNextDaily": 11.5,
  "confluenceScore": 7,
  "confluenceLevel": "high",
  "isHighConfluence": true,
  "description": "HIGH confluence (score 7): 4 cycles closing. Watch for breakout/breakdown.",
  "alert": "⚠️ HIGH TIME CONFLUENCE DETECTED: 3D + 21D + 30D closing within 48h. Score: 7. Expect volatility expansion window.",
  "activeCycles": [
    {
      "cycle": "3D",
      "cycleDays": 3,
      "score": 1,
      "nextClose": "2026-03-05T00:00:00.000Z",
      "hoursToClose": 11.5,
      "isHighPriority": true
    },
    {
      "cycle": "21D",
      "cycleDays": 21,
      "score": 2,
      "nextClose": "2026-03-05T00:00:00.000Z",
      "hoursToClose": 11.5,
      "isHighPriority": true
    },
    {
      "cycle": "30D",
      "cycleDays": 30,
      "score": 3,
      "nextClose": "2026-03-05T00:00:00.000Z",
      "hoursToClose": 11.5,
      "isHighPriority": true
    }
  ],
  "cycleBreakdown": [
    "3D (11.5h, score: 1)",
    "21D (11.5h, score: 2)",
    "30D (11.5h, score: 3)"
  ]
}
```

## Real-World Examples

### Example 1: Low Confluence
```
Active Cycles: 2D (closing in 5h)
Confluence Score: 0
Level: LOW
Action: No special time edge
```

### Example 2: Medium Confluence
```
Active Cycles: 3D + 5D (both closing in 18h)
Confluence Score: 2
Level: MEDIUM
Action: Minor time edge, watch for small moves
```

### Example 3: High Confluence
```
Active Cycles: 7D + 21D + 30D (closing in 24h)
Confluence Score: 7
Level: HIGH
Action: ⚠️ HIGH CONFLUENCE - Watch for breakout/breakdown
```

### Example 4: Extreme Confluence
```
Active Cycles: 21D + 30D + 90D + 180D (closing in 12h)
Confluence Score: 13
Level: EXTREME
Action: 🚨 EXTREME CONFLUENCE - Major decompression window likely
```

## Integration with Trading Strategy

### Pre-Entry Checklist
1. Check confluence score before entering position
2. If score ≥ 6, prepare for potential volatility expansion
3. Consider wider stops if entering near high confluence window

### Position Sizing
- **Low confluence (0-2)**: Standard position size
- **Medium confluence (3-5)**: Standard position size
- **High confluence (6-9)**: Consider reducing size or waiting for confirmation
- **Extreme confluence (≥10)**: Reduce size or wait for decompression to complete

### Exit Timing
- High confluence windows often mark trend exhaustion points
- Consider taking partial profits before major cycle closes
- Re-evaluate thesis after confluence window passes

### Confluence + Price Action
Best setups occur when:
1. **High time confluence** (score ≥ 6)
2. **Price at key level** (support/resistance, 50% Fib, etc.)
3. **Momentum confirmation** (breakout, reversal pattern)

This is the **3-factor confluence** institutional traders watch for.

## Advanced Features

### Filtering by Priority

```typescript
// Get only high-priority cycles in next 7 days
const highPriority = getUpcomingHighPriorityCycles();

highPriority.forEach(cycle => {
  console.log(`${cycle.cycle}: ${formatTimeRemaining(cycle.hoursToClose)}`);
});
```

### Symbol-Specific Alerts

```typescript
const shouldAlert = shouldAlertSymbol('BTC', confluence, {
  minScore: 6,
  requireHighPriority: true,
});

if (shouldAlert) {
  console.log('⚠️ BTC: High confluence window detected!');
}
```

### Custom Scoring

You can modify `CYCLE_SCORES` in [`cryptoTimeConfluence.ts`](c:\Users\bradl\Downloads\marketscannerpros-main (2)\marketscannerpros-main\lib\time\cryptoTimeConfluence.ts) to customize which cycles are most important for your strategy.

## Technical Details

### Cycle Calculation

All cycles are calculated using modulo arithmetic from Unix epoch:

```typescript
daysSinceEpoch % cycleDays = days into current cycle
cycleDays - daysInCurrentCycle = days until next close
```

This ensures all cycles align perfectly with UTC midnight.

### Time Zones

The engine works in **UTC only**. Display conversions to local time happen in the UI layer.

For Sydney traders:
- UTC 00:00 = 11:00 AM AEDT (UTC+11)
- UTC 00:00 = 10:00 AM AEST (UTC+10)

### Performance

- Computation: ~1ms
- No external API calls
- Pure calculation (can run client or server-side)
- Suitable for real-time updates

## Dashboard Integration

Add the widget to your crypto dashboard:

```tsx
// In app/tools/crypto-dashboard/page.tsx
import CryptoTimeConfluenceWidget from '@/components/CryptoTimeConfluenceWidget';

export default function CryptoDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <CryptoTimeConfluenceWidget className="md:col-span-2" />
      {/* Other widgets */}
    </div>
  );
}
```

## Scanner Integration

Enhance your scanner results with time confluence:

```typescript
import { computeCryptoTimeConfluence } from '@/lib/time/cryptoTimeConfluence';

// In scanner logic
const confluence = computeCryptoTimeConfluence();

// Boost score for high confluence setups
if (confluence.isHighConfluence) {
  setup.score += 10; // Time edge bonus
  setup.timeConfluence = confluence.confluenceScore;
  setup.tags.push('HIGH_TIME_CONFLUENCE');
}
```

## Alert System

Set up automated alerts for high confluence windows:

```typescript
// Check every hour
setInterval(async () => {
  const confluence = computeCryptoTimeConfluence();
  
  if (confluence.isHighConfluence && !alertSentToday) {
    await sendAlert({
      title: 'High Time Confluence Detected',
      message: confluence.alert,
      score: confluence.confluenceScore,
      cycles: confluence.cycleBreakdown,
    });
    
    alertSentToday = true;
  }
}, 3600000); // 1 hour
```

## Next Steps

1. **Test the API**: `curl http://localhost:3000/api/crypto-time-confluence`
2. **Add Widget**: Import `CryptoTimeConfluenceWidget` to your dashboard
3. **Monitor Alerts**: Watch for score ≥ 6 events
4. **Backtest**: Review historical high-confluence events to validate effectiveness
5. **Integrate**: Combine with your existing price/volume confluence system

## Support

For questions or issues:
- Check the [Time Confluence Engine source](c:\Users\bradl\Downloads\marketscannerpros-main (2)\marketscannerpros-main\lib\time\cryptoTimeConfluence.ts)
- Review example usage in the code comments
- Test with `exampleUsage()` function

---

**Remember**: Time confluence is a **timing accelerator**, not a directional signal. Always combine with price action, volume, and fundamental analysis.
