# MarketScanner Pros Layout, Graphics & Flow Audit

Audit date: 2026-04-28  
Scope: App Router pages, current public platform, private admin terminal, shared UI components, graphics assets, navigation flow, trader-grade usability, mobile/readability, and educational safety.

Important visual note: this is a code-and-asset audit. It is strong enough to set priorities, but final visual grades should be tightened with screenshots or Playwright captures for desktop and mobile because rendered spacing, cropping, image blur, table overflow, and real contrast cannot be fully proven from source alone.

## 1. Executive Design Verdict
- Overall visual grade: B-. The dark institutional direction is right, but the experience still feels assembled from several design eras.
- Overall product flow grade: C+. The intended workflow exists, but users can still feel like they are choosing from a large tool drawer rather than being guided through a clean research process.
- Biggest strength: The platform now has a credible research workflow backbone: Dashboard -> Scanner -> Golden Egg -> Backtest -> Journal -> Workspace.
- Biggest weakness: Too many overlapping routes and inconsistent page shells dilute the premium feeling.
- Highest ROI improvement: Make `/tools` the guided Workflow page, simplify top nav, and use one PageHeader/DataTruth/Evidence/Risk component system across every major tool.
- Biggest trust issue: Landing and tool graphics still depend too much on stylized/mock/product-card imagery; real product screenshots would build more credibility.
- Biggest mobile issue: Dense scanner/options/portfolio/backtest tables and 10-11px labels will become hard to read; mobile needs card-first layouts, not shrunk desktop tables.

