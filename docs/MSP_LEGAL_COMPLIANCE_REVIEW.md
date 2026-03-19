# MSP Full Legal / Compliance Review — v2 (Post-Remediation)

**Date:** March 19, 2026
**Previous version:** March 18, 2026 (pre-remediation)
**Scope:** Full product + website + workflow + planned features legal risk audit
**Jurisdiction:** Australia — New South Wales — ASIC / Corporations Act 2001
**Standard:** Substance over labels. Disclaimers alone do not resolve advisory conduct.
**Status:** Internal compliance assessment following P0/P1 code remediation (not legal advice — engage specialist counsel for binding opinions)

---

## 1. Executive Verdict

| Dimension | Rating | Detail |
|-----------|--------|--------|
| **Overall Legal Risk** | **LOW** *(was MEDIUM → MEDIUM-HIGH)* | Full remediation completed across 27+ files. All advisory/directive language reframed to educational/analytical terminology. No remaining explicit buy/sell/trade directives in user-facing code. |
| **Current Website Risk** | **LOW** *(was LOW-MEDIUM → MEDIUM)* | Homepage hero: "See The Market With Clarity". All "high-probability" → "technically aligned". All "institutional-grade" → "professional-level". Marketing copy fully remediated. |
| **Current Product Workflow Risk** | **LOW** *(was MEDIUM → HIGH)* | Scanner/Golden Egg/AI pipeline fully reframed. Alert API routes updated (DIRECTION CHANGE/SIGNAL, not BUY/SELL). Fear & Greed: no "buying opportunity" language. CryptoMorningDecisionCard: PERMISSION→CONDITION/ALIGNED. All backtest/portfolio/journal labels neutralized. Paper trade framing consistent throughout. |
| **Biggest Concern Now** | **Structural personalization risk** | All explicit directive language has been fixed. The remaining theoretical risk is the substance test under s.766B(3) — platform still analyses individual user behaviour via edge profile + adaptive personality. Educational/paper trade framing provides strong defense but specialist counsel should still assess. |
| **Can MSP honestly position itself as educational/informational?** | **Yes** *(was Mostly Yes → Partially)* | Paper trade framing, "ALIGNED/NOT ALIGNED" labels, confluence terminology, GAW banner on all tool pages, no-AFSL disclaimer prominently placed, educational disclaimers throughout, all alert/UI/marketing language remediated. The platform presents as educational across all user-facing surfaces. |

### What Changed (P0/P1 Remediation Summary)

Three code commits addressed the most critical compliance issues:

**Commit ee31dd00 (P0 — 17 files):**
- AlertsWidget.tsx: "Buy Signal"/"Sell Signal" → "Bullish Setup"/"Bearish Setup"
- AdaptivePersonalityCard.tsx: "TRADE_READY" → "ALIGNED", "NO_TRADE" → "PATTERN MISMATCH", "recommendation" → "assessment"
- edgeProfile.ts: Removed directive language ("Consider reducing size or skipping")
- 4 AI prompt files: "TRADE-READY" → "CONDITIONS ALIGNED", "NO-TRADE" → "CONDITIONS NOT MET"
- Footer.tsx: Added no-AFSL statement
- disclaimer/page.tsx: Added AFSL/Corporations Act disclosure
- ToolsLayoutClient.tsx: Added GAW banner on ALL tool pages
- Hero.tsx, CommandHub.tsx, pricing/page.tsx, blog/[slug]/page.tsx: Marketing copy fixes

**Commit 79246cf2 (P1 — 18 files):**
- Golden Egg (8 files): TRADE/NO TRADE → ALIGNED/NOT ALIGNED, Verdict → Assessment, Confidence → Confluence, BUY/SELL → LONG/SHORT, Trade Plan → Scenario Plan (Paper Trade)
- Scanner: HIGH CONVICTION → HIGH ALIGNMENT, Trade Readiness → Setup Alignment, Capital Allocation → Simulated Allocation (paper), Permission → Regime State, added score disclaimer
- Risk Governor (4 files): "New trades disabled" → "New simulated entries disabled", "permission" → "risk metric"
- Edge Profile: "Strong edge" → "Historical pattern", added past-performance disclaimer
- Disclaimer page: Added Data Delays section and Paper Trade & Simulation System section
- Terms of Service: Added Section 2A (Paper Trade System with AFSL disclosure) and Section 2B (AI-Generated Content)
- Privacy Policy: Added edge profile, adaptive personality, portfolio/journal data collection, AI processing disclosures

**Commit 5d6bbbbc (bugfix):**
- Heartbeat API UUID validation fix (not compliance-related)

### Current Core Problem

The original core problem was that the platform had the **substance of financial product advice** through directive language (TRADE_READY, BUY SIGNAL, etc.) and personalized outputs.

**What's been resolved:** The primary user-facing display layer now uses educational/analytical framing. All tool pages carry a General Advice Warning. The disclaimer page includes comprehensive AFSL, paper trade, and data delay disclosures. AI prompts have been updated to use "CONDITIONS ALIGNED/NOT MET" labels.

**What remains:** The substance-over-form risk still exists in specific secondary components and backend alerts that generate old-style "BUY SIGNAL"/"SELL SIGNAL" text. The Fear & Greed gauges still frame extreme conditions as "buying opportunities." The `CryptoMorningDecisionCard` still uses "PERMISSION" as a display label. These are specific, fixable issues rather than systemic problems.

---

## 2. What Is Now Compliant

These features have been audited and are consistent with an educational/informational platform:

| Feature | Compliance Status | Evidence |
|---------|------------------|----------|
| **Homepage Hero** | ✅ COMPLIANT | "See The Market With Clarity" — no predictive claims |
| **Homepage Subtitle** | ✅ COMPLIANT | "Professional-level scanning, confluence detection..." — accurate description |
| **Pricing Page Pro Trader CTA** | ✅ COMPLIANT | "Advanced tools for serious traders." — factual, no edge claims |
| **AlertsWidget (UI)** | ✅ COMPLIANT | "Bullish Setup" / "Bearish Setup" — non-directive |
| **AdaptivePersonalityCard** | ✅ COMPLIANT | "ALIGNED" / "PATTERN MISMATCH" labels, "assessment" property, no "recommendation" |
| **Golden Egg (UI layer)** | ✅ COMPLIANT | "Aligned/Not Aligned/Watch" verdicts, "Confluence" percentages, "Scenario Plan (Paper Trade)" |
| **Scanner (UI layer)** | ✅ COMPLIANT | "HIGH ALIGNMENT", "Setup Alignment", "Simulated Allocation (paper)", "Regime State", score disclaimer |
| **Edge Profile (UI)** | ✅ COMPLIANT | "Historical pattern" framing, past-performance disclaimer footer, no directive language |
| **Risk Governor** | ✅ COMPLIANT | "New simulated entries disabled" — educational framing, risk metric display |
| **AI Prompts** | ✅ COMPLIANT | "CONDITIONS ALIGNED"/"CONDITIONS NOT MET" labels, educational framing, every response requires disclaimer |
| **Footer** | ✅ COMPLIANT | No-AFSL statement present |
| **Disclaimer Page** | ✅ COMPLIANT | Comprehensive: AFSL disclosure, data delays, paper trade system, backtest limitations, AI accuracy limits |
| **Terms of Service** | ✅ COMPLIANT | Sections 2A (Paper Trade/AFSL) and 2B (AI Content) added |
| **Privacy Policy** | ✅ COMPLIANT | Edge profile, adaptive personality, portfolio/journal, AI processing disclosures added |
| **General Advice Warning** | ✅ COMPLIANT | GAW banner displayed on ALL tool pages via ToolsLayoutClient.tsx |
| **Options Scanner** | ✅ COMPLIANT | "Educational Mode" alert, "This is a simulated workflow — no broker execution" |
| **Intraday Charts** | ✅ COMPLIANT | Pure data visualization |
| **Sector / Crypto Heatmaps** | ✅ COMPLIANT | Market overview visualizations |
| **Market Movers** | ✅ COMPLIANT | Factual data display |
| **Macro Dashboard** | ✅ COMPLIANT | Market data display |
| **Watchlists** | ✅ COMPLIANT | User-created lists |
| **Portfolio Tracker** | ✅ COMPLIANT | Record-keeping / paper trade framing |
| **Trade Journal** | ✅ COMPLIANT | Self-reflection learning tool |
| **Economic/Earnings Calendars** | ✅ COMPLIANT | Factual event data |
| **Blog / Educational Articles** | ✅ COMPLIANT | Educational content with disclaimers |
| **Cookie Policy** | ✅ COMPLIANT | Granular GDPR consent mechanism |
| **Backtest Engine** | ✅ COMPLIANT | Hypothetical disclaimer, educational mode label, "not investment advice" statement |
| **Data Attribution** | ✅ COMPLIANT | Alpha Vantage and CoinGecko properly attributed |

---

## 3. What Was Fixed

> **ALL ITEMS IN THIS SECTION HAVE BEEN REMEDIATED** (completed 2026-03-19, commit `d619919a` + prior sessions)
>
> Items preserved below for audit trail purposes.

### 3A. Alert API Routes — FIXED

Alert generation routes updated to non-directive language:
- `signal-check/route.ts`: "BUY SIGNAL"/"SELL SIGNAL" → "DIRECTION CHANGE: shifted to bullish/bearish"
- `strategy-check/route.ts`: "ENTRY SIGNAL suggests entering"/"EXIT SIGNAL suggests exiting" → "SIGNAL: generated entry/exit signal"
- `smart-check/route.ts`: Fear/greed/OI divergence messages neutralized to observational tone

### 3B. Fear & Greed Components — FIXED

- `FearGreedGauge.tsx`: "buying opportunity" → "oversold conditions"
- `CustomFearGreedGauge.tsx`: "consider taking profits" → "historically precedes market pullbacks"
- `DerivativesWidget.tsx`: "contrarian long potential" → "elevated short positioning"

### 3C. CryptoMorningDecisionCard — FIXED

- `PermissionVerdict` type → `ConditionVerdict` (YES/NO DEPLOYMENT → ALIGNED/NOT ALIGNED)
- `permissionColor()`/`permissionBadge()` → `conditionColor()`/`conditionBadge()`
- `STATUS:` display → `CONDITIONS:`
- Sub-cluster `permission` field → `condition`

### 3D. Marketing Copy — FIXED

- All "high-probability" → "technically aligned" (Benefits.tsx, about/page.tsx, blog, reviews, partners)
- All "institutional-grade" → "professional-level" (about, pricing, time-scanner, DataComingSoon)

### 3E. Probability Engine Labels — FIXED

- `ScanTemplatesBar.tsx`: "High Conviction" template → "High Alignment"
- `probability-engine.ts`: Only remaining reference is a code comment (not user-visible)

### 3F. MSP Analyst Route — FIXED

- "historically good buying opportunity" → "historically oversold conditions"

### 3G. Additional Items Fixed (2026-03-19)

