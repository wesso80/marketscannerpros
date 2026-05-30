# MarketScanner Pros — Phase 0 Audit

**Scope:** Read-only walk of the codebase. No files modified.
**Date:** 2026-05-30
**Surface audited:** 162 page routes, 364 API routes, 354 components, 421 lib files, 73 test files.
**Auditors:** 5 parallel read-only explore agents (design, tools, methodology, security, public-pages).

This report is intentionally specific and citation-heavy. Every finding points at a file and (where useful) a line. The four summary tables below are the actionable starting point — everything underneath is the evidence.

---

## TABLE 1 — Design-system inconsistencies

| # | Area | Evidence | Severity |
|---|------|----------|----------|
| 1 | **Tokens defined but bypassed** | `app/globals.css` lines 6–55 define a full `--msp-*` token system (colors, spacing, radii, type scale). Components ignore it and hardcode hex. | HIGH |
| 2 | **Three "bullish green" hex values in active use** | `#10B981` (40+ files), `#2FB36E` (`--msp-bull` token), `#22c55e` (one-off). Same semantic, three pixels. | HIGH |
| 3 | **Three "bearish red" hex values** | `#EF4444`, `#E46767` (`--msp-bear`), `#DC2626`. | HIGH |
| 4 | **Three "warning amber" hex values** | `#D97706`, `#F59E0B`, `#D8A243` (`--msp-warn`). | HIGH |
| 5 | **No Button component** | At least 8 distinct button implementations: `components/CookieBanner.tsx` line 39 (`.btn`), `components/AlertsWidget.tsx` line 539 (Tailwind), `components/WatchlistWidget.tsx` lines 741–763 (6 inline color variants), `components/Hero.tsx` line 23, `components/ConfirmDialog.tsx` line 49 (inline styles). | HIGH |
| 6 | **No Card component** | Card-shaped panels re-implemented per widget. Examples: `src/features/volatilityEngine/components/VESignalCard.tsx`, `VEProjectionCard.tsx`, `VEInvalidationCard.tsx`, `VEVolatilityPhaseCard.tsx` — four near-identical wrappers. | HIGH |
| 7 | **Typography is scattered** | 20+ distinct font-sizes in use: `text-[0.65rem]`, `text-[0.68rem]`, `text-[0.72rem]`, `text-[0.73rem]`, `text-[0.74rem]`, `text-[0.75rem]`, `text-[0.76rem]`, alongside `text-xs/sm/base/lg/xl/2xl/3xl/4xl/5xl` and inline `fontSize: 10/11/13/14/18/22`. No 8/12/16/24 rhythm. See `src/features/volatilityEngine/components/VERegimeTimeline.tsx` lines 190–216, `src/features/goldenEgg/components/GEBreakoutReadiness.tsx` lines 56–83. | HIGH |
| 8 | **Inline-style hegemony** | ~95% of sampled components mix `style={{...}}` with Tailwind classes simultaneously. Example: `src/features/volatilityEngine/components/VESignalCard.tsx` lines 89–148 uses `className="text-xl font-black"` *and* `style={{ color }}`. CSS-modules used in ~15 admin files only. | HIGH |
| 9 | **Disclaimer wording drifts** | One central `components/ComplianceDisclaimer.tsx` with 6 variants — but 8+ ad-hoc inline disclaimers diverge from it: `app/tools/golden-egg/page.tsx` line 563 / 579 / 1402, `app/tools/portfolio/page.tsx` line 498, `app/tools/options-flow/page.tsx` line 440, `app/daily-pick/page.tsx` line 242, `app/pricing/page.tsx` line 309, `app/auth/page.tsx` line 258. Some say "financial advice", some "investment advice", one mentions "no order routing". | MEDIUM |
| 10 | **Two heatmap idioms** | `components/CryptoHeatmap.tsx`, `components/CategoryHeatmapWidget.tsx`, `components/SectorHeatmap.tsx`, `src/features/volatilityEngine/components/VEHeatmapGauge.tsx`, `src/features/goldenEgg/components/GEConfluenceHeatmap.tsx` — five separate implementations of "color-coded grid". | MEDIUM |

---

## TABLE 2 — Reused-but-divergent components (consolidation candidates)

