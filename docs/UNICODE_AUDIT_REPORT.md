# Unicode Character Audit Report

**Generated:** 2026-07-17  
**Scope:** All `.tsx` and `.ts` files under `components/`, `app/`, and `src/`  
**Purpose:** Identify Unicode/special characters that could render as "?" or garbled symbols on misconfigured browsers/fonts

---

## Executive Summary

**~1,200+ Unicode character instances** found across the codebase in 8 categories. The vast majority are **safe** — modern browsers handle them correctly with standard fonts. However, there are some risk areas worth noting.

### Risk Assessment

| Risk Level | Category | Count | Verdict |
|---|---|---|---|
| 🟢 LOW | Box drawing in comments (`──`, `═══`) | 300+ | Comments only — never rendered |
| 🟢 LOW | Em/en dashes (`—`, `–`) | 400+ | Universal font support |
| 🟢 LOW | Arrows (`→`, `←`, `↑`, `↓`) | 200+ | Universal font support |
| 🟢 LOW | Bullets/dots (`•`, `·`) | 100+ | Universal font support |
| 🟡 MEDIUM | Colored emoji circles (`🔴🟢🟡🔵`) | 200+ | Requires emoji font — OK on all modern OS |
| 🟡 MEDIUM | Greek letters (`Δ`, `Θ`, `Γ`, `σ`, `β`, `ν`) | 35 | Standard in fonts, but verify on mobile |
| 🟡 MEDIUM | Math symbols (`×`, `±`, `≥`, `≤`, `∞`) | 92 | Standard in fonts |
| 🟢 LOW | Currency (`₿`) | 8 | Supported since ~2017 in all major fonts |

**Bottom line:** No high-risk Unicode issues. All characters used are well-supported in modern browsers. The codebase is clean.

---

## Category 1: Arrows & Dashes (400+ instances)

### Em Dash `—` (U+2014) — SAFE

Used as fallback/empty state values and in prose text. Universal font support.

| File | Line(s) | Context |
|---|---|---|
| `components/time/TimeScannerPage.tsx` | 532, 679, 784, 799, 836, 855, 914, 958, 988, 997, 1020, 1036, 1103 | Em dashes in section labels, time ranges, fallbacks |
| `components/time/CloseCalendar.tsx` | 64, 437, 484, 494 | Fallback values: `—` for missing data |
| `components/crypto-terminal/CryptoTerminalView.tsx` | 96, 98, 104, 105, 189, 518 | Fallback: `?? '—'` patterns |
| `components/scanner/ResearchCaseModal.tsx` | 35, 40, 115, 242, 290, 293, 318, 341 | Fallbacks and separator text |
| `components/home/CommandHub.tsx` | 80, 152, 207 | Prose descriptions |
| `components/BacktestHub.tsx` | 618 | Fallback value |
| `components/PerformanceMetrics.tsx` | 99-176, 232 | Extensive fallback values |
| `components/AlertsWidget.tsx` | 388, 390 | Fallback values |
| `components/DerivativesWidget.tsx` | 103-120 | Explanatory text |
| `components/DailyAIMarketFocus.tsx` | 50-52 | Placeholder values |
| `components/Hero.tsx` | 50 | Marketing text |
| `components/FlowTab.tsx` | 6, 41, 57 | Fallback values |
| `app/api/golden-egg/route.ts` | 91, 99, 104, 115, 273-354, 402, 441, 444, 487, 694, 708 | **API response narratives** |
| `app/blog/posts-data.ts` | 137, 240-343 | Blog content |
| `app/tools/portfolio/page.tsx` | 955, 2560 | UI fallbacks |
| `app/tools/signal-accuracy/page.tsx` | 170-291 | Fallback values |
| `app/operator/page.tsx` | 459, 1232, 1588-1916 | Dashboard fallbacks |
| `app/about/page.tsx` | 4-62 | Marketing content |
| `app/partners/page.tsx` | 47-820 | Marketing content |
| `app/pricing/page.tsx` | 177, 460 | Pricing descriptions |
| `app/contact/page.tsx` | 4 | Title text |
| `app/resources/page.tsx` | 29-61 | Content |
| `app/admin/usage-analytics/page.tsx` | 250, 258 | Dashboard labels |

### En Dash `–` (U+2013) — SAFE

| File | Line(s) | Context |
|---|---|---|
| `components/time/TimeScannerPage.tsx` | 600-602, 836, 860-990 | Time ranges (e.g., "9:30–10:00") |
| `components/crypto-terminal/CryptoTerminalView.tsx` | 463 | Time ranges |