| Component | Change |
|-----------|--------|
| Options Confluence | BUY/SELL → LONG/SHORT, Trade Summary → Analysis Summary, Recommends → Identifies |
| Backtest Page | "Deploy live" removed, "qualify execution" → "evaluate strategy statistics" |
| PerformanceMetrics | "Strong edge" → "Above breakeven", Best/Worst Trade → Largest Gain/Loss |
| ResearchCaseModal CSV | Entry → Reference Level, Stop Loss → Invalidation Level, Target → Key Level |
| TradeEntryForm | Stop Loss → Risk Level, Target → Key Level |
| Portfolio Page | CSV headers neutralized, Stop Loss → Risk Level, Take Profit → Reaction Zone |
| LiveDeskFeedPanel | "High Probability Setups" → "Technically Aligned Setups" |
| TimeGravityMap | "HIGH PROBABILITY TARGET" → "KEY CONFLUENCE ZONE" |
| TimeScannerPage | "Permission score" → "Alignment score", "permission quality" → "confluence quality" |
| MSPCopilot | "best trades" → "strongest confluence" |
| EdgeInsightCards | "Best strategy/regime" → "Historically strongest/Highest win-rate regime" |
| Blog posts | 5 "high-probability" instances → "technically aligned"/"confluence" |
| Reviews | "high-probability setups" → "technically aligned setups" |
| AI suggest route | "stop losses" → "risk levels" |
| Correlation regime engine | All directive recommendations → observational tone |
| Economic calendar | "Trade leaders only" → "Focus on leaders and consider..." |
| AlertsWidget | "accumulation detected"/"distribution/deleveraging" → "bullish/bearish divergence" |
| Partners page | "high-probability conditions" → "technically aligned conditions" |
| tools-preview.html | "high-probability trade setups" → "technically aligned trade setups" |

---

## 4. Risk Assessment — Current State

### The Spectrum of Conduct

```
SAFE                                                    RISKY
  |                                                        |
  Data Display → General Commentary → General Advice → Personal Advice → Dealing
  |              |                    |                  |                |
  Charts,        "Markets are         "Breakouts tend   "Based on YOUR   Submitting
  Heatmaps,      volatile today"      to work better    edge profile,    orders to
  Calendars                           in expansion      this signal      broker
                                      regimes"          fits YOUR style"
```

### Where MSP Currently Sits (Post-Remediation)

**Data Display (SAFE):** Charts, heatmaps, calendars, sector performance, crypto derivatives data, portfolio tracker (paper trade framing), journal.

**General Commentary (SAFE):** Macro dashboard regime labels, blog articles, educational guides, market overview text, AI prompts with educational framing.

**Educational Analytics (SAFER THAN BEFORE, STILL REQUIRES CARE):** Scanner confluence scores displayed as "alignment" with disclaimers. Golden Egg displayed as "scenario plans" with "aligned/not aligned" labels. AI outputs framed as "educational analysis" with mandatory disclaimers. Backtest engine with hypothetical performance warnings.

**Personal Analytics (REDUCED RISK):** Edge profile now shows "historical patterns" not "recommendations." Adaptive personality shows "pattern alignment" not "adaptive confidence." Portfolio heat governor shows "risk metrics" not "trade permission." **However**, the substance of personalization still exists — the platform still analyses individual user behaviour and presents tailored outputs. The reframing reduces but does not eliminate the s.766B(3) personal advice risk.

**Dealing (NOT LIVE):** No broker execution, no order submission, no live account connectivity. Paper trade framing consistently applied.

### Key ASIC Regulatory Instruments

| Reference | Relevance |
|-----------|-----------|
| **Corporations Act s.766B** | Definition of "financial product advice" — recommendation or opinion that could reasonably influence a person's decision about a financial product |
| **Corporations Act s.766B(3)** | Personal advice — provider has considered, or should have considered, the person's objectives, financial situation, or needs |
| **Corporations Act s.766C** | "Dealing" in a financial product — arranging for a person to deal |
| **Corporations Act s.911A** | Requirement for AFSL to provide financial services |
| **Corporations Act s.911A(2)(a)** | Media exemption — does not apply to personalized or interactive tools |
| **ASIC RG 244** | Giving information, general advice, and scaled advice |
| **ASIC RG 175** | Licensing: Financial product advisers — conduct and disclosure |
| **ASIC Report 632** | Review of how digital advice providers meet their obligations |
| **ASIC v. Westpac (2019)** | Substance not form test — disclaimers don't override the character of conduct |
| **ASIC v. RI Advice Group (2021)** | Licensees must ensure advice is appropriate, even when technology-mediated |
| **ASIC finfluencer prosecutions (2023-2025)** | ASIC pursued unlicensed advice providers on social media — "educational" framing did not protect those providing specific buy/sell guidance |

### The Critical Question — Reassessed

**Could ASIC reasonably say MSP is providing digital financial product advice?**

**Possibly, but the risk is significantly reduced.** Post-remediation:
1. ✅ Confluence scores now labeled "alignment" with disclaimers — reduces but doesn't eliminate
2. ✅ Trade plans labeled "scenario plans (paper trade)" — educational framing
3. ✅ "ALIGNED" / "NOT ALIGNED" replaces "TRADE_READY" / "NO_TRADE" — less directive
4. ✅ AI outputs include mandatory educational disclaimers — reduces risk
5. ⚠️ Alert API routes still generate "BUY SIGNAL" / "SELL SIGNAL" — remains problematic
6. ⚠️ Fear & Greed components still say "buying opportunity" — remains problematic
7. ✅ Edge profile uses "historical pattern" framing — reduced personalization risk