## 2. Page Inventory
| Route | Type | Purpose | Visual Grade | Flow Grade | Decision |
| --- | --- | --- | --- | --- | --- |
| `/` | marketing | Explain MSP and drive signup/scanner preview | B | B- | REFINE |
| `/about` | marketing | Company/product context | C | C | REFINE |
| `/account` | authenticated | User account and subscription state | B- | B | REFINE |
| `/after-checkout` | authenticated | Post-checkout confirmation | B- | B | KEEP |
| `/auth` | public-app | Passwordless/auth/admin access entry | B- | B- | REFINE |
| `/auth/verify` | public-app | Magic-link verification | B- | B | KEEP |
| `/blog` | marketing | Educational articles index | B- | B- | REFINE |
| `/blog/[slug]` | marketing | Article detail | B- | B | KEEP |
| `/compliance-hub` | marketing | Trust, legal, and educational safety hub | B | B | KEEP |
| `/contact` | marketing | Contact/support path | C+ | B- | REFINE |
| `/cookie-policy` | marketing | Legacy cookie policy route | C | C | MERGE |
| `/dashboard` | authenticated | Redirect to app dashboard | A | A | KEEP |
| `/disclaimer` | marketing | Legacy disclaimer route | C | C | MERGE |
| `/guide` | marketing | Platform guide/onboarding | B- | B | REFINE |
| `/guide/open-interest` | marketing | Open interest explainer | B- | B | KEEP |
| `/launch` | marketing | Launch page/campaign | C | C | REMOVE or MERGE |
| `/legal/cookie-policy` | marketing | Canonical legal cookie policy | B- | B | KEEP |
| `/legal/privacy` | marketing | Canonical legal privacy | B- | B | KEEP |
| `/legal/refund-policy` | marketing | Canonical legal refund policy | B- | B | KEEP |
| `/legal/terms` | marketing | Canonical legal terms | B- | B | KEEP |
| `/operator` | admin | Private operator cockpit | B+ | B | ADMIN_ONLY |
| `/operator/engine` | admin | Private operator engine detail | B | B | ADMIN_ONLY |
| `/partners` | marketing | Partner/referral acquisition | C+ | C+ | REFINE |
| `/partners/demo` | marketing | Partner demo surface | C+ | C+ | MERGE |
| `/pricing` | marketing | Free/Pro/Pro Trader conversion | B | B | REFINE |
| `/privacy` | marketing | Legacy privacy route | C | C | MERGE |
| `/quant` | marketing | Quant/product proof page | C+ | C | REFINE |
| `/refund-policy` | marketing | Legacy refund route | C | C | MERGE |
| `/resources` | marketing | Resource hub | C+ | C+ | REFINE |
| `/resources/platform-guide` | marketing | Platform education | B- | B | MERGE with `/guide` |
| `/resources/trading-guides` | marketing | Trading education | B- | B | KEEP |
| `/reviews` | marketing | Social proof/reviews | C+ | C | REFINE |
| `/terms` | marketing | Legacy terms route | C | C | MERGE |
| `/tools` | public-app | Workflow/product map | B | B | REFINE |
| `/tools/dashboard` | authenticated | Command Center start page | B- | C+ | REBUILD |
| `/tools/scanner` | public-app | Ranked educational scan candidates | B | B- | REFINE |
| `/tools/golden-egg` | pro_trader | Single-symbol confluence packet | B | B | REFINE |
| `/tools/backtest` | pro_trader | Historical simulation lab | B- | B- | REFINE |
| `/tools/journal` | pro | Learning and trade review log | B | B | REFINE |
| `/tools/workspace` | pro | Saved research/workflow hub | B- | B- | REFINE |
| `/tools/portfolio` | pro | User-entered holdings analytics | C+ | C+ | REFINE |
| `/tools/alerts` | pro | Educational condition alerts | C+ | C+ | REFINE |
| `/tools/watchlists` | public-app | Saved symbols/watchlists | C+ | C+ | MERGE into Workspace |
| `/tools/settings` | authenticated | User app settings | C+ | B- | KEEP |
| `/tools/referrals` | authenticated | Referral management | B- | B | KEEP |
| `/tools/ai-analyst` | pro | AI research assistant page | B- | B- | MERGE into ARCA panel |
| `/tools/ai-tools` | pro | AI tool collection | C | C | MERGE |
| `/tools/research` | public-app | Research hub | B- | B- | REFINE |
| `/tools/news` | public-app | News feed | C+ | C+ | MERGE into Research |
| `/tools/macro` | pro | Macro dashboard | B- | B- | REFINE |
| `/tools/economic-calendar` | public-app | Macro event calendar | B- | B | MERGE into Research/Macro |
| `/tools/earnings-calendar` | public-app | Earnings calendar | B- | B | MERGE into Research |
| `/tools/earnings` | public-app | Earnings research | C+ | C+ | MERGE |
| `/tools/markets` | public-app | Market overview | B- | B- | REFINE |
| `/tools/market-movers` | public-app | Gainers/losers and movers | C+ | C | MERGE into Markets |
| `/tools/gainers-losers` | public-app | Duplicative movers view | C | C | MERGE |
| `/tools/heatmap` | public-app | Market heatmap | B- | B- | MERGE into Markets |
| `/tools/commodities` | public-app | Commodities research | C+ | C+ | MERGE into Markets/Research |
| `/tools/explorer` | public-app | Cross-asset explorer hub | B- | B | REFINE |
| `/tools/equity-explorer` | public-app | Equity explorer | B- | B- | MERGE under Explorer |
| `/tools/crypto-explorer` | public-app | Crypto explorer | B- | B- | MERGE under Explorer |
| `/tools/company-overview` | public-app | Single-company fundamentals | C+ | C+ | MERGE into Golden Egg/Explorer |
| `/tools/deep-analysis` | pro | Detailed symbol report | B- | B- | MERGE into Golden Egg tabs |
| `/tools/intraday-charts` | public-app | Intraday chart surface | C+ | C | MERGE into Golden Egg/Terminal |
| `/tools/terminal` | pro_trader | Advanced market terminal | B | B- | REFINE |
| `/tools/options` | pro | Options landing/tool route | C+ | C | MERGE |
| `/tools/options-flow` | pro | Options flow estimates | B- | B- | REFINE |
| `/tools/options-terminal` | pro_trader | Advanced options chain terminal | B | B- | REFINE |
| `/tools/options-confluence` | pro_trader | Options confluence scanner | B- | B- | MERGE with Options Terminal |
| `/tools/liquidity-sweep` | pro_trader | Liquidity-zone research | B- | B- | REFINE |
| `/tools/confluence-scanner` | pro_trader | Confluence scan surface | C+ | C+ | MERGE with Scanner/Golden Egg |
| `/tools/scanner/backtest` | pro_trader | Scanner-specific backtest | C+ | C+ | MERGE into Backtest |
| `/tools/signal-accuracy` | pro_trader | Scanner outcome accuracy | B- | B- | MERGE into Backtest/Admin Diagnostics |
| `/tools/scalper` | pro_trader | Intraday/scalper scan | C+ | C | HIDE from main nav |
| `/tools/time-scanner` | pro_trader | Time confluence research | B | B- | REFINE |
| `/tools/volatility-engine` | pro_trader | Directional volatility engine | B | B | REFINE |
| `/tools/crypto` | public-app | Crypto route/landing | C | C | MERGE |
| `/tools/crypto-dashboard` | pro_trader | Crypto derivatives dashboard | B- | B- | REFINE |
| `/tools/crypto-heatmap` | public-app | Crypto heatmap | B- | B- | MERGE into Crypto/Markets |
| `/tools/crypto-intel` | pro | Crypto intelligence | C+ | C+ | MERGE |
| `/tools/crypto-terminal` | pro_trader | Crypto terminal | B- | B- | REFINE |
| `/tools/crypto-time-confluence` | pro_trader | Crypto time confluence | B- | B- | MERGE with Time Scanner |
| `/v2` | public-app | Legacy/experimental v2 route | C | C | REMOVE or REDIRECT |
| `/v2/scanner` | public-app | Legacy/experimental scanner | C | C | REMOVE or REDIRECT |
| `/admin` | admin | Admin overview/business/ops | C+ | C+ | REBUILD |
| `/admin/morning-brief` | admin | Private morning command brief | B+ | B+ | KEEP |
| `/admin/operator-terminal` | admin | Private operator terminal | B+ | B | KEEP |
| `/admin/terminal/[symbol]` | admin | Private symbol command terminal | B+ | B+ | KEEP |
| `/admin/live-scanner` | admin | Live scanner diagnostics/feed | B | B | KEEP |
| `/admin/risk` | admin | Risk governor/admin permission | B | B | KEEP |
| `/admin/diagnostics` | admin | System/model/provider diagnostics | B | B | KEEP |
| `/admin/system` | admin | System health | B- | B | KEEP |
| `/admin/logs` | admin | Logs | B- | B | KEEP |
| `/admin/alerts` | admin | Internal alert controls | B- | B | KEEP |
| `/admin/settings` | admin | Admin settings | B- | B | KEEP |
| `/admin/usage-analytics` | admin | Usage analytics | C+ | C+ | REFINE |
| `/admin/ai-usage` | admin | AI usage/cost diagnostics | B- | B | KEEP |
| `/admin/costs` | admin | Cost controls | B- | B | KEEP |
| `/admin/income` | admin | Revenue overview | B- | B | KEEP |
| `/admin/subscriptions` | admin | Subscription management | B- | B | KEEP |
| `/admin/trials` | admin | Trial management | B- | B | KEEP |
| `/admin/delete-requests` | admin | Deletion requests/compliance ops | B- | B | KEEP |
| `/admin/discord-bridge` | admin | Discord bridge controls | B- | B | KEEP |
| `/admin/commander` | admin | Command/automation interface | B- | B- | REFINE |
| `/admin/outcomes` | admin | Outcome labeling/learning ops | B | B | KEEP |
| `/admin/outcomes/scorecard` | admin | Learning scorecard | B | B | KEEP |
| `/admin/quant` | admin | Quant diagnostics | B- | B | KEEP |
| `/admin/reporting` | admin | Reporting exports | B- | B | KEEP |
| `/admin/scalper` | admin | Private scalper diagnostics | B- | B- | KEEP |