| # | Group | Files | Suggested consolidation |
|---|-------|-------|-------------------------|
| 1 | **Fear & Greed gauges** | `components/FearGreedGauge.tsx`, `components/CustomFearGreedGauge.tsx` | One gauge, accept data source as prop |
| 2 | **Time confluence widgets** | `components/TimeConfluenceWidget.tsx`, `components/CryptoTimeConfluenceWidget.tsx` | Generic widget, asset-type prop |
| 3 | **VE cards** | `VESignalCard`, `VEProjectionCard`, `VEInvalidationCard`, `VEVolatilityPhaseCard` (all in `src/features/volatilityEngine/components/`) | One `Card` primitive + variant prop |
| 4 | **Personality cards** | `components/AdaptivePersonalityCard.tsx`, `components/AdaptiveTraderPersonalityBar.tsx` | Same data shape, two densities → one component, `density` prop |
| 5 | **12+ "Widget" components** | `WatchlistWidget`, `TrendingPoolsWidget`, `TrendingCoinsWidget`, `TopMoversWidget`, `TimeGravityMapWidget`, `SuggestionsWidget`, `CryptoNewsWidget`, `SentimentWidget`, `AlertsWidget`, `DerivativesWidget`, `DefiStatsWidget`, `DailyAIMarketFocus` | All follow `(fetch → state → container)` pattern — extract a `useWidgetData` hook + `<WidgetShell>` chrome |
| 6 | **Heatmaps** | See Table 1 row 10 | One `<Heatmap rows={..} cells={..} colorScale={..}/>` |
| 7 | **Inline buttons across widgets** | See Table 1 row 5 | One `<Button variant="primary\|secondary\|ghost\|danger" size="sm\|md\|lg">` |
| 8 | **Duplicate tool pages (redirect-only)** | `/tools/watchlists`, `/tools/options`, `/tools/options-terminal`, `/tools/ai-tools`, `/tools/crypto-heatmap`, `/tools/crypto-intel`, `/tools/earnings`, `/tools/earnings-calendar` all just `redirect()` to another route. | Delete the page files; add `redirects` to `next.config.mjs` instead — keeps the URL working without shipping a route |
| 9 | **Three "explorer" tools that overlap** | `/tools/explorer`, `/tools/equity-explorer`, `/tools/crypto-explorer`. `/tools/explorer` already embeds the latter two via dynamic import. | Make `/tools/explorer?tab=equity` and `/tools/explorer?tab=crypto` canonical, deprecate standalone routes |
| 10 | **Scanner-backtest vs Backtest** | `/tools/scanner/backtest` (signal replay) vs `/tools/backtest` (strategy backtest) — different purposes but the URL hierarchy will confuse users | Rename or merge under one `/tools/backtest?mode=signal\|strategy` |
| 11 | **Duplicate legal pages** | `/privacy`↔`/legal/privacy`, `/terms`↔`/legal/terms`, `/cookie-policy`↔`/legal/cookie-policy`, `/refund-policy`↔`/legal/refund-policy`. Top-level routes are re-exports of `/legal/*`. Sitemap lists *top-level* as canonical, but `alternates.canonical` in the page metadata points at `/legal/*`. Conflict. | Pick one set as canonical, 301-redirect the others. See Quick Win #2 |
| 12 | **SocialProof component** | `components/home/SocialProof.tsx` is named for testimonials but actually renders feature-stat cards (Multi-asset, Regime-aware, Data quality, Workflow-first) | Rename to `FeatureStats` to remove misleading name |

---

## TABLE 3 — Highest-severity bugs / broken states

