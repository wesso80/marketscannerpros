# MSP Full Legal / Compliance Review

**Date:** March 18, 2026
**Scope:** Full product + website + workflow + planned features legal risk audit
**Jurisdiction:** Australia — New South Wales — ASIC / Corporations Act 2001
**Standard:** Substance over labels. Disclaimers alone do not resolve advisory conduct.
**Status:** Independent internal compliance assessment (not legal advice — engage specialist counsel for binding opinions)

---

## 1. Executive Verdict

| Dimension | Rating | Detail |
|-----------|--------|--------|
| **Overall Legal Risk** | **MEDIUM-HIGH** | The platform has grown from a data display tool into a decision-making engine. Several features now have the substance of financial product advice, regardless of disclaimers. |
| **Current Website Risk** | **MEDIUM** | Marketing copy is mostly compliant but contains specific claims ("See The Market Before It Moves", "high-probability setups", "institutional-grade") that overstate capability. Data delay disclosures missing. |
| **Current Product Workflow Risk** | **HIGH** | The Scanner → Golden Egg → Trade Ticket → Execute pipeline, combined with personalized edge profiles, adaptive personality matching, and TRADE_READY verdicts, has the substance of personal financial product advice. |
| **Biggest Concern Right Now** | **Personalized advisory outputs** | The combination of Edge Profile (`lib/intelligence/edgeProfile.ts`) + Adaptive Personality Card (`components/AdaptivePersonalityCard.tsx`) + TRADE_READY/NO_TRADE recommendations constitutes **personal financial product advice** under Corporations Act s.766B. This is the single biggest regulatory exposure. |
| **Can MSP honestly position itself as educational/informational?** | **Partially** | The scanner, charts, heatmaps, macro dashboard, and data tools are genuinely informational. But the decision engine (Golden Egg verdicts, AI trade plans, adaptive personality scoring, edge-aware filtering, auto-sized trade tickets) has crossed into advisory territory in substance if not in label. |

### Core Problem

The Corporations Act 2001 (Cth) defines "financial product advice" as a recommendation or statement of opinion that is **intended to, or could reasonably be regarded as being intended to, influence a person in making a decision about a financial product** (s.766B(1)). The test is objective — it doesn't matter what the provider calls it, it matters what a reasonable person would conclude.

Several MSP features would fail this test:
- "TRADE_READY" / "NO_TRADE" verdicts = recommendations about whether to trade
- "72% Adaptive Confidence" + "Fits your setup preference" = personalized opinion
- AI trade plans with specific entry/stop/target = opinion intended to influence a trading decision
- "BUY signal" / "SELL signal" alerts = explicit directional recommendations
- Edge profile filtering ("your strongest asset class is BTC") = tailored guidance

Disclaimers stating "not financial advice" do not override the substance of conduct. ASIC has repeatedly stated that **a disclaimer cannot turn advice into non-advice** (see ASIC Report 632, RG 244, and enforcement actions against finfluencers in 2023-2025).

---

## 2. What Looks Relatively Safe

These features are consistent with an educational/informational platform:

| Feature | Why It's Safer |
|---------|----------------|
| **Intraday Charts** | Pure data visualization — user draws own conclusions |
| **Sector Heatmap** | Market overview — no directional recommendation |
| **Crypto Heatmap** | Market overview visualization |
| **Market Movers** (data display only) | Showing what moved is factual reporting |
| **Macro Dashboard** (regime display only) | Displaying yield curves, VIX, commodities is market data |
| **Watchlists** | User-created lists — no platform opinion |
| **Portfolio Tracker** (manual entry) | Record-keeping tool |
| **Trade Journal** (manual journaling) | Self-reflection learning tool |
| **Backtest Engine** (historical results) | Historical analysis — with proper "past performance" disclaimers |
| **Economic/Earnings Calendars** | Factual event data |
| **Blog / Educational Articles** | Educational content with disclaimers |
| **Data Attribution** | Alpha Vantage and CoinGecko properly attributed |
| **Footer Disclaimer** | Present on all pages |
| **Terms of Service** | Well-structured with NSW governing law |
| **Privacy Policy** | GDPR + CCPA coverage adequate |
| **Cookie Policy** | Granular consent mechanism in place |

---

## 3. What Looks Risky

### 3A. Features That Drift Toward Financial Product Advice