### Arrow Characters — SAFE

| Char | Files | Usage |
|---|---|---|
| `→` (U+2192) | CommandHub, BacktestHub, AlertToast, AlertsWidget, DerivativesWidget, VERegimeTimeline, operator/page, guide/page, blog pages, admin pages, partners/page | Navigation arrows, "go to" indicators |
| `←` (U+2190) | VEDirectionalCompass L67, blog/[slug]/page L56/133, guide/open-interest/page L92 | Back navigation |
| `↑` (U+2191) | TimeScannerPage L652, MarketPressureWidget L125, AlertToast L86, FearGreedHistory L141, CapitalFlowCard L299 | Bullish/up indicators |
| `↓` (U+2193) | Same files as `↑` | Bearish/down indicators |
| `↗` (U+2197) | AlertsWidget L237 | Price rising |
| `↘` (U+2198) | AlertsWidget L238 | Price falling |
| `↔` (U+2194) | TimeScannerPage L797, MarketPressureWidget L125, GERegimeBar L41, macro/page L550/586, options-confluence L2944 | Neutral/range/correlation |

---

## Category 2: Bullets, Checkmarks & Warning Signs (300+ instances)

### Bullet `•` (U+2022) and Middle Dot `·` (U+00B7) — SAFE

Ubiquitous as list separators throughout the codebase. Too many to list individually.

**Key files:** TimeScannerPage, AlertsWidget, CapitalFlowCard, DerivativesWidget, portfolio/page, backtest/page, options-flow/page, liquidity-sweep/page, operator/page

### Check/Cross Marks — SAFE

| Char | Files | Usage |
|---|---|---|
| `✓` (U+2713) | Benefits L15, AlertsWidget L1411, partners/page L298-865, blog/posts-data L111-116, admin/page L579 | Checkmarks in feature lists |
| `✗`/`✕`/`✖` | ResearchCaseModal L269, OnboardingChecklist L80, TradeSuggestionCard L67, AdaptivePersonalityCard L146, CryptoTerminalView L119, DerivativesWidget L221/266, MSPCopilot L506, portfolio/page L1703-2563, admin/page L580 | Close buttons, "blocked" indicators, XRP icon |
| `✔` (U+2714) | TradeSuggestionCard L67 | Success indicator |

### Warning/Status Emoji — SAFE (requires emoji font)

