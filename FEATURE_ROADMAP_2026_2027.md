# MarketScanner Pros - Feature Roadmap 2026-2027

## 📅 Timeline Overview

**Start Date:** December 2025  
**Vision:** State-of-the-Art Trading Platform by Q4 2027  

---

# 💵 PRICING EVOLUTION

## Subscription Tiers

| Date | Trigger | Pro Price | Pro Trader | Notes |
|------|---------|-----------|------------|-------|
| **Dec 2025** | Holiday Sale | $7.49/mo | $14.99/mo | Limited time |
| **Jan 2026** | Sale Ends | $9.99/mo | $19.99/mo | Regular pricing |
| **Mar 2026** | Alerts Launch | $12.99/mo | $24.99/mo | +Push alerts, webhooks |
| **Jun 2026** | Social Features | $14.99/mo | $29.99/mo | +Leaderboards, profiles |
| **Sep 2026** | Mobile Apps | $17.99/mo | $34.99/mo | +Native iOS/Android |
| **Jan 2027** | Broker Integration | $19.99/mo | $39.99/mo | +Live trading |
| **Jun 2027** | Copy Trading | $24.99/mo | $49.99/mo | +Signal marketplace |

## Annual Pricing (25% Discount)

| Date | Pro Annual | Pro Trader Annual | Effective Monthly |
|------|-----------|-------------------|-------------------|
| **Dec 2025** | $67.41 | $134.91 | $5.62 / $11.24 |
| **Jan 2026** | $89.99 | $179.99 | $7.50 / $15.00 |
| **Mar 2026** | $116.99 | $224.99 | $9.75 / $18.75 |
| **Jun 2026** | $134.99 | $269.99 | $11.25 / $22.50 |
| **Sep 2026** | $161.99 | $314.99 | $13.50 / $26.25 |
| **Jan 2027** | $179.99 | $359.99 | $15.00 / $30.00 |
| **Jun 2027** | $224.99 | $449.99 | $18.75 / $37.50 |

## Enterprise Tier (Q3 2027)

| Tier | Price | Features |
|------|-------|----------|
| **Enterprise** | $199/mo | White label, API access, team seats, priority support |
| **Enterprise Annual** | $1,999/yr | 17% discount |

## Grandfathering Policy

- ✅ Existing subscribers keep their price forever
- ✅ Annual subscribers locked for full year
- ✅ Upgrades use current pricing
- ✅ Downgrades lose grandfathered rate

---

# 💰 MONTHLY RUNNING COSTS

## Current Infrastructure

| Service | Monthly Cost | Purpose |
|---------|-------------|---------|
| Render | $7-25 | Hosting (web service) |
| Neon Postgres | $0-19 | Database (free tier → Scale) |
| Alpha Vantage Premium | $49.99 | Market data (75 RPM) |
| OpenAI API (gpt-4o-mini) | ~$18-100 | AI features (scales with users) |
| **Current Total** | **~$75-195** | At 50-270 users |

## Cost Scaling by User Growth

| Month | Users | Render+Neon | Alpha Vantage | OpenAI | Other | Total |
|-------|-------|-------------|---------------|--------|-------|-------|
| Dec 25 | 50 | $7 | $50 | $18 | $0 | **$75** |
| Jan 26 | 70 | $7 | $50 | $25 | $0 | **$82** |
| Feb 26 | 100 | $7 | $50 | $37 | $20 | **$114** |
| Mar 26 | 150 | $19 | $50 | $55 | $50 | **$174** |
| Apr 26 | 200 | $19 | $50 | $74 | $70 | **$213** |
| May 26 | 250 | $25 | $50 | $92 | $70 | **$237** |
| Jun 26 | 300 | $25 | $50 | $111 | $80 | **$266** |
| Jul 26 | 375 | $35 | $50 | $138 | $80 | **$303** |
| Aug 26 | 450 | $35 | $50 | $166 | $90 | **$341** |
| Sep 26 | 500 | $45 | $100 | $185 | $100 | **$430** |
| Oct 26 | 600 | $45 | $100 | $222 | $110 | **$477** |
| Nov 26 | 750 | $55 | $100 | $277 | $120 | **$552** |
| Dec 26 | 1,000 | $65 | $100 | $369 | $130 | **$664** |

*"Other" includes: SendGrid email ($20), Push service ($0-99), Redis ($0-25), RevenueCat ($0-99)*

## Additional Services (When Added)