| Feature | Risk | Specific Issue |
|---------|------|----------------|
| **Golden Egg "TRADE" / "NO TRADE" / "WATCH" verdicts** | HIGH | Binary permission language = recommendation on whether to acquire/dispose of a financial product |
| **TRADE_READY / CAUTION / NO_TRADE recommendation badges** | **CRITICAL** | Explicit advisory classification — "recommendation" is literally the property name in code |
| **Adaptive Personality Card ("72% Adaptive Confidence")** | **CRITICAL** | Personalized scoring of signal-to-user fit = personal financial product advice |
| **Edge Profile insights ("Consider reducing size or skipping")** | HIGH | Directive language tailored to individual's trading history |
| **AI Analyst trade plans with entry/stop/targets** | HIGH | Structured opinion on specific trade execution = advice |
| **Scanner "BUY signal" / "SELL signal" alerts** | **CRITICAL** | Explicit buy/sell recommendations via alert system |
| **"Fear & Greed below threshold (contrarian buy opportunity)"** | **CRITICAL** | Frames market condition as actionable buying opportunity |
| **"HIGH CONVICTION" trade readiness labels** | HIGH | Implies platform endorsement of trade quality |
| **AI sessions: "Lean INTO regimes with >60% win rate"** | HIGH | Prescriptive directive based on statistical claims |
| **Risk Governor blocking/allowing trades** | MEDIUM-HIGH | Automated gate that permits or denies trading = advisory conduct |

### 3B. Features That Drift Toward Personal Advice (vs General)

Under the Corporations Act, **personal advice** (s.766B(3)) means advice given to a person where the provider has considered, or should reasonably be expected to have considered, the person's objectives, financial situation, or needs.

| Feature | Risk | Why It Crosses from General → Personal |
|---------|------|----------------------------------------|
| **Edge Profile** | **CRITICAL** | Analyses the user's specific past trade outcomes and tailors recommendations to their individual performance patterns. This is the definition of considering "the person's... circumstances". |
| **Adaptive Personality Card** | **CRITICAL** | Scores how well a signal matches the user's individual trading personality, risk DNA, decision timing. This explicitly considers the person's behavioral profile. |
| **Account-linked position sizing** | HIGH | When broker balance feeds position sizing ("142 shares of AAPL based on your $50,000 account"), the platform is considering the person's financial situation. |
| **Portfolio heat governor** | MEDIUM-HIGH | "You cannot trade because your portfolio heat is 10.2%" considers the person's existing financial position. |
| **Edge-aware scanner nudging** | HIGH | If scanner results are filtered or weighted by user's edge profile, outputs are personalized advice. |

### 3C. Features That Drift Toward Arranging/Dealing

| Feature | Risk | Status |
|---------|------|--------|
| **Read-only broker sync** | LOW-MEDIUM | Displaying broker data is passive. Similar to portfolio trackers. |
| **Trade ticket (without execution)** | MEDIUM | Pre-filling trade parameters from signals is close to "arranging" if it leads directly to execution. |
| **"Save as Plan" (no broker action)** | LOW | Journaling intent without execution is safer. |
| **Paper mode** | LOW-MEDIUM | Simulation without real orders is educational. |
| **Direct order submission to broker** | **CRITICAL** | Submitting orders to a broker through MSP's system = "arranging" for dealing in financial products (s.766C). This likely requires an AFSL or authorized representative status. |
| **Pre-filled trade tickets from AI/scanner signals** | HIGH | The combination of: (a) platform generates trade idea, (b) pre-fills order form, (c) user clicks submit → this is a complete advice-to-execution pipeline, regardless of the disclaimer checkbox. |

### 3D. Misleading or Deceptive Conduct Risk