## 3. Recommended Platform Flow
Current flow problem: The product has a good workflow in `lib/toolWorkflows.ts`, but the top nav still exposes too many equal-weight surfaces. Dashboard, Tools, Scanner, Golden Egg, Backtest, Journal, and Workspace are all top-level, while many secondary pages duplicate one another under Research, Markets, Explorer, Crypto, and Options.

Recommended user journey: Dashboard opens with market state and a research queue. Scanner finds aligned scenarios. Golden Egg validates one symbol. Backtest tests historical behavior. Journal captures decision/outcome. Workspace stores saved research and watchlists. Portfolio remains analytics for user-entered holdings, not a recommendation engine.

Recommended nav: Dashboard, Scanner, Golden Egg, Backtest, Journal, Workspace, Pricing/Account. Rename Tools to Workflow or Platform Map and make it an onboarding/product map rather than a competing nav destination.

Recommended secondary nav: Markets, Options, Crypto, Macro, News/Calendar, Explorer, Alerts. These should live under a compact Research menu or secondary rail, not all compete with the main workflow.

Recommended admin journey: Admin Command Center -> Morning Brief -> Live Intelligence -> Risk Governor -> Data Health/Diagnostics -> Alerts -> Webhooks/Bridge -> Logs -> Business Ops.

## 4. Global Design System Findings
What is consistent:
- Dark theme, emerald primary accent, slate panels, educational disclaimers, and market-status colors are broadly consistent.
- `globals.css` defines useful MSP tokens for background, panels, borders, text, accent, bull/bear/warn, spacing, radius, and content widths.
- Shared market truth components now exist: `DataFreshnessBadge`, `MarketStatusStrip`, `EvidenceStack`, and `RiskFlagPanel`.
- Focus-visible styling and reduced-motion handling are present globally.

What is inconsistent:
- Many pages still use raw Tailwind colors, hard-coded hex values, inline styles, and page-local card/badge/button patterns.
- Border radius varies from 4px to `rounded-3xl`; tool pages use rounded-xl/2xl heavily while the stated elite direction should be tighter and more institutional.
- Typography has too many 9px, 10px, and 11px labels in dense trading surfaces.
- Icons are mixed: emoji, PNG thumbnails, SVGs, manually drawn SVG arrows, and no consistent icon set.
- Some pages use public educational tone; others expose trader/admin labels like TRADE, LONG, SHORT, Permission, Signal, and Decision Packet too prominently.
- Admin shell exists, but root chrome does not treat `/admin` as an app/admin route, so public header/footer behavior should be verified and separated.

Tokens to standardise:
- Background: `bg`, `surface`, `surfaceRaised`, `surfaceInset`, `surfaceHover`.
- Border: `subtle`, `normal`, `strong`, `critical`, `warning`, `success`.
- Status: `live`, `cached`, `stale`, `missing`, `degraded`, `unknown`.
- Tier: `free`, `pro`, `proTrader` with one badge system.
- Text: `caption`, `label`, `body`, `bodyStrong`, `sectionTitle`, `pageTitle`, `heroTitle`.
- Radius: 6px control, 8px card, 10px panel; avoid 24px/32px for data UI.
- Layout: page max width, tool grid gap, dashboard rail width, mobile toolbar height.

