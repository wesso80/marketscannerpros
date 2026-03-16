# MSP Full Platform Audit — v2 Architecture + v3 Intelligence Readiness

**Audit Date:** July 2025  
**Scope:** Entire MSP codebase — v1 tools, v2 surfaces, backend engines, database, navigation, UI/UX consistency  
**Standard:** Professional desk reviewer — not casual UI walkthrough

---

## 1. Executive Verdict

| Metric                        | Score  |
|-------------------------------|--------|
| v2 Architecture Coherence     | 8 / 10 |
| Feature Completeness          | 7 / 10 |
| Code Quality                  | 7 / 10 |
| UI/UX Consistency             | 6 / 10 |
| Backend Robustness            | 8 / 10 |
| v3 Intelligence Readiness     | 6 / 10 |

**Overall: 7 / 10 — Structurally sound, architecturally coherent, but held back by a dual-platform split (v1 still active with zero migration path), a 100% mock V2Context that confuses the data contract, and incomplete v3 pipeline tables.**

Is v2 coherent? **Yes.** The 8 surfaces (Dashboard, Scanner, Golden Egg, Terminal, Explorer, Research, Backtest, Workspace) map cleanly to the architecture document. Navigation is flat and fast. Real API hooks in `api.ts` call v1 endpoints and transform responses correctly. The regime-weighted MSP score, lifecycle state derivation, and tier gating all work.

Is it shippable as-is? **No.** The V2Context still injects mock data for intelligence/news/calendar/journal/watchlist even though individual surfaces bypass it with their own hooks. The v1 platform (50+ tool pages) has zero links to v2 and no deprecation signals. Users can live in v1 indefinitely without discovering v2 exists.

---

## 2. What Is Working Well

### Architecture
- **Surface model is clean.** 8 flat nav items + Pricing/Referrals/Account. No deep nesting, no confusing hierarchy.
- **V2Shell pattern works.** V2Provider → TopNav → RegimeBar → content → footer. Every surface gets consistent chrome.
- **api.ts is well-designed.** Real `apiFetch<T>()` wrapper with `same-origin` credentials, AuthError class, typed response interfaces for regime/quote/scanner/golden-egg/DVE/flow/news/calendar/movers/sectors/commodities/crypto/close-calendar/earnings. No new backend needed.

### Individual Surfaces
- **Scanner** (Tier-1, ~1400 lines): 8 filter tabs, Ranked + Pro modes, regime-weighted `computeMspScore()`, `deriveLifecycleState()`, inline SymbolDetailPanel with entry/stop/targets. Click flows to Golden Egg. This is the strongest surface.
- **Golden Egg** (Tier-1, ~1500 lines): Complete verdict header, setup thesis, structure/options/momentum/narrative sections, cross-market alignment badge, lifecycle badge. Options section correctly gated to Pro Trader.
- **Dashboard** (Tier-1, ~400 lines): Regime banner, best setups, movers, calendar, headlines. Clean entry point that links to Scanner/Explorer/Research.
- **Workspace** (Tier-1): 7 tabs wrapping real components (WatchlistWidget, JournalPageV1, PortfolioV1, AlertsContentV1, BacktestPage, LearningTab, AccountSection). Dynamic imports with loading skeletons. Tier gates on Journal (Pro), Learning (Pro), Backtest (Pro Trader).
- **Research** (Tier-1, ~500 lines): News/Calendar/Earnings tabs. Clean data. Pro gated.
- **Pricing** (Tier-1): 3 plans, yearly toggle, Stripe checkout, referral code handling, FAQ. Production-ready.
- **Referrals** (Tier-2): Stats, history, leaderboard, contest. Auth-gated. Feature-complete.

### Backend
- **Engine library is massive and mature.** 15+ computation engines: capitalFlowEngine, regime-engine, correlation-regime-engine, DVE, time-confluence, options-confluence-analyzer, institutional-brain, probability-matrix, learning-engine, plus execution pipeline (exits, leverage, orderBuilder, positionSizing, riskGovernor) and workflow system (decisionPacket, scoring, events).
- **ARCA Doctrine system is fully typed.** 10 playbooks in registry, classifier with top-3 matching, PersonalProfile type, DoctrineOutcome type. API routes exist at `/api/doctrine/profile`, `/api/doctrine/playbooks`, `/api/doctrine/outcome`.
- **Database schema is comprehensive.** 49 migrations covering auth, portfolio, journal, alerts, AI, learning, signals, referrals, catalyst events.

---

## 3. Critical Problems Still Remaining

### P0 — Must Fix Before Ship