| Claim/Feature | Risk | Issue |
|---------------|------|-------|
| **"See The Market Before It Moves"** | MEDIUM | Implies predictive capability. Could be seen as misleading about the platform's actual ability. |
| **"high-probability setups"** | MEDIUM | "Probability" implies quantified accuracy that may not be validated. |
| **"institutional-grade scanning"** | MEDIUM | Marketing puffery but could be challenged — actual institutional platforms have different data feeds, latency, and compliance infrastructure. |
| **Win rate claims (55-65% base win rates for options signals)** | HIGH | Claiming specific win rates for signal types implies performance warranties. These appear in the TRADING_INTELLIGENCE_AUDIT.md and may reach users through AI outputs. |
| **"Serious tools. Serious edge."** (Pro Trader CTA) | MEDIUM-HIGH | "Serious edge" implies the platform provides a trading advantage — this is a performance claim. |
| **Backtest results displayed without adequate disclaimers** | MEDIUM | Backtests have survivorship bias, look-ahead bias, and transaction cost gaps. Current disclaimer ("past results do not predict future outcomes") is minimal. |
| **"Confidence: 76%"** | HIGH | Users will interpret this as "76% chance this trade will work" — this is a misleading performance representation if not carefully contextualized. |
| **AI-generated "win rate: 62.5% for AAPL"** | **CRITICAL** | Historical win rate presented as forward-looking predictive statistic for a specific asset = misleading performance claim. |

---

## 4. Advice Risk Review

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

### Where MSP Currently Sits

**Data Display (SAFE):** Charts, heatmaps, calendars, sector performance, crypto derivatives data, portfolio tracker, journal.

**General Commentary (SAFE):** Macro dashboard regime labels, blog articles, educational guides, market overview text.

**General Advice (RISKY WITHOUT AFSL):** Scanner confluence scores, Golden Egg trade plans (entry/stop/target for any user), AI analyst trade plans, backtest strategy results, time confluence decompression windows. These provide opinions intended to influence trading decisions, but are not personalized to any individual. Under the Corporations Act, general advice requires either an AFSL or to be covered by an exemption (e.g., media exemption under s.911A(2)(a) or factual information exemption).

**Personal Advice (REQUIRES AFSL):** Edge profile insights ("your strongest asset is BTC"), adaptive personality matching ("72% fit to your trading style"), account-linked position sizing, portfolio heat governor, "TRADE_READY" based on user's specific profile. These consider the person's individual circumstances and constitute personal financial product advice under s.766B(3).

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

### The Critical Question

**Could ASIC reasonably say MSP is providing digital financial product advice?**

**Yes.** The combination of:
1. Confluence scores with directional bias (bullish/bearish)
2. Trade plans with specific entry/stop/target prices
3. "TRADE_READY" / "NO_TRADE" permission verdicts
4. AI-generated analysis saying "Trade-Ready" or "No-Trade Zone"
5. Win rate statistics for specific signals
6. Edge profile personalization ("fits your style")

...constitutes financial product advice under s.766B. A reasonable person viewing the MSP interface would conclude the platform is telling them whether and how to trade. Disclaimers saying "not advice" do not change this conclusion under the substance-over-form test.

**Could ASIC reasonably say MSP is providing personal advice?**

**Yes, for Pro Trader tier features.** The edge profile, adaptive personality card, account-linked sizing, and portfolio governor all consider the user's individual circumstances. Under s.766B(3), this is personal advice.

---

## 5. Broker / Trade Ticket Risk Review

### Risk Assessment by Feature

| Feature | Risk Level | Assessment |
|---------|-----------|------------|
| **Read-only broker sync (positions, balances)** | LOW-MEDIUM | Displaying the user's own broker data is passive. Similar to Mint/Sharesight portfolio aggregators. The risk is low if MSP does not use this data to generate recommendations. **However**, if broker balance feeds into position sizing calculations that are presented alongside trade recommendations, the combined effect is personalized advice. |
| **Read-only broker sync (fills → journal)** | LOW | Auto-populating journal entries from fills is record-keeping. Safe. |
| **Trade ticket (display only, no broker)** | MEDIUM | Showing a structured trade plan (entry/stop/target/sizing) is general advice if generic, personal advice if sized to the user's account. The pre-fill from scanner/GE makes it advice-driven. |
| **"Save as Plan" (no execution)** | LOW-MEDIUM | Journaling a trade plan without executing is closer to educational. The concern is that the trade plan was generated by an advisory signal. |
| **Paper mode** | LOW-MEDIUM | Simulated trading is educational. However, paper mode combined with "TRADE_READY" signals is still advice about what to trade — it just doesn't execute the trade. |
| **Broker deep-link / handoff** | MEDIUM-HIGH | Sending the user to their broker's website with pre-populated trade parameters is "arranging" conduct. The user still executes at the broker, but MSP facilitated the arrangement. |
| **Direct "Submit Order" to broker** | **CRITICAL** | This is "arranging for a person to deal in a financial product" under s.766C. Combined with MSP generating the trade idea, this is a complete advice-to-execution pipeline. **Do not launch without external Australian financial services legal review.** |
| **Future autonomous suggestions** | **CRITICAL** | Any feature that automatically suggests trades without user initiation (e.g., push notifications saying "BTC setup detected, trade here") crosses from passive tools into active solicitation. |

