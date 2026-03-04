# Time Gravity Map - Quick Reference Card

## 🧮 Core Formulas

### Gravity Calculation
```
gravity = (tf_weight × decompression_multiplier × debt_multiplier) / distance
```

**Where:**
- `tf_weight` = Timeframe importance (1H=2, 1D=6, 1M=12, 1Y=18, 5Y=24)
- `decompression_multiplier` = Window status boost (1x to 5x)
- `debt_multiplier` = 2x if unresolved, 1x if tagged
- `distance` = % distance from current price

### Confidence Score
```
confidence = 50 + min(30, tf_count×10) + min(20, debt_count×10) + min(20, active_windows×10)
```

**Max Confidence:** 100%

---

## ⏱️ Decompression Windows (Your Proprietary Model)

| TF | Window | From | Multiplier |
|----|--------|------|------------|
| **1H** | 7-9 min | Open | 5x when active |
| **4H** | 9-12 min | Open | 5x when active |
| **1D** | 1 hour | Before Close | 5x when active |
| **1W** | 2 hours | Before Close | 5x when active |
| **1M** | 18 hours | Before Close | 5x when active |
| **1Y** | 13 days | Before Close | 5x when active |
| **5Y** | 104 days | Before Close | 5x when active |

---

## 📊 Status Indicators

| Icon | Status | Multiplier | Action |
|------|--------|-----------|--------|
| 🔴 | Debt (Unresolved) | 2x | High priority target |
| 🔵 | Active Decompression | 5x | **TRADE NOW** |
| 🟡 | Pre-Window | 2x | Get ready |
| 🟢 | Tagged | 0.1x | Already hit |
| ⚪ | Compression | 1x | Wait |

---

## 🎯 Trading Rules

### Entry Checklist
- [ ] Confidence ≥ 80% (ideal) or ≥ 60% (minimum)
- [ ] Active decompression count ≥ 1 (ideally ≥ 2)
- [ ] Debt count ≥ 2 in top zone
- [ ] Multiple timeframes clustered (3+ TFs)
- [ ] Price approaching target zone

### Position Sizing
- **80-100% Confidence:** Full position size
- **60-79% Confidence:** Half position size  
- **<60% Confidence:** Watch only, no trade

### Risk Management
- **Entry:** Current price or better
- **Target:** Center of top gravity zone
- **Stop:** Beyond zone range (minPrice - buffer or maxPrice + buffer)
- **Risk:Reward:** Minimum 1:2

---

## 🔢 Timeframe Weights

| Timeframe | Weight | Timeframe | Weight |
|-----------|--------|-----------|--------|
| 1m | 0.5 | 1D | 6 |
| 5m | 0.5 | 1W | 10 |
| 15m | 1 | 1M | 12 |
| 30m | 1.5 | 3M | 14 |
| 1H | 2 | 1Y | 18 |
| 4H | 3.5 | 5Y | 24 |

**Rule:** Higher TF = stronger gravity

---

## 🔍 Clustering Algorithm

**Threshold:** 0.5% (50 basis points)

**Example:**
- Midpoint 1: $68,000
- Midpoint 2: $68,100  
- Distance: 0.147% ✅ CLUSTERED

**Formula:**
```
distance% = |price1 - price2| / price1 × 100
```

If `distance% ≤ 0.5%` → Same cluster

---

## 📈 Gravity Zone Analysis

### High-Probability Zone Criteria
1. **4+ timeframes** clustered within 0.5%
2. **3+ unresolved debt** midpoints
3. **2+ active decompression** windows
4. **Confidence ≥ 80%**

### Zone Ranking
Zones ranked by `totalGravity` (sum of all point gravities in cluster)

**Top Zone** = Highest total gravity = Primary target

---

## 🚦 Decompression Status Logic

```
IF midpoint already tagged:
  status = TAGGED
ELSE IF now in decompression window:
  status = ACTIVE        // 🔵 TRADE NOW
ELSE IF approaching window (within 20%):
  status = PRE_WINDOW    // 🟡 GET READY
ELSE IF past window:
  status = POST_WINDOW
ELSE:
  status = COMPRESSION   // ⚪ WAIT
```

---

## 💡 Quick Interpretation Guide

### Scenario 1: Perfect Setup
```
Confidence: 85%
Top Zone: 68,495
Active Windows: 3 (1H, 4H, 1D)
Debt: 4 unresolved
```
**Action:** STRONG BUY/SELL toward 68,495