**3.1 V2Context is 100% Mock Data**  
`V2Context.tsx` initializes 5 datasets via `useState(() => generateMock…())` — intelligence (18 fake symbols), news (8 hardcoded items), calendar (6 hardcoded events), journal (5 fake entries), watchlist (6 fake items). Individual surfaces (Scanner, Dashboard, Golden Egg, etc.) bypass this and use their own hooks from `api.ts` to fetch real data. But any component consuming `V2Context` directly gets fake data.

**Impact:** The `data` field (SymbolIntelligence[]) from context is consumed for the `selectedSymbol` intelligence panel on some surfaces. If a surface renders intelligence from context instead of from its own API call, users see fabricated numbers.

**Fix:** Either (a) wire V2Context's data feeds to real API hooks, (b) remove the mock data fields entirely and rely solely on per-surface hooks, or (c) clearly document which surfaces use context data vs. own hooks and ensure no context mock data bleeds into production UI.

**3.2 v1 Has Zero Links to v2**  
Grep of `app/tools/**/*.tsx` for `/v2/` or `navigateTo` returned **zero matches**. The 30+ active v1 tool pages have no banner, no link, no redirect suggesting users try v2. The v2 footer has a "Back to v1" link, but v1 has no forward link. Users who have bookmarked `/tools/scanner` will never discover `/v2/scanner`.

**Impact:** User migration cannot happen organically. v1 and v2 will coexist indefinitely, doubling maintenance burden.

**Fix:** Add a persistent migration banner to v1 layout (`app/tools/toolsLayoutClient.tsx` or `app/tools/layout.tsx`) saying "Try the new v2 experience →" with link to the corresponding v2 surface. Optionally, set a cookie to remember dismissal.

**3.3 `doctrine_outcomes` Table Not in Migrations**  
The table creation script exists at `scripts/migrate-doctrine-outcomes.sql` but is NOT in the `migrations/` folder. If deployed to a fresh environment, the table won't be auto-created. `/api/doctrine/outcome` POST and `lib/doctrine/stats.ts` SELECT queries will fail with "relation does not exist".

**Fix:** Move the script to `migrations/` with proper sequencing (e.g., `050_doctrine_outcomes.sql`).

### P1 — Should Fix Soon

**3.4 `trade_lifecycle` Table Does Not Exist**  
Zero mentions in codebase. The v3 roadmap requires lifecycle tracking (SETUP → ENTRY → MANAGEMENT → EXIT → REVIEW) per trade. The workflow types define `MSPEvent` with 15+ event types including lifecycle transitions, but there's no persistent store.

**Fix:** Create migration for `trade_lifecycle` table with columns: id, workspace_id, symbol, journal_trade_id, state, entered_at, metadata jsonb, created_at.

**3.5 Backtest Is Both Nav Item 7 AND Workspace Tab 5**  
Backtest appears in TopNav as a standalone surface (`/v2/backtest`) AND inside Workspace as a tab. The Workspace tab dynamically imports the same BacktestPage. This means users can reach the identical UI two ways, which is confusing and wastes a nav slot.

**Impact:** 8 nav items instead of the architecture's 7. Cognitive overhead for users.

**Fix:** Remove Backtest from TopNav (keep it as Workspace tab only) or remove it from Workspace (keep as standalone). The architecture document specifies 7 surfaces — Backtest as standalone was added later.

**3.6 Terminal Tier-2 Quality — Flow/Options Loosely Integrated**  
Terminal has 4 tabs (Close Calendar, Options Terminal, Crypto, Flow). The Flow tab displays capital flow visualization but relies on dynamic imports and the capitalFlowEngine output shape. Options Terminal is hidden for crypto (correctly) but the Crypto tab is essentially a re-import of `CryptoTerminalView` from v1 components.

**Fix:** Terminal needs a coherence pass — ensure all 4 tabs share consistent styling, loading states, and error handling. The Crypto tab should be reviewed for v2 styling compliance.

### P2 — Nice to Fix

**3.7 Explorer Cross-Market Tab Has Static Data**  
The Cross-Market relationships section in Explorer uses `CROSS_MARKET` from constants.ts — 6 hardcoded relationships (SPY/QQQ → VIX, oil → energy, DXY → gold/EM, etc.) rendered as static cards. No dynamic correlation data.

**3.8 Homepage Doesn't Link to Backtest**  
CommandHub.tsx links to 7 v2 surfaces but omits `/v2/backtest`. If Backtest remains a standalone nav item, it should be discoverable from the homepage.

---

## 4. Page-by-Page Audit

### V2 Surfaces