### What Requires External Legal Review Before Launch

**MUST get specialist Australian financial services legal opinion before launching:**
1. Direct order submission to any broker (Phase 3)
2. Pre-filled trade tickets from scanner/GE/AI signals
3. Account-linked position sizing using broker balances
4. Any feature where MSP generates a trade idea AND facilitates its execution in one workflow

**Can likely proceed with appropriate safeguards:**
1. Read-only broker sync (display only, no advisory integration)
2. Save as Plan (journaling, no execution)
3. Paper/simulation mode (with disclaimers and no performance claims)

---

## 6. Copy / Wording Review

### Wording That Should Change

| Current Wording | Location | Problem | Suggested Replacement |
|-----------------|----------|---------|----------------------|
| "See The Market Before It Moves" | Homepage hero | Implies predictive capability | "Scan The Market With Clarity" or "Monitor Markets in Real Time" |
| "high-probability setups" | Homepage, pricing, blog | Implies quantified probability | "pattern-based setups" or "technically aligned setups" |
| "Serious tools. Serious edge." | Pricing page Pro Trader CTA | Performance claim | "Advanced tools for serious traders." |
| "Institutional-grade scanning" | Homepage, about | Overstates sophistication | "Professional-level scanning tools" |
| "BUY signal" / "SELL signal" | AlertsWidget.tsx | Explicit trade directive | "Bullish setup detected" / "Bearish setup detected" |
| "Extreme Fear (Buy Opportunity)" | AlertsWidget.tsx | Explicit buy recommendation | "Extreme Fear Zone" (remove "Buy Opportunity") |
| "TRADE_READY" | AdaptivePersonalityCard, AI outputs | Permission/recommendation language | "ALIGNED" or "CONDITIONS MET" |
| "NO_TRADE" | AdaptivePersonalityCard, AI outputs | Permission language | "CONDITIONS NOT MET" or "MISALIGNED" |
| "recommendation" (property name) | AdaptivePersonalityCard.tsx | Literally says "recommendation" | Rename to "assessment" or "status" |
| "72% ADAPTIVE CONFIDENCE" | AdaptivePersonalityCard | Implies predictive certainty | "72% PATTERN ALIGNMENT" |
| "Fits your setup preference" | AdaptivePersonalityCard | Personalized advisory | "Matches historical pattern" |
| "Consider reducing size or skipping" | edgeProfile.ts | Directive advisory language | "Historical performance below average in this category" |
| "Lean INTO regimes with >60% win rate" | AI prompt outputs | Prescriptive trading directive | Remove from AI outputs, or reframe as "Historical data shows higher win rates in these regimes" |
| "Win rate: 62.5%" (AI output for specific asset) | arcaV3Engine prompts | Forward-looking performance claim | "Historical hit rate: 62.5% (past performance does not indicate future results)" |
| "Confidence: 76%" | Golden Egg, scanner | Implies probability of success | "Alignment: 76%" or "Confluence: 76%" |
| "HIGH CONVICTION" | Scanner detail | Implies platform endorsement | "HIGH ALIGNMENT" or "STRONG CONFLUENCE" |
| "ready to find your edge?" | Homepage bottom CTA | "edge" implies trading advantage | "Ready to explore the markets?" |
| "surface high-probability setups" | Homepage ARCxA section | Probability + setup = advice | "identify technically aligned patterns" |

### AI System Prompt Language Changes Needed

The AI prompts contain verdict labels that map directly to trade recommendations:
- "Trade-Ready" → should be "Conditions Aligned"
- "No-Trade Zone" → should be "Conditions Not Aligned"
- "Watch for Confirmation" → acceptable (neutral)

The AI prompts should include stronger framing:
- "You are an educational analysis tool. You describe market conditions and technical patterns. You do not recommend trades."
- Remove all "should" language ("you should consider" → "traders sometimes consider")
- Remove "edge" in advisory context

---

## 7. Disclosure / Terms / Policy Gaps

### Missing or Weak Disclosures