| Service | Added | Monthly Cost |
|---------|-------|-------------|
| SendGrid (Email) | Feb 2026 | $20 |
| OneSignal (Push) | Mar 2026 | $0-99 |
| Redis (Alert Queue) | Mar 2026 | $0-25 |
| Apple Developer | Sep 2026 | $8.25 |
| Google Play | Nov 2026 | $2.08 |
| RevenueCat | Nov 2026 | $0-99 |

---

# 🤖 AI COSTS (OpenAI API)

## Current Configuration

| Route | Model | Cost/Request |
|-------|-------|--------------|
| `/api/msp-analyst` | gpt-4o-mini | $0.0006 |
| `/api/portfolio/analyze` | gpt-4o-mini | $0.0006 |
| `/api/journal/analyze` | gpt-4o-mini | $0.0006 |
| `/api/market-focus/generate` | gpt-4o-mini | $0.0006 |

## AI Cost by User Volume

| Users | Requests/Month | Monthly Cost |
|-------|----------------|--------------|
| 50 | 30,000 | **$18** |
| 100 | 60,000 | **$37** |
| 250 | 150,000 | **$92** |
| 500 | 300,000 | **$185** |
| 1,000 | 600,000 | **$369** |

## AI Tier Limits

| Tier | Daily Limit | Max Monthly | Max AI Cost |
|------|-------------|-------------|-------------|
| Free | 10 | 300 | $0.18 |
| Pro | 50 | 1,500 | $0.92 |
| Pro Trader | 200 | 6,000 | $3.69 |

---

# 📈 EXPECTED REVENUE

## Monthly Revenue Projection (Year 1)

| Month | Users | Paid Users | Avg Price | MRR | Running Costs | Net Profit |
|-------|-------|------------|-----------|-----|---------------|------------|
| Dec 25 | 50 | 33 | $12.12 | **$400** | $88 | $312 |
| Jan 26 | 70 | 45 | $13.33 | **$600** | $95 | $505 |
| Feb 26 | 100 | 65 | $13.85 | **$900** | $127 | $773 |
| Mar 26 | 150 | 90 | $16.67 | **$1,500** | $180 | $1,320 |
| Apr 26 | 200 | 120 | $17.50 | **$2,100** | $219 | $1,881 |
| May 26 | 250 | 155 | $18.06 | **$2,800** | $242 | $2,558 |
| Jun 26 | 300 | 200 | $20.00 | **$4,000** | $276 | $3,724 |
| Jul 26 | 375 | 250 | $20.00 | **$5,000** | $308 | $4,692 |
| Aug 26 | 450 | 310 | $20.00 | **$6,200** | $351 | $5,849 |
| Sep 26 | 500 | 380 | $22.37 | **$8,500** | $435 | $8,065 |
| Oct 26 | 600 | 460 | $22.83 | **$10,500** | $487 | $10,013 |
| Nov 26 | 750 | 580 | $24.14 | **$14,000** | $557 | $13,443 |
| Dec 26 | 1,000 | 700 | $25.00 | **$17,500** | $669 | $16,831 |

## Year 1 Summary

| Metric | Value |
|--------|-------|
| **Total Revenue** | ~$74,000 |
| **Total Costs** | ~$4,000 |
| **Net Profit** | ~$70,000 |
| **End MRR** | $17,500 |
| **End ARR** | $210,000 |

## Year 2 Quarterly Revenue (2027)

| Quarter | Users | Paid | Avg Price | MRR | Quarterly Rev |
|---------|-------|------|-----------|-----|---------------|
| Q1 2027 | 1,500 | 1,000 | $29.99 | **$30,000** | $65,000 |
| Q2 2027 | 2,500 | 1,600 | $37.49 | **$45,000** | $110,000 |
| Q3 2027 | 4,000 | 2,500 | $42.00 | **$55,000** | $160,000 |
| Q4 2027 | 6,000 | 3,500 | $50.00 | **$70,000** | $200,000 |

## Year 2 Summary

| Metric | Value |
|--------|-------|
| **Total Revenue** | ~$535,000 |
| **Total Costs** | ~$76,000 |
| **Net Profit** | ~$459,000 |
| **End MRR** | $70,000 |
| **End ARR** | $840,000 |

## Combined 2-Year Summary

| Metric | Year 1 | Year 2 | **Total** |
|--------|--------|--------|-----------|
| Revenue | $74,000 | $535,000 | **$609,000** |
| Costs | $4,000 | $76,000 | **$80,000** |
| Net Profit | $70,000 | $459,000 | **$529,000** |

## Key Revenue Milestones