| # | Surface | File | Lines | Quality | Verdict |
|---|---------|------|-------|---------|---------|
| 1 | Dashboard | `app/v2/dashboard/page.tsx` | ~400 | Tier-1 | **KEEP** — Clean entry point. Regime banner, best setups, movers, calendar, headlines. |
| 2 | Scanner | `app/v2/scanner/page.tsx` | ~1400 | Tier-1 | **KEEP** — Strongest surface. 8 tabs, MSP scoring, lifecycle, inline detail. |
| 3 | Golden Egg | `app/v2/golden-egg/page.tsx` | ~1500 | Tier-1 | **KEEP** — Complete signal analysis. Verdict/thesis/structure/options/momentum/narrative. |
| 4 | Terminal | `app/v2/terminal/page.tsx` | ~900 | Tier-2 | **KEEP — needs polish.** 4 tabs work but styling/loading inconsistent. |
| 5 | Explorer | `app/v2/explorer/page.tsx` | ~600 | Tier-2 | **KEEP** — Pro gated. Overview/Sectors/Commodities/Cross-Market tabs. Make cross-market dynamic. |
| 6 | Research | `app/v2/research/page.tsx` | ~500 | Tier-1 | **KEEP** — News/Calendar/Earnings. Clean and functional. |
| 7 | Backtest | `app/v2/backtest/page.tsx` | ~400 | Tier-2 | **KEEP — merge into Workspace only** (remove standalone nav entry). |
| 8 | Workspace | `app/v2/workspace/page.tsx` | ~80 | Tier-1 | **KEEP** — 7 tabs, dynamic imports, tier gates. Hub for user data. |
| 9 | Pricing | `app/v2/pricing/page.tsx` | Full | Tier-1 | **KEEP** — 3 plans, Stripe, referrals, FAQ. Production-ready. |
| 10 | Referrals | `app/v2/referrals/page.tsx` | Full | Tier-2 | **KEEP** — Stats, leaderboard, contest. Auth-gated. |

### V1 Tools — Keep/Merge/Remove