Components to create:
- `AppShell`, `PageHeader`, `SectionHeader`, `WorkflowStepper`, `ProductMapCard`, `TierBadge`, `FeatureAccessBadge`, `EducationalDisclaimer`, `AdminOnlyBanner`, `ResearchModeBadge`, `ScannerSymbolCard`, `MobileSymbolCard`, `SymbolDetailDrawer`, `WhyThisRankDrawer`, `ChartPreviewCard`, `ToolOutcomeCard`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `ProviderBadgeStrip`, `FooterDisclaimer`, `ARCAInsightPanel`.

Components to merge:
- Merge local badge/status pills into `StatusPill` plus `DataFreshnessBadge`.
- Merge page-local truth grids into `MarketStatusStrip`.
- Merge Golden Egg local evidence widgets with shared `EvidenceStack` where possible.
- Merge tool image cards into one `ToolCard`/`ProductMapCard` pattern.

Recommended global component matrix:
| Component | Status | Should Use On | Design Guidance | Priority |
| --- | --- | --- | --- | --- |
| AppShell | inconsistent | all `/tools`, `/admin`, `/operator` | One public app shell and one admin shell; admin never shows marketing footer | critical |
| TopNav | exists/inconsistent | global | Reduce top-level items; add secondary Research menu | high |
| MarketRegimeStrip | inconsistent | Dashboard, Scanner, Golden Egg, Backtest | Compact regime/risk/volatility strip | high |
| PageHeader | inconsistent | every major tool | Title, safe subtitle, tier, freshness, primary action | high |
| SectionHeader | exists/inconsistent | all cards/sections | One label/title/subtitle pattern | medium |
| WorkflowStepper | missing | Tools, Dashboard, onboarding | Shows Find -> Validate -> Test -> Track | high |
| ProductMapCard | inconsistent | Tools, landing, guide | Purpose, best used when, output, tier, next step | high |
| TierBadge | inconsistent | pricing, tools, gates | Small factual Free/Pro/Pro Trader badge | high |
| FeatureAccessBadge | inconsistent | locked tools | Clear locked/available state, not noisy | high |
| DataFreshnessBadge | exists | Scanner, Golden Egg, DVE, Options, Dashboard | Small mono LIVE/CACHED/STALE timestamp | high |
| DataTruthPanel | should merge | major tools | Use `MarketStatusStrip` as base | high |
| EducationalDisclaimer | exists/inconsistent | public trading tools | Short visible + expandable full copy | critical |
| AdminOnlyBanner | missing | `/admin`, `/operator` | Internal only, no public advice/legal footer | high |
| ResearchModeBadge | missing | Scanner, Golden Egg, Backtest | Says Educational Research Mode | medium |
| ConfluenceMeter | inconsistent | Golden Egg, Scanner, Dashboard | One 0-100 meter with evidence count | medium |
| EvidenceStack | exists | Golden Egg, DVE, Options, Morning Brief, Scanner drawers | Supportive/neutral/conflicting/missing | high |
| StatusPill | exists admin/inconsistent global | all status rows | One shape and tone map | high |
| RiskFlagPanel | exists | Golden Egg, DVE, Options, Morning Brief, Dashboard | Info/warning/critical with reason | high |
| ScannerRankTable | exists/inconsistent | Scanner desktop | Safer labels, sticky header, drawer action | high |
| ScannerSymbolCard | missing | Scanner desktop optional | Compact ranked result card | high |
| MobileSymbolCard | missing | Scanner mobile | Replace full table below 768px | critical |
| SymbolDetailDrawer | partial | Scanner, Golden Egg | Evidence, missing data, next research step | high |
| WhyThisRankDrawer | missing | Scanner | Explain score movement and penalties | critical |
| ChartPreviewCard | inconsistent | Scanner, Golden Egg, Backtest | 16:9 mini chart with source/freshness | medium |
| ToolOutcomeCard | missing | Tools | Outcome-first tool explanation | high |
| EmptyState | inconsistent | all data pages | State cause and next action | high |
| ErrorState | inconsistent | all data pages | Explain provider/auth/rate-limit cause | high |
| LoadingSkeleton | inconsistent | all data pages | Stable dimensions, no layout jump | medium |
| ProviderBadgeStrip | partial | landing, data pages | Factual provider/source strip | medium |
| FooterDisclaimer | exists/inconsistent | public marketing/tools | Legal footer summary + links | high |
| ARCAInsightPanel | inconsistent | Dashboard, Golden Egg, Scanner | What is known, uncertain, what changes view | high |

## 5. Landing Page Audit
Strengths:
- The hero is visually clean, dark, and premium enough to hold attention.
- CTA pair is mostly right: Start Free and Scanner Preview.
- Provider logos and sample-data labels are good trust moves.
- The current copy does use educational language and avoids brokerage/execution promises.