### Scenario 2: Moderate Setup
```
Confidence: 65%
Top Zone: 68,500
Active Windows: 1 (4H)
Debt: 2 unresolved
```
**Action:** Consider entry with half size

### Scenario 3: Wait
```
Confidence: 45%
Top Zone: 68,510  
Active Windows: 0
Debt: 1 unresolved
```
**Action:** Monitor, wait for decompression window

---

## 📊 Heatmap Color Scale

| Color | Gravity Intensity | Meaning |
|-------|------------------|---------|
| Red | 75-100% | Extreme pull |
| Orange | 50-75% | Strong pull |
| Yellow | 25-50% | Moderate pull |
| Green | 10-25% | Weak pull |
| Gray | 0-10% | Minimal pull |

---

## 🔌 API Quick Reference

### Get Time Gravity Map
```bash
GET /api/time-gravity-map?symbol=BTCUSD&price=68000
```

### Response Structure
```json
{
  "targetPrice": 68495,
  "targetRange": [68480, 68510],
  "confidence": 85,
  "zones": [...],
  "alert": "🎯 HIGH PROBABILITY TARGET..."
}
```

---

## 🧠 Mental Model

Think of price as a ball rolling across a bumpy surface:

- **Midpoints** = Magnets embedded in surface
- **Gravity** = Pull strength of each magnet  
- **Decompression Window** = Magnet is powered ON (5x stronger)
- **Debt** = Magnet hasn't been visited yet (2x stronger)
- **Cluster** = Multiple magnets close together (combined pull)

Price will naturally roll toward the **strongest cluster of active magnets**.

---

## 📱 Widget Variants

### Full Dashboard
```tsx
<TimeGravityMapWidget
  symbol="BTCUSD"
  currentPrice={68000}
  midpoints={midpoints}
  variant="full"
/>
```
Shows: Heatmap + Zones + Ladder + Timers + Debt + AI

### Compact View
```tsx
<TimeGravityMapWidget
  symbol="BTCUSD"
  currentPrice={68000}
  midpoints={midpoints}
  variant="compact"
/>
```
Shows: Top zones only

---

## ⚡ Performance Tips

### Caching
- Cache midpoint data for 30 seconds
- Only recalculate on price change > 0.1%

### Optimization
- Limit to top 20-30 midpoints per symbol
- Prioritize recent midpoints (< 30 days old)
- Filter out tagged midpoints > 7 days old

---

## 🎓 Learning Path

1. **Start with Status Indicators**
   - Learn what 🔴🔵🟡🟢⚪ mean
   - Watch timers progress in real-time

2. **Understand Clustering**
   - See how multiple TFs align
   - Notice when zones form

3. **Track Decompression Windows**
   - Observe price behavior during active windows
   - Notice hit rate increases with 🔵 status

4. **Use Confidence Score**
   - Start with 80%+ only
   - Gradually trade 60-79% as you gain experience

5. **Combine with Other Analysis**
   - Use TGM as confirmation, not sole signal
   - Best when aligned with support/resistance, volume, etc.

---

## 🔧 Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| No zones detected | Midpoints too spread | Wait for confluence |
| All showing tagged | Detection too sensitive | Adjust tolerance |
| Status always COMPRESSION | Time sync issue | Check UTC alignment |
| Low confidence always | Not enough TFs | Add more timeframes |

---

## 📚 Key Concepts Summary

**Time Confluence** = Multiple time cycles lining up  
**Decompression** = Specific window when midpoint is tested  
**Midpoint Debt** = Unresolved 50% level  
**Gravity** = Pull strength toward a price level  
**AOI (Area of Interest)** = Multi-TF cluster zone  
**Confluence Score** = Quantified strength of setup  

---

## 🏆 Competitive Advantage

### TradingView
❌ No decompression timing  
❌ No debt tracking  
❌ No gravity calculation  
✅ Has basic confluence zones

### MarketScannerPros (This System)
✅ Proprietary decompression windows  
✅ Complete debt tracking  
✅ Quantified gravity model  
✅ Multi-dimensional confidence scoring  
✅ Real-time status indicators  

**This is institutional-grade edge not available anywhere else.**

---

## 📞 Quick Links

- Time Scanner: `/tools/time-scanner`
- API Docs: `TIME_GRAVITY_MAP_IMPLEMENTATION.md`
- Full Architecture: `TIME_CONFLUENCE_COMPLETE_ARCHITECTURE.md`

---

**Print this card and keep it visible while trading!** 📌