A reasonable person viewing the current MSP interface sees "Confluence: 73%", "Scenario Plan (Paper Trade)", "Aligned" status, with a General Advice Warning banner and educational disclaimers. This is materially better than "HIGH CONVICTION", "TRADE_READY", "BUY SIGNAL" with no warnings.

**Could ASIC reasonably say MSP is providing personal advice?**

**Reduced risk, but possible for Pro Trader tier.** The edge profile and adaptive personality card still analyse individual user behaviour. The reframing from "recommendation" to "assessment" and "confidence" to "alignment" helps, but ASIC's substance test looks at whether the platform considers "the person's objectives, financial situation, or needs" — which the edge profile and adaptive personality inherently do. The disclaimers and "paper trade" framing provide a stronger defensive position than before.

---

## 5. Broker / Trade Ticket Risk Review

### Current Status

No broker features are live. All portfolio/journal features operate as paper trade simulation. No order routing, no account connectivity, no execution capability exists in the deployed application.

### Risk Assessment by Feature (Unchanged — Future Planning)

| Feature | Risk Level | Assessment |
|---------|-----------|------------|
| **Read-only broker sync (positions, balances)** | LOW-MEDIUM | Passive data display. Safe if not used for recommendations. |
| **Read-only broker sync (fills → journal)** | LOW | Record-keeping. Safe. |
| **Trade ticket (display only, no broker)** | MEDIUM | Now labeled "Scenario Plan (Paper Trade)" — reduced risk. |
| **"Save as Plan" (no execution)** | LOW | Journaling. Safe. |
| **Paper mode** | LOW | Current mode. Well-disclaimed. |
| **Broker deep-link / handoff** | MEDIUM-HIGH | Still "arranging" conduct if implemented. |
| **Direct "Submit Order" to broker** | **CRITICAL** | Requires AFSL assessment. Not implemented. |
| **Future autonomous suggestions** | **CRITICAL** | Active solicitation. Not implemented. |

### What Requires External Legal Review Before Launch

**MUST get specialist Australian financial services legal opinion before launching:**
1. Direct order submission to any broker
2. Pre-filled trade tickets from scanner/GE/AI connected to broker execution
3. Account-linked position sizing using broker balances
4. Any feature where MSP generates a trade idea AND facilitates its execution

**Can proceed with current safeguards:**
1. ✅ Read-only portfolio tracker (paper trade framing — currently live)
2. ✅ Save as Plan / journal (currently live)
3. ✅ Paper/simulation mode (currently live, well-disclaimed)

---

## 6. Copy / Wording Review — Current State

### Previously Flagged Items — Resolution Status

| Original Flagged Wording | Status | Current State |
|--------------------------|--------|---------------|
| "See The Market Before It Moves" | ✅ FIXED | "See The Market With Clarity" |
| "Serious tools. Serious edge." | ✅ FIXED | "Advanced tools for serious traders." |
| "BUY signal" / "SELL signal" (AlertsWidget UI) | ✅ FIXED | "Bullish Setup" / "Bearish Setup" |
| "TRADE_READY" (display text) | ✅ FIXED | "ALIGNED" |
| "NO_TRADE" (display text) | ✅ FIXED | "NOT ALIGNED" / "PATTERN MISMATCH" |
| "recommendation" (property label) | ✅ FIXED | "assessment" |
| "72% ADAPTIVE CONFIDENCE" | ✅ FIXED | Pattern alignment language |
| "Fits your setup preference" | ✅ FIXED | Historical pattern language |
| "Consider reducing size or skipping" | ✅ FIXED | Removed from edgeProfile.ts |
| "Confidence: 76%" (Golden Egg) | ✅ FIXED | "Confluence: 76%" |
| "HIGH CONVICTION" (Scanner UI) | ✅ FIXED | "HIGH ALIGNMENT" |
| "Trade-Ready" (AI outputs) | ✅ FIXED | "CONDITIONS ALIGNED" |
| "No-Trade Zone" (AI outputs) | ✅ FIXED | "CONDITIONS NOT MET" |
| "Extreme Fear (Buy Opportunity)" (AlertsWidget UI) | ✅ FIXED | Removed from AlertsWidget |
| General Advice Warning missing | ✅ FIXED | GAW on all tool pages |
| No AFSL disclaimer | ✅ FIXED | Footer, disclaimer page, terms, tools layout |
| Data delay disclosure missing | ✅ FIXED | Disclaimer page: "Data Delays & Third-Party Sources" section |
| Backtest disclaimers too weak | ✅ FIXED | Comprehensive hypothetical/educational disclaimer |
| AI disclaimer insufficient | ✅ FIXED | Strengthened AI/pattern matching disclaimers |
| Terms of Service gaps | ✅ FIXED | Sections 2A (Paper Trade/AFSL) and 2B (AI Content) added |
| Privacy Policy gaps | ✅ FIXED | Edge profile, adaptive personality, portfolio/journal, AI disclosures added |
| Risk Governor "permission" language | ✅ FIXED | "Simulated entries" / "risk metric" language |
| Edge profile directive language | ✅ FIXED | "Historical pattern" / past performance disclaimer |
| Scanner score disclaimer missing | ✅ FIXED | "Scores reflect indicator agreement" disclaimer added |

### Wording That Still Needs Change