Weaknesses:
- "See The Market With Clarity" is attractive but too abstract. It does not explain scanner, confluence, or workflow fast enough.
- Landing page repeats product explanation across hero, preview, guided chooser, value stack, core scanners, Why MSP, ARCA, Platform, referral, and CTA. The page is too long for the value being communicated.
- The hero image should be a real product screenshot or clearly labelled composite, not a generic terminal-style product visual.
- Emoji/icon definitions exist in the featured tool data but are not consistently used; graphics rely on PNG thumbnails of mixed style.
- Social proof appears as a section, but trust would be stronger with concrete product proof: real screenshots, data source freshness examples, and clear tier comparison.

Section order recommendation:
1. Hero with clearer product category and CTA.
2. Real product screenshot carousel: Dashboard, Scanner, Golden Egg.
3. Four-step workflow: Find -> Validate -> Test -> Track.
4. Tool outcomes by tier.
5. Data quality and compliance trust.
6. Pricing preview/CTA.
7. Legal disclaimer footer.

Hero recommendation:
- Replace headline with: "Educational market intelligence for traders who want cleaner context."
- Subheadline: "Scan equities, crypto, options flow, volatility, and multi-timeframe confluence in one research workflow. No brokerage execution. No financial advice."
- Primary CTA: "Start Free - No Card".
- Secondary CTA: "Open Scanner Preview".

Graphics recommendation:
- Replace `/logos/landing-hero.png` with a real product screenshot in a dark terminal frame.
- Keep `HomePreviewStrip` only if every preview remains visibly labelled sample data.
- Reduce generic product-card imagery. Use real screenshots for Scanner, Golden Egg, Dashboard, Backtest, Journal.
- Use provider logos small and factual; do not imply endorsement.

CTA recommendation:
- Keep Start Free as primary.
- Change "Try the Scanner" to "Open Scanner Preview".
- Add a small "No broker connection. Educational research only." line near CTAs.

Copy recommendation:
- Shorten ARCA copy and avoid vague "AI intelligence" wording.
- Explain Free, Pro, and Pro Trader earlier: Free discovers, Pro tracks/researches, Pro Trader validates/tests advanced evidence.

## 6. Tools Page Audit
Strengths:
- The four-step sequence is the right mental model.
- Tool grouping in `toolWorkflows.ts` is better than a random tools grid.
- Outcome blocks are valuable and should stay.
- Tier labels exist.

Weaknesses:
- Too many cards are visible at once.
- Primary vs advanced vs specialist is useful internally but less useful than "Start here", "Next", and "Advanced" for a user.
- Cards do not yet show enough: best used when, output you get, and recommended next tool.
- Free/Pro/Pro Trader distinction is visually present but not strong enough to guide upgrade understanding.

Recommended layout:
- Header: "Your MSP research workflow" with short educational subtitle.
- Sticky stepper: Find -> Validate -> Test -> Track.
- Each step: one primary card large, secondary cards collapsed or in a smaller rail.
- Add a "recommended next step" footer to every card.
- Add a compact progress path for logged-in users: last scanner run, last Golden Egg review, saved journal draft.

Card changes:
- Tool name.
- One-line purpose.
- Best used when.
- Output you get.
- Tier badge.
- Primary Open button.
- Recommended next step.

Workflow improvements:
- Rename `/tools` to Workflow or Platform Map in the UI.
- Hide advanced tools behind an "Advanced research" disclosure by default.
- Show locked Pro Trader tools clearly, but do not blur half the product into noise.

## 7. Scanner Page Audit
Strengths:
- Trader-grade ingredients are present: regime strip, tabs, timeframe, stats, data truth panels, ranked table, trust, DVE, lifecycle, and research actions.
- Recent shared `DataFreshnessBadge` and `MarketStatusStrip` adoption is a major improvement.
- The scanner already attempts safe wording in several places.

Weaknesses:
- It is still table-heavy and cognitively dense for a public educational surface.
- Rank logic is not explained within 5 seconds.
- No strong "why rank changed" drawer yet.
- Mobile is likely the weakest part because a full dense table cannot be the main mobile interface.
- Some labels remain too internal: Raw, Conf, BBWP, DVE, lifecycle, permission.
- Stale/degraded data is present, but it should be visually dominant enough that users cannot miss it.

Column changes:
- Keep: Symbol, MSP, Price, Bias, Alignment, Reason, Trust, Volatility, Regime, Lifecycle, Review.
- Rename: Direction -> Bias; Conf -> Alignment; Action -> Review; Analyze -> Review Scenario; Ready Setups -> Aligned Scenarios.
- Remove or hide by default on public desktop: Raw, BBWP technical code, internal DVE flags. Put them in a detail drawer.
- Admin scanner can keep raw/internal labels.

Layout changes:
- Add top answer panel: regime, risk state, volatility state, data quality, last scan.
- Put controls directly under context strip.
- Add summary cards: symbols scanned, aligned scenarios, developing scenarios, degraded data, last scan.
- Desktop table remains, but each row needs a Review drawer action.
- Add a rank explanation drawer: evidence, missing evidence, penalties, stale data, next research step.

Mobile changes:
- Replace table with `MobileSymbolCard` below 768px.
- Each card: rank, symbol, price, bias, MSP score, alignment, trust, one-line reason, Review button.
- Controls should collapse into a sticky filter sheet.