| Milestone | MRR | Target Date |
|-----------|-----|-------------|
| 💰 Break-Even | $88 | Dec 2025 (12 paid users) |
| 📈 $1K MRR | $1,000 | Feb 2026 |
| 📈 $5K MRR | $5,000 | Jul 2026 |
| 📈 $10K MRR | $10,000 | Oct 2026 |
| 📈 $15K MRR | $15,000 | Dec 2026 |
| 📈 $30K MRR | $30,000 | Mar 2027 |
| 📈 $50K MRR | $50,000 | Jun 2027 |
| 🚀 $100K MRR | $100,000 | Dec 2027+ |

## Revenue per User Tier

| Tier | % of Paid | Count (1K users) | Revenue/Mo |
|------|-----------|------------------|------------|
| Pro (Monthly) | 50% | 350 | $3,500 |
| Pro (Annual) | 20% | 140 | $1,050 |
| Pro Trader (Monthly) | 20% | 140 | $2,800 |
| Pro Trader (Annual) | 10% | 70 | $1,050 |
| **Total** | 100% | 700 | **$8,400** |

*Note: Actual revenue higher due to price increases throughout year*

---

# 🎯 CURRENT FEATURES (Live Now)

| Category | Feature | Status |
|----------|---------|--------|
| **Scanning** | Stock Scanner | ✅ Live |
| | Crypto Scanner | ✅ Live |
| | ETF Scanner | ✅ Live |
| | Options Scanner | ✅ Live |
| **AI** | MSP Analyst (GPT-4) | ✅ Live |
| | AI Market Focus | ✅ Live |
| | AI Scanner | ✅ Live |
| **Trading Tools** | Portfolio Tracker | ✅ Live |
| | Trade Journal | ✅ Live |
| | Backtesting Engine | ✅ Live |
| **Market Data** | Real-time Quotes | ✅ Live |
| | Technical Indicators | ✅ Live |
| | Gainers/Losers | ✅ Live |
| | Company Overview | ✅ Live |
| | News Sentiment | ✅ Live |
| **Premium** | TradingView Scripts | ✅ Live |
| | CSV Exports | ✅ Live |

---

# 📆 MONTH-BY-MONTH ROADMAP

---

## 🗓️ DECEMBER 2025 (Current)

### Focus: Open Interest MVP

**New Features:**
- [ ] Global Open Interest display (Binance)
- [ ] Per-coin OI breakdown
- [ ] Integration with scanner page

---

## 🗓️ JANUARY 2026

### Focus: Enhanced Derivatives + AI Integration

**Week 1-2: Derivatives Data**
- [ ] 24-hour OI change tracking
- [ ] Long/Short Ratio display
- [ ] Funding Rates (real-time)
- [ ] Charts and animations

**Week 3-4: AI Enhancement**
- [ ] AI analyst uses OI data in responses
- [ ] Context-aware market analysis
- [ ] "How to Read OI" user guide

---

## 🗓️ FEBRUARY 2026

### Focus: Market Sentiment + Alerts Foundation

**Week 1-2: Sentiment Dashboard**
- [ ] Proprietary Fear & Greed Index
- [ ] Stock market sentiment (not just crypto)
- [ ] Combined sentiment dashboard
- [ ] Historical sentiment charts

**Week 3-4: Alerts System (Phase 1)**
- [ ] Basic price alerts
- [ ] Email notifications
- [ ] Alert management dashboard

---

## 🗓️ MARCH 2026

### Focus: Advanced Alerts + Push Notifications

**Week 1-2: Alert Conditions**
- [ ] Technical indicator alerts (RSI, MACD, etc.)
- [ ] OI spike detection alerts
- [ ] Multi-condition alerts (AND/OR logic)
- [ ] Pre-built alert templates

**Week 3-4: Push Notifications**
- [ ] Browser push notifications
- [ ] In-app notification center
- [ ] Permission management flow

---

## 🗓️ APRIL 2026

### Focus: Webhook Integrations + API Access

**Week 1-2: Webhooks**
- [ ] Discord alert integration
- [ ] Telegram alert integration
- [ ] Slack alert integration
- [ ] Custom webhook endpoints

**Week 3-4: Developer API (Pro Trader)**
- [ ] API key generation/management
- [ ] Rate limiting by tier
- [ ] API documentation (Swagger/OpenAPI)
- [ ] JavaScript SDK starter

---

## 🗓️ MAY 2026

### Focus: Mobile PWA Enhancement

**Week 1-2: PWA Optimization**
- [ ] Full offline support
- [ ] Instant app loading
- [ ] "Add to Home Screen" flow

**Week 3-4: Mobile Experience**
- [ ] Touch-optimized scanner
- [ ] Swipe gestures for portfolio
- [ ] Quick journal entry
- [ ] Performance optimization

---

## 🗓️ JUNE 2026

### Focus: Social Features + Leaderboards

**Week 1-2: Social Trading**
- [ ] Public trader profiles
- [ ] Trade idea sharing
- [ ] Follow system
- [ ] Activity feed

**Week 3-4: Gamification**
- [ ] Performance-based leaderboards
- [ ] Monthly rankings
- [ ] Achievement badges
- [ ] Privacy controls (opt-in)

---

## 🗓️ JULY 2026

### Focus: Advanced Backtesting

**Backtesting 2.0 Features:**
- [ ] Visual strategy builder
- [ ] Multi-asset portfolio backtesting
- [ ] Walk-forward analysis
- [ ] Monte Carlo risk simulation
- [ ] Parameter optimization
- [ ] PDF report exports

---

## 🗓️ AUGUST 2026

### Focus: Platform Optimization

**Performance & Polish:**
- [ ] Code optimization and cleanup
- [ ] Performance improvements
- [ ] Bug fixes and stability
- [ ] UX refinements from user feedback

---

## 🗓️ SEPTEMBER 2026

### Focus: iOS App Development (Start)

**React Native Foundation:**
- [ ] Project setup (React Native + Expo)
- [ ] Native authentication flow
- [ ] Core navigation structure
- [ ] Scanner screen (iOS)
- [ ] Portfolio screen (iOS)
- [ ] Push notification setup

---

## 🗓️ OCTOBER 2026

### Focus: iOS App Completion

**Feature Parity:**
- [ ] AI Analyst (native chat UI)
- [ ] Trade Journal (native)
- [ ] Backtesting viewer
- [ ] Alert management
- [ ] Settings/Profile screens
- [ ] TestFlight beta release

---

## 🗓️ NOVEMBER 2026

### Focus: Android App + Store Launch

**Week 1-2: Android Port**
- [ ] Android device testing
- [ ] Platform-specific fixes
- [ ] Play Store preparation

**Week 3-4: Launch**
- [ ] iOS App Store launch
- [ ] Google Play launch
- [ ] In-app purchases
- [ ] Launch marketing campaign

---

## 🗓️ DECEMBER 2026

### Focus: Polish + Broker Research

**Week 1-2: Year 1 Polish**
- [ ] Bug fixes and stability
- [ ] Performance optimization
- [ ] UX improvements from feedback

**Week 3-4: Broker Research**
- [ ] Broker API evaluation (Alpaca, IBKR, etc.)
- [ ] Compliance research
- [ ] Integration architecture planning

---

# 🚀 YEAR 2 ROADMAP (2027)

---

## Q1 2027: Broker Integration

### January 2027
- [ ] Alpaca broker integration
- [ ] Live trading setup

### February 2027
- [ ] Interactive Brokers integration
- [ ] Advanced order routing

### March 2027
- [ ] Coinbase integration
- [ ] Kraken integration
- [ ] Unified multi-broker dashboard

---

## Q2 2027: Advanced AI + Copy Trading

### April - June 2027
- [ ] AI-powered strategy generation
- [ ] Copy trading system
- [ ] Signal marketplace
- [ ] AI trade execution assistance

---

## Q3 2027: Enterprise + B2B

### July - September 2027
- [ ] White label platform
- [ ] Enterprise dashboard
- [ ] Team management
- [ ] Enterprise API v2
- [ ] Priority support system

---

## Q4 2027: Market Leadership

### October - December 2027
- [ ] Advanced analytics dashboard
- [ ] Institutional features
- [ ] Market expansion
- [ ] Platform optimization

---

# 📋 FEATURE CHECKLIST BY CATEGORY

## Derivatives Suite
- [ ] Global Open Interest (Dec 2025)
- [ ] Long/Short Ratio (Jan 2026)
- [ ] Funding Rates (Jan 2026)
- [ ] Liquidation Alerts (Feb 2026)
- [ ] Historical OI Charts (Feb 2026)

## Market Sentiment
- [ ] Enhanced Fear & Greed (Feb 2026)
- [ ] Stock Market Sentiment (Feb 2026)
- [ ] Social Sentiment (Jun 2026)

## Alerts System
- [ ] Price Alerts (Feb 2026)
- [ ] Technical Alerts (Mar 2026)
- [ ] OI Alerts (Mar 2026)
- [ ] Push Notifications (Mar 2026)
- [ ] Webhook Delivery (Apr 2026)