| Gap | Priority | Detail |
|-----|----------|--------|
| **No ABN displayed** | P0 | If MSP operates as a business in Australia, it must display its ABN on the website. This is a legal requirement under the ABN Act 1999. |
| **No AFSL disclaimer** | P0 | Should explicitly state: "MarketScanner Pros does not hold an Australian Financial Services Licence (AFSL). We do not provide financial product advice within the meaning of the Corporations Act 2001." |
| **No data delay disclosure** | P1 | Users are told data is "real-time" but there is no disclosure of actual pipeline latency. Alpha Vantage premium provides real-time US equities during market hours, but CoinGecko has inherent API latency. Should state: "Market data may be subject to delays of up to [X] seconds/minutes." |
| **No General Advice Warning (GAW)** | P0 | If any feature constitutes general advice, the Corporations Act requires a General Advice Warning: "This information does not take into account your personal objectives, financial situation, or needs. You should consider whether this information is appropriate for you before acting on it." This should appear on every tool page, not just the footer. |
| **No "consider seeking independent advice" statement** | P1 | The standard Australian regulatory recommendation is: "Consider seeking independent financial advice before making any trading decisions." This appears on the pricing page FAQ but should be prominent on all tool pages. |
| **Backtest disclaimers too weak** | P1 | Current: "past results do not predict future outcomes." Should add: "Backtested performance is hypothetical and has inherent limitations including survivorship bias, hindsight bias, and the absence of trading costs, slippage, and market impact. Actual results may differ materially." |
| **AI disclaimer insufficient** | P1 | Current: "educational purposes only." Should add: "AI-generated analysis reflects mathematical pattern matching on historical data. AI outputs may contain errors, hallucinations, or outdated information. AI cannot predict future market movements." |
| **No broker risk disclosure** | P1 (pre-launch) | Before any broker feature launches: "Broker integration is a convenience feature only. MSP does not execute trades, hold funds, or take responsibility for order execution. Trading through any broker involves risk of loss." |
| **No geographic restriction disclosure** | P2 | Should state which jurisdictions the platform is designed for and which it is not. |
| **Win rate / performance claims need qualification** | P0 | Every instance of a win rate, accuracy percentage, or performance statistic must be accompanied by: "Based on historical data. Past performance does not indicate future results." |
| **Confidence/score disclaimer needed** | P1 | "Scores and alignment percentages reflect the degree of technical indicator agreement, not the probability of a profitable trade outcome." |

### Terms of Service Gaps

| Gap | Priority |
|-----|----------|
| No clause addressing AI-generated content liability | P1 |
| No clause addressing broker integration liability (for when it launches) | P1 |
| No clause addressing personalization/edge profile data usage | P1 |
| No explicit "not personal advice" clause (only says "not advice" generally) | P0 |
| Terms effective date (Dec 2025) — should be updated when features change materially | P1 |
| No clause about data accuracy limitations by source | P2 |
| Class action waiver may not be enforceable under Australian Consumer Law — should be reviewed by Australian counsel | P2 |

### Privacy Policy Gaps

| Gap | Priority |
|-----|----------|
| No mention of edge profile / personalization data collection | P1 |
| No mention of broker credential storage (for when it launches) | P1 |
| No mention of AI interaction content storage beyond "debugging" | P2 |
| No data breach notification procedure described | P2 |

---

## 8. Product Safeguards Needed

### Before Any Broker Feature Launches

| Safeguard | Priority | Detail |
|-----------|----------|--------|
| **External Australian financial services legal opinion** | P0 | Engage a law firm with ASIC/financial services expertise to review the broker integration design and advise on AFSL requirements |
| **AFSL assessment** | P0 | Determine whether MSP needs an AFSL, an authorized representative arrangement, or can rely on an exemption |
| **Kill switch for broker execution** | P0 | Already designed (`BROKER_WRITE_ENABLED=false`) — must default to OFF |
| **Full audit trail** | P0 | Already designed (`order_audit_log`) — must be immutable |
| **Geography gating** | P1 | Block broker features in jurisdictions where MSP has no regulatory clearance |
| **Tier gating** | P1 | Already designed (Pro Trader only) — appropriate |
| **Rate limiting** | P1 | Already designed (10/min) — appropriate |

### Before Personalization Features Continue to Expand