Trader-grade improvements:
- Chart preview per selected symbol.
- Rank delta and reason changed since last scan.
- Data-source line per asset class.
- Save to Workspace and open Golden Egg as the two main next steps.

Public wording changes:
- Use "Review", "Scenario", "Bias", "Alignment", "Research candidate".
- Avoid "Trade", "Buy", "Sell", "Ready to trade", "signal" on public pages unless explicitly framed as educational/historical.

## 8. Golden Egg Audit
Current state:
- Golden Egg is close to flagship quality in data depth, but visually it still reads like a dense advanced page rather than the polished final evidence packet.
- It has strong sections: verdict, confluence, levels, evidence stack, cross-market, DVE/time/volatility, and recently shared evidence/status/risk panels.
- It contains too many small labels and technical blocks visible at once.

Recommended flagship layout:
1. Symbol Header: symbol, asset class, price, regime, data freshness.
2. Verdict/Educational Summary: scenario state, confluence, bias, invalidation area, reaction zones, missing evidence.
3. Evidence Stack: trend, momentum, volatility, time, liquidity, options, macro/news.
4. Chart/Levels: timeframe selector, key levels, invalidation, reaction zones.
5. ARCA Explanation: known, uncertain, what changes view.
6. Research Notes and Journal/Workspace links.

Evidence design:
- Evidence must be verifiable. Each row should show status, source, freshness, and why it matters.
- Missing evidence should be as visible as supportive evidence.
- Use one confluence meter and one evidence stack; avoid multiple competing score visualizations.

ARCA panel design:
- Three tabs only: Known, Uncertain, What Changes View.
- Keep wording educational and conditional.
- Never present as an oracle or direct action instruction.

Public/admin split:
- Public: educational scenario packet, evidence and uncertainty.
- Admin: direct operator-grade language, raw diagnostics, private alert feed, model internals.

## 9. Dashboard / Command Center Audit
Current state:
- `/dashboard` correctly redirects to `/tools/dashboard`.
- `/tools/dashboard` is useful but not yet a true start page. It mixes tabs, cache results, movers, calendar, news, macro, crypto derivatives, and favorites.
- It answers "what is happening" partially, but not "what changed" or "what should I research first" strongly enough.

Recommended layout:
1. Market Regime Header.
2. Data Health Strip.
3. Today's Research Queue.
4. Watchlist Movement.
5. Scanner Highlights.
6. Volatility/Time Cluster Alerts.
7. ARCA Research Summary.
8. Continue Workflow.

Missing widgets:
- Freshness/provider health.
- "Changed since last login".
- Research queue from top scanner + watchlist + alerts.
- Continue last workflow card.
- Degraded data warnings.

Priority upgrades:
- Rebuild dashboard as the main start point, not a tabbed tool aggregator.
- Move Macro and Crypto Derivatives to secondary nav rather than tabs inside Dashboard.
- Make Dashboard explicitly send users to Scanner or Golden Egg.

## 10. Backtest Audit
Current state:
- Backtest has a serious engine and many assumptions/warnings, but the UI risks feeling like a control-dense lab before users understand the research question.
- It includes strategy groups, timeframes, universe scans, signal replay, inverse comparison, and journal integration.

Recommended layout:
1. Strategy setup.
2. Assumptions: data coverage, slippage, commission, fill model, sample quality.
3. Historical simulation results.
4. Risk metrics.
5. Drawdown chart.
6. Trade distribution.
7. Educational limitations.
8. Save to journal.

Risk wording:
- Avoid over-emphasizing win rate.
- Use "historical simulation", "paper result", "sample quality", "assumptions", "not predictive".
- Label all strategy outputs as educational and historical.

Charts needed:
- Equity curve with drawdown overlay.
- Drawdown depth/duration.
- Trade distribution histogram.
- Monthly return heatmap if sample size supports it.
- Assumption coverage panel.

Metrics presentation:
- Primary: sample size, max drawdown, expectancy, profit factor with caveat, average R, time in market.
- Secondary: win rate, Sharpe, CAGR.

## 11. Journal / Portfolio / Workspace Audit
Current state:
- Journal is a high-retention page and has strong architecture: KPIs, live prices, drawer, dock modules, snapshots, close modal, filters.
- Portfolio is powerful but visually and legally riskier: it includes position sizing, LONG/SHORT, close/reduce/edit-stop actions, risk heatmaps, and many dense analytics.
- Workspace should become the saved research hub, but it currently competes with Journal, Watchlists, Alerts, and Portfolio.

Recommended flow:
- Scanner result -> Golden Egg research -> Backtest scenario -> Journal note -> Workspace saved plan.
- Workspace stores saved research cases, watchlists, alerts, notes, and plan history.
- Portfolio remains separate as user-entered holdings analytics, not workflow advice.

Retention improvements:
- Add "Continue research" cards in Workspace.
- Show last reviewed symbols and incomplete journal reviews.
- Link each journal entry back to originating Scanner/Golden Egg/Backtest context.