| Current Wording | Location | Problem | Suggested Replacement |
|-----------------|----------|---------|----------------------|
| `🟢 BUY SIGNAL: ${scan.symbol}` | `app/api/alerts/signal-check/route.ts` ~L251 | Directive alert text | `🟢 Bullish Setup: ${scan.symbol}` |
| `🔴 SELL SIGNAL: ${scan.symbol}` | `app/api/alerts/signal-check/route.ts` ~L270 | Directive alert text | `🔴 Bearish Setup: ${scan.symbol}` |
| `🟢 BUY SIGNAL: ${strategy}` | `app/api/alerts/strategy-check/route.ts` ~L212 | Directive alert text | `🟢 Bullish Setup: ${strategy}` |
| `🔴 SELL SIGNAL: ${strategy}` | `app/api/alerts/strategy-check/route.ts` ~L219 | Directive alert text | `🔴 Bearish Setup: ${strategy}` |
| `contrarian BUY signal` | `app/api/alerts/smart-check/route.ts` ~L322 | Directive + buy language | `contrarian bullish setup` |
| `potential buying opportunity` | `components/FearGreedGauge.tsx` ~L71, ~L208 | Explicit buy recommendation | `potential oversold conditions` |
| `buying opportunity - smart money accumulates here` | `components/CustomFearGreedGauge.tsx` ~L244 | Buy recommendation + privileged insight | `oversold conditions — historically precedes reversals` |
| `contrarian long potential` | `components/DerivativesWidget.tsx` ~L112 | Directional suggestion | `elevated short positioning` |
| `PERMISSION: {verdict}` | `components/CryptoMorningDecisionCard.tsx` ~L205 | Authorization language | `STATUS: {verdict}` |
| `historically good buying opportunity` | `app/api/msp-analyst/route.ts` ~L774 | Buy recommendation in AI context | `historically oversold conditions` |
| `high-probability setups` | `components/Benefits.tsx` L6 | Unqualified probability claim | `technically aligned setups` |
| `high-probability trade windows` | `app/about/page.tsx` L52 | Unqualified probability claim | `technically aligned trade windows` |
| `institutional-grade tools` | `app/about/page.tsx` L22 | Overstates sophistication | `professional-level tools` |
| `institutional-grade analysis` | `app/pricing/page.tsx` L195 | Overstates sophistication | `professional-level analysis` |
| `institutional-grade precision` | `app/tools/time-scanner/page.tsx` L43 | Overstates sophistication | `professional-level precision` |
| `institutional-grade` | `components/DataComingSoon.tsx` L38 | Overstates sophistication | `professional-level` |
| `High Conviction` | `components/scanner/ScanTemplatesBar.tsx` ~L90 | Predictive language in template name | `High Alignment` |

---

## 7. Disclosure / Terms / Policy Assessment — Current State

### Disclosures Now In Place

| Disclosure | Status | Location |
|------------|--------|----------|
| **AFSL disclaimer** | ✅ PRESENT | Footer.tsx, disclaimer/page.tsx, ToolsLayoutClient.tsx (GAW banner), legal/terms/page.tsx |
| **General Advice Warning (GAW)** | ✅ PRESENT | ToolsLayoutClient.tsx — displayed on ALL tool pages |
| **Data delay disclosure** | ✅ PRESENT | disclaimer/page.tsx — "Data Delays & Third-Party Sources" section |
| **Paper trade system disclosure** | ✅ PRESENT | disclaimer/page.tsx — "Paper Trade & Simulation System" section |
| **Backtest disclaimers** | ✅ PRESENT | disclaimer/page.tsx (comprehensive) + tools/backtest/page.tsx (on-page disclaimer) |
| **AI disclaimer** | ✅ PRESENT | disclaimer/page.tsx, AI prompt mandatory footer on every response |
| **Score/alignment disclaimer** | ✅ PRESENT | disclaimer/page.tsx (paper trade section) + scanner page inline |
| **Past performance disclaimer** | ✅ PRESENT | EdgeInsightCards.tsx footer, disclaimer/page.tsx |
| **Terms of Service: Paper trade + AFSL** | ✅ PRESENT | Section 2A added |
| **Terms of Service: AI content** | ✅ PRESENT | Section 2B added |
| **Privacy Policy: Edge profile data** | ✅ PRESENT | Added disclosures for edge profile, adaptive personality, portfolio/journal, AI processing |
| **Cookie consent** | ✅ PRESENT | Granular GDPR consent mechanism |

### Remaining Disclosure Gaps

| Gap | Priority | Detail |
|-----|----------|--------|
| **No ABN displayed** | P0 | If MSP operates as a business in Australia, it must display its ABN on the website. This is a legal requirement under the ABN Act 1999. *Blocked on business registration.* |
| **No geographic restriction disclosure** | P2 | Should state which jurisdictions the platform is designed for and which it is not. |
| **No broker risk disclosure** | P1 (pre-launch) | Before any broker feature launches: "Broker integration is a convenience feature only. MSP does not execute trades, hold funds, or take responsibility for order execution." |
| **Backtest: survivorship bias language** | P2 | Disclaimer page covers backtests comprehensively but the on-page backtest disclaimer could mention survivorship bias specifically. |
| **Class action waiver enforceability** | P2 | Class action waiver in Terms may not be enforceable under Australian Consumer Law — needs review by Australian counsel. |
| **Data breach notification procedure** | P2 | Not described in privacy policy. Should be added if handling significant personal data. |

---

## 8. Product Safeguards — Current State

### Safeguards Now In Place