| Safeguard | Priority | Detail |
|-----------|----------|--------|
| **Reframe all personalization as "analytics" not "advice"** | P0 | Edge profile should describe historical patterns, not recommend future actions |
| **Remove all directive language from edge profile** | P0 | "Consider reducing size" → "Historical win rate below average" |
| **Add disclaimers to every personalized output** | P0 | "This reflects your past trading patterns. Past performance does not indicate future results." |
| **Rename "recommendation" property** | P0 | Property and UI text must not use "recommendation" |
| **Remove "TRADE_READY" / "NO_TRADE" labels** | P0 | Replace with non-advisory labels |

### General Platform Safeguards

| Safeguard | Priority | Detail |
|-----------|----------|--------|
| **Add General Advice Warning to all tool pages** | P0 | Standard Australian regulatory GAW |
| **Add ABN to website** | P0 | Legal requirement |
| **Compliance review checklist for new features** | P1 | Before any new feature launches, run through: "Does this feature recommend a trade? Does it consider the user's circumstances? Does it facilitate dealing?" |
| **Content moderation for AI outputs** | P1 | Filter AI responses to remove explicit buy/sell language |
| **Quarterly compliance review** | P2 | Re-review platform against ASIC guidance quarterly |

---

## 9. Launch Guidance

### Safe to Keep Live Now

- Intraday charts
- Sector / crypto heatmaps
- Market overview / macro dashboard (data display)
- Watchlists
- Portfolio tracker (manual entry)
- Trade journal (manual journaling)
- Economic / earnings calendars
- Blog / educational articles
- About, contact, legal pages
- Backtest engine (with strengthened disclaimers)
- Commodities dashboard
- Market movers (data display)
- News / sentiment feeds

### Safe With Wording Changes

| Feature | Required Changes |
|---------|-----------------|
| **Scanner** | Replace "BUY signal" / "SELL signal" → "Bullish setup" / "Bearish setup". Replace "HIGH CONVICTION" → "HIGH ALIGNMENT". Add GAW to page. |
| **Golden Egg** | Replace "TRADE" / "NO TRADE" → "CONDITIONS ALIGNED" / "CONDITIONS NOT ALIGNED". Replace "Confidence" → "Confluence" or "Alignment" throughout. Add GAW to page. Remove "permission" language (TRADE/WATCH/NO_TRADE as authorization). |
| **AI Analyst** | Update prompts to remove "Trade-Ready" → "Conditions Aligned". Add output filter for buy/sell directives. Strengthen disclaimer per response. Add GAW to page. |
| **Alerts** | Remove "Buy Opportunity" labels. Change "BUY signal" / "SELL signal" → "Bullish setup detected" / "Bearish setup detected". Remove "consider taking profits" language. |
| **Options Confluence** | Remove "High confidence prediction: 78%" → "High confluence alignment: 78%". Qualify all win rate mentions with "historical, past performance" language. |
| **Homepage** | "See The Market Before It Moves" → less predictive. "high-probability" → "technically aligned". "Serious edge" → "Serious tools". |
| **Pricing page** | Remove "Serious tools. Serious edge." Add prominance to "educational tool" classification. |

### Safe Only With Stronger Safeguards

| Feature | Required Safeguards |
|---------|---------------------|
| **Edge Profile** | Reframe from advice to analytics. Remove all directive language. Add "past performance" disclaimers to every insight. Do NOT use edge profile to filter or weight scanner results. |
| **Adaptive Personality Card** | Remove "TRADE_READY" / "NO_TRADE" labels. Remove "recommendation" property. Rename "Adaptive Confidence" → "Pattern Alignment". Add disclaimer: "Based on historical patterns only." |
| **Backtest Engine** | Add comprehensive backtest limitations disclaimer (survivorship bias, look-ahead bias, no transaction costs, no slippage, no market impact). Current disclaimer is too brief. |
| **Position Sizing** (when account-linked) | Must NOT be presented alongside a trade recommendation. If account-linked sizing appears on the same screen as "TRADE_READY" or a trade plan, it constitutes personal advice. Either separate the features or obtain AFSL coverage. |
| **Risk Governor** (blocking/allowing trades) | Reframe from "permission" to "risk metric display." Show the numbers, don't gate user actions with advisory labels. |

### Do Not Launch Without Specialist Australian Legal Review