Compliance-safe wording:
- Use Exposure, Concentration, Volatility, Drawdown, Allocation View, User-entered holdings.
- Avoid Buy, Sell, Hold, Reduce, Recommended Allocation, Buy more.
- Rename close/reduce actions to recordkeeping language where possible: Record Full Close, Record Partial Close, Edit Plan.

## 12. Graphics & Image Audit
| Location | Current Graphic | Decision | Recommended Replacement | Priority |
| --- | --- | --- | --- | --- |
| Landing hero | `/logos/landing-hero.png` terminal/product visual | replace | Real dashboard/scanner screenshot in terminal frame | high |
| Landing provider strip | NASDAQ, CoinGecko, Alpha Vantage logos | keep | Keep small, factual, non-endorsement | medium |
| Landing preview strip | CSS/HTML sample previews | refine | Keep sample labels; add real screenshot carousel above | high |
| Core scanner cards | `/assets/scanners/*.png` | refine | Use consistent screenshot or icon frame style | medium |
| Platform cards | `/assets/platform-tools/*.png` | refine | Standard 16:9 screenshot thumbnail set | high |
| ARCA section | `/logos/arcxa-chip.png` | refine | Smaller brand mark plus factual capability panel | medium |
| Options Terminal | `/assets/platform-tools/options-terminal.png` | keep/refine | Real options terminal screenshot once stable | medium |
| Golden Egg header | `/assets/scanners/golden-egg.png` | refine | Real Golden Egg evidence packet screenshot | high |
| Explorer/crypto/equity icons | PNG/SVG mix | refine | One icon system, one card ratio | medium |
| Admin pages | Emoji icons in sidebar and headings | replace | Lucide/icons or compact text glyphs for professional admin | medium |
| Portfolio calculator | Emoji labels | replace | Lucide icons or text labels | medium |
| Backtest metrics | Emoji labels | replace | Data/research icons, no playful emoji | medium |
| Signal accuracy | Emoji title | replace | Institutional title/icon | low |
| Marketing legacy pages | Mixed cards/no strong imagery | refine | Use text-first legal/resources layout | low |

## 13. Mobile Audit
| Page | Issue | Fix |
| --- | --- | --- |
| Landing | Long vertical page and multiple explanation sections | Cut duplicated sections; make screenshot preview first viewport-adjacent |
| Tools | Too many cards stacked | Use stepper plus one primary card per step; collapse advanced tools |
| Scanner | Dense table unsuitable for phone | Add `MobileSymbolCard` and sticky filter sheet |
| Golden Egg | Too many small technical panels | Use accordion layers and one summary card first |
| Dashboard | Dense tabbed dashboard with many rows | Convert to research queue cards and collapsible market widgets |
| Backtest | Many controls before context | Wizard/sectioned lab layout with assumptions panel |
| Journal | Drawer/table complexity | Compact list cards with full-screen trade drawer |
| Portfolio | Inline styles and dense analytics | Mobile-first exposure cards; hide advanced analytics behind tabs |
| Pricing | Feature matrix can become long | Add tier comparison accordion on mobile |
| Admin | Sidebar plus dense panels may overflow | Admin mobile can be limited; require tablet/desktop notice for command surfaces |

## 14. Accessibility Audit
| Page | Issue | Severity | Fix |
| --- | --- | --- | --- |
| Global | Many statuses rely on color plus tiny text | high | Add icons/text labels and minimum 12px readable text |
| Global | Mixed custom buttons/links may miss consistent aria labels | medium | Standard button/link components |
| Header | Mobile drawer has focus trap, good, but nav breadth is high | medium | Reduce nav items and group secondary tools |
| Scanner | Table text and badges are very small | high | Larger default text, card mobile layout, better row spacing |
| Golden Egg | Many 11px labels and tooltips | high | Raise label size and use accessible detail panels |
| Options Terminal | 9px/10px labels in chart/chain areas | high | Increase minimum label size and support zoom/scroll |
| Portfolio | Inline styled controls and small action buttons | high | Standard controls, 44px tap targets on mobile |
| Backtest | Dense forms and results may overwhelm screen readers | medium | Fieldsets, section headings, described-by warnings |
| Landing | Image alt text is decent, but real screenshot labels needed | medium | Add explicit screenshot/sample/real-data status |
| Admin | Emoji icons and dense diagnostics | medium | Text/icon labels, keyboard-friendly tables |

## 15. Public vs Admin Separation
Public visual direction: Calm educational research desk. Fewer panels, clearer explanations, softer labels, explicit data quality, no direct advice wording, no admin diagnostics unless translated into user-safe language.

Admin visual direction: Dense operator command center. Raw provider status, feeds, model diagnostics, risk governor state, alert streams, logs, and private decision aids. Faster, more direct, clearly internal.

Routes that need separation:
- `/admin/**` must use admin shell only and never show marketing footer/header.
- `/operator/**` should remain private/internal and noindex.
- `/tools/scalper`, `/tools/signal-accuracy`, advanced diagnostics-style pages should be hidden from broad public nav or translated into educational views.
- `/v2/**` should be removed or redirected to avoid experimental public leakage.

