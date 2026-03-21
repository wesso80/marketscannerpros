# MSP Legal / Compliance Briefing Pack

**Current Site State · Educational Safeguards · Future Regulatory Review Points**

---

**Prepared for:** External Legal Counsel (Australian Financial Services)
**Prepared by:** MarketScanner Pros — Internal Compliance Review
**Date:** 21 March 2026
**Version:** 1.2
**Classification:** Confidential — Legal Privileged

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Overview](#2-platform-overview)
3. [Data Sources and Licensing](#3-data-sources-and-licensing)
4. [Current User Workflow](#4-current-user-workflow)
5. [Educational and Informational Safeguards](#5-educational-and-informational-safeguards-implemented)
6. [Active Disclaimers and Legal Warnings](#6-active-disclaimers-and-legal-warnings)
7. [AI System Constraints](#7-ai-system-constraints)
8. [Personalisation — Edge Profile and Adaptive Features](#8-personalisation--edge-profile-and-adaptive-features)
9. [Risk Governor and Risk Framing](#9-risk-governor-and-risk-framing)
10. [What MSP Does Not Do](#10-what-msp-does-not-do)
11. [Future Features Requiring Legal Review](#11-future-features-requiring-legal-review)
12. [Key Legal Questions for External Counsel](#12-key-legal-questions-for-external-counsel)
13. [Risk Summary Table](#13-risk-summary-table)
14. [Appendices](#14-appendices)
15. [Supporting Materials Needed](#15-supporting-materials-needed)

---

## 1. Executive Summary

**MarketScanner Pros** ("MSP") is a subscription-based web platform that provides analytical and informational tools relating to US equities, cryptocurrency markets, and options markets. The platform is designed to operate as an **educational and informational analytics system** — not as a financial advisory service, broker, dealer, or investment manager.

### What MSP Is

MSP is a software-as-a-service platform that aggregates publicly available market data from licensed third-party providers and presents derived analytics, technical indicators, and AI-generated educational commentary to subscribers. Users interact with scanning tools, analytical dashboards, and paper-trade simulation features.

### What MSP Is Not

MSP is not a financial adviser, broker, dealer, fund manager, or market participant. It does not hold client funds, execute trades, connect to brokerage accounts, submit orders, or provide personal financial product advice. No outputs are intended to constitute recommendations to acquire or dispose of financial products.

### Jurisdiction

The operating entity is based in **New South Wales, Australia**. The platform is subject to the **Corporations Act 2001 (Cth)**, **ASIC Regulatory Guides** (including RG 244), and the **Australian Consumer Law**.

### Market Coverage

- US equities (via Nasdaq-licensed data)
- Cryptocurrencies (via CoinGecko commercial API)
- Options / derivatives data (via Alpha Vantage commercial API)
- Macroeconomic indicators

### Current Posture

MSP is structured to present as an educational and informational analytics system. It does not hold an Australian Financial Services Licence (AFSL) and does not purport to provide financial product advice as defined under s.766B of the Corporations Act.

### Recent Remediation

In March 2026, two comprehensive internal compliance remediations were conducted:

- **Round 1 (19 March 2026):** 27+ source files, 90+ individual text changes — removed directive, advisory, and predictive language from scanner outputs, AI prompts, Golden Egg reports, marketing copy, alerts, and dashboard interfaces.
- **Round 2 (20 March 2026):** 23 additional source files, 131 insertions / 100 deletions — extended remediation to all remaining component-level UI text, including options terminals, crypto dashboards, decision bars, time scanners, risk governor displays, edge profile cards, operator workflows, and screener tables.
- **Round 3 (21 March 2026):** 45+ additional source files — deep sweep of all tool pages, AI prompt templates, API route outputs, blog content, user documentation, and resource pages. Addressed residual instances of "confidence" (→ "confluence"), "signal" (→ "setup"), "edge" (→ "pattern"/"advantage"), "institutional" (→ "analytical"), "operator" (→ "analysis"), "execution" (→ "analysis"/"timing"), "playbook" (→ "framework"), "Stop Loss" (→ "Invalidation"), "Target Price" (→ "Analyst Price Target"/"Key Levels"), "permission" (→ "condition"/"status"), "deploy" (→ "position"/"analyse"), "conviction" (→ "confluence"), "prediction" (→ "scenario"), and "recommendations" (→ "analysis"/"scenarios").

Combined, the three remediation rounds covered 95+ source files with 350+ individual text changes. Details are set out in Section 5 below.

---

## 2. Platform Overview

The following describes each major system within the platform, what it does, what its output looks like to the user, and how it is currently framed.

### 2.1 Market Scanner

**What it does:** Scans a universe of US equities and cryptocurrencies against a set of technical analysis criteria (moving averages, RSI, MACD, volume, ATR, Bollinger Bands, and other standard indicators). Returns a filtered list of symbols that meet the selected criteria.

**Output:** A table of ticker symbols with associated indicator values, a setup alignment label (e.g., "Aligned" or "Not Aligned"), and a directional label ("Bullish Setup" or "Bearish Setup"). Includes a simulated allocation column labeled "(paper)".

**Current framing:** Outputs are labeled as educational. The term "Trade Ready" has been replaced with "Aligned" or "Conditions Aligned." Directional labels use "Bullish" / "Bearish" rather than "Buy" / "Sell." A General Advice Warning banner is displayed above the scanner interface.

### 2.2 Golden Egg

**What it does:** Produces a multi-layered analytical report for a single symbol, combining technical indicators, macro regime context, options flow data, time confluence analysis, and AI-generated commentary into a structured scenario assessment.

**Output:** A single-page report with sections covering price data, technical indicators, confluence scoring, macro regime state, options sentiment, and an AI-generated thesis paragraph. Outputs are framed as "scenario analysis" rather than trade recommendations.

**Current framing:** The scoring label "Confidence" has been replaced with "Confluence" / "Alignment." The term "Trade Plan" has been replaced with "Scenario Plan (Paper Trade)." Scenario outputs describe observed conditions rather than recommending action. In Round 3, additional labels were remediated: "Live Market Signals" → "Live Market Setups", "Prediction" → "Scenario", "Active Signal" → "Active Setup", "confidence scores / conviction" → "confluence scores / alignment", and API output phrases "Buy/Sell on pullback" → "Enter long/Enter short on pullback".

### 2.3 AI Analyst (ARCA AI)

**What it does:** An AI-powered Q&A system that responds to user queries about market conditions, technical analysis, and Pine Script development. Uses OpenAI's GPT models (GPT-4o-mini for Pro tier; GPT-4.1 for Pro Trader tier).

**Output:** Text-based analysis paragraphs with technical commentary, scenario descriptions, and educational explanations. Each response carries a mandatory disclaimer footer.

**Current framing:** The AI system prompt explicitly instructs the model to provide analysis, scenarios, and explanations — never to provide financial advice. Outputs use labels such as "Conditions Aligned," "Watch for Confirmation," and "Conditions Not Met" rather than directive language. Every response includes: *"This analysis is for educational purposes only and does not constitute financial advice."*

### 2.4 Time Confluence

**What it does:** Analyses when multiple timeframe candles are due to close within overlapping windows, and calculates a 50% retracement level for each timeframe to identify potential price levels of analytical interest.

**Output:** A timeline table showing timeframe labels, close times, countdown values, weights, and mid-50 price levels. A "Likely Decompression Level" is displayed as a weighted average of contributing timeframes.

**Current framing:** Outputs are observational in nature, describing when timeframe candles close and where historical midpoints sit. No directive language is used.

### 2.5 Options Confluence

**What it does:** Displays options flow data including put/call ratios, implied volatility rank, max pain levels, unusual activity indicators, and open interest distribution. Available to Pro Trader subscribers only.

**Output:** A dashboard of options metrics with visual indicators. Includes a prominent notice: *"This is a simulated workflow — no broker execution."*

**Current framing:** Designed to present options analytics for educational review. No order routing or execution capability exists.

### 2.6 Macro Dashboard

**What it does:** Aggregates macroeconomic indicators (fear/greed indices, sector heatmaps, market breadth, economic calendar events, earnings calendar) into a single overview.

**Output:** Visual dashboard with gauge charts, heatmaps, and event calendars. Purely informational display of publicly available data.

**Current framing:** Observational data display. No advisory interpretation is embedded. General Advice Warning is displayed.

### 2.7 Portfolio Tracker

**What it does:** Allows users to manually enter and track positions, view simulated P&L, and sync data across devices via database storage.

**Output:** A table of positions with entry price, current price, simulated P&L, and basic metrics. Data persists across devices.

**Current framing:** Structured to present as a paper trade / simulation tracking system. The platform does not connect to brokerage accounts, does not hold funds, and does not execute trades. Allocation labels include "(paper)" designators.

### 2.8 Trade Journal

**What it does:** Allows users to record trade observations, attach notes, categorise by strategy and setup type, and review historical entries with basic analytics.

**Output:** A journal interface with entry fields, tags, and summary statistics (win rate, average R, streak analysis). Supports execution modes: "DRY_RUN" and "PAPER" (a "LIVE" mode is defined in the data model but is not currently enabled).

**Current framing:** Designed to operate as an educational record-keeping tool. Journal intelligence features describe historical tendencies, not future predictions.

### 2.9 Backtest Engine

**What it does:** Runs a user-defined strategy against historical price data and returns simulated performance metrics (win rate, profit factor, max drawdown, equity curve). Available to Pro Trader subscribers only.

**Output:** A results dashboard with performance statistics and equity curve chart.

**Current framing:** Includes a limitations disclaimer: *"Backtested results are hypothetical, do not reflect actual trading, do not account for slippage/commissions. Past results do not guarantee future outcomes."* Labeled as an educational simulation tool.

### 2.10 Risk Governor

**What it does:** A rule-based system that evaluates simulated trade proposals against predefined risk parameters (daily loss limits, portfolio heat caps, minimum reward-to-risk ratios, open trade count limits).

**Output:** A pass/fail assessment with specific reason codes (e.g., "Portfolio heat exceeds 6% — reduce simulated exposure"). Display uses the label "Risk metric" rather than "permission."

**Current framing:** Implemented to function as an educational risk context tool. It does not control real broker execution, does not hold funds, and does not place or block real orders. Language uses "simulated entries" and "risk metric" throughout.

### 2.11 Edge Profile / Adaptive Features

**What it does:** Analyses a user's closed trade history (from the journal) to identify statistical patterns — e.g., which strategy types, market regimes, or timeframes have historically corresponded with positive or negative simulated outcomes. An "Adaptive Personality" feature adjusts UI presentation based on interaction patterns.

**Output:** Cards displaying labels such as "Historical pattern" and "ALIGNED" / "PATTERN MISMATCH" based on how a current setup compares to the user's historical journal data. Includes a disclaimer: *"Past performance does not guarantee future results. Edge insights are based on your journal history and are for educational analysis only."*

**Current framing:** Designed to describe historical tendencies, not to recommend future trades. This area is identified internally as the primary topic requiring legal review — see Section 8.

---

## 3. Data Sources and Licensing

### 3.1 Alpha Vantage (Market Data — Equities, Options, Indicators)

- **Licence type:** Commercial API subscription (Premium tier, 600 requests per minute)
- **Data provided:** US equity intraday/daily/weekly OHLCV data, technical indicators (RSI, MACD, SMA, etc.), options data (REALTIME_OPTIONS_FMV), global quotes
- **Commercial use:** Explicitly permitted under paid subscription terms
- **Data delay:** Realtime entitlement on Premium plan; data may still carry 15+ minute delay for certain endpoints. Disclaimer language on the platform states: *"Data sourced from Alpha Vantage Premium API, may be delayed by 15+ minutes"*
- **Redistribution:** Raw data feeds are not redistributed. Data is used for display and derived analytics only.

### 3.2 CoinGecko (Cryptocurrency Data)

- **Licence type:** Commercial API plan
- **Data provided:** Cryptocurrency OHLC candles (1-day, 30-day, 90-day ranges), real-time prices, market cap, volume, derivatives data, fear/greed indices
- **Commercial use:** Permitted under the commercial API tier
- **Data delay:** Varies by endpoint. OHLC data revalidates at 5-minute intervals within the platform.
- **Redistribution:** Raw feed is not redistributed. Data is processed and displayed as derived analytics.

### 3.3 Nasdaq (Market Data Licence)

- **Licence type:** Nasdaq data licence for display of US equity market data
- **Usage:** Equity pricing, quotes, and market data displayed within the platform
- **Terms:** Subject to Nasdaq display and redistribution rules

### 3.4 OpenAI (AI Model Provider)

- **Licence type:** Commercial API access (GPT-4o-mini, GPT-4.1)
- **Usage:** Powers the ARCA AI analyst feature
- **Data handling:** Per OpenAI's commercial API terms, API request data is not used to train models. User queries are processed but not retained by OpenAI for training purposes.
- **Attribution:** AI-generated content is disclosed as such in disclaimers and terms of service.

### 3.5 General Data Disclaimers

The platform's disclaimer page includes the following statements regarding data:

> *"Data may be incomplete, delayed, or inaccurate. Market data availability can be affected by third-party providers. No accuracy, completeness, or uptime guarantees are made."*

> *"Scores, indicators, signals, and AI-generated insights may be incomplete, delayed, or inaccurate."*

---

## 4. Current User Workflow

A typical user interaction with the platform proceeds as follows:

1. **Account creation:** User subscribes via Stripe payment (or activates a free tier). Authentication is email-based, linked to a Stripe customer record.

2. **Platform access:** Upon login, the user sees a dashboard with navigation to various analytical tools. A General Advice Warning banner is displayed across all tool pages.

3. **Scanner usage:** The user selects a market (equities or crypto), applies filter criteria, and reviews a list of symbols meeting those criteria. Output labels describe the technical setup alignment status using educational terminology.

4. **Golden Egg / Deep Analysis:** The user selects a specific symbol and reviews a multi-section analytical report covering technical indicators, macro context, options data, and time confluence. AI-generated commentary provides a scenario thesis.

5. **AI Analyst:** The user asks questions about market conditions, specific symbols, or Pine Script development. The AI responds with analytical commentary, each response carrying a mandatory educational disclaimer.

6. **Paper portfolio / journal:** The user may manually record positions in the portfolio tracker and log observations in the trade journal. All entries are simulated — no connection to brokerage accounts exists.

7. **Backtest (Pro Trader):** The user defines a strategy and runs it against historical data to review simulated performance metrics.

### What Does Not Occur

At no point in the current workflow does the platform:

- Connect to a user's brokerage account
- Submit any order to any exchange or broker
- Execute or facilitate the execution of any trade
- Hold, custody, or transmit client funds
- Provide advice that takes into account the user's personal financial situation, objectives, or needs
- Automatically execute trades based on signals, alerts, or analytical outputs

---

## 5. Educational and Informational Safeguards Implemented

In March 2026, a comprehensive remediation effort was conducted to review and update all user-facing language across the platform. The objective was to remove terminology that could be characterised as directive, predictive, or advisory, and replace it with observational, analytical, and educational framing.

### 5.1 Terminology Changes

The following table documents the major language changes implemented across 50+ source files in two remediation rounds:

**Round 1 — Scanner, AI, Golden Egg, Marketing, Alerts (19 March 2026)**

| Previous Term | Replacement Term | Context |
|---|---|---|
| BUY / SELL | Bullish / Bearish | Directional labels on scanner outputs and alerts |
| BUY SIGNAL / SELL SIGNAL | Bullish Setup / Bearish Setup | Alert and notification language |
| TRADE_READY | ALIGNED / Conditions Aligned | Setup status labels across scanner, Golden Egg, and AI systems |
| NO_TRADE | NOT ALIGNED / Conditions Not Met | Negative setup status labels |
| HIGH CONVICTION | HIGH ALIGNMENT | Confluence scoring descriptors |
| Trade Readiness | Setup Alignment | Scanner filter and dashboard labels |
| Confidence (as score label) | Confluence / Alignment | Golden Egg scoring — reduced prediction framing |
| Trade Plan | Scenario Plan (Paper Trade) | Output framing for analytical scenarios |
| Stop Loss | Risk Level / Invalidation Level | Risk parameter labelling |
| Take Profit / Target | Key Levels / Reaction Zones | Price level labelling |
| Capital Allocation | Simulated Allocation (paper) | Position sizing display |
| High Probability | Technically Aligned | Marketing and dashboard copy |
| Institutional-grade | Professional-level | Marketing copy |
| Strong edge | Historical pattern | Edge Profile outputs |
| Permission (risk governor) | Regime State / Condition | Risk governor display labels |
| New trades disabled | New simulated entries disabled | Risk governor block messages |
| Recommendation | Assessment | Edge Profile and AI outputs |

**Round 2 — Component-Level UI Text Across All Tool Interfaces (20 March 2026)**

| Previous Term | Replacement Term | Context |
|---|---|---|
| MSP One Brain Card / Brain Score | Confluence Card / Confluence Score | CapitalFlowCard main heading and scoring |
| Risk Permission | Risk Metric | CapitalFlowCard and risk governor displays |
| ALLOW / ALLOW_SMALL / BLOCK (display values) | ALIGNED / REDUCED / NOT ALIGNED | Permission status display mapping across all components |
| Playbook | Framework | Scenario planning sections |
| EXECUTION ALLOWED / BLOCKED | CONDITIONS MET / NOT MET | CapitalFlowCard risk governor summary |
| Institutional Risk Governor | Risk Metrics Engine | CapitalFlowCard institutional section |
| Flow Trade Permission Matrix | Flow Analysis Matrix | CapitalFlowCard matrix heading |
| PERMITTED / BLOCKED (matrix labels) | ALIGNED / NOT ALIGNED | Flow analysis matrix status labels |
| Risk governor lockout active | Risk threshold reached | Risk governor block message |
| News Deployment Gate | News Condition Gate | PermissionGate crypto component |
| PERMISSION: YES/NO/CONDITIONAL | CONDITION: ALIGNED/NOT ALIGNED/CONDITIONAL | Permission gate display labels |
| Execution: reduce leverage and trade leaders only | Status: conditions suggest reduced exposure and large-cap focus | PermissionGate conditional message |
| Institutional Decision Lens | Market Analysis Lens | DecisionLens heading |
| TRADABLE | ALIGNED | DecisionLens verdict labels |
| NOISE — SKIP | LOW CONFLUENCE | DecisionLens verdict labels |
| Authorization: ALLOW/BLOCK | Regime State: ALIGNED/NOT ALIGNED | DecisionLens regime state display |
| Operator Proposals | Workflow Suggestions | OperatorProposalRail heading |
| Execute / Executed | Apply / Applied | OperatorProposalRail action buttons |
| Assist blocked | Policy note | OperatorProposalRail status messages |
| GO / WAIT / BLOCK (permission tone) | ALIGNED / CONDITIONAL / NOT ALIGNED | DecisionCommandBar, TimeScannerPage, TimeGateBar |
| Conf (abbreviation) | Confluence | Options and time scanner metric pills |
| Deploy / Deploy Strategy | View / View Strategy | DecisionCommandBar, DecisionBar action buttons |
| MSP Deployment Status | Analysis Status | DecisionBar heading |
| TIME DEPLOYMENT STATUS | TIME ANALYSIS STATUS | TimeGateBar heading |
| Permission: ALLOW/WAIT/BLOCK | Condition: ALIGNED/CONDITIONAL/NOT ALIGNED | TimeGateBar, DecisionBar status labels |
| Suggested Structures | Structure Examples | SuggestedPlaysCard heading |
| Trade Permission | Market Condition | NewsDecisionCard labels |
| Extract Signal | View Analysis | NewsDecisionCard action button |
| Draft Trade Plan | Draft Notes | NewsDecisionCard action button |
| Command Center State | Market Context | CommandCenterStateBar heading |
| Operator Mode | Analysis Mode | CommandCenterStateBar mode label |
| Actionable Now | Current Status | CommandCenterStateBar status label |
| Crypto Deployment Gate | Crypto Condition Gate | CryptoMorningDecisionCard heading |
| Adaptive Confidence | Confluence Score | CryptoMorningDecisionCard scoring |
| Capital Mode: Normal Size / Reduced | Sizing Context: Standard / Reduced | CryptoMorningDecisionCard sizing display |
| Longs: Allowed / Restricted | Long Conditions: Favorable / Unfavorable | CryptoMorningDecisionCard directional labels |
| Shorts: Allowed / Restricted | Short Conditions: Favorable / Unfavorable | CryptoMorningDecisionCard directional labels |
| Today's Permissioned Trades | Scenario Watchlist | TradeIdeasSection heading |
| Trade idea output | Analytical scenarios | TradeIdeasSection description |
| Today's decision | Today's analysis | DerivativesDecisionRow label |
| COMPLIANT / TIGHT / BLOCKED (screener) | ALIGNED / CAUTION / NOT ALIGNED | ScreenerTable rule column display |
| Rule (column header) | Status | ScreenerTable column label |
| Rule Guard active | Risk Guard active | WatchlistWidget status message |
| Sort: Edge Temperature | Sort: Alignment Score | WatchlistWidget sort label |
| Your Trading Edge | Your Historical Patterns | EdgeInsightCards heading (×3 instances) |
| Established edge / Developing edge | Established pattern / Developing pattern | EdgeInsightCards status labels |
| Command / Decision / Execution (kickers) | Context / Analysis / Levels | DecisionCockpit section kicker labels |

**Round 3 — Deep Sweep: Tool Pages, AI Prompts, API Routes, Blog, Docs (21 March 2026)**

| Previous Term | Replacement Term | Context |
|---|---|---|
| Confidence (Golden Egg labels) | Confluence | golden-egg/page.tsx — summary text, score labels, regime labels |
| Live Market Signals | Live Market Setups | golden-egg/page.tsx — cross-market regime section |
| Confidence scores / conviction | Confluence scores / alignment | golden-egg/page.tsx — cross-market description |
| Prediction | Scenario | golden-egg/page.tsx — time confluence section |
| Active Signal | Active Setup | golden-egg/page.tsx — DVE signal section |
| Target Price (deep analysis) | Analyst Price Target | deep-analysis/page.tsx — company fundamentals card |
| Operator Panel | Analysis Panel | options-confluence/page.tsx — panel heading |
| Market Playbook Engine | Market Framework Engine | options-confluence/page.tsx — scenario panel |
| Playbook invalidation | Framework invalidation | options-confluence/page.tsx — thesis invalidation |
| MSP AI SIGNAL | MSP AI SETUP | options-confluence/page.tsx — AI setup panel |
| supports intraday execution | supports intraday analysis | intraday-charts/page.tsx — permission reason |
| Execution blocked | Conditions not met | intraday-charts/page.tsx — blocked state |
| Execution Context / Actions | Analysis Context / Actions | intraday-charts/page.tsx — section headings |
| Operator summary | Analysis summary | commodities/page.tsx — summary text |
| permission (in summary) | status | commodities/page.tsx — summary text |
| normal execution allowed | normal analysis allowed | news/page.tsx — catalyst summary |
| Confidence (news) | Confluence | news/page.tsx — narrative label |
| AI prediction performance | AI analysis performance | signal-accuracy/page.tsx — description text |
| Signal Accuracy | Setup Accuracy | signal-accuracy/page.tsx — page title |
| EXECUTE (portfolio action) | REVIEW | portfolio/page.tsx — operator state action |
| AI Signal (strategy option) | AI Setup | portfolio/page.tsx — strategy dropdown |
| Adaptive Confidence (equity) | Adaptive Confluence | equity-explorer/page.tsx — regime label |
| Target Price (equity) | Analyst Price Target | equity-explorer/page.tsx — analyst data |
| confidence (crypto summary) | confluence | crypto/page.tsx — AI summary text |
| Adaptive Confidence (crypto) | Adaptive Confluence | crypto/page.tsx — morning decision label |
| no directional edge | no directional bias | crypto-dashboard/page.tsx — liquidation text |
| operator summary (backtest) | analysis summary | backtest/page.tsx — AI brief prompt |
| Backtest confidence | Backtest confluence | backtest/page.tsx — journal auto-text |
| ARCA Playbook Library | ARCA Framework Library | workspace/LearningTab.tsx — section heading |
| Scanner Signals (alert groups) | Scanner Setups | AlertsWidget.tsx — optgroup labels |
| Signal Alerts | Setup Alerts | AlertsWidget.tsx — strategy alert heading |
| signal alerts (description) | setup alerts | AlertsWidget.tsx — description text |
| daily edge (review) | daily go-to | Reviews.tsx — testimonial text |
| fast signals (review) | real-time data | Reviews.tsx — testimonial text |
| Confidence: [XX%] (ARCA prompt) | Confluence: [XX%] | arcaV3Engine.ts — output template |
| Stop Loss (ARCA prompt) | Invalidation | arcaV3Engine.ts — scenario template |
| Stop loss is MANDATORY | Invalidation level is MANDATORY | arcaV3Engine.ts — rules section |
| reduced confidence / low conviction | reduced confluence / low alignment | arcaV3Engine.ts — multi-TF rules |
| entry timing recommendations | entry timing analysis | arcaV3Engine.ts — time confluence rules |
| highest conviction setup | highest confluence setup | arcaV3Engine.ts — time confluence rules |
| High conviction move (analyst) | High confluence move | mspAnalystV2.ts — OI interpretation |
| RISK GOVERNOR PERMISSION | RISK GOVERNOR STATUS | mspAnalystV2.ts — context builder |
| recommendation MUST be WAIT | assessment MUST be WAIT | mspAnalystV2.ts — block message |
| ADAPTIVE CONFIDENCE LENS | ADAPTIVE CONFLUENCE LENS | mspAnalystV2.ts — ACL section |
| Active Playbook (doctrine) | Active Framework | intelligenceContext.ts — doctrine classifier |
| Match Confidence (doctrine) | Match Confluence | intelligenceContext.ts — doctrine stats |
| playbook may underperform | framework may underperform | intelligenceContext.ts — regime warning |
| active doctrine playbook | active doctrine framework | intelligenceContext.ts — instructions |
| strike recommendations | strike analysis | platformKnowledge.ts — tool description |
| permission gates | condition gates | platformKnowledge.ts — tool description |
| High Conviction (engine comment) | High Alignment | probability-engine.ts — label comment |
| Buy / Sell on pullback (GE API) | Enter long / Enter short | golden-egg/route.ts — entry trigger text |
| confidence (GE API narrative) | confluence | golden-egg/route.ts — narrative summary |
| High conviction move (analyst API) | High confluence move | msp-analyst/route.ts — OI interpretation |
| Confidence (regime agreement) | Confluence | msp-analyst/route.ts — system prompt |
| Adaptive Confidence (analyst API) | Adaptive Confluence | msp-analyst/route.ts — system prompt |
| High confidence signal | High confluence setup | ai/suggest/route.ts — suggestion title |
| confidence detected | confluence detected | ai/suggest/route.ts — suggestion description |
| Brain permission | Brain status | research-case/route.ts — thesis text |
| Best playbook | Best framework | research-case/route.ts — probability text |
| edge (blog — marketing CTA) | analytical advantage | blog/posts-data.ts — blog content |
| Higher Win Rates (blog title) | Better Analysis | blog/posts-data.ts — blog post title |
| extremely high win rate | extremely high confluence alignment | blog/posts-data.ts — blog content |
| improves win rates | improves analysis quality | blog/posts-data.ts — blog content |
| trade with confidence | analyse with confluence | blog/posts-data.ts — CTA link |
| profit potential (blog) | move potential | blog/posts-data.ts — short squeeze blog |
| squeeze alerts before market reacts | squeeze detection across timeframes | blog/posts-data.ts — CTA link |
| should invest (user guide) | suggested position sizes | USER_INSTRUCTIONS.md — scanner description |
| buy signal / sell signal scores | bullish setup / bearish setup | USER_INSTRUCTIONS.md — score meanings |
| buy (Bullish) / sell (Bearish) | bias is Bullish / Bearish | USER_INSTRUCTIONS.md — direction column |
| stop-loss order | invalidation level | USER_INSTRUCTIONS.md — column descriptions |
| Guides and playbooks | Guides and frameworks | resources/page.tsx — description |
| Playbooks (badge) | Frameworks | resources/page.tsx — card badge |
| deploying size | positioning size | resources/trading-guides/page.tsx |
| Volatility Window Playbook | Volatility Window Framework | resources/trading-guides/page.tsx |
| permission state / deployment mode | condition state / analysis mode | resources/platform-guide/page.tsx |
| signal trigger | setup trigger | resources/platform-guide/page.tsx |

### 5.2 Design Rationale

These changes were implemented to reduce the risk that platform outputs could be characterised as "financial product advice" under s.766B of the Corporations Act. The intent is that all outputs are observational and analytical in nature — describing what technical conditions exist — rather than directive — instructing a user to take a specific action.

### 5.3 Scope of Remediation

The combined remediation (Rounds 1, 2, and 3) covered:

- Scanner output labels and status indicators (ScreenerTable, WatchlistWidget)
- Golden Egg scenario reports and scoring language
- AI system prompts and output formatting rules (arcaV3Engine, mspAnalystV2, intelligenceContext, platformKnowledge)
- Edge Profile and Adaptive Personality display labels (EdgeInsightCards, StateMachineTraderEyeCard)
- Risk Governor display messages (CapitalFlowCard, risk metric labels)
- Marketing copy on the homepage, pricing page, and feature descriptions
- Alert and notification text (AlertsWidget scanner/strategy groups)
- Component-level UI text across dashboard, portfolio, and journal interfaces
- Fear & Greed gauge interpretation language (removed "buying opportunity" framing)
- Crypto-specific components (CryptoMorningDecisionCard, DerivativesDecisionRow, TradeIdeasSection, crypto/page.tsx, crypto-dashboard/page.tsx)
- Options terminal components (DecisionCommandBar, DecisionBar, SuggestedPlaysCard, options-confluence/page.tsx)
- Time scanner components (TimeScannerPage, TimeGateBar)
- News and decision components (NewsDecisionCard, PermissionGate, DecisionLens, DecisionCockpit, news/page.tsx)
- Operator workflow components (OperatorProposalRail, CommandCenterStateBar)
- Confluence and flow analysis displays (CapitalFlowCard — formerly "MSP One Brain Card")
- All tool pages: Golden Egg, deep analysis, options confluence, intraday charts, commodities, news, gainers-losers, signal accuracy, portfolio, equity explorer, crypto, crypto dashboard, backtest, workspace/LearningTab
- API route outputs: golden-egg, msp-analyst, ai/suggest, research-case
- AI prompt template files: arcaV3Engine.ts, mspAnalystV2.ts, intelligenceContext.ts, platformKnowledge.ts, probability-engine.ts
- Blog content (posts-data.ts): marketing CTAs, "win rate" / "edge" / "profit" language
- User documentation (USER_INSTRUCTIONS.md): "buy/sell signal" → "bullish/bearish setup", "stop-loss" → "invalidation level"
- Resource pages: trading guides, platform guide
- Reviews: testimonial language

**Note:** The Operator HUD (comprising AdaptiveTraderPersonalityBar, OperatorCommandStrip, CapitalControlStrip, and GlobalSessionBar) remains hidden from the user interface pending further review. All other components are live with remediated language.

---

## 6. Active Disclaimers and Legal Warnings

The following disclaimers are currently deployed across the platform.

### 6.1 General Advice Warning (GAW) — All Tool Pages

**Placement:** Amber-coloured banner displayed at the top of every page within the `/tools/` section of the platform (scanner, Golden Egg, portfolio, journal, AI analyst, backtest, options, and all other tool pages).

**Text:**

> **General Advice Warning:** This platform provides general information only. It does not consider your personal objectives, financial situation, or needs. MarketScanner Pros does not hold an Australian Financial Services Licence (AFSL) and is not a licensed financial adviser. Content is not financial advice — consult a licensed professional before making investment decisions.

### 6.2 Footer Disclaimer — All Pages

**Placement:** Persistent footer visible on every page of the platform.

**Text:**

> ⚠️ Disclaimer: MarketScanner Pros provides general information only and does not hold an Australian Financial Services Licence (AFSL). Nothing on this platform is financial, investment, or trading advice, nor does it consider your personal objectives, financial situation, or needs. Past performance does not guarantee future results. Trading involves substantial risk of loss. Consult a licensed financial advisor before making investment decisions.

### 6.3 Disclaimer Page (`/disclaimer`)

**Content:** A dedicated, standalone page containing detailed disclosures organised into the following sections:

- Educational Use Only
- AFSL Disclosure (explicit statement of non-licence status)
- Market Risk Warning
- Data, Signals, AI & Accuracy Limitations
- Data Delays & Third-Party Sources
- Paper Trade & Simulation System Disclosure
- Backtests & Historical Data Limitations
- Jurisdiction & Compliance
- Limitation of Liability

### 6.4 Terms of Service — Key Sections

- **Section 2:** States the platform is for educational purposes only; does not provide financial, investment, or trading advice
- **Section 2A (Paper Trade & Simulation System):** Explicit disclosure that no feature executes real trades, connects to live brokerage accounts, or places orders. States MSP does not hold an AFSL.
- **Section 2B (AI-Generated Content):** States AI outputs are not financial advice and may contain errors. States personalisation features use historical data to surface analytical patterns, not recommend trades.
- **Section 9 (Governing Law):** New South Wales, Australia

### 6.5 AI Output Disclaimer — Every AI Response

**Placement:** Appended to every AI-generated response.

**Text:**

> ⚠️ Disclaimer: This analysis is for educational purposes only and does not constitute financial advice. Past performance does not guarantee future results. Always consult a licensed financial adviser before making any investment decisions.

### 6.6 Backtest Disclaimer

**Placement:** Displayed within the backtest results interface.

**Text:**

> Backtested results are hypothetical, do not reflect actual trading, do not account for slippage/commissions. Past results do not guarantee future outcomes.

### 6.7 Options / Execution Disclaimer

**Placement:** Displayed within options workflow components.

**Text:**

> This is a simulated workflow — no broker execution.

### 6.8 Edge Profile Disclaimer

**Placement:** Displayed within Edge Profile insight cards.

**Text:**

> Past performance does not guarantee future results. Edge insights are based on your journal history and are for educational analysis only.

### 6.9 Data Source Attribution

**Placement:** Disclaimer page.

**Text:**

> Data sourced from Alpha Vantage Premium API, may be delayed by 15+ minutes. Options/derivatives data may have additional delays.

---

## 7. AI System Constraints

The AI analyst feature (branded "ARCA AI") operates under the following constraints, implemented at the system prompt level and enforced through output formatting rules.

### 7.1 System Prompt Directives

The AI system prompt explicitly instructs the model to:

- Provide analysis, scenarios, explanations, and technical tool-building support
- **Never** provide financial advice
- **Never** use directive language such as "buy," "sell," "you should," or "I recommend"
- Frame all outputs using the labels: "Conditions Aligned," "Watch for Confirmation," or "Conditions Not Met"
- Append a mandatory disclaimer to every response

### 7.2 Output Labels

All AI analytical outputs use the following classification system:

| Label | Meaning |
|---|---|
| ✅ Conditions Aligned | Technical criteria have been met based on the selected indicators |
| ⚠️ Watch for Confirmation | Some criteria are met; others are pending |
| ❌ Conditions Not Met | Technical criteria are not satisfied |

These labels are designed to describe observed technical conditions rather than to direct the user to take action.

### 7.3 What the AI Does Not Do

The AI system:

- Does not assess the user's income, liabilities, risk tolerance, or broader personal financial circumstances
- Does not generate outputs that constitute personal financial product advice within the meaning of s.766B(3) of the Corporations Act
- Does not have access to the user's brokerage accounts, positions, or financial situation beyond data the user has voluntarily entered into the platform's paper trade simulation tools
- Does not execute, facilitate, or recommend the execution of trades

### 7.4 Usage Limits

AI usage is rate-limited by subscription tier:

| Tier | Daily Limit | Model |
|---|---|---|
| Free | 10 questions/day | GPT-4o-mini |
| Pro | 50 questions/day | GPT-4o-mini |
| Pro Trader | 50 questions/day | GPT-4.1 |

Limits are enforced server-side and cannot be circumvented by the user.

---

## 8. Personalisation — Edge Profile and Adaptive Features

**This section is flagged as the primary area requiring external legal assessment.**

### 8.1 Description

The Edge Profile system analyses a user's closed trade history from the platform's paper trade journal to identify statistical patterns. For example, it may observe that a user's simulated outcomes were historically more positive when a particular strategy type was used during a specific market regime.

The Adaptive Personality feature adjusts certain UI presentation elements based on the user's interaction patterns with the platform.

### 8.2 Current Framing

- Outputs are labelled as "Historical pattern" rather than "edge" or "prediction"
- Status labels use "ALIGNED" / "PATTERN MISMATCH" rather than "TRADE_READY"
- Section headings use "Your Historical Patterns" rather than "Your Trading Edge"
- Pattern maturity labels use "Established pattern" / "Developing pattern" rather than "Established edge" / "Developing edge"
- A disclaimer is displayed: *"Past performance does not guarantee future results. Edge insights are based on your journal history and are for educational analysis only."*
- The Terms of Service (Section 2B) state: *"Personalisation features (Edge Profile, Adaptive Personality) use historical data to surface analytical patterns, NOT recommend trades."*

### 8.3 Data Inputs

The Edge Profile system uses only data that the user has voluntarily entered into the platform's paper trade journal:

- Simulated entry/exit prices and dates
- Strategy labels and setup types (assigned by the user)
- Simulated P&L outcomes
- Market regime state at the time of entry

It does not access the user's real brokerage positions, account balances, income, liabilities, or personal financial circumstances.

### 8.4 Risk Assessment

While the personalisation features are designed to describe historical tendencies rather than recommend future actions, there is a structural question as to whether this level of personalisation could create a risk of the outputs being characterised as personal financial product advice under the substance test in s.766B(3) of the Corporations Act.

**The key question is:** Does a system that analyses a user's individual historical behaviour — even within a paper trade simulation — and then adjusts its outputs based on that analysis cross the threshold from "general information" to "personal advice" under the substance-over-form test?

**Internal assessment:** The current framing (educational analytics, paper trade simulation, disclaimers, no consideration of personal financial circumstances) is intended to mitigate this risk. However, this remains the area where external legal counsel's assessment is most needed.

---

## 9. Risk Governor and Risk Framing

### 9.1 Description

The Risk Governor is a rule-based evaluation system that assesses simulated trade proposals against predefined risk parameters. It operates within the platform's paper trade simulation environment.

### 9.2 Parameters

| Parameter | Value |
|---|---|
| Maximum daily loss | 2% of simulated equity |
| Maximum portfolio heat (aggregate open risk) | 6% of simulated equity |
| Minimum reward-to-risk ratio | 1.5:1 |
| Maximum concurrent open simulated trades | 8 |
| Maximum single trade risk | 2% of simulated equity |

### 9.3 Current Framing

- The Risk Governor is framed as a simulation / risk metric display tool
- It does not control real broker execution
- It does not hold funds or place orders
- Display language uses "simulated entries" and "risk metric" — not "permission" or "trades disabled"
- Status display uses "CONDITIONS MET" / "CONDITIONS NOT MET" rather than "EXECUTION ALLOWED" / "EXECUTION BLOCKED"
- Block messages read "Risk threshold reached" rather than "Risk governor lockout active"
- The component formerly titled "Institutional Risk Governor" is now titled "Risk Metrics Engine"
- When a simulated proposal fails a risk check, the message reads: *"New simulated entries disabled"* with a specific reason code (e.g., *"Portfolio heat X% ≥ Y% — reduce simulated exposure"*)

### 9.4 Legal Significance

The Risk Governor exists as an educational risk context tool. It is designed to demonstrate risk management principles within a simulation environment. It does not constitute a risk management service, as it does not manage real funds or positions.

---

## 10. What MSP Does Not Do

The following is a definitive list of activities that MSP does **not** currently perform:

| Activity | Status |
|---|---|
| Execute live trades | ❌ Not performed |
| Connect to user brokerage accounts for live dealing | ❌ Not performed |
| Hold, custody, or transmit client funds | ❌ Not performed |
| Submit orders to any exchange or broker on behalf of users | ❌ Not performed |
| Provide personal financial product advice (s.766B(3)) | ❌ Not intended; educational framing applied |
| Provide general financial product advice requiring an AFSL | ❌ Not intended; informational/educational positioning |
| Auto-trade based on signals, alerts, or AI outputs | ❌ Not performed |
| Act as a broker, dealer, or market participant | ❌ Not performed |
| Assess users' personal financial circumstances | ❌ Not performed |
| Provide human financial adviser consultations | ❌ Not performed |
| Redistribute raw market data feeds | ❌ Not performed |

---

## 11. Future Features Requiring Legal Review

The following features have been designed at the architecture level but are **not currently live**. Each would require legal review before activation.

### 11.1 Read-Only Broker Sync (Phase 1 — Designed, Not Live)

**Description:** Connect to external brokerage accounts (e.g., Interactive Brokers, Alpaca, Binance) via OAuth to read positions, balances, and fill history. No order submission.

**Legal review needed:** Whether read-only access to brokerage data affects the platform's regulatory classification. Whether displaying real account data alongside analytical outputs creates an advisory framing risk.

### 11.2 Trade Ticket System (Phase 2 — Designed, Not Live)

**Description:** A pre-filled trade ticket interface that aggregates analytical outputs (scanner results, Golden Egg scenarios, AI commentary) into a structured proposal that a user could review before any action.

**Legal review needed:** Whether pre-filling trade parameters from analytical outputs constitutes "arranging" under s.766C of the Corporations Act, even if the user must independently act on the information.

### 11.3 User-Confirmed Broker Execution (Phase 3 — Designed, Not Live)

**Description:** Direct submission of orders to a connected broker, requiring explicit user confirmation and a compliance checkbox acknowledgement before each order.

**Legal review needed:** This feature would likely constitute "dealing" or "arranging" under the Corporations Act and would almost certainly require an AFSL or authorised representative arrangement. **This feature must not be activated without external legal clearance.**

### 11.4 Account-Linked Position Sizing

**Description:** Using real broker account balances to calculate position sizes within the analytical tools.

**Legal review needed:** Whether linking real account data to analytical sizing outputs changes the nature of the platform's outputs from general information to personal advice.

### 11.5 Advanced Adaptive Personalisation

**Description:** Expanding the Edge Profile system to provide more granular, personalised analytical outputs based on a deeper analysis of user behaviour and trading patterns.

**Legal review needed:** Whether increased personalisation depth crosses the threshold into personal financial product advice under the substance test, regardless of disclaimer language.

---

## 12. Key Legal Questions for External Counsel

The following questions are submitted for your assessment:

1. **AFSL Requirement:** In its current remediated state — as an educational and informational analytics platform with no execution capability, no fund custody, and no personal advice — does MSP require an Australian Financial Services Licence?

2. **General vs. Personal Advice:** Do the current personalisation features (Edge Profile, Adaptive Personality) create a risk that platform outputs could be characterised as personal financial product advice under s.766B(3), even where:
   - The data source is limited to the user's own paper trade journal entries
   - Outputs are framed as historical pattern descriptions
   - Disclaimers explicitly state these are not recommendations
   - No assessment of the user's personal financial circumstances is performed

3. **Substance-Over-Form Test:** Is the current disclaimer and framing regime sufficient to satisfy ASIC's substance-over-form approach, or are there structural features of the platform (e.g., personalised outputs, scenario plans, risk governor assessments) that could be interpreted as advice regardless of labelling?

4. **Future Broker Features:** Which of the planned broker-connected features (read-only sync, trade ticket, user-confirmed execution) would constitute "arranging" or "dealing" under s.766C, and at what phase would an AFSL become necessary?

5. **Optimal Regulatory Path:** Given the platform's current state and planned roadmap, what is the recommended regulatory path:
   - Remain as an educational / informational platform (no AFSL required)?
   - Become an authorised representative under an existing AFSL holder?
   - Apply for an AFSL directly?

6. **Additional Disclosures:** Are there any additional disclaimers, user acknowledgements, or workflow constraints that should be implemented in the current platform to strengthen the educational / informational positioning?

7. **Cross-Jurisdiction Considerations:** Given that the platform is operated from Australia but primarily analyses US equity and cryptocurrency markets and may have users in multiple jurisdictions, are there cross-border regulatory considerations (e.g., US SEC, state-level regulations, MiFID II for any EU users)?

8. **AI Regulatory Exposure:** Does the use of AI-generated analytical commentary create any additional regulatory obligations under Australian law (current or proposed), particularly regarding the accuracy of AI outputs and the potential for user reliance?

9. **ABN Display:** The platform does not currently display an Australian Business Number. Is this required, and if so, where must it be displayed?

---

## 13. Risk Summary Table

| Area | Current Risk Level | Notes |
|---|---|---|
| Core analytics platform (scanner, indicators, dashboards) | **LOW** | Informational display of derived analytics from licensed data sources. No directive language. GAW and disclaimers in place. |
| AI-generated outputs | **LOW–MODERATE** | Educational framing with mandatory disclaimers. Risk remains that users may treat AI commentary as advice despite disclaimers. AI may produce inaccurate outputs (hallucination risk). |
| Edge Profile / Personalisation | **MODERATE** | Primary risk area. Analyses individual user behaviour and adjusts outputs accordingly. Currently framed as historical pattern recognition. Substance test under s.766B(3) should be assessed by counsel. |
| Scenario planning outputs (Golden Egg) | **LOW–MODERATE** | Multi-factor analytical reports with scenario framing. Remediated language reduces advisory appearance. No execution link. |
| Risk Governor | **LOW** | Educational simulation tool. Does not control real capital. Uses "simulated" language throughout. |
| Trade journal / portfolio tracker | **LOW** | Paper trade record-keeping. No broker connection. No execution. |
| Backtest engine | **LOW** | Historical simulation with mandatory limitations disclaimer. |
| Broker features (future — not live) | **HIGH** (if activated) | Not currently operational. Phase 3 (execution) would almost certainly require an AFSL. Must not be activated without legal clearance. |
| Cross-border considerations | **MODERATE** | Platform operated from Australia; analyses US markets; potential users in multiple jurisdictions. No current assessment of cross-border obligations has been conducted. |
| Data licensing compliance | **LOW** | Commercial licences in place for Alpha Vantage, CoinGecko, and Nasdaq. No raw feed redistribution. |

---

## 14. Appendices

The following materials should be compiled and attached to this briefing pack before submission to external counsel.

### Appendix A — Screenshots of Current UI

- A.1: Scanner results page showing alignment labels, GAW banner, and "(paper)" allocation label
- A.2: Golden Egg report page showing scenario framing and confluence scoring
- A.3: AI Analyst response showing educational disclaimer footer
- A.4: Edge Profile card showing "Historical pattern" label and disclaimer
- A.5: Risk Governor display showing "simulated entries" language
- A.6: Portfolio tracker showing paper trade framing
- A.7: Footer disclaimer as displayed across all pages

### Appendix B — Sample AI Output

- B.1: Sample ARCA AI response to a market analysis query, showing output labels and disclaimer

### Appendix C — Sample Scanner Output

- C.1: Screenshot of scanner results table showing "Aligned" / "Not Aligned" labels and "Bullish Setup" / "Bearish Setup" directional framing

### Appendix D — Disclaimer Text (Full)

- D.1: Full text of the `/disclaimer` page
- D.2: Full text of the General Advice Warning banner

### Appendix E — Terms of Service Extract

- E.1: Section 2 (Use of App — educational purposes)
- E.2: Section 2A (Paper Trade & Simulation System)
- E.3: Section 2B (AI-Generated Content)
- E.4: Section 9 (Governing Law)

### Appendix F — Privacy Policy Extract

- F.1: Data collection summary (Edge Profile, Adaptive Personality, Journal data)
- F.2: Third-party processor list
- F.3: Data retention schedule
- F.4: GDPR / CCPA rights summary

### Appendix G — Broker Integration Design Document

- G.1: Phase 1–3 architecture overview (design only — not live)
- G.2: Compliance controls designed into execution pipeline

---

## 15. Supporting Materials Needed

Before sending this briefing pack to external counsel, the following materials should be compiled and attached:

| Item | Description | Priority |
|---|---|---|
| **UI Screenshots** | Screenshots of all major tool pages (scanner, Golden Egg, AI analyst, portfolio, journal, backtest, options, Edge Profile, Risk Governor) showing current disclaimers and framing | High |
| **GAW Banner Screenshot** | Clear screenshot showing the General Advice Warning banner as displayed on tool pages | High |
| **Footer Disclaimer Screenshot** | Screenshot of the persistent footer disclaimer | High |
| **Sample AI Response** | Exported text or screenshot of a representative ARCA AI response including the mandatory disclaimer | High |
| **Disclaimer Page Export** | Full HTML or PDF export of the `/disclaimer` page | High |
| **Terms of Service Export** | Full HTML or PDF export of the Terms of Service, highlighting Sections 2, 2A, and 2B | High |
| **Privacy Policy Export** | Full HTML or PDF export of the Privacy Policy | High |
| **Cookie Policy Export** | Full HTML or PDF export of the Cookie Policy | Medium |
| **Refund Policy Export** | Full HTML or PDF export of the Refund Policy | Medium |
| **Edge Profile Output Sample** | Screenshot or export showing Edge Profile insight cards with "Historical pattern" labels and disclaimers | High |
| **Broker Integration Design Doc** | Internal design document covering Phases 1–3 of planned broker integration | High |
| **Subscription Tier Summary** | Clean summary of Free / Pro / Pro Trader feature sets and pricing | Medium |
| **Remediation Changelog** | Summary of all 90+ text changes made during March 2026 compliance remediation, with before/after examples | Medium |
| **ABN / Business Registration Status** | Current status of ABN registration (if in progress) | High |
| **Data Licence Agreements** | Copies of API licence agreements with Alpha Vantage, CoinGecko, and Nasdaq (if available) | Medium |
| **AI System Prompt Extract** | Sanitised extract of the ARCA AI system prompt showing compliance directives and output formatting rules | Medium |

---

*End of Briefing Pack*

*This document has been prepared for the purpose of instructing external legal counsel. It is intended to provide a factual description of the platform's current state and does not constitute a legal opinion or self-assessment of compliance. All assessments of regulatory obligations should be made by appropriately qualified legal practitioners.*