| Char | Files | Usage |
|---|---|---|
| `⚠️` | VERegimeTimeline L20/172, ResearchCaseModal L364, AlertsWidget L247-1444, Footer L32, CryptoTerminalView L648, DerivativesWidget L103-138, MSPCopilot L221/226, TimeGravityMapWidget L286, portfolio/page, backtest/page, options-flow/page, blog/posts-data, guide/* | Warning indicators |
| `⚡` | TimeScannerPage L33, GERegimeBar L55, GEOptionsDetail L97/104, AlertsWidget L596-959, MSPCopilot L107-857, TimeGravityMapWidget L113-784, admin/page L597, backtest/page L1786, guide/open-interest L175 | Lightning/energy indicators |

---

## Category 3: Colored Emoji Circles (200+ instances)

Used extensively as status/signal indicators throughout the trading platform. **All require emoji font support** — available on all modern OS (Windows 10+, macOS 10.12+, iOS 10+, Android 7+).

### Pattern: Bullish/Bearish/Neutral Signal System

The codebase uses a consistent `🟢/🟡/🔴` traffic light pattern:

| Char | Meaning | Example Files |
|---|---|---|
| `🟢` | Bullish / Active / Safe / Buy | VESignalCard, CryptoTerminalView, AlertsWidget, DailyAIMarketFocus, CryptoMorningDecisionCard, DerivativesWidget, FearGreedGauge, TopMoversWidget, TimeConfluenceWidget, ProModeDashboard, CatalystTab, portfolio/page, crypto-dashboard/page, deep-analysis/page, options-confluence/page, scanner/backtest/page, market-movers/page, gainers-losers/page, API routes (alerts/*, msp-analyst, economic-indicators, crypto/liquidations) |
| `🔴` | Bearish / Alert / Danger / Sell | Same files as `🟢` — always paired |
| `🟡` | Neutral / Cautious / Conditional | Same files — three-state system |
| `🟠` | Fear / Near Level | FearGreedGauge L72, liquidity-sweep/page L56, msp-analyst/route L742 |
| `🔵` | Active / Arbitrum chain | CryptoTerminalView L127, TimeGravityMapWidget L339/380, NewPoolsWidget L23, time-scanner/page L172 |
| `⚪` | Inactive / Stable / Neutral | CryptoTerminalView L792, admin/page L705, options-confluence L1405/4412 |
| `⭐` | Star / Highlight | CryptoTimeConfluenceWidget L174, MSPCopilot L211, WatchlistWidget L54/514, ToolsNavBar L62, crypto-time-confluence/page L202-204, options-confluence L3515 |

### Files with Heaviest Emoji Usage

| File | Approx Count | Notes |
|---|---|---|
| `app/tools/options-confluence/page.tsx` | 30+ | Execution state, gamma regime, cross-asset flow, OI sentiment |
| `app/tools/deep-analysis/page.tsx` | 20+ | Risk tags, factor analysis, bullish/bearish indicators |
| `components/AlertsWidget.tsx` | 15+ | Signal types in dropdowns and labels |
| `app/tools/crypto-dashboard/page.tsx` | 12+ | Derivatives signals |
| `components/TimeGravityMapWidget.tsx` | 10+ | Debt/active/tagged states |
| `components/crypto-terminal/CryptoTerminalView.tsx` | 10+ | Chain icons, signal severity |
| `app/api/alerts/smart-check/route.ts` | 5+ | Alert messages |
| `app/api/alerts/signal-check/route.ts` | 4 | Buy/sell signal messages |
| `app/api/msp-analyst/route.ts` | 5 | Fear/greed context for AI |

---

## Category 4: Greek Letters (35 instances)

Used for options Greeks display. Standard Unicode — supported in all fonts.

| Char | Unicode | Files | Lines |
|---|---|---|---|
| `Δ` (Delta) | U+0394 | GEOptionsDetail L56/77, DerivativesMarketStrip L33, OptionsTerminalView L110/295/361/369/487/607/868, OptionsChainTable L76, ContractInspectorPanel L110, ChainNavigatorPanel L18, options-flow/page L329, trade-proposal/route L240, deep-analysis/page L1546/1584, equity-explorer/page L590, crypto-explorer/page L569, options-confluence/page L4450/4491, crypto/open-interest/route L119 | Options delta symbol |
| `Θ` (Theta) | U+0398 | GEOptionsDetail L62/83, OptionsTerminalView L362/368, OptionsChainTable L77, ContractInspectorPanel L111, deep-analysis/page L1554/1592, options-confluence/page L4452/4491 | Options theta symbol |
| `Γ` (Gamma) | U+0393 | OptionsTerminalView L362/368, options-confluence/page L4491 | Options gamma symbol |
| `σ` (sigma) | U+03C3 | CatalystDetailsDrawer L186 | Standard deviation |
| `β` (beta) | U+03B2 | company-overview/page L301 | Stock beta coefficient |
| `ν` (nu) | U+03BD | options-confluence/page L4491 | Vega notation |

---

## Category 5: Math Symbols (92 instances)

| Char | Unicode | Key Files | Usage |
|---|---|---|---|
| `×` (multiply) | U+00D7 | VEProjectionCard L67, CryptoTerminalView L676, CorrelationConfluenceCard L452, MarketPressureWidget L42, CapitalFlowCard L391, BacktestHub L277/287, GlobalSessionBar L41, TimeConfluenceWidget L655, ExplainButton L174, SessionPhaseStrip L93, time-scanner/page L111, scanner/backtest/page L503/509, scanner/bulk/route L1522-1534, journal/auto-log/route L373, trade-proposal/route L230/236, ai/accuracy/route L111 | Multiplier labels, close buttons, formulas |
| `±` (plus-minus) | U+00B1 | CorrelationConfluenceCard L402, RightRail L51, OptionsTab L182, useDecisionLens L118/120, options-terminal/* L332/633/635/236/89/92, deep-analysis/page L285-367, options-confluence/page L2068-4005, guide/open-interest L55 | Expected move ranges |
| `≥` (gte) | U+2265 | VESignalCard L36-70, BacktestHub L369, TimeConfluenceWidget L406-444, scanner/backtest/page L185/682-685, crypto-time-confluence/page L130-202, backtest/scanner/route L91 | Threshold conditions |
| `≤` (lte) | U+2264 | VESignalCard L36-70, scanner/backtest/page L186/682-685, correlation/route L122 | Threshold conditions |
| `≠` (neq) | U+2260 | blog/posts-data L82 | "Not equal" in blog text |
| `∞` (infinity) | U+221E | intelligence/EdgeInsightCards L89, tools/alerts/page L445 | Infinite profit factor, unlimited |

---

## Category 6: Decorative Shapes (62 instances)

| Char | Files | Usage |
|---|---|---|
| `▲`/`▼` | FlowTab L96, ScreenerTable L268, MarketPulseHero L235, SentimentWidget L208, operator/RiskManagerMode L59/91, time/TimeGravityMapSection L138-278, signal-accuracy/page L229-285, commodities/page L742, equity-explorer/page L195-846, intraday-charts/page L1093-1314, options-confluence/page L2569-4585, deep-analysis/page L852, dashboard/page L174, scanner/page L633 | Sort arrows, directional indicators, expand/collapse toggles |
| `●` | CryptoTerminalView L124, GlobalSessionBar L9-10, GEDecisionStrip L104/109, scanner/PriceChart L381, workspace/PortfolioV2 L480/528, dashboard/page L174, signal-accuracy/page L229 | Status dots, section markers |
| `○` | VESignalCard L130, OperatorCommandStrip L57/61, ProModeDashboard L473, scanner/PriceChart L381, market-movers/page L879 | Unchecked/awaiting state |
| `★` | reviews/Reviews L20, options-confluence/page L2743 | Star ratings, AI watching |
| `◐` | market-movers/page L879 | Half-circle conditional state |
| `■` | intraday-charts/page L1314 | Marker |

---

## Category 7: Currency Symbols (8 instances)

| Char | File | Line | Context |
|---|---|---|---|
| `₿` | CryptoTerminalView.tsx | 115 | `icon: '₿'` for Bitcoin |
| `₿` | DominanceWidget.tsx | 147 | `₿ BTC Dominance` in JSX |
| `₿` | MarketPulseHero.tsx | 145 | `<span>₿</span>` |
| `₿` | OpenInterestWidget.tsx | 363 | `₿ BTC` in JSX |
| `₿` | liquidity-sweep/page.tsx | 138 | `₿ Crypto` label |
| `₿` | deep-analysis/page.tsx | 825 | Asset type icon |
| `₿` | market-movers/page.tsx | 765, 818 | Asset class label |
| `💱` | deep-analysis/page.tsx | 825 | Forex asset type (emoji) |

No `€`, `£`, or `¥` found in the codebase.

---

## Category 8: Box Drawing (300+ instances) — ALL IN COMMENTS

**Zero risk.** All box drawing characters are used exclusively in code comments as section dividers:

```
// ── Helpers ──
/* ─── Types ─── */
{/* ═══ SCAN OUTPUT: Direction + Price Target ═══ */}
/* ──────────────────────────────────── */
```

**Key files:** CloseCalendar.tsx, TimeScannerPage.tsx, MarketPressureWidget.tsx, ResearchCaseModal.tsx, CommandHub.tsx, CryptoTerminalView.tsx, DistributionChart.tsx, ScreenerTable.tsx, VEDirectionalCompass.tsx, VERegimeTimeline.tsx, golden-egg/route.ts, usage-analytics/page.tsx, and many more.

**None render to the browser.**

---

## Recommendations

### No Action Required

1. **Em/en dashes, arrows, bullets** — All part of Unicode BMP (Basic Multilingual Plane), supported by every font since the 1990s. No browser will show `?` for these.

2. **Box drawing in comments** — Never rendered. Purely developer aesthetics.

3. **Greek letters** — Part of the Latin Extended/Greek Unicode blocks. Supported universally. Perfect for options Greeks display.

4. **Math symbols** (`×`, `±`, `≥`, `≤`, `∞`) — BMP characters with universal support.

5. **`₿` Bitcoin symbol** — Added to Unicode in 2017 (U+20BF). Supported in all modern fonts.

### Monitor (Low Risk)

6. **Colored emoji circles** (`🔴🟢🟡🔵🟠`) — These are emoji (non-BMP, supplementary plane). They require emoji font support which is available on:
   - Windows 10+ ✅
   - macOS 10.12+ ✅  
   - iOS 10+ ✅
   - Android 7+ ✅
   - **Older systems or stripped-down Linux without emoji fonts could show `?` or boxes**
   
   If supporting older/embedded browsers is a concern, consider using CSS-styled colored circles (`<span style="color:red">●</span>`) instead of emoji — but this is extremely unlikely to be an issue for your target audience (traders using modern devices).

### Summary

**The codebase has no Unicode rendering issues for any modern browser.** All characters used are well-established in Unicode and supported by standard system fonts. The colored emoji (🔴🟢🟡 etc.) are the only characters that theoretically could fail on extremely old or unusual systems, but this is not a practical concern.