| Safeguard | Status | Implementation |
|-----------|--------|----------------|
| **General Advice Warning on all tool pages** | ✅ LIVE | `ToolsLayoutClient.tsx` — amber alert banner with ASIC-compliant language |
| **No-AFSL disclaimer in footer** | ✅ LIVE | `Footer.tsx` — visible on every page |
| **No-AFSL disclaimer in Terms** | ✅ LIVE | `legal/terms/page.tsx` Section 2A |
| **Paper trade framing** | ✅ LIVE | Consistent across scanner, Golden Egg, portfolio, journal, options |
| **Educational mode labeling** | ✅ LIVE | Backtest, options scanner, scanner pages |
| **AI output disclaimers** | ✅ LIVE | Mandatory footer on every AI response |
| **Past performance disclaimers** | ✅ LIVE | Edge profile insights, disclaimer page |
| **Score/alignment disclaimers** | ✅ LIVE | Scanner page, disclaimer page |
| **Data delay disclosure** | ✅ LIVE | Disclaimer page |
| **Non-directive labels** | ✅ LIVE | ALIGNED/NOT ALIGNED, Bullish/Bearish Setup, Confluence (not Confidence) |

### Safeguards Still Needed

| Safeguard | Priority | Detail |
|-----------|----------|--------|
| **Fix alert API route text** | P0 | `signal-check`, `strategy-check`, `smart-check` routes still generate BUY/SELL SIGNAL text |
| **Fix Fear & Greed "buying opportunity"** | P0 | Three components still frame extreme fear as actionable buying opportunity |
| **Fix CryptoMorningDecisionCard "PERMISSION"** | P1 | Change to "STATUS" or "TRADING STATUS" |
| **Add ABN to website** | P0 | Blocked on registration |
| **External AFSL legal opinion** | P0 (pre-broker) | Required before any broker integration launches |
| **Geography gating** | P1 (pre-broker) | Block broker features in jurisdictions without regulatory clearance |
| **Content moderation for AI outputs** | P2 | Filter AI responses to remove explicit buy/sell language (prompts already do this — verify enforcement) |
| **Compliance review checklist** | P2 | Internal checklist for new feature launches |

---

## 9. Launch Guidance — Updated

### Safe to Keep Live Now (No Changes Needed)

- ✅ All intraday charts, sector/crypto heatmaps, market overview
- ✅ Watchlists, portfolio tracker (paper trade), trade journal
- ✅ Economic, earnings, and ex-dividend calendars
- ✅ Blog, educational articles, guides
- ✅ About, contact, legal pages
- ✅ Backtest engine (comprehensive disclaimers in place)
- ✅ Commodities dashboard, market movers, news/sentiment feeds
- ✅ Scanner (with current compliant labels and disclaimers)
- ✅ Golden Egg (with current compliant labels and disclaimers)
- ✅ AI Analyst (with current prompt guardrails and disclaimers)
- ✅ Options scanner (educational mode, simulated workflow disclosure)
- ✅ Time scanner / confluence tools

### Needs Specific Fixes Before Considered Fully Compliant

| Feature | Required Fix | Priority |
|---------|-------------|----------|
| **Alert API routes** | Replace BUY/SELL SIGNAL text in 3 route files | P0 |
| **FearGreedGauge** | Remove "buying opportunity" language | P0 |
| **CustomFearGreedGauge** | Remove "buying opportunity" + "smart money" language | P0 |
| **DerivativesWidget** | Remove "contrarian long potential" | P1 |
| **CryptoMorningDecisionCard** | Change "PERMISSION" label | P1 |
| **MSP Analyst route** | Fix Fear & Greed context text | P1 |
| **Benefits component** | "high-probability" → "technically aligned" | P1 |
| **About page** | "institutional-grade" → "professional-level", "high-probability" → "technically aligned" | P1 |
| **Pricing FAQ** | "institutional-grade" → "professional-level" | P1 |
| **Time scanner page** | "institutional-grade" → "professional-level" | P1 |
| **DataComingSoon** | "institutional-grade" → "professional-level" | P2 |
| **ScanTemplatesBar** | "High Conviction" template → "High Alignment" | P2 |

### Do Not Launch Without Specialist Australian Legal Review

| Feature | Why | Status |
|---------|-----|--------|
| **Direct broker order submission** | Likely constitutes "arranging" under s.766C | NOT BUILT |
| **Pre-filled trade tickets connected to broker execution** | Complete advice-to-execution pipeline | DESIGNED ONLY |
| **Account-linked position sizing from broker balances** | Considers user's financial situation = personal advice | DESIGNED ONLY |
| **Push notifications with trade directives + execution links** | Active solicitation | NOT BUILT |
| **Automated trade filtering by edge profile** | Algorithmically generated personal advice | NOT BUILT |

---

## 10. Priority Fixes — Status

### P0 — Urgent — ✅ ALL COMPLETE

| # | Fix | Files Affected | Status |
|---|-----|----------------|--------|
| 1 | **Replace BUY/SELL SIGNAL in alert API routes** | `signal-check`, `strategy-check`, `smart-check` | ✅ DONE (d619919a) |
| 2 | **Remove "buying opportunity" from Fear & Greed** | `FearGreedGauge.tsx`, `CustomFearGreedGauge.tsx` | ✅ DONE |
| 3 | **Add ABN to website** | `components/Footer.tsx`, legal pages | ⏳ BLOCKED (pending registration) |

### P1 — Should Change Soon — ✅ ALL COMPLETE

| # | Fix | Status |
|---|-----|--------|
| 4 | Remove "contrarian long potential" from DerivativesWidget | ✅ DONE |
| 5 | Change "PERMISSION" → "CONDITION" in CryptoMorningDecisionCard | ✅ DONE (d619919a) |
| 6 | Fix Fear & Greed context text in MSP Analyst route | ✅ DONE |
| 7 | Replace "high-probability" in Benefits.tsx, about/page.tsx, blog, reviews | ✅ DONE (d619919a) |
| 8 | Replace "institutional-grade" in about, pricing, time-scanner, DataComingSoon | ✅ DONE |
| 9 | Rename "High Conviction" scan template to "High Alignment" | ✅ DONE |

### P2 — Later / Pre-Launch

| # | Fix | Status |
|---|-----|--------|
| 10 | Engage Australian financial services lawyer for AFSL assessment | ⏳ BUSINESS ACTION |
| 11 | Implement geography-aware feature gating for broker features | ⏳ FUTURE |
| 12 | Create internal compliance review checklist for new features | ⏳ BUSINESS ACTION |
| 13 | Review class action waiver enforceability under Australian Consumer Law | ⏳ LEGAL REVIEW |
| 14 | Add data breach notification procedure to privacy policy | ⏳ FUTURE |
| 15 | Consider ABN/ACN registration | ⏳ BUSINESS ACTION |
| 16 | Review media exemption (s.911A(2)(a)) applicability | ⏳ LEGAL REVIEW |
| 17 | Consider authorized representative arrangement for broker execution | ⏳ LEGAL REVIEW |

---

## 11. Completed P0/P1 Items — Audit Trail

These items from the original March 18 review have been verified as complete:

| Original # | Fix | Commit | Verified |
|-------------|-----|--------|----------|
| P0-1 | Remove "BUY signal" / "SELL signal" from AlertsWidget UI | ee31dd00 | ✅ "Bullish Setup" / "Bearish Setup" |
| P0-2 | Remove "Buy Opportunity" from AlertsWidget UI | ee31dd00 | ✅ Removed |
| P0-3 | Replace "TRADE_READY"/"NO_TRADE" display labels | ee31dd00 | ✅ "ALIGNED" / "PATTERN MISMATCH" |
| P0-4 | Rename "recommendation" property | ee31dd00 | ✅ "assessment" |
| P0-5 | Remove "Consider reducing size or skipping" | ee31dd00 | ✅ Removed |
| P0-6 | Add General Advice Warning to all tool pages | ee31dd00 | ✅ ToolsLayoutClient.tsx GAW banner |
| P0-8 | Add explicit "no AFSL" disclaimer | ee31dd00 | ✅ Footer, disclaimer, terms, tools |
| P0-10 | Replace "Confidence" with "Confluence" | 79246cf2 | ✅ Golden Egg uses "Confluence" |
| P1-11 | Replace "See The Market Before It Moves" | ee31dd00 | ✅ "See The Market With Clarity" |
| P1-13 | Replace "Serious tools. Serious edge." | ee31dd00 | ✅ "Advanced tools for serious traders." |
| P1-14 | Add data delay disclosure | 79246cf2 | ✅ Disclaimer page "Data Delays" section |
| P1-15 | Strengthen backtest disclaimers | 79246cf2 | ✅ Comprehensive disclaimer on page + disclaimer page |
| P1-16 | Strengthen AI output disclaimers | ee31dd00 | ✅ AI prompts updated |
| P1-17 | Update Terms of Service | 79246cf2 | ✅ Sections 2A, 2B added |
| P1-18 | Update Privacy Policy | 79246cf2 | ✅ Edge profile, AI, portfolio disclosures |
| P1-19 | Add past performance disclaimer to edge profile | 79246cf2 | ✅ EdgeInsightCards footer |
| P1-20 | Add score disclaimer to scanner | 79246cf2 | ✅ Inline disclaimer added |
| P1-21 | Reframe Risk Governor | 79246cf2 | ✅ "Simulated entries" / "risk metric" |

---

## 12. Final Verdict — Post-Remediation

### Where Does MSP Currently Stand Legally?

MSP has moved from a **MEDIUM-HIGH risk** position to **LOW risk** through systematic compliance remediation across 27+ files and 90+ individual text replacements. The platform now presents fully as an **educational paper trade simulation system** with appropriate disclaimers, non-directive labeling, and regulatory disclosures.

**All code-level compliance items are now complete:**
- Every tool page carries a General Advice Warning (GAW)
- The no-AFSL disclaimer appears in footer, disclaimer page, terms of service, and tools layout
- "TRADE_READY"/"NO_TRADE" replaced with "ALIGNED"/"NOT ALIGNED" throughout all UI
- "Confidence" replaced with "Confluence" in Golden Egg — reduced prediction framing
- "BUY/SELL signal" replaced with "Bullish/Bearish Setup" in AlertsWidget
- Alert API routes: All directive language replaced with observational framing ("DIRECTION CHANGE", "SIGNAL")
- Fear & Greed: "buying opportunity"/"consider taking profits" → "oversold conditions"/"historically precedes pullbacks"
- CryptoMorningDecisionCard: "PERMISSION" → "CONDITION", verdict values "YES"/"NO DEPLOYMENT" → "ALIGNED"/"NOT ALIGNED"
- All "high-probability" → "technically aligned" across blog, reviews, marketing, partners
- All "institutional-grade" → "professional-level" across about, pricing, time-scanner
- Backtest: "Deploy live" → "Evaluation complete", "Best/Worst Trade" → "Largest Gain/Loss"
- Portfolio/Journal: "Stop Loss" → "Risk Level", "Entry Price" → "Reference Price"
- Options confluence: "BUY/SELL" → "LONG/SHORT", "Trade Summary" → "Analysis Summary"
- Correlation regime engine: All directive recommendations → observational tone
- Paper trade framing is consistent across scanner, Golden Egg, portfolio, journal, options
- AI prompts explicitly require educational disclaimer on every response
- Terms of Service and Privacy Policy updated with Paper Trade, AI content, and AFSL disclosures
- Disclaimer page is comprehensive: AFSL, data delays, paper trade system, backtest limitations, AI accuracy

**The only remaining gaps are non-code items:**
- ABN not yet displayed (pending business registration)
- Specialist legal counsel not yet engaged for AFSL/s.766B(3) assessment

### What Is the Biggest Legal Risk Now?

**The structural personalization risk.** All explicit directive language has been removed. The remaining theoretical risk is the substance test under s.766B(3) of the Corporations Act — the platform still analyses individual user behaviour (edge profile + adaptive personality) and presents tailored outputs. The educational/paper trade framing provides a strong defensive position, but specialist legal counsel should assess whether the personalization layer crosses the line into personal advice under the substance test.

### Platform Classification — Current

| Classification | Status |
|---------------|--------|
| Data platform | **Yes** — Charts, heatmaps, calendars, data feeds |
| Analytics platform | **Yes** — Scanner scoring, confluence analysis, technical indicators |
| Educational simulation platform | **Yes** — Paper trade framing, simulation mode, educational disclaimers |
| Decision-support tool | **Yes, but well-disclaimed** — Golden Egg scenario plans, AI educational analysis |
| Advice-like system | **Minimal** — Personalization exists but uses analytical not advisory framing. All directive language removed. |
| Execution facilitator | **Not live** — No broker connectivity deployed |

**Current:** Educational analytics platform with comprehensive regulatory disclosures. All code-level compliance remediation complete.
**Remaining work:** Business actions only — ABN registration, specialist legal counsel engagement

### Recommended Next Steps

1. **Business (P0 pre-broker):** Engage specialist Australian financial services lawyer before any broker integration
2. **Business (P0):** Register ABN and display on website
3. **Ongoing:** Re-run this compliance review whenever significant new features are added
4. **Ongoing:** Ensure any new UI text, alert messages, or marketing copy follows the established compliance patterns (observational, not directive)

---

## Appendix A: Data Licensing Assessment

### Current Position

| Source | Licence | Display Rules | Status |
|--------|---------|---------------|--------|
| **Alpha Vantage** | Premium commercial (600 RPM) | Can display to paid users. Cannot resell raw feeds. | ✅ Compliant |
| **CoinGecko** | Commercial licence | Can display with attribution. Subject to rate limits. | ✅ Compliant |
| **Nasdaq** | Licensed market data (via Alpha Vantage) | Display vs. non-display rules apply. Data redistribution restricted. | ⚠️ Verify — MSP displays derived calculations (scores, signals) from Nasdaq-sourced data. Need to confirm this is "derived data" not "redistribution" under Nasdaq's Data Agreement. |

### Data Disclosure Status

| Disclosure | Status |
|------------|--------|
| Data source freshness/latency statement | ✅ PRESENT — Disclaimer page "Data Delays & Third-Party Sources" section |
| Derived calculations disclaimer | ✅ PRESENT — "Scores, alignment readings, confluence percentages... reflect indicator agreement and technical pattern recognition — they do not represent profit probability" |
| "Real-time" qualification | ✅ PRESENT — "Real-time data availability varies by provider and plan" |

---

## Appendix B: Cross-Jurisdiction Risk

### US Market Exposure

MSP serves primarily US-market data and users trading US equities. This creates exposure to:
- **SEC considerations:** If MSP is deemed to provide investment advice to US persons, it may need to register as an investment adviser under the Investment Advisers Act of 1940, or qualify for an exemption.
- **FINRA considerations:** If broker execution is added and MSP routes orders for US securities, it may need to register as a broker-dealer or rely on the foreign broker-dealer exemption (Rule 15a-6).
- **Current risk:** LOW (no US users specifically targeted, no US entity). But if user base grows to include significant US users, this should be reassessed.

### Crypto Regulatory Differences

Crypto regulation differs significantly from equities:
- **Australia:** ASIC treats crypto as a financial product in certain contexts (crypto derivatives are financial products; spot crypto is not yet clearly regulated under the Corporations Act, though ASIC has proposed reforms).
- **US:** SEC vs. CFTC jurisdiction disputes. Some tokens are "securities" (Howey test). Providing crypto trading signals may be investment advice under US law.
- **Recommendation:** Consider separate disclaimers for crypto tools vs. equity tools.

### Geographic Restrictions

Consider:
- Adding a "this product is not available in [jurisdictions]" clause
- Blocking features for users in heavily regulated jurisdictions (EU MiFID II, UK FCA) where unlicensed advice is prohibited
- Region-specific disclaimers for EU users (MiFID II risk warnings), UK users (FCA risk warnings)

---

## Appendix C: ASIC Decision Framework

### Practical Questions for Each Feature

For every MSP feature, answer these three questions:

1. **Could a reasonable person view this as a recommendation about whether to trade a financial product?**
   - If YES → it's likely financial product advice → needs AFSL or exemption

2. **Does this feature consider the user's personal circumstances (account size, risk tolerance, past performance, portfolio composition)?**
   - If YES → it's likely personal advice → needs AFSL + Statement of Advice

3. **Does this feature facilitate the user dealing in a financial product (buying, selling, or arranging)?**
   - If YES → it's likely dealing → needs AFSL with dealing authorization

Apply this framework before launching any new feature.

---

*This document is an internal compliance assessment and does not constitute legal advice. Engage qualified Australian financial services legal counsel for binding opinions on AFSL requirements, Corporations Act compliance, and feature-specific regulatory assessment.*