| Feature | Why |
|---------|-----|
| **Direct broker order submission (Phase 3)** | Likely constitutes "arranging" under s.766C. May require AFSL or authorized representative arrangement. |
| **Pre-filled trade tickets from scanner/GE/AI signals connected to broker execution** | Complete advice-to-execution pipeline. Even with user confirmation, the chain from: (a) platform generates trade idea, (b) pre-fills order, (c) user clicks submit is likely regulated conduct. |
| **Account-linked position sizing with broker balances feeding trade tickets** | Considers user's financial situation = personal advice. Combined with execution = dealing. |
| **Any push notification that says "trade detected" or "setup ready" with a link to execute** | Active solicitation + execution link = regulated financial services. |
| **Scaling edge profile into automated trade filtering/weighting** | If scanner results are personalized based on user's edge profile, this is algorithmically generated personal advice. |

---

## 10. Priority Fixes

### P0 — Urgent (should change before next deployment)

| # | Fix | Files Affected |
|---|-----|----------------|
| 1 | **Remove "BUY signal" / "SELL signal" from alerts** | `components/AlertsWidget.tsx` (~L277, L282-283) |
| 2 | **Remove "Buy Opportunity" from Fear & Greed alerts** | `components/AlertsWidget.tsx` (~L277, L831) |
| 3 | **Replace "TRADE_READY" / "NO_TRADE" with non-advisory labels** | `components/AdaptivePersonalityCard.tsx`, AI prompts |
| 4 | **Rename "recommendation" property** | `components/AdaptivePersonalityCard.tsx` (~L28) |
| 5 | **Remove "Consider reducing size or skipping" from edge profile** | `lib/intelligence/edgeProfile.ts` (~L334) |
| 6 | **Add General Advice Warning to all tool pages** | All pages under `app/tools/` |
| 7 | **Add ABN to footer and legal pages** (once registered) | `components/Footer.tsx`, legal pages |
| 8 | **Add explicit "no AFSL" disclaimer** | `app/disclaimer/page.tsx`, `components/Footer.tsx` |
| 9 | **Qualify all win rate / accuracy claims with "historical, past performance" language** | AI prompts, options confluence analyzer, edge profile |
| 10 | **Replace "Confidence" labels with "Alignment" or "Confluence" everywhere** | Golden Egg, scanner, AI outputs, AdaptivePersonalityCard |

### P1 — Should Change Soon

| # | Fix |
|---|-----|
| 11 | Replace "See The Market Before It Moves" with less predictive headline |
| 12 | Replace "high-probability setups" with "technically aligned setups" across site |
| 13 | Replace "Serious tools. Serious edge." with "Advanced tools for serious traders." |
| 14 | Add data delay disclosure to disclaimer page and tool pages |
| 15 | Strengthen backtest disclaimers (add survivorship bias, no transaction costs, etc.) |
| 16 | Strengthen AI output disclaimers (add pattern matching, not prediction, may contain errors) |
| 17 | Update Terms of Service with AI content liability, personalization data, and broker clauses |
| 18 | Update Privacy Policy with edge profile data collection and broker credential storage |
| 19 | Add "past performance" disclaimer to every edge profile insight |
| 20 | Add "scores reflect indicator agreement, not profit probability" disclaimer to scanner |
| 21 | Reframe Risk Governor from "permission" language to "risk metric display" |
| 22 | Remove "institutional-grade" → "professional-level" in marketing copy |

### P2 — Later / Pre-Launch

| # | Fix |
|---|-----|
| 23 | Engage Australian financial services lawyer for AFSL assessment |
| 24 | Implement geography-aware feature gating for broker features |
| 25 | Create internal compliance review checklist for new features |
| 26 | Review class action waiver enforceability under Australian Consumer Law |
| 27 | Add data breach notification procedure to privacy policy |
| 28 | Consider filing for ABN/ACN if not already registered |
| 29 | Review whether media exemption (s.911A(2)(a)) could apply to general market commentary features |
| 30 | Consider authorized representative arrangement with an AFSL holder for broker execution features |

---

## 11. Final Verdict

### Where Does MSP Currently Stand Legally?

MSP sits at a **crossroads**. The platform's foundation (market data, charts, scanning, backtesting) is genuinely educational and informational. The data display and analysis tools would likely be accepted by ASIC as information services, not financial product advice.

However, several features have grown beyond informational tools into **advisory territory**:
- The Golden Egg framework doesn't just display data — it tells the user whether to trade
- The AI analyst doesn't just describe conditions — it issues trade plans with specific prices
- The edge profile doesn't just show statistics — it recommends what to trade based on the user's personal history
- The adaptive personality system doesn't just score alignment — it recommends "TRADE_READY" or "NO_TRADE"