| v1 Page | Purpose | Gate | Decision | Notes |
|---------|---------|------|----------|-------|
| `scanner/page.tsx` | Market scanner | Free+ | **MERGE → v2 Scanner** | v2 Scanner is superior (MSP score, lifecycle, inline detail) |
| `golden-egg/page.tsx` | Signal deep-dive | Free+ | **MERGE → v2 Golden Egg** | v1 has rich GE component system but v2 wraps the thesis cleanly |
| `portfolio/page.tsx` | Position tracker | Free+ | **KEEP as v2 component** | Already wrapped by Workspace Portfolio tab |
| `journal/page.tsx` | Trade journal | Pro | **KEEP as v2 component** | Already wrapped by Workspace Journal tab |
| `watchlists/page.tsx` | Symbol watchlists | Free+ | **KEEP as v2 component** | Already wrapped by Workspace Watchlist tab |
| `alerts/page.tsx` | Alert management | Free+ | **KEEP as v2 component** | Already wrapped by Workspace Alerts tab |
| `backtest/page.tsx` | Strategy backtest | Pro Trader | **MERGE → v2 Backtest** | v2 backtest is standalone with real API hooks |
| `settings/page.tsx` | Account settings | Free+ | **KEEP as v2 component** | Wrapped by Workspace Settings tab |
| `markets/page.tsx` | "V2 Unified Hub" | Free+ | **REMOVE** | This was a transitional v1→v2 hub. v2 surfaces supersede it entirely. |
| `options-terminal/page.tsx` | Options chain viewer | Pro | **MERGE → v2 Terminal** | Already imported as Options Terminal tab |
| `crypto-terminal/page.tsx` | Crypto derivatives | Pro | **MERGE → v2 Terminal** | Already imported as Crypto tab |
| `options-confluence/page.tsx` | Options + flow + state machine | Pro | **MERGE → v2 Terminal** | Flow tab covers this. The v1 version has more components (state machine, evolution) but they're specialty views. |
| `deep-analysis/page.tsx` | Full symbol analysis | Pro | **MERGE → v2 Golden Egg** | v2 Golden Egg does this better with structured sections |
| `news/page.tsx` | News + earnings | Free+ | **MERGE → v2 Research** | v2 Research has News/Calendar/Earnings |
| `economic-calendar/page.tsx` | Econ events | Free+ | **MERGE → v2 Research** | Already in Research Calendar tab |
| `earnings/page.tsx` | Earnings standalone | Free+ | **REDIRECT → v2 Research** | earnings is already redirected in v1 |
| `earnings-calendar/page.tsx` | Earnings calendar | Free+ | **MERGE → v2 Research** | Same data |
| `heatmap/page.tsx` | Sector heatmap | Free+ | **MERGE → v2 Explorer** | Overview tab has heatmap |
| `commodities/page.tsx` | Commodity prices | Free+ | **MERGE → v2 Explorer** | Explorer has Commodities tab |
| `equity-explorer/page.tsx` | Equity sectors | Pro | **MERGE → v2 Explorer** | Sectors tab covers this |
| `crypto-explorer/page.tsx` | Crypto categories | Pro | **MERGE → v2 Explorer** | Overview tab has crypto |
| `crypto/page.tsx` | Crypto dashboard | Free+ | **MERGE → v2 Explorer** | Explorer Overview covers crypto movers + categories |
| `crypto-dashboard/page.tsx` | Crypto with derivatives | Pro | **MERGE → v2 Explorer + Terminal** | Split between Explorer (overview) and Terminal (crypto tab) |
| `crypto-heatmap/page.tsx` | Crypto heatmap | Free+ | **REMOVE — redirects to crypto** | Already redirected |
| `macro/page.tsx` | Macro indicators | Free+ | **MERGE → v2 Explorer** | Cross-Market tab or new Macro sub-tab |
| `confluence-scanner/page.tsx` | Time confluence scan | Pro | **MERGE → v2 Terminal** | Close Calendar tab covers this |
| `time-scanner/page.tsx` | Time scanner | Pro Trader | **MERGE → v2 Terminal** | Close Calendar / time confluence |
| `crypto-time-confluence/` | Crypto time cycles | Pro | **MERGE → v2 Terminal** | Similar to close calendar but crypto-specific |
| `options/page.tsx` | Options scanner | Pro | **MERGE → v2 Terminal** | Options Terminal tab |
| `options-flow/page.tsx` | Options flow | Pro | **MERGE → v2 Terminal** | Flow tab |
| `volatility-engine/page.tsx` | DVE visualization | Pro | **MERGE → v2 Golden Egg** | GE Structure section covers DVE |
| `gainers-losers/page.tsx` | Market movers | Free+ | **MERGE → v2 Explorer** | Explorer Overview has movers |
| `market-movers/page.tsx` | Market movers v2 | Free+ | **MERGE → v2 Explorer** | Same |
| `intraday-charts/page.tsx` | Chart viewer | Free+ | **MERGE → v2 Golden Egg or Terminal** | Interactive chart needed in GE |
| `liquidity-sweep/page.tsx` | Liquidity analysis | Pro | **MERGE → v2 Golden Egg** | Part of structure analysis |
| `company-overview/page.tsx` | Fundamentals | Free+ | **MERGE → v2 Golden Egg** | GE Deep section has company overview |
| `referrals/page.tsx` | Referral page | Free+ | **MERGE → v2 Referrals** | v2 version is complete |
| `ai-analyst/page.tsx` | AI analysis | Pro | **REDIRECT → v2 Scanner** | Already redirecting |
| `ai-tools/page.tsx` | AI tools landing | Free+ | **REDIRECT → /tools** | Already redirecting |
| `command-hub/page.tsx` | Landing hub | Free+ | **REMOVE** | Superseded by v2 Dashboard |
| `operator/page.tsx` | Operator dashboard | Internal | **KEEP (internal tool)** | Advanced operator/admin view, not user-facing |

**Total v1 tool directories:** ~50  
**Active v1 pages:** ~30  
**Redirect to v2:** Immediate for 8 pages  
**Keep as v2 component wrappers:** 5 pages (portfolio, journal, watchlists, alerts, settings)  
**Full removal:** 3 pages (markets hub, crypto-heatmap redirect, command-hub)  
**Targeted merge remaining:** ~15 pages into v2 surfaces over time  

---

## 5. Duplication & Consolidation Audit

### Direct Duplicates (same data, two entry points)