Components that need split behaviour:
- PageHeader: public educational vs admin command title.
- EvidenceStack: public explanation vs admin raw diagnostics.
- RiskFlagPanel: public caution language vs admin action/lockout language.
- StatusPill: public data-quality wording vs internal provider state.
- ARCAInsightPanel: public uncertainty-first vs admin operator recommendation diagnostics.

## 16. Quick Wins
1. Change top nav label from Tools to Workflow or Platform Map.
2. Replace landing hero headline/subheadline with explicit educational market intelligence wording.
3. Replace hero image with a real product screenshot or clearly labelled real UI composite.
4. Move four-step workflow higher on the landing page.
5. Collapse advanced tools on `/tools` by default.
6. Add Scanner mobile symbol cards.
7. Rename public Scanner labels: Direction -> Bias, Conf -> Alignment, Action -> Review.
8. Add Why This Rank drawer to Scanner rows.
9. Remove emoji icons from professional tool/admin surfaces.
10. Treat `/admin` as an admin/app route in chrome so no public header/footer leaks.

## 17. Bigger Rebuild Recommendations
1. Rebuild Dashboard as the true start page with research queue, data health, and continue-workflow cards.
2. Consolidate Research/Markets/Explorer/Crypto duplicate routes into fewer hubs.
3. Merge Deep Analysis into Golden Egg as tabs or evidence layers.
4. Merge Options Confluence into Options Terminal.
5. Merge Scanner Backtest into Backtest Lab.
6. Build a screenshot-based graphics system using real product UI in consistent frames.
7. Create a formal MSP design system package with tokens and components.
8. Create public/admin variants for wording and density.
9. Add end-to-end mobile QA for Scanner, Golden Egg, Backtest, Journal, Portfolio, Pricing.
10. Build a self-learning playbook layer only after enough labeled outcomes exist; do not fake calibration.

## 18. Exact Implementation Plan

### Phase 1 - Trust and Clarity
- Update landing hero copy and CTA labels.
- Add real screenshot slot and sample/real-data labeling rules.
- Standardise EducationalDisclaimer and FooterDisclaimer.
- Patch route chrome so `/admin` uses admin separation.
- Add tier wording block explaining Free, Pro, Pro Trader value.

### Phase 2 - Layout and Flow
- Rename Tools to Workflow/Platform Map in nav.
- Rework `/tools` into stepper plus primary tool cards.
- Rebuild `/tools/dashboard` as the daily start page.
- Add continue-workflow cards linking Scanner -> Golden Egg -> Backtest -> Journal -> Workspace.
- Hide or collapse advanced/specialist routes from primary navigation.

### Phase 3 - Graphics and Screenshots
- Capture real screenshots for Dashboard, Scanner, Golden Egg, Backtest, Journal, Options Terminal.
- Replace generic/stylized PNG hero imagery with screenshot frames.
- Standardise card thumbnails at 16:9 or 4:3.
- Replace emoji icons in public app/admin with one icon system.
- Keep provider logos small and factual.

### Phase 4 - Mobile and Accessibility
- Build `MobileSymbolCard` for Scanner.
- Add mobile filter sheet for Scanner controls.
- Increase minimum label size on dense trading pages.
- Standardise EmptyState, ErrorState, and LoadingSkeleton.
- Add visual regression screenshots for mobile and desktop.

### Phase 5 - Admin Command Center
- Confirm `/admin/**` chrome separation.
- Standardise AdminShell, AdminSidebar, AdminTopBar, AdminStatusBar.
- Make Morning Brief the operator default.
- Add admin-only banner/internal mode indicator.
- Group admin nav: Terminal, System, Business, Learning/Models.

## 19. Final Verdict
- Does the platform feel premium enough? Almost, but not consistently. The best surfaces feel close to an institutional research desk; older/duplicated pages and generic graphics pull it back to "tool collection".
- Does the flow make sense? The intended flow makes sense, but it is not enforced strongly enough in navigation or dashboard onboarding.
- Do the graphics help or hurt trust? Mixed. Provider logos and labelled sample previews help. Generic or stylized product imagery hurts trust compared with real screenshots.
- Which pages should be rebuilt first? Dashboard first, then Tools/Workflow, then Scanner mobile/results, then Golden Egg flagship polish, then Portfolio wording/layout.
- What is the best path to an elite outcome? Make Dashboard the morning research command start, make Tools a guided workflow map, use real screenshots, standardise the design system, collapse duplicate routes, and keep public language educational while reserving direct operator language for admin-only surfaces.

Screenshots needed now? Not to start implementation. Yes for the final visual pass. The best screenshot set would be desktop and mobile for: landing, `/tools`, `/tools/dashboard`, `/tools/scanner`, `/tools/golden-egg`, `/tools/backtest`, `/tools/journal`, `/tools/workspace`, `/tools/portfolio`, `/pricing`, `/admin`, `/admin/morning-brief`, and `/admin/operator-terminal`.