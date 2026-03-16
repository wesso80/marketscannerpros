# Broker Integration - Australian Legal Guide

## Overview

This document outlines the legal requirements and compliance considerations for adding broker integration to MarketScanner Pros under Australian law (ASIC regulation).

---

## 🇦🇺 Australian Financial Services (AFS) Licensing

### Do You Need an AFS Licence?

**Short Answer:** NO - if you use the pass-through model described below.

### ❌ Activities That REQUIRE an AFS Licence

| Activity | Why It's Regulated |
|----------|-------------------|
| Executing trades on behalf of users | "Dealing in financial products" under Corporations Act |
| Holding client funds | Custodial services require licensing |
| Providing personal investment advice | Financial advice requires AFSL |
| Operating as a broker/dealer | Must be licensed by ASIC |
| Managing client portfolios | Investment management requires AFSL |

### ✅ Activities That DO NOT Require an AFS Licence

| Activity | Why It's Exempt |
|----------|----------------|
| **API pass-through to licensed brokers** | You're technology, not a financial service |
| **Display portfolio from broker API** | Read-only sync, no dealing |
| **Order routing UI** (user clicks execute) | Interface only, broker handles trade |
| **Paper trading** | No real money involved |
| **Educational tools & signals** | General information, not advice |
| **Scanner, alerts, AI analysis** | Current MSP model - educational |

---

## 🛡️ Safe Broker Integration Models

### Option 1: API Pass-Through (RECOMMENDED)

**How it works:**
1. User connects their existing broker account via OAuth
2. MSP displays positions, P&L from broker API
3. User can place orders through MSP interface
4. Order is routed to broker who executes it
5. Broker handles all compliance, custody, settlement

**Your role:** Technology provider / User interface  
**Broker's role:** Licensed financial services provider

**Why this is legal:**
- You never hold funds
- You never execute trades (broker does)
- You don't provide personal advice
- Broker maintains all regulatory obligations

### Option 2: Corporate Authorised Representative (CAR)

**How it works:**
- Operate under an existing AFS licensee's licence
- They supervise your activities
- You get limited dealing authorisation

**Costs:** $5,000 - $20,000/year  
**Pros:** Can offer more services  
**Cons:** Ongoing compliance overhead, supervision requirements

### Option 3: Full AFS Licence (NOT RECOMMENDED)

**Costs:** $50,000+ initial, $100,000+/year ongoing  
**Timeline:** 6-12 months to obtain  
**Requirements:** Responsible managers, compliance staff, capital requirements

**Only needed if:** You want to be an actual broker/dealer

---

## 🤝 Recommended Broker Partners (Pre-Licensed)

### For Stock Trading

| Broker | Licence | API Available | Notes |
|--------|---------|---------------|-------|
| **Interactive Brokers** | AFSL 245574 | Yes | Best for AU stocks |
| **IG Markets** | AFSL 220440 | Yes | CFDs, Forex |
| **Alpaca** | US SEC/FINRA | Yes | US stocks (non-AU users) |

### For Crypto Trading

| Broker | Regulation | API Available | Notes |
|--------|------------|---------------|-------|
| **Phemex** | Not regulated | Yes | Crypto derivatives |
| **Binance** | Limited AU | Yes | Spot crypto |
| **Coinbase** | US regulated | Yes | Spot crypto |

**Note:** Crypto is less regulated in Australia. ASIC doesn't require AFS licence for spot crypto trading services (as of 2025).

---

## 📋 Required Legal Updates (Before Launch)

### 1. Terms of Service - Add Section 14

```
14. Third-Party Broker Integration

14.1 Technology Service Only
MarketScanner Pros provides technology to connect your accounts with 
third-party brokers ("Broker Partners"). We are a technology provider, 
not a broker, dealer, or financial services provider.

14.2 No Custody of Funds
We do not hold, custody, or control your funds at any time. All funds 
remain with your chosen Broker Partner. All trades are executed by and 
through your Broker Partner's systems.

14.3 No Trade Execution
We do not execute trades on your behalf. When you place an order through 
our interface, you are instructing your Broker Partner to execute that 
trade. The Broker Partner is solely responsible for trade execution, 
settlement, and compliance.

14.4 Broker Partner Licensing
Your Broker Partner is responsible for maintaining appropriate licences 
and regulatory compliance in your jurisdiction. You should verify that 
your chosen Broker Partner is appropriately licensed before trading.

14.5 No Financial Advice
Broker integration features are provided for convenience only and do not 
constitute financial advice. You are solely responsible for your trading 
decisions.

14.6 API Access
By connecting your broker account, you authorise MarketScanner Pros to 
access your account data via your Broker Partner's API for the purpose 
of displaying positions, balances, and order history. You may revoke 
this access at any time through your account settings.

14.7 Risk Acknowledgment
Trading involves substantial risk of loss. Past performance displayed 
in the App does not guarantee future results. You should only trade with 
funds you can afford to lose.
```

### 2. Disclaimer Page - Add Broker Section

```
## Broker Integration

MarketScanner Pros integrates with third-party brokers to allow you to 
view and manage your trading accounts. Important points:

• We are NOT a broker, dealer, or financial services provider
• We do NOT hold your funds - all funds remain with your broker
• We do NOT execute trades - your broker executes all trades
• We do NOT provide financial advice - all features are educational
• You are responsible for verifying your broker is licensed in your jurisdiction
• Trading involves substantial risk of loss
```

### 3. Privacy Policy - Add Data Section

```
## Broker Account Data

When you connect a broker account, we may access:
• Account balances and positions
• Trade history and orders
• Account settings and preferences

This data is used solely to display your portfolio within the App. 
We do not share this data with third parties. You can disconnect 
your broker account at any time.
```

---

## ⚠️ Things You Must NOT Do

1. **Never hold client funds** - All money goes directly to broker
2. **Never execute trades yourself** - Route to licensed broker only
3. **Never provide personal advice** - Keep it "general advice" or "educational"
4. **Never guarantee returns** - Already covered in existing disclaimer
5. **Never imply you are a broker** - Always clarify you're technology
6. **Never operate without proper disclosures** - Add all terms above

---

## ✅ Compliance Checklist (Before Broker Launch)

- [ ] Partner with licensed broker(s) - IBKR, Alpaca, Phemex, etc.
- [ ] Update Terms of Service with Section 14
- [ ] Update Disclaimer page with broker section
- [ ] Update Privacy Policy with broker data section
- [ ] Add broker-specific disclaimers to trading UI
- [ ] Implement OAuth connection (user authorises, not us)
- [ ] Ensure no funds touch our systems
- [ ] Add risk warnings on order placement screens
- [ ] Test with ASIC's MoneySmart guidelines
- [ ] Consider professional legal review before launch

---

## 📚 ASIC Resources

- [Do I need an AFS licence?](https://www.asic.gov.au/for-finance-professionals/afs-licensees/applying-for-and-managing-an-afs-licence/)
- [Regulatory Guide 36: Licensing](https://asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-36-licensing-financial-product-advice-and-dealing/)
- [Information Sheet 225: Crypto-assets](https://asic.gov.au/regulatory-resources/digital-transformation/crypto-assets/)

---

## 📅 Timeline for Implementation

| Phase | Month | Tasks |
|-------|-------|-------|
| **Research** | Dec 2025 | ✅ This document |
| **Legal Updates** | Jan 2026 | Update Terms, Disclaimer, Privacy |
| **Phemex Integration** | Jan 2026 | Crypto trading via API |
| **Alpaca Integration** | Feb 2026 | US stocks via API |
| **IBKR Integration** | Mar 2026 | AU/Global stocks via API |
| **Legal Review** | Mar 2026 | Professional review before full launch |

---

## 💡 Summary

**You CAN legally build broker integration** if you:

1. ✅ Partner with licensed brokers (they hold the licence, not you)
2. ✅ Use pass-through model (you're UI, they're broker)
3. ✅ Never touch funds (OAuth connection, broker holds money)
4. ✅ Keep educational disclaimers (you already have these)
5. ✅ Add broker-specific terms (outlined above)
6. ✅ Make clear you're technology, not a financial service

**Your January 2026 roadmap is legally viable under this model.**

---

*Document created: December 24, 2025*  
*Jurisdiction: New South Wales, Australia*  
*Disclaimer: This is general guidance only, not legal advice. Consider consulting a financial services lawyer before launching broker integration features.*