| Feature | v1 Location | v2 Location | Action |
|---------|-------------|-------------|--------|
| Market scanner | `/tools/scanner` | `/v2/scanner` | Redirect v1 → v2 |
| Golden Egg analysis | `/tools/golden-egg` | `/v2/golden-egg` | Redirect v1 → v2 |
| News / sentiment | `/tools/news` | `/v2/research` (News tab) | Redirect v1 → v2 |
| Economic calendar | `/tools/economic-calendar` | `/v2/research` (Calendar tab) | Redirect v1 → v2 |
| Earnings | `/tools/earnings-calendar` | `/v2/research` (Earnings tab) | Redirect v1 → v2 |
| Sector heatmap | `/tools/heatmap` | `/v2/explorer` (Overview tab) | Redirect v1 → v2 |
| Commodities | `/tools/commodities` | `/v2/explorer` (Commodities tab) | Redirect v1 → v2 |
| Market movers | `/tools/gainers-losers` + `/tools/market-movers` | `/v2/explorer` (Overview tab) | Redirect both → v2 |
| Options terminal | `/tools/options-terminal` | `/v2/terminal` (Options tab) | Redirect v1 → v2 |
| Crypto terminal | `/tools/crypto-terminal` | `/v2/terminal` (Crypto tab) | Redirect v1 → v2 |
| Backtest | `/tools/backtest` | `/v2/backtest` + `/v2/workspace` (Backtest tab) | Three locations — consolidate to workspace tab |
| Referrals | `/tools/referrals` | `/v2/referrals` | Redirect v1 → v2 |

### Internal v2 Duplication

| Feature | Location 1 | Location 2 | Action |
|---------|-----------|-----------|--------|
| Backtest | TopNav standalone `/v2/backtest` | Workspace tab 5 | Remove from TopNav |

### Component Re-use (intentional — not duplication)

The Workspace surface correctly wraps v1 components via dynamic imports:
- `WatchlistWidget` → Watchlists tab
- `JournalPageV1` → Journal tab  
- `PortfolioContent` → Portfolio tab
- `AlertsContent` → Alerts tab
- `BacktestPage` → Backtest tab
- `AccountSection` → Settings tab

This is good architectural practice — reuse, don't rewrite.

---

## 6. Workflow Audit

### Flow 1: "New user signs up, opens platform for first time"

1. User signs up via Stripe → `/api/auth/login` validates Stripe customer → `ms_auth` cookie set ✅
2. Redirected to... **unclear**. If from homepage, CommandHub links go to v2. If from v1 bookmark, they land in v1. ❌ **No deterministic landing page for new signups.**
3. Dashboard loads → regime banner via `useRegime()` (real API) ✅, best setups via `useScannerResults()` (real API) ✅, movers (real API) ✅
4. User clicks a setup → `navigateTo('golden-egg', symbol)` → Golden Egg loads with real data ✅

**Gaps:** Step 2 needs a post-signup redirect to `/v2/dashboard`. Currently the after-checkout page (`app/after-checkout/page.tsx`) may not route to v2.

### Flow 2: "Existing user runs full scan-to-trade workflow"

1. User opens Scanner → sees regime-weighted results with MSP scores ✅
2. Clicks interesting symbol → Golden Egg loads → sees verdict, setup thesis, entry/stop/targets ✅
3. User checks Terminal → Close Calendar shows anchor model ✅, Flow shows capital flow brain decision ✅, Options Terminal shows chain (if equity) ✅
4. User opens Workspace → Portfolio tab → adds position ✅
5. Position auto-syncs to database via `/api/portfolio` ✅
6. User logs trade in Journal tab ✅ → journal entry saved via `/api/journal` ✅
7. **Missing:** No automated Journal ↔ Portfolio sync ON ENTRY (sync exists for close-trade). User must manually log in both places.
8. **Missing:** No decision packet auto-creation. The workflow events system defines `MSPEvent` types but no UI triggers `workflow/events` endpoint.

**Gaps:** Steps 7-8 need automation. The decision packet lifecycle is fully typed but not wired to UI.

### Flow 3: "User checks daily market context"

1. Dashboard → regime banner shows current regime ✅, economic calendar shows today's events ✅
2. Explorer → Overview tab shows sector heatmap + movers ✅
3. Research → News tab shows sentiment-tagged headlines ✅, Calendar shows macro events ✅
4. **Working end-to-end.** This workflow is complete.

### Flow 4: "User reviews past performance and learns"

1. Workspace → Journal tab → sees trade history with KPIs ✅
2. Workspace → Learning tab → **calls `/api/doctrine/profile` and `/api/doctrine/playbooks`** ✅ (API routes exist)
3. Learning tab shows personal doctrine profile: edge score, win rate by doctrine/regime ✅
4. **Gap:** `doctrine_outcomes` table must be migrated first. If table doesn't exist in DB, the profile API returns empty/errors.
5. **Gap:** No automated outcome labeling for doctrine. `lib/learning-engine.ts` has `tagOutcome()` but it's not triggered from UI.

---

## 7. UI/UX Consistency Audit

### v2 Internal Consistency