Under the Corporations Act, the test is not what you call the conduct — it's what a reasonable person would conclude from the substance. A user looking at "TRADE_READY" + "72% Adaptive Confidence" + "Entry: $185.50, Stop: $182.00, Targets: $189/$193.50/$198" is receiving financial product advice, regardless of how many disclaimers surround it.

### What Is the Biggest Legal Risk?

**The personalized advisory pipeline:** Edge Profile → Adaptive Personality → TRADE_READY verdict → Pre-filled trade ticket → (future) broker execution.

This is a complete personal financial advice → dealing pipeline. Each component individually increases risk; together they create a regulated activity.

### What Should Change Immediately?

1. **Remove all buy/sell/trade-ready directive language** from alerts, adaptive card, and AI outputs
2. **Reframe "TRADE_READY"** → "CONDITIONS ALIGNED" or similar non-advisory label
3. **Remove "Buy Opportunity"** from Fear & Greed alerts entirely
4. **Add General Advice Warning** to every tool page
5. **Add explicit "no AFSL" disclaimer** to footer and disclaimer page
6. **Qualify all win rate / confidence claims** with "historical, past performance" language

### What Should Not Be Launched Yet?

1. **Direct broker order submission** — requires external AFSL legal assessment
2. **Pre-filled trade tickets connected to broker execution** — complete advice-to-execution pipeline
3. **Account-linked position sizing from broker balances** alongside trade recommendations
4. **Any push notifications with trade directives + execution links**

### Platform Classification

| Classification | Status |
|---------------|--------|
| Data platform | **Yes** — Charts, heatmaps, calendars, data feeds |
| Analytics platform | **Yes** — Scanner scoring, confluence analysis, technical indicators |
| Decision-support tool | **Yes, but problematic** — Golden Egg verdicts, AI trade plans, regime gating |
| Advice-like system | **Yes, in substance** — TRADE_READY verdicts, edge profile recommendations, adaptive personality matching |
| Execution facilitator | **Designed but not live** — Trade ticket and broker integration designed, broker stub exists |

**Current:** Analytics platform with advice-like features (requiring compliance remediation)
**Trending toward:** Decision-support + execution facilitator (requiring AFSL assessment before launch)

### The Smart Compliance Path

1. **Immediate:** Fix P0 language issues (remove directive language, add GAW, qualify performance claims)
2. **Short-term:** Reframe personalization from "advice" to "analytics" — show data, don't recommend
3. **Before broker launch:** Engage specialist Australian financial services lawyer. Get a formal AFSL assessment. Determine whether MSP needs an AFSL, can operate as an authorized representative of an AFSL holder, or can rely on an exemption
4. **Architecture decision:** Consider structuring broker integration as a separate legal entity with appropriate licensing, keeping the informational platform clean
5. **Ongoing:** Quarterly compliance review as features evolve

---

## Appendix A: Data Licensing Assessment

### Current Position

| Source | Licence | Display Rules | Status |
|--------|---------|---------------|--------|
| **Alpha Vantage** | Premium commercial ($49.99/mo) | Can display to paid users. Cannot resell raw feeds. | ✅ Compliant |
| **CoinGecko** | Commercial licence | Can display with attribution. Subject to rate limits. | ✅ Compliant |
| **Nasdaq** | Licensed market data (via Alpha Vantage) | Display vs. non-display rules apply. Data redistribution restricted. | ⚠️ Verify — MSP displays derived calculations (scores, signals) from Nasdaq-sourced data. Need to confirm this is "derived data" not "redistribution" under Nasdaq's Data Agreement. |

### Data Disclosure Gaps

- No user-facing statement about data source freshness/latency
- No disclosure that derived calculations (scores, signals) are MSP's interpretation, not guaranteed by data providers
- "Real-time" claimed on multiple pages without defining what "real-time" means (is it <1s? <15s? <60s?)

### Recommendation

Add to disclaimer page:
> "Market data is provided by Alpha Vantage and CoinGecko under commercial licence agreements. Data may be subject to delays. Derived metrics (scores, signals, confluence) are calculated by MarketScanner Pros and are not endorsed by, or guaranteed by, any data provider. Data accuracy is not guaranteed."

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