## Mobile
- [ ] PWA Optimization (May 2026)
- [ ] iOS Native App (Oct 2026)
- [ ] Android Native App (Nov 2026)
- [ ] In-App Purchases (Nov 2026)

## Social/Community
- [ ] User Profiles (Jun 2026)
- [ ] Trade Sharing (Jun 2026)
- [ ] Leaderboards (Jun 2026)
- [ ] Copy Trading (Q2 2027)

## Advanced Trading
- [ ] Strategy Builder (Jul 2026)
- [ ] Broker Integration (Q1 2027)
- [ ] Live Execution (Q1 2027)

## Enterprise
- [ ] Developer API (Apr 2026)
- [ ] White Label (Q3 2027)
- [ ] Team Management (Q3 2027)

---

# 🎯 KEY MILESTONES

| Milestone | Target Date |
|-----------|-------------|
| 🔥 Open Interest Launch | Dec 2025 |
| 🔔 Alerts System Live | Mar 2026 |
| 🔗 Webhooks + API Access | Apr 2026 |
| 📱 PWA Mobile Optimization | May 2026 |
| 👥 Social Features Launch | Jun 2026 |
| 📊 Advanced Backtesting | Jul 2026 |
|  iOS App Store Launch | Nov 2026 |
| 📱 Android Play Store Launch | Nov 2026 |
| 🏦 Alpaca Integration Live | Jan 2027 |
| 🏦 Interactive Brokers Live | Feb 2027 |
| 🪙 Crypto Broker Integration | Mar 2027 |
| 🤖 AI Strategy Generation | Apr 2027 |
| 📋 Copy Trading Launch | Jun 2027 |
| 🏢 Enterprise/White Label | Sep 2027 |
| 🚀 Market Leadership | Dec 2027 |

---

# 📅 QUARTERLY VIEW

## Q4 2025 (Current)
- ✅ Core platform live
- [ ] Open Interest MVP

## Q1 2026
- [ ] Enhanced derivatives data
- [ ] Fear & Greed Index
- [ ] Alerts system (email + push)
- [ ] Webhook integrations
- [ ] Developer API

## Q2 2026
- [ ] Mobile PWA optimization
- [ ] Social features
- [ ] Advanced backtesting

## Q3 2026
- [ ] Platform optimization
- [ ] iOS app development
- [ ] iOS app completion

## Q4 2026
- [ ] Android app
- [ ] App store launches
- [ ] Broker research

## Q1 2027
- [ ] Alpaca integration
- [ ] Interactive Brokers
- [ ] Crypto exchanges

## Q2 2027
- [ ] AI strategy generation
- [ ] Copy trading
- [ ] Signal marketplace

## Q3 2027
- [ ] Enterprise features
- [ ] White label platform
- [ ] Team management

## Q4 2027
- [ ] Market leadership
- [ ] Platform maturity
- [ ] Expansion

---

# 📱 PLATFORM AVAILABILITY

| Platform | Status | Target |
|----------|--------|--------|
| Web App | ✅ Live | - |
| PWA | ✅ Live | May 2026 Enhanced |
| iOS App | 🔄 Planned | Nov 2026 |
| Android App | 🔄 Planned | Nov 2026 |
| API Access | 🔄 Planned | Apr 2026 |

---

# 🔔 ALERT TYPES (By Release)

## February 2026
- Price above/below
- Price change %
- Email delivery

## March 2026
- RSI overbought/oversold
- MACD crossover
- Volume spike
- OI spike
- Browser push
- In-app notifications

## April 2026
- Discord webhook
- Telegram webhook
- Slack webhook
- Custom webhook

---

# 🏦 BROKER INTEGRATIONS (2027)

| Broker | Type | Target |
|--------|------|--------|
| Alpaca | Stocks/Crypto | Jan 2027 |
| Interactive Brokers | Stocks/Options | Feb 2027 |
| Coinbase | Crypto | Mar 2027 |
| Kraken | Crypto | Mar 2027 |

---

# ✅ NEXT ACTIONS (This Week)

1. **Dec 23** - Start OI API development
2. **Dec 24-25** - Complete OI widget
3. **Dec 26** - Integration testing
4. **Dec 27** - Deploy to production
5. **Dec 28-31** - Monitor, bug fixes

---

*Document Version: 1.1*  
*Created: December 23, 2025*  
*Review Schedule: Monthly*  
*Owner: MarketScanner Pros*
