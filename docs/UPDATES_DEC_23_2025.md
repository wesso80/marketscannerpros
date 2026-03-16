# MarketScanner Pros - December 23, 2025 Updates

## 🚀 Today's Feature Releases

### 1. Custom Fear & Greed Index
- **NEW** Proprietary multi-factor sentiment analysis for both **Crypto** and **Stocks**
- Crypto factors: Market Sentiment (35%), Funding Rate (20%), L/S Ratio (20%), Price Momentum (25%)
- Stock factors: VIX Index (60%), S&P 500 Momentum (40%)
- Interactive gauge with market toggle on scanner page
- Component breakdown showing individual factor contributions

### 2. Derivatives Data in Scanner Results
- **NEW** Open Interest (OI), Funding Rate, and Long/Short Ratio displayed on crypto bulk scan results
- Each of the Top 10 crypto cards now shows:
  - 📊 OI: Total open interest in USD
  - 💰 FR: Current funding rate (color-coded for extremes)
  - ⚖️ L/S: Long/Short ratio (highlights crowded trades)

### 3. Alert Templates
- **NEW** Quick template dropdown for creating alerts (like backtest strategy selector)
- Pre-built price alerts: BTC dip, ETH dip, SOL breakout, SPY correction, NVDA dip, etc.
- Pre-built smart alerts: OI surge, funding extremes, crowded positions, fear/greed extremes

### 4. AI Cost Tracker (Admin)
- **NEW** Live token tracking for OpenAI API usage
- Dashboard showing daily, weekly, monthly costs
- Breakdown by tier and top users
- Auto-migration for database schema updates

---

## 💰 Subscription Tiers

### Free Tier - $0/month
**Perfect for getting started with market analysis**

| Feature | Limit |
|---------|-------|
| Market Scanner | 3 scans/day |
| AI Analyst Questions | 5/day |
| Price Alerts | 3 active |
| Fear & Greed Index | ✅ Crypto & Stocks |
| Scanner Results | Basic indicators |
| Portfolio Tracker | ❌ |
| Trade Journal | ❌ |
| Backtesting | ❌ |
| Smart Alerts | ❌ |
| TradingView Scripts | ❌ |

---

### Pro Tier - $19/month
**For active traders who need more power**

| Feature | Limit |
|---------|-------|
| Market Scanner | Unlimited |
| AI Analyst Questions | 50/day |
| Price Alerts | 10 active |
| Fear & Greed Index | ✅ Crypto & Stocks |
| Scanner Results | Full indicators |
| Portfolio Tracker | ✅ Unlimited positions |
| Trade Journal | ❌ |
| Backtesting | ❌ |
| Smart Alerts | ❌ |
| TradingView Scripts | ❌ |
| CSV Exports | ✅ |

**What's Included:**
- ✅ Unlimited market scans (40+ cryptos, 50+ stocks)
- ✅ 50 AI questions per day with full market context
- ✅ 10 price alerts with email notifications
- ✅ Portfolio tracking with P&L analysis
- ✅ Custom Fear & Greed Index (Crypto + Stocks)
- ✅ Export data to CSV

---

### Pro Trader Tier - $49/month
**The complete trading toolkit for serious traders**

| Feature | Limit |
|---------|-------|
| Market Scanner | Unlimited |
| AI Analyst Questions | Unlimited |
| Price Alerts | 25 active |
| Fear & Greed Index | ✅ Crypto & Stocks |
| Scanner Results | Full + Derivatives |
| Portfolio Tracker | ✅ Unlimited |
| Trade Journal | ✅ Full analytics |
| Backtesting | ✅ 20+ strategies |
| Smart Alerts | ✅ 10 active |
| TradingView Scripts | ✅ All scripts |
| Priority Support | ✅ |

**Everything in Pro, plus:**
- ✅ **Unlimited AI questions** - No daily cap
- ✅ **Strategy Backtester** - Test 20+ strategies on historical data
- ✅ **Trade Journal** - Track trades with AI-powered insights
- ✅ **Smart Alerts** - AI-powered alerts on:
  - OI surges/drops
  - Funding rate extremes
  - Long/Short ratio warnings
  - Fear & Greed extremes
  - Bullish/Bearish divergences
- ✅ **Alert Templates** - Pre-built alerts for common setups
- ✅ **TradingView Scripts** - Pine Script indicators for TV
- ✅ **Derivatives Intelligence** - OI, Funding, L/S in scanner
- ✅ **Priority Support** - Direct access to dev team

---

## 📊 Feature Comparison Matrix

| Feature | Free | Pro | Pro Trader |
|---------|------|-----|------------|
| Daily Scans | 3 | ∞ | ∞ |
| AI Questions | 5/day | 50/day | ∞ |
| Price Alerts | 3 | 10 | 25 |
| Smart Alerts | ❌ | ❌ | 10 |
| Fear & Greed | ✅ | ✅ | ✅ |
| Portfolio | ❌ | ✅ | ✅ |
| Journal | ❌ | ❌ | ✅ |
| Backtest | ❌ | ❌ | ✅ |
| Derivatives | ❌ | ❌ | ✅ |
| TV Scripts | ❌ | ❌ | ✅ |
| CSV Export | ❌ | ✅ | ✅ |
| Email Alerts | ✅ | ✅ | ✅ |
| Push Notifications | 🔜 | 🔜 | 🔜 |

---

## 🔔 Alert Types

### Price Alerts (All Tiers)
- Price Above/Below threshold
- Percent Change Up/Down
- Volume Spike detection

### Smart Alerts (Pro Trader Only)
- **OI Surge** - Open Interest spikes (new positions flooding in)
- **OI Drop** - Mass liquidations/closures
- **Funding Extreme (Positive)** - Overleveraged longs (bearish)
- **Funding Extreme (Negative)** - Overleveraged shorts (bullish)
- **L/S Ratio High** - Crowded longs (squeeze risk)
- **L/S Ratio Low** - Crowded shorts (squeeze up risk)
- **Extreme Fear** - Contrarian buy opportunity
- **Extreme Greed** - Consider taking profits
- **Bullish Divergence** - OI rising while price down
- **Bearish Divergence** - OI falling while price up

---

## 📱 Coming Soon

- **Push Notifications** - Real-time alerts to your device
- **Mobile App** - Native iOS/Android apps
- **Webhook Integrations** - Send alerts to Discord, Telegram
- **API Access** - Programmatic access for algo traders

---

## 🛠 Technical Notes

### API Endpoints Added Today
- `GET /api/fear-greed-custom?market=crypto|stock` - Custom F&G Index
- `GET /api/admin/costs` - AI cost tracking (admin)
- `GET /api/admin/check-db` - Database schema check (admin)

### Database Migrations
- `012_ai_usage_tokens.sql` - Added token tracking columns

### Components Added
- `CustomFearGreedGauge` - Interactive F&G gauge with market toggle
- Alert template dropdowns in AlertsWidget

---

*Last updated: December 23, 2025*