| Aspect | Consistent? | Notes |
|--------|-------------|-------|
| Color scheme | ✅ Yes | Dark theme `#0F172A` bg, `#10B981` accent green throughout |
| Typography | ✅ Yes | `text-[11px]` for tabs, consistent heading sizes |
| Card styling | ✅ Yes | Shared `Card` component from `ui.tsx`, consistent border/radius |
| Tab pattern | ✅ Yes | Same pill-button tabs across all surfaces |
| Loading states | ⚠️ Partial | Dynamic imports have skeleton loaders, but some API-driven sections show nothing during load |
| Error states | ⚠️ Partial | `AuthError` is handled with `AuthPrompt`, but generic API errors often show empty states instead of error messages |
| Empty states | ✅ Yes | `EmptyState` component used consistently |
| Responsive | ⚠️ Partial | `overflow-x-auto` on tabs, but some surfaces (Terminal, Explorer) may overflow on mobile |

### v1 Components Inside v2

| Component | Styling Match? | Notes |
|-----------|---------------|-------|
| WatchlistWidget | ⚠️ Mostly | Has its own dark styling but may not use v2 Card wrapper |
| JournalPageV1 | ⚠️ Partial | Full 3-layer journal layout — works but has v1 chrome (command bar, headers) that may clash |
| PortfolioContent | ⚠️ Partial | v1 portfolio page is large (~1700 lines) with its own header/modals |
| AlertsContent | ⚠️ Partial | v1 alerts with own heading/styling |
| BacktestPage | ✅ Yes | Built natively for v2 |

**Recommendation:** The wrapped v1 components in Workspace need a styling wrapper or pass a `embedded` prop to hide their own headers/chrome when rendered inside v2.

### v2 vs v1 Design Language

v2 uses a flat, minimal design with small pill tabs, compact badges, and dense data presentation. v1 uses larger headers, full-width layouts, more whitespace. When v1 components appear inside v2 Workspace, the contrast is noticeable. Not broken, but not seamless.

---

## 8. Data/Backend Architecture Audit

### API Layer

| Endpoint | Used By | Status |
|----------|---------|--------|
| `/api/regime` | Dashboard, Scanner, Golden Egg | ✅ Real, working |
| `/api/scanner/run` | Scanner (POST) | ✅ Real, working |
| `/api/golden-egg` | Golden Egg | ✅ Real, working |
| `/api/dve` | Golden Egg, Terminal | ✅ Real, working |
| `/api/quote` | Multiple | ✅ Real, working |
| `/api/flow` | Terminal Flow tab | ✅ Real, working |
| `/api/confluence-scan` | Terminal Close Calendar | ✅ Real, working |
| `/api/news-sentiment` | Dashboard, Research | ✅ Real, working |
| `/api/economic-calendar` | Dashboard, Research | ✅ Real, working |
| `/api/market-movers` | Dashboard, Explorer | ✅ Real, working |
| `/api/sectors/heatmap` | Explorer | ✅ Real, working |
| `/api/commodities` | Explorer | ✅ Real, working |
| `/api/crypto/*` | Explorer, Terminal Crypto tab | ✅ Real, working |
| `/api/earnings-calendar` | Research | ✅ Real, working |
| `/api/watchlists` | Workspace Watchlists | ✅ Real, working |
| `/api/journal` | Workspace Journal | ✅ Real, working |
| `/api/portfolio` | Workspace Portfolio | ✅ Real, working |
| `/api/alerts` | Workspace Alerts | ✅ Real, working |
| `/api/backtest` | Backtest | ✅ Real, working |
| `/api/doctrine/profile` | Workspace Learning | ✅ Exists (needs DB table) |
| `/api/doctrine/playbooks` | Workspace Learning | ✅ Exists |
| `/api/doctrine/outcome` | Outcome recording | ✅ Exists (needs DB table) |
| `/api/payments/checkout` | Pricing | ✅ Real, working |
| `/api/referral/dashboard` | Referrals | ✅ Real, working |
| `/api/workflow/events` | **Not wired to UI** | ⚠️ Exists but no frontend trigger |
| `/api/workflow/decision-packet` | **Not wired to UI** | ⚠️ Exists but no frontend trigger |

### Database Table Health