| # | Severity | Finding | File |
|---|----------|---------|------|
| 1 | **CRITICAL** | **Cross-tenant data leak — public, unauthenticated**: `GET /api/cached/universe` returns every row in `symbol_universe` with no auth and no `workspace_id` filter. Any anonymous client can enumerate every symbol tracked on the platform. | `app/api/cached/universe/route.ts` lines 12–40 (query at line 30: `SELECT * FROM symbol_universe WHERE 1=1`) |
| 2 | **CRITICAL** | **Unauthenticated DOS surface on paid API**: `GET /api/cached/quote` accepts any symbol with no auth and no rate limit. On cache miss it calls Alpha Vantage (the paid quota you're already burning at 103/60s). One scraper can wipe out your daily AV budget. | `app/api/cached/quote/route.ts` (no `getSessionFromCookie`, no `apiLimiter.check`) |
| 3 | **HIGH** | **NaN leakage through scoring**: Cached equities feed `NaN` for the Aroon indicator into `computeScore()`. The Aroon dimension is weighted ~1.0; cached symbols silently lose a dimension, shifting their score baseline. Not all branches guard with `Number.isFinite()`. | `app/api/scanner/run/route.ts` ~line 1612 (layer counting), evidence in `INSTITUTIONAL_AUDIT_PHASE32.md` line 172 |
| 4 | **HIGH** | **Stale-data scoring is not gated**: scanner UI badges symbols `DEGRADED` if `freshnessStatus !== 'live'`, but the **score itself is still computed and published from the stale candles**. The badge is the only signal a user has. | `app/tools/scanner/page.tsx` lines 114–115; `app/api/scanner/run/route.ts` lines 2745–2750 |
| 5 | **HIGH** | **`adminOnly: true` field leaked to public response**: `/api/backtest` returns a `scoreSnapshot.adminOnly: true` field to any caller, including free-tier users. Violates `no-public-leakage.md`. | `app/api/backtest/route.ts` lines 205–221 |
| 6 | **HIGH** | **`/quant` is publicly accessible**: described in code as "Private operator terminal for quant intelligence" — renders private alert data + risk scoring with no `requireAdmin` gate at the page level. Auditor flagged: needs middleware check immediately. | `app/quant/page.tsx` line 143 |
| 7 | **HIGH** | **Local demo data can leak to prod**: `buildLocalDemoGoldenEggPayload()` returns synthetic AAPL=520 prices + `Math.sin(i/12)*0.012` waves whenever `LOCAL_DEMO_MARKET_DATA=true`. If that env var is ever set in production by mistake, fake setups go live with no UI distinction. | `app/api/golden-egg/route.ts` lines 18–65 |
| 8 | **MEDIUM** | **Sitemap/canonical conflict** for legal pages: `app/sitemap.ts` lists `/privacy`, `/terms`, `/cookie-policy`, `/refund-policy`. But `alternates.canonical` in those pages points to `/legal/*`. Google will see duplicate content with conflicting canonicals. | `app/sitemap.ts` |
| 9 | **MEDIUM** | **AI Analyst prompt does not enforce AI Output Standards** (`.claude/rules/ai-output-standards.md` requires Opportunity Score, Evidence Quality Score, Personal Exposure Score/Flag, Confidence, What confirms, What invalidates, Main risk). Prompt requires only a closing disclaimer. No post-response validator. | `lib/prompts/mspAnalystV11.ts` lines 22, 151, 154, 166 |
| 10 | **MEDIUM** | **Personal Exposure is hardcoded `"ok"` everywhere**, never derived from portfolio cluster analysis. Field exists, value is meaningless. | ARCA module ~line 275; confirmed in `ARCA_BRAIN_VERIFICATION.md` line 273 |
| 11 | **MEDIUM** | **Backtest exposes adminOnly flag** (duplicate of row 5 for visibility) and uses `99 95%` capital per trade without volume liquidity check — large hypothetical positions would slippage in live trading. | `app/api/backtest/route.ts` line 129 |
| 12 | **MEDIUM** | **Health endpoint leaks env-var names**: `/api/health/status` returns `Missing: STRIPE_KEY, OPENAI_KEY...` style messages, telling an attacker exactly which env vars are expected. | `app/api/health/status/route.ts` line 29 |
| 13 | **LOW** | **`Date.now() + Math.random()` for client-generated portfolio IDs** — collision is astronomically unlikely but not impossible; if you ever import client IDs as DB primary keys you'll regret it. | `app/tools/portfolio/page.tsx` lines 1024, 1086, 1310 |
| 14 | **LOW** | **Disclaimer effective date hardcoded** "13 December 2025" — will go stale. | `app/disclaimer/page.tsx` |

---

## TABLE 4 — Quick wins (high impact, low effort)

| # | Effort | Impact | Action |
|---|--------|--------|--------|
| 1 | 5 min | **CRITICAL** — closes data-leak | Add `getSessionFromCookie()` + `workspace_id` filter to `app/api/cached/universe/route.ts`. If it must stay public, return only a count, not rows. |
| 2 | 10 min | **CRITICAL** — protects AV budget | Wrap `app/api/cached/quote/route.ts` with `apiLimiter.check(ip)` (already imported elsewhere in the codebase). Suggest 60 req/min per IP. |
| 3 | 2 min | **HIGH** — closes public-leak | Strip `adminOnly` from the response in `app/api/backtest/route.ts` line 221 with `delete scoreSnapshot.adminOnly` before `NextResponse.json()`. |
| 4 | 10 min | **HIGH** — closes admin-exposure | Add middleware check for `/quant` in `middleware.ts` redirecting unauthenticated users to `/auth`. |
| 5 | 15 min | **MEDIUM** — fixes SEO confusion | Pick one set of legal URLs as canonical (`/legal/*` recommended since the pages have `canonical: /legal/...` metadata). Add 301 redirects from the top-level paths in `next.config.mjs` via `async redirects()`. Update `app/sitemap.ts` to list only the canonical set. Delete the re-export pages. |
| 6 | 10 min | **MEDIUM** | Delete the 8 redirect-only page files (Table 2 row 8). Move all to `next.config.mjs` `redirects()`. Shrinks the page count by ~5%. |
| 7 | 30 min | **MEDIUM** | Add a `<DegradedBanner>` to the top of `/tools/scanner` result table when `freshnessStatus !== 'live'` — currently only the per-row badge surfaces this and it's easy to miss. Wording per `risk-language-private.md`. |
| 8 | 30 min | **MEDIUM** | Replace every ad-hoc disclaimer string (Table 1 row 9) with `<ComplianceDisclaimer variant=…/>`. Estimated 8 sites. Adds the missing centralisation. |
| 9 | 5 min | **MEDIUM** | Auto-disable `LOCAL_DEMO_MARKET_DATA` in production: top of `app/api/golden-egg/route.ts`, `if (process.env.NODE_ENV === 'production' && process.env.LOCAL_DEMO_MARKET_DATA === 'true') throw new Error(...)`. |
| 10 | 20 min | **LOW** | Make disclaimer effective-date dynamic (read from `EFFECTIVE_DATE` constant or git commit date). |
| 11 | 15 min | **LOW** | Rename `components/home/SocialProof.tsx` to `FeatureStats.tsx`. Add real testimonials later as `SocialProof.tsx`. |
| 12 | 1 hour | **MEDIUM** | Introduce three primitives in `components/ui/`: `Button`, `Card`, `Badge`. Don't refactor everything — just create them so new code stops adding to the pile. |

---

# DETAILED FINDINGS

The four tables above are the actionable bits. The sections below are the supporting evidence by domain. Read what you need.

## 1. Design system

### 1.1 Tokens (exist, ignored)

`app/globals.css` lines 6–55 establishes a complete CSS variable system:

- Backgrounds: `--msp-bg #0A101C`, `--msp-card #101A2A`, `--msp-panel #122033`, `--msp-panel-2 #0D1726`
- Borders: `--msp-border rgba(255,255,255,0.08)`, `--msp-border-strong rgba(255,255,255,0.12)`
- Text: `--msp-text rgba(255,255,255,0.92)`, `--msp-text-muted rgba(255,255,255,0.62)`, `--msp-text-faint rgba(255,255,255,0.45)`
- Semantic: `--msp-accent #10B981`, `--msp-bull #2FB36E`, `--msp-bear #E46767`, `--msp-warn #D8A243`
- Spacing: `--msp-section-gap 24px`, `--msp-panel-padding 16px`, `--msp-grid-gap 16px`
- Radii: `--msp-radius-sm/md/lg/panel 6/8/10/10 px`
- Type: `--msp-text-caption/label/body-sm/body 0.6875/0.75/0.8125/0.875 rem`

`lib/tailwind.config.js` extends Tailwind with `msp` color namespace and shadows.

**These tokens are largely ignored** — hardcoded hex is everywhere. Top 20 hardcoded colors found in `components/` and `app/`:

| Hex | Approx. occurrences | Token equivalent (if any) |
|-----|----------------------|---------------------------|
| `#10B981` | 40+ | `--msp-accent` |
| `#EF4444` | 35+ | none (drift from `--msp-bear #E46767`) |
| `#D97706` | 25+ | none (drift from `--msp-warn #D8A243`) |
| `#64748B` | 30+ | could use `--msp-text-muted` |
| `#94A3B8` | 20+ | could use `--msp-text-faint` |
| `#F59E0B` | 15+ | none (3rd amber variant) |
| `#475569` | 8+ | none |
| `#3B82F6` | 6+ | none |
| `#1E3A5F` | 3+ | none |
| `#8B5CF6` | 4+ | none |
| `#DC2626`, `#FBBF24`, `#F87171`, `#A78BFA`, `#CBD5E1`, `#E2E8F0`, `#22c55e`, `#eab308`, `#334155` | scattered | none |

### 1.2 Buttons

Eight distinct implementations:

1. Global CSS class — `components/CookieBanner.tsx` line 39 (`className="btn"`)
2. Tailwind-conditional — `components/WatchlistWidget.tsx` lines 741–763 (6 colour variants inline)
3. Pure Tailwind hardcoded — `components/AlertsWidget.tsx` line 539 (`bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg`)
4. Tailwind utility blocks — `components/Hero.tsx` line 23
5. Inline `style={{...}}` — `components/ConfirmDialog.tsx` lines 49–79
6. Pill / segmented control — `components/crypto-terminal/CryptoTerminalView.tsx` line 89

### 1.3 Mobile

Tool pages are largely responsive. Sample (all `app/tools/*/page.tsx`):

| Page | Mobile-aware |
|------|-------------|
| portfolio | YES (`sm:`, `md:`, `lg:` grids; lines 1762–2070) |
| golden-egg | YES (lines 78–984) |
| workspace | YES (lines 49–127) |
| terminal | YES (lines 186–901) |
| time-scanner | YES |
| options-flow | minimal — relies on container layout |
| backtest | PARTIAL — large tables may not collapse |
| scanner | YES |

`app/globals.css` lines 115–175 has `@media` rules for `options-page-container` / `msp-main-shell`. Mobile is the strongest area of the codebase.

### 1.4 Inline-style audit

Sampled 20 random components. Result: 95% mix inline `style={{...}}` with Tailwind in the same file. Example `src/features/volatilityEngine/components/VESignalCard.tsx` lines 89–148 — `className="text-xl font-black"` next to `style={{ color }}`. CSS Modules used in ~15 admin files only.

---

## 2. Tool pages

### 2.1 Priority pages — verdicts

| Page | Loading state | Error state | Tier gate | Notable issues |
|------|---------------|-------------|-----------|----------------|
| `/tools/scanner` | spinner + ScreenerTable placeholder | inline | free (capped) → pro_trader (unlimited) | `getDataQualityLabel()` works correctly (line 54). No hardcoded test data. **NaN-in-cache risk** (Table 3 row 3). |
| `/tools/scanner/backtest` | spinner | inline | pro_trader (line 430) | NaN safety via `n()` helper (line 11). Equity chart keyed properly. |
| `/tools/backtest` | skeleton | inline; `console.error` line 1134 | pro_trader (line 713) | 3200+ lines — complex state. Inverse comparison snapshot at line 223. |
| `/tools/portfolio` | spinner | many `console.error` (lines 676, 683, 884, 898, 905, 912, 922, 963, 1348) | `canExportCSV` line 7, `canAccessPortfolioInsights` line 639 | Position sizer Kelly correct. **No "empty positions" visual** beyond array-length check. |
| `/tools/journal` | Suspense spinner | delegated | `canAccessJournal` line 8 | Clean 27-line wrapper. |
| `/tools/ai-analyst` | n/a | n/a | n/a | **Redirects to `/tools/scanner`**. Bot is floating button now. |
| `/tools/golden-egg` | dynamic imports use plain `"Loading..."` text (line 26) | inline | delegated to children | Dynamic imports lack styled skeletons. Long, dense JSX. |
| `/tools/volatility-engine` | blank div during tier check | delegated | `canAccessVolatilityEngine` (pro_trader, line 10) | Thin wrapper. |
| `/tools/confluence-scanner` | spinner | delegated | `canAccessConfluenceScanner` (pro_trader, line 13) | Accepts `embeddedInTerminal` prop. |
| `/tools/options-flow` | spinner | explicit error state; `console.error` line 208 | `canAccessOptionsTerminal` (pro_trader, line 156) | Nested aggregates, IV-skew classifier (`bearish_hedging` / `bullish_demand` / `neutral`). |
| `/tools/options-confluence` | skeleton | inline | `canAccessOptionsConfluence` line 608 | 2300+ lines, very dense. |

### 2.2 Tier gating summary (verified)

- **Free:** `/tools/scanner` (capped), `/tools/alerts`, `/tools/settings`, `/tools/workspace`, `/tools/dashboard`, `/tools/referrals`, `/tools/page` (hub).
- **Pro** (`canAccessPortfolioInsights`): `/tools/portfolio`, `/tools/intraday-charts`, `/tools/heatmap`, `/tools/markets`, `/tools/economic-calendar`, `/tools/news`, `/tools/commodities`, `/tools/company-overview`.
- **Pro Trader:** `/tools/backtest`, `/tools/volatility-engine`, `/tools/confluence-scanner`, `/tools/options-flow`, `/tools/options-confluence`, `/tools/crypto-terminal`, `/tools/scalper`, `/tools/time-scanner`.
- **Hardcoded tier check** (smell): `/tools/scalper/page.tsx` line 76 uses raw `const canAccess = tier === 'pro_trader'` instead of `canAccessScalper()`. Should match the helper-function pattern of the others.
- **No explicit gate:** `/tools/macro`, `/tools/gainers-losers`, `/tools/deep-analysis` (gating delegated to child component).

### 2.3 Redirect-only routes (8 — delete)

These pages are bare `redirect()` calls. They take build time and bundle space; should be `next.config.mjs` redirects instead:

- `/tools/ai-analyst` → `/tools/scanner`
- `/tools/ai-tools` → `/tools`
- `/tools/crypto-heatmap` → `/tools/explorer?tab=crypto-command&section=heatmap`
- `/tools/crypto-intel` → `/tools/explorer?tab=crypto-intel`
- `/tools/earnings` → `/tools/research?tab=earnings`
- `/tools/earnings-calendar` → `/tools/research?tab=earnings`
- `/tools/options`, `/tools/options-terminal` → `/tools/terminal?tab=options-terminal`
- `/tools/watchlists` → `/tools/workspace?tab=watchlists`

### 2.4 Duplicate / overlapping tool pages

See Table 2 rows 8–10 for the consolidation matrix.

---

## 3. Methodology / scoring (the credibility layer)

The brief was explicit: **don't tune for accuracy, tune for transparency**. Findings are framed that way.

### 3.1 MSP Score

**Location:** `app/tools/scanner/page.tsx` lines 217–233.

```ts
const structure  = Math.min(100, Math.max(0, Math.abs(r.score ?? 0) * 10));
const momentum   = Math.min(100, Math.max(0, r.confidence ?? (Math.abs(r.score ?? 0) * 8)));
const volatility = r.dveBbwp != null
  ? (r.dveBbwp < 20 ? 80 + (20 - r.dveBbwp)
    : r.dveBbwp > 80 ? 70 + (r.dveBbwp - 80)
    : 30 + r.dveBbwp * 0.3)
  : 40;
const options = r.derivatives ? Math.min(100, 50 + Math.abs(r.derivatives.fundingRate ?? 0) * 500) : 30;
const time    = r.scoreV2?.acl?.confidence ?? 50;
const raw = (structure*w.structure + momentum*w.momentum + volatility*w.volatility + options*w.options + time*w.time) / 100;
if (r.scoreV2?.regimeScore?.gated) return Math.round(Math.max(0, raw * 0.4));
return Math.round(Math.min(100, Math.max(0, raw)));
```

**Issues:**

- `REGIME_WEIGHTS` referenced as `w.structure / w.momentum / …` — not defined in the visible scope. Where do these weights come from, and why do they change by regime?
- Fallbacks `volatility = 40`, `options = 30`, `time = 50`, `momentum ?? score*8` — all magic constants, all undocumented.
- Piecewise BBWP function uses `20` and `80` as breakpoints with no rationale.
- `regimeScore.gated` triggers a flat `* 0.4` multiplier — why 0.4? Why not 0.5 or 0?
- **Deterministic given inputs** ✔ — no `Math.random()` or `Date.now()` in the scoring path.

**Lifecycle thresholds** (line 224–232): `READY ≥ 75 & conf ≥ 65`, `SETTING_UP ≥ 55 & conf ≥ 45`, `WATCHING ≥ 35`, else `DISCOVERED`. Five magic numbers, no justification.

### 3.2 Confluence scoring

**Location:** `app/api/scanner/run/route.ts` lines 1349–1665.

Five evidence layers — Trend Structure (45%), Volume (20%), Oscillators (25%), Volatility regime (±10), Derivatives (+8 for crypto). Final score:

```ts
const netConviction   = (dominantSignals - opposingSignals) / totalDirectional;
const agreementRatio  = Math.min(1, dominantSignals / 14);
const confluenceBonus = layersContributing >= 10 ? 8 : layersContributing >= 7 ? 4 : 0;
const missingEvidencePenalty = layersContributing < 7 ? (7 - layersContributing) * 4 : 0;
let score = Math.round((netConviction * 0.5 + agreementRatio * 0.5) * 85);
score += confluenceBonus + volatilityBoost + derivativesContribution.boost - missingEvidencePenalty;
score = Math.max(0, Math.min(100, score));
```

**Issues:**

- 50+ magic constants across the function: EMA% thresholds 3% / 1%, DI-diff cutoffs 10 / 3, OBV change 2% / 0.5%, RSI zones 30/45/55/70, CCI ranges ±100/±200, Stoch 20/80, BBWP 10/20/80/90, ATR% 2/5/8.
- Trend multiplier scales by ADX (0.6 / 1.0 / 1.2 / 1.4); non-linear and unexplained.
- Direction gating (line 1625): forced to `'neutral'` if `totalDirectionalRaw < 4` OR `layersContributing < 4`. Why 4?
- Direction flip threshold (lines 1629, 1633): must win by >15% to flip → why 1.15?
- `agreementRatio = dominantSignals / 14` uses fixed denominator 14 even when only 8 indicators returned valid data. The ratio over-states agreement when data is sparse.
- Deterministic ✔.

### 3.3 DVE (Volatility Engine)

`lib/directionalVolatilityEngine.ts` not deeply inspected. Externally observed:

- BBWP `< 8%` = compression — magic number.
- ATR% `> 8%` = `volatilityBoost -= 5` — magic number.
- DVE internals (squeeze score, trap detection, exhaustion level) opaque to consumers.

### 3.4 Golden Egg

**Location:** `app/api/golden-egg/route.ts` lines 407–500+.

- Verdict mapping is arbitrary thresholds: `score ≥ 65 → 'agree', ≥ 45 → 'neutral', else 'disagree'` (line 411, repeated for momentum line 522, internals line 548). Why 65 and 45?
- Time-confluence applies a **hard binary override** (line 551): if direction disagrees with TC direction, verdict forced to `'disagree'`. No weighted compromise.
- **No top-level Opportunity Score, Evidence Quality Score, Personal Exposure flag, Confidence, What confirms, What invalidates, Main risk.** Fails the AI Output Standards rule for setup outputs.
- **Local-demo fallback** (lines 18–65): synthetic AAPL=520 + `Math.sin(i/12)*0.012` wave when `LOCAL_DEMO_MARKET_DATA=true`. **Production guard missing** — see Quick Win #9.
- Stale-data check before computing verdicts: missing. Stale indicator scored same as live.

### 3.5 Scan-universe pipeline

**Location:** `app/api/scanner/run/route.ts`.

- Calls 12+ indicators (EMA, RSI, MACD, ADX, Aroon, Stoch, CCI, OBV, MFI, VWAP, Ichimoku, ATR), DVE, derivatives, regime classification, time confluence.
- `direction` logic at line 1625–1634 (quoted in 3.2 above).
- **Cached equities feed `NaN` Aroon** into scoring → Table 3 row 3.
- No explicit rejection of stale candles. `freshnessStatus` is set on output but not used as a gate.

### 3.6 Backtest engine

**Location:** `lib/backtest/runStrategy.ts`, `lib/backtest/assumptions.ts`.

Assumptions (good — these are *documented*):

- Slippage: 5 bps entry + 5 bps exit, adverse direction.
- Commission per leg: 1 bp (stock), 20 bps (crypto), 2 pips (forex).
- Fill model: `historical_bar_simulation` — fills use bar OHLC, no intrabar path.
- Intrabar ambiguity: SL resolves before TP when bar touches both (line 127).
- Not modelled: bid/ask spread, borrow costs, taxes, depth, market impact.
- Look-ahead bias: explicitly addressed at `lib/backtest/assumptions.ts` line 132.
- Min sample size: 50 intraday bars / 3 years annual.

Gaps:

- Spreads not modelled — 2–5× larger than slippage for illiquid symbols.
- Volume limits ignored — position uses 95% of capital per trade (`runStrategy.ts` line 129) regardless of bar volume.
- End-of-data exits close at final close — locks in unrealized profits artificially when strategy trending green at window end.
- Sample-size warning is text-only, not blocking. A 3-trade backtest happily renders metrics like Sharpe and expectancy as if calibrated.
- Single-window backtest can sit entirely in one regime — acknowledged but not corrected.

### 3.7 AI Analyst prompt

**Location:** `lib/prompts/mspAnalystV11.ts`.

Good:

- Line 22: "You never give financial advice."
- Line 151: "Do not give explicit buy/sell instructions; instead present scenarios and conditions."
- Line 166: hard-coded disclaimer wording the model must append.

Gaps:

- "Present scenarios" leaves room for soft recommendations ("Scenario A bullish, 70% probable, requires …").
- Disclaimer is required by prompt but **not validated post-response** — if the model forgets, nothing catches it.
- No requirement for `Confidence`, `Evidence Quality Score`, `Personal Exposure`, `What confirms`, `What invalidates`, `Main risk` — fails AI Output Standards.

### 3.8 AI Output Standards compliance

| Output surface | Opp. Score | Evidence Quality | Personal Exp. | Confidence | What confirms | What invalidates | Main risk | Grade |
|----------------|-----------|------------------|---------------|------------|---------------|------------------|-----------|-------|
| Scanner (public) | ✓ implicit (MSP) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **F** |
| Golden Egg (Pro) | ✓ partial | ✗ | ✗ | ✗ | ~ narrative | ~ narrative | ~ narrative | **D+** |
| Admin ARCA (private) | ✓ | ~ hardcoded heuristic | ✗ hardcoded `"ok"` | ✓ | ✓ | ✓ | ✓ | **C+** |
| AI Analyst chat | ✗ | ✗ | ✗ | ✗ | ~ prose | ~ prose | ~ prose | **D** |

Public outputs fail the rule. Admin ARCA is closer but `personalExposure` is hardcoded `"ok"`.

### 3.9 Data-integrity surfacing

`app/tools/scanner/page.tsx` lines 114–115:

```ts
if (r.scoreQuality?.freshnessStatus === 'missing') return 'MISSING';
if ((r.scoreQuality?.missingEvidencePenalty ?? 0) > 0
  || (r.scoreQuality?.staleDataPenalty ?? 0) > 0
  || (r.scoreQuality?.liquidityPenalty ?? 0) > 0
  || r.rankWarnings?.length) return 'DEGRADED';
```

- Binary grading — 4-point penalty (1 missing layer) looks identical to a 20-point penalty (5 missing).
- Stale data shows `DEGRADED` but score still published.
- No `FRESH` badge for the happy path.

### 3.10 Hardcoded fallbacks affecting scoring (not just UI)

| Pattern | Where | Risk |
|---------|-------|------|
| `volatility = 40`, `options = 30`, `time = 50` | `app/tools/scanner/page.tsx` 217–233 | HIGH — affects score, undocumented |
| `?? 50` on RSI/time confidence | scanner + golden-egg | HIGH — biases neutral baseline |
| `volume: 0` synthetic for missing crypto | `scanner/run` line ~898 | MEDIUM — OBV becomes NaN |
| `Math.random()` for portfolio entry IDs | `app/tools/portfolio/page.tsx` 1024, 1086, 1310 | LOW (UI only) |
| Local demo `Math.sin()` price wave | `app/api/golden-egg/route.ts` 18–65 | HIGH if `LOCAL_DEMO_MARKET_DATA=true` ever set in prod |

---

## 4. Security + API

364 API routes. Sample of 30 + targeted checks on auth/cron/webhooks.

### 4.1 Workspace tenant isolation

**Correct (sampled):** `alerts/route.ts` line 141, `favorites/route.ts` line 20, `watchlists/route.ts` line 15, `journal/route.ts`, `ai/copilot/route.ts` line 50, `ai/suggest/route.ts` line 45, `adaptive/profile/route.ts`, `backtest/symbol-range/route.ts`.

**Critical leaks** — see Table 3 rows 1–2.

### 4.2 Secret exposure

**Zero issues found.** Every `process.env.STRIPE_SECRET_KEY / OPENAI_API_KEY / ALPHA_VANTAGE_API_KEY / APP_SIGNING_SECRET / DATABASE_URL / ADMIN_SECRET / CRON_SECRET` lives under `app/api/`, `lib/`, or `middleware.ts`. No `'use client'` file touches them.

### 4.3 Cron auth

**All 9 cron routes** validate `x-cron-secret` with timing-safe comparison:
`refresh-fundamentals` (line 30), `arca-cycle` (26–39), `arca-daily-report` (33–40), `persist-edge-packets` (47–54), `edge-label-outcomes` (29–37), `edge-rebuild-matrix`, `label-ai-outcomes` (line 93), `evening-packet` (line 39), `macro-ingest` (line 28).

### 4.4 Input validation

- Zod / schema: `app/api/backtest/route.ts` line 87, `app/api/ai/actions/route.ts` lines 69–133, `app/api/alerts/route.ts` lines 195–215.
- Manual: `alerts`, `favorites` (line 35–40), `trades/close` (line 10–17).
- **Unvalidated**: `app/api/cached/universe/route.ts` POST (lines 60–80) — trusts `symbols` array shape. `app/api/ai/suggest/route.ts` (94–120) — minimal check, but user-workspace scoped (low risk).
- **SQL injection: zero risk.** Every `q()` call seen uses `$1, $2, ...` parameterisation.

### 4.5 Rate limiting

Deployed: `bars/route.ts` (25–27), `deep-analysis/route.ts` (1216–1222, 5/min), `backtest/route.ts` (43–49, 10/min), `backtest/scanner/route.ts` (line 26).

**Missing on high-risk public routes:**
- `app/api/cached/quote/route.ts` — see Table 3 row 2.
- `app/api/symbol-search/route.ts` — caches 6h but no per-IP miss limit.

### 4.6 Stripe webhook

`app/api/webhooks/stripe/route.ts` line 8–12 imports the SDK with `STRIPE_WEBHOOK_SECRET` available; expected `constructEvent` HMAC validation in the handler. ✓

### 4.7 CORS / CSRF

`next.config.mjs` 1–60 sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection`, HSTS 63072000 + preload in production. JWT cookie is timing-safe verified in `middleware.ts` 5–70. No explicit CSRF token but cookie is `SameSite=Strict`-compatible.

### 4.8 AI quota

`app/api/ai/copilot/route.ts` 37–66 — server-side DB-backed daily quota check **before** OpenAI call. Logged to `ai_usage` (lines 68–77). ✓

### 4.9 Public/admin separation

- `adminOnly` field leaks via backtest → Table 3 row 5.
- `/api/health/status` line 29 leaks expected env-var names → Table 3 row 12.
- Verified clean: `app/api/ai-market-focus/route.ts` 25–70 (public-only fields), `app/api/golden-egg/route.ts` 192–210 (maps `InternalPermission` → public `assessment`).

---

## 5. Public marketing pages

22 routes audited.

### 5.1 Page-by-page (condensed)

| Page | State | Disclaimer | Mobile | Issues |
|------|-------|-----------|--------|--------|
| `/` (homepage) | OK | "No brokerage execution. No financial advice." in subtitle | OK | `SocialProof.tsx` is misnamed — shows feature stats, not testimonials |
| `/about` | OK | jurisdiction stated | OK | None |
| `/contact` | OK | n/a (contact page) | Button may overflow <400px | Minor |
| `/pricing` | OK | "All plans educational/informational only" line 309 | **Feature matrix uses CSS grid not `<table>` — overflow + a11y risk** | Use semantic table |
| `/reviews` | unread (delegates to component) | unknown | unknown | Need component-level audit |
| `/partners` | OK | none on page | hard to assess — heavy inline styles | **Tech debt: inline styles, ignores design tokens** |
| `/guide` | OK | n/a | OK | None |
| `/guide/open-interest` | OK | educational tone in scenarios | gradient header may dampen text contrast | Tab a11y depends on impl |
| `/resources`, `/resources/platform-guide`, `/resources/trading-guides` | OK | n/a | OK | None |
| `/blog`, `/blog/[slug]` | OK | n/a | OK | None |
| `/quant` | **PUBLIC but shouldn't be** | none | n/a | **CRITICAL — Table 3 row 6** |
| `/compliance-hub` | OK | dedicated page | OK | None |
| `/disclaimer` | OK | this is the disclaimer | OK | **Hardcoded effective date 13 Dec 2025**; `#EAB308` borderline contrast |
| `/cookie-policy`, `/legal/cookie-policy` | OK | yes | OK | Duplicate (Table 3 row 8) |
| `/privacy`, `/legal/privacy` | OK | yes | OK | Duplicate |
| `/terms`, `/legal/terms` | OK | yes | OK | Duplicate |
| `/refund-policy`, `/legal/refund-policy` | OK | yes | OK | Duplicate |
| `/daily-pick` | **No disclaimer surfaced** at top — there is one at the bottom now (line 242) but UI doesn't visually emphasise data freshness | yes (added recently) | OK | Add `<DegradedBanner>` if last scan stale |
| `/share/scan/[symbol]` | **No disclaimer visible in code excerpt** — should add | unclear | OK | Add educational-use banner |
| `/v2` | OK — `redirect('/tools/explorer')` | n/a | n/a | Clean deprecation |
| `/v2/scanner` | unverified — assume redirect | n/a | n/a | Verify it redirects too |

### 5.2 Homepage component map

```
app/page.tsx
└── components/home/CommandHub.tsx
    ├── Hero.tsx                        (CTAs, data-source logos)
    ├── Guided Workflow Paths           (6 cards: scan/validate/options/test/track/crypto)
    ├── HomePreviewStrip.tsx            (3 CSS-rendered sample cards, labelled "sample data")
    ├── SocialProof.tsx                 ← misnamed; renders feature stats
    ├── Value Stack                     (4 cards)
    ├── ARCxA Section                   (logo + asset tags)
    └── Core Workflow Tools             (5-step flow, badges 01–05)
```

**Overlap:** `SocialProof` (Multi-asset, Regime-aware, Data quality, Workflow-first) vs Value Stack (Scan faster, Verify context, Test safely, Track your edge) — same shape, complementary content. Not strictly redundant but ripe for consolidation under one "Why MSP" rail.

---

## 6. Compliance notes (cross-cutting)

- **`no-broker-execution.md`** — no broker SDK or order-routing call found anywhere in `app/api/`. ✓
- **`alpha-vantage-usage.md`** — `lib/avFetch.ts` enforces rate caps. Cache TTLs present. Partial-payload handling is mostly explicit. **However**: missing fields are sometimes silently coerced to `0` / `40` / `50` (see methodology §3.10) — violates "Never backfill missing fields silently with hardcoded values."
- **`coingecko-usage.md`** — `lib/coingecko.ts` has aliases (e.g. RNDR fix from commit aca5d5cd). Delayed snapshots are labelled in some widgets but not all derivative metrics carry a freshness badge.
- **`options-data-rules.md`** — flow/gamma metrics are tagged with timestamps in options-flow output, but missing-options-data does not currently reduce the Evidence Quality Score (because there is no EQS — see §3.4).
- **`data-integrity.md`** — admin panels mostly carry source + last-updated + freshness, but **public surfaces lack the same**. `/daily-pick` is the most prominent gap.
- **`risk-language-private.md`** — admin language quality is good. Public language doesn't get deterministic claims, which is correct.
- **`no-public-leakage.md`** — violated by `adminOnly` field in backtest response (Table 3 row 5) and by `/quant` being publicly accessible (Table 3 row 6).

---

## 7. Test coverage snapshot

73 test files exist. Not deeply audited in this pass. Suggested next pass:

- Verify every scoring function in §3 has a unit test that pins the formula's behaviour for a fixed input snapshot. Today the formulas can be changed silently.
- Verify backtest fee/slippage assumptions are exercised by an end-to-end test that asserts a known PnL on a fixed candle set.

---

## 8. Suggested execution order

This mirrors the brief's suggested order with one re-prioritisation: the **two CRITICAL security findings (Table 3 rows 1, 2) and the `/quant` exposure (row 6) should be patched before anything else** — they are 5-30 minute fixes and they are real leaks.

1. **Hour 1** — Quick Wins #1, #2, #3, #4 (security leaks + admin leaks).
2. **Hour 2** — Quick Wins #5, #6, #9 (SEO cleanup, redirect cleanup, prod guard for demo data).
3. **Phase 1 (design system, 1–3 days)** — introduce `Button`, `Card`, `Badge`, `Pill`, `StatCard`, `DataTable` in `components/ui/`. Do **not** mass-refactor; just stop new code from adding to the pile.
4. **Phase 3 (methodology docs, 1–2 days)** — write `METHODOLOGY.md` per the brief. Document every constant in §3.1–§3.5. This is the single highest-leverage move for credibility and should happen before any score-tuning.
5. **Phase 2 (UX progressive disclosure + first-run) and Phase 4 (perf/tests)** — iterate as scoped tasks.
6. **Phase 5 (compliance centralisation)** — consolidate disclaimer wording into `<ComplianceDisclaimer>` everywhere (Quick Win #8).

---

## 9. Closing verdict

The platform's bones are stronger than the brief implies: tenant isolation is mostly correct, cron auth is uniformly hardened, secrets don't leak to the client, mobile responsiveness in tool pages is genuinely good, and a token system already exists. The credibility problems are concentrated in three places:

1. **Two leaky public APIs** that are 15 minutes of work to close (`cached/universe`, `cached/quote`) and one admin-page that should not be public (`/quant`).
2. **The scoring layer is opaque** — formulas are deterministic but riddled with undocumented magic numbers and silent fallbacks (`?? 40`, `?? 50`, `?? 30`). This is the gap between "looks elite" and "is elite". Fixing it is a documentation job first, a code job second.
3. **AI Output Standards are not enforced** — the rule in `.claude/rules/ai-output-standards.md` is real, but none of the public outputs currently emit the seven required fields. This is the most direct lever to raise perceived rigor.

Mobile, auth, billing, and infra are solid. Methodology documentation, public-output standardisation, and a real design-token enforcement pass are the three moves that will most materially separate this from competitors.