| Table Group | Tables | Migrated? | Used? |
|-------------|--------|-----------|-------|
| Auth | workspaces, user_subscriptions, user_trials | ✅ Yes | ✅ Yes |
| Portfolio | portfolio_positions, portfolio_closed, portfolio_performance, portfolio_cash_ledger | ✅ Yes | ✅ Yes |
| Journal | journal_entries | ✅ Yes | ✅ Yes |
| Decisions | decision_packets, decision_packet_aliases | ✅ Yes | ⚠️ API exists, not wired |
| Alerts | alert_conditions, alerts, alert_history | ✅ Yes | ✅ Yes |
| AI | ai_signal_log, ai_usage, ai_events | ✅ Yes | ✅ Yes |
| Learning | learning_predictions, learning_outcomes, learning_stats | ✅ Yes | ⚠️ Partially used |
| Doctrine | doctrine_outcomes | ❌ In scripts/ not migrations/ | ⚠️ APIs exist, table may not |
| Lifecycle | trade_lifecycle | ❌ Does not exist | ❌ Not implemented |
| Market Data | symbol_universe, daily_picks, daily_prices | ✅ Yes | ✅ Yes |
| Catalyst | catalyst_events, catalyst_event_studies | ✅ Yes | ✅ Yes |
| Referrals | referrals, referral_rewards | ✅ Yes | ✅ Yes |

### v3 Intelligence Pipeline Readiness

The v3 roadmap requires:

| v3 Requirement | Backend Status | Frontend Status |
|----------------|---------------|-----------------|
| Doctrine classification per trade | ✅ `lib/doctrine/classifier.ts` works, 10 playbooks in registry | ⚠️ LearningTab reads profile, no per-trade classification UI |
| Outcome tracking per doctrine | ✅ `/api/doctrine/outcome` route exists | ❌ No UI to record outcomes, no auto-labeling trigger |
| Personal profile evolution | ✅ `lib/doctrine/stats.ts` computes from `doctrine_outcomes` | ⚠️ Depends on table existing + data flowing |
| Trade lifecycle state machine | ⚠️ Workflow types define states, no persistent store | ❌ No `trade_lifecycle` table, no UI |
| Decision packet creation | ✅ API route exists, types fully defined | ❌ No frontend integration |
| Forward test tracking | ✅ `lib/signals/forwardTestTracker.ts` exists | ❌ No UI |
| Automated outcome labeling | ✅ `lib/signals/outcomeLabeler.ts` exists | ❌ No cron/trigger wired |

**v3 Assessment:** The backend has 70% of what v3 needs (types, engines, API routes), but the frontend has ~10% (only LearningTab). The pipeline is missing the connective tissue: auto-doctrine-tagging on trade entry, auto-outcome-labeling on trade exit, lifecycle state transitions, and decision packet auto-creation from scanner/golden-egg signals.

---

## 9. Missing Features

### From Architecture Document

| Feature | Status | Priority |
|---------|--------|----------|
| Interactive price chart on Golden Egg | ❌ No TradingView/chart component in v2 GE | P1 |
| v1 → v2 migration banner | ❌ v1 has zero links to v2 | P0 |
| Post-signup redirect to v2 | ❌ After-checkout may go to v1 | P1 |
| Mobile-optimized v2 layout | ⚠️ Tabs scroll, but no explicit mobile testing | P2 |
| CSV export from Scanner | ⚠️ May exist in v1, not confirmed in v2 | P2 |
| TradingView script generation | ⚠️ Exists in v1 (Pro Trader), not surfaced in v2 | P2 |

### From v3 Roadmap

| Feature | Status | Priority |
|---------|--------|----------|
| Doctrine auto-tagging on trade entry | ❌ Not implemented | P1 |
| Auto outcome labeling | ❌ Engine exists, not triggered | P1 |
| Trade lifecycle state machine UI | ❌ No table, no UI | P1 |
| Decision packet auto-creation | ❌ API exists, no trigger | P2 |
| Forward test dashboard | ❌ Engine exists, no UI | P2 |
| Learning evolution curve | ❌ No visualization | P2 |

---

## 10. Priority Fix List

### P0 — Ship Blockers

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | **Remove or wire V2Context mock data** — Either delete mock generators and strip `data`/`news`/`calendar`/`journal`/`watchlist` from context (surfaces use own hooks), or wire them to real APIs. Current state creates a false contract. | Medium | High — prevents any mock data leaking to production UI |
| 2 | **Add v1 → v2 migration banner** — Add persistent banner to `app/tools/layout.tsx` linking to equivalent v2 surfaces. Include dismiss cookie. | Small | High — enables organic user migration |
| 3 | **Move `doctrine_outcomes` to migrations/** — Copy `scripts/migrate-doctrine-outcomes.sql` to `migrations/050_doctrine_outcomes.sql` so it's created on deployment. | Trivial | High — unblocks Learning tab + v3 doctrine pipeline |

### P1 — First Sprint After Ship

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 4 | **Consolidate Backtest navigation** — Remove from TopNav, keep in Workspace only. Update constants.ts NAV_ITEMS to 7. | Small | Medium — cleaner nav, matches architecture |
| 5 | **Add interactive chart to Golden Egg** — Import PriceChart or InteractiveChart component from v1 scanner. | Medium | High — GE needs a chart for technical reference |
| 6 | **Wire doctrine auto-tagging** — When user adds a journal trade, auto-call `classifyDoctrine()` and tag the entry. | Medium | High — v3 pipeline foundation |
| 7 | **Post-signup routing to v2** — Ensure `after-checkout` page redirects to `/v2/dashboard` instead of v1. | Small | Medium — first impression for new users |
| 8 | **Terminal styling polish** — Ensure all 4 Terminal tabs (Close Calendar, Options, Crypto, Flow) have consistent v2 styling, loading skeletons, and error states. | Medium | Medium — Terminal is Tier-2 |
| 9 | **v1 component wrappers in Workspace** — Pass `embedded={true}` prop to JournalPageV1, PortfolioV1, AlertsContentV1 to suppress v1 headers/chrome when inside v2. | Medium | Medium — UI polish |

### P2 — Later

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 10 | **Create `trade_lifecycle` migration** | Small | Medium — v3 requirement |
| 11 | **Wire automated outcome labeling** — Set up cron or journal-close trigger to call `outcomeLabeler` | Medium | Medium — v3 pipeline |
| 12 | **Make Explorer Cross-Market dynamic** — Replace static `CROSS_MARKET` cards with live correlation data from `/api/correlation-regime` | Medium | Low — cosmetic improvement |
| 13 | **Add Backtest to homepage CommandHub** — If keeping as standalone | Trivial | Low |
| 14 | **Decision packet auto-creation** — Wire scanner selection → decision packet → journal | Large | Medium — v3 advanced workflow |
| 15 | **Forward test dashboard UI** — Display tracked predictions with outcomes | Large | Medium — v3 feature |
| 16 | **Start v1 page deprecation** — Add redirects from high-traffic v1 pages to v2 equivalents | Medium | High (long-term) — reduces maintenance debt |

---

## 11. Final Verdict

### Is v2 ready to be the primary platform?

**Almost.** The architecture is sound, the surfaces are coherent, the backend is robust, and the real API hooks work. Three things block full launch:

1. **V2Context mock data must be resolved** — this is a code integrity issue, not a feature issue
2. **v1 → v2 migration path must exist** — users need to discover v2
3. **doctrine_outcomes table must be in migrations** — the Learning tab and v3 pipeline depend on it

### What's stopping v3?

The backend has the engines and types. The frontend has almost none of the v3 UI. Specifically:
- No trade lifecycle state machine (table + UI)
- No automated doctrine tagging on trade entry
- No automated outcome labeling on trade exit
- No decision packet creation from scanner/golden-egg signals
- No forward test tracking UI

These are all net-new features, not architectural problems. The v2 foundation supports them.

### Top 5 Changes (in priority order)

1. **Clean up V2Context** — Remove mock data generators. Context should only provide navigation state (`selectedSymbol`, `navigateTo`, `activeSurface`). Let surfaces own their data via `api.ts` hooks. This makes the data contract honest.

2. **Add v1 → v2 migration banner** — A single `<MigrationBanner />` component in `app/tools/layout.tsx` that shows "Try the new experience →" with a link to the corresponding v2 surface. Include localStorage/cookie dismissal. This is the single highest-leverage change for user migration.

3. **Move doctrine_outcomes to migrations and wire auto-tagging** — Move the SQL script, then wire `classifyDoctrine()` to fire on journal trade creation. This connects the v3 doctrine pipeline end-to-end: trade entry → doctrine classification → outcome tracking → personal profile evolution.

4. **Remove Backtest from TopNav** — This is a 2-minute change (delete one entry from NAV_ITEMS in constants.ts). It brings the nav to 7 items matching the architecture, and Backtest is still accessible via Workspace.

5. **Phase 1 v1 redirects** — For the 5 highest-traffic v1 pages (scanner, golden-egg, news, heatmap, backtest), add `redirect('/v2/...')` in their v1 page files. Keep the v1 components alive (they're used by v2 Workspace wrappers) but stop serving them as standalone pages. This begins the v1 sunset.

---

*Audit complete. The platform is architecturally coherent with a strong backend engine library. The primary risk is not code quality — it's the dual-platform maintenance burden and the disconnected v3 pipeline. Fix the 3 P0 items, execute the top 5 changes, and v2 is launch-ready.*
