# Public AI endpoint audit: old trading-advice behaviour

Date: 2026-10-08 · Base: `research-page-phase4` @ `717bfdb` · Scope: read-only; no endpoint changed.

Purpose: find public (non-`/api/admin`) routes that still generate or return trade advice (entries, stops,
targets, sizing, direction calls, strategy picks), list who calls them, and list admin/private dependencies on
the modules they share, so the changes can be made without overlapping Codex's MSP Copilot work.

Severity: **High** = live caller or reachable route that emits trade levels/sizing/direction or a security gap;
**Medium** = reachable but uncalled route with advice output, or a live route with contradictory instructions;
**Low** = wording only, or already compliant.

## 1. Inventory

| # | Route | Access | Model | Live callers | Advice behaviour | Severity | Proposed change |
|---|---|---|---|---|---|---|---|
| A | `/api/msp-analyst` | Signed in; Free 10/day, Pro 50/day | OpenAI | None in app | Injects `buildV3EnginePrompt` (`TRADE_CONSTRUCTION_PROMPT`: Entry, Stop, Target 1/2, R:R ≥ 1.5, "Size Context: % of capital"); `mspAnalystV2` options lines ("Sell premium", "Buy options") and FINAL VERDICT ALIGNED/CONDITIONAL; `scannerExplainerRules` "Long bias ONLY / Short bias ONLY"; personal adaptive profile, performance throttle | **High** (reachable, uncalled) | Retire, or 410 once Copilot replaces it. Do not edit shared prompts until Codex confirms (§3) |
| B | `/api/ai/copilot` | Codex-owned | OpenAI | Copilot UI | Imports `buildV3EnginePrompt` and `MSP_ANALYST_V2`; handles `generate_trade_plan` tool | **Coordinate** | Codex: no change from Claude |
| D | `/api/journal/analyze` | Signed in, AI limits | OpenAI | None | System prompt descriptive, but user message asks "What mistakes or losing patterns should be avoided?" and "Specific, actionable recommendations to improve" | Medium | Rewrite user message to descriptive pattern review (sample size, period) |
| E | `/api/portfolio/analyze` | Pro | OpenAI | `app/tools/portfolio/page.tsx:700` | Descriptive, forbidden-word guard, required footer | Low (compliant) | None |
| F1 | `/api/market-focus/generate` | Pro | OpenAI | None | Score → "Bullish continuation conditions" / "Bearish-Leaning" / "Risk-off" stance | Medium | Retire or make descriptive |
| F2 | `/api/jobs/generate-market-focus` | Cron (`0 21 * * *`) | OpenAI | Worker schedule | "Bullish Phase / Bearish Phase" language written to storage | Medium | Check consumers of stored output; descriptive phase labels |
| F3 | `/api/ai-market-focus` | Pro | OpenAI | `components/DailyAIMarketFocus.tsx` (not mounted) | Reads F2 output | Low (dead UI) | Retired (410 after Pro check); dead component deleted |
| G | `/api/ai/analyst-context` | Signed in | OpenAI | `lib/ai/useAnalystContext.ts` (imported by nothing) | "Position sizing context", Sizing, performance-throttle `governorRecommendation` | Medium | Retire with the dead hook |
| H1 | `/api/ai/explain` | Signed in | OpenAI | None | "one actionable insight" | Medium | Retire or descriptive wording |
| H2 | `/api/ai/suggest` | Signed in | OpenAI | None | "Next Best Actions"; adaptive layer; `lib/ai/tools.ts` | Medium | Retired (410 after sign-in check) |
| I1 | `GET /api/ai-scanner/alerts` | **Unauthenticated** | — | External Streamlit `app.py` (per comments) | Lists stored TradingView alerts (side LONG/SHORT, price, features); `limit` unbounded | **High (security)** | Require auth (admin or shared secret), cap `limit` |
| I2 | `POST /api/ai-scanner/test` | **Unauthenticated** | — | None | Injects the server's own webhook secret and inserts a fake LONG BTC alert | **High (security)** | Admin-only or delete |
| I3 | `/api/ai-scanner/alert`, `/status` | Secret-gated / harmless | — | TradingView webhook | — | Low | None |
| J | `/api/ai-signals` | Pro | — | None | POST writes entry/stop/target1/target2/verdict to `ai_signal_log` | Medium | Retired (410 after Pro check) |
| K | `/api/trade-proposal` | Pro | — | None | Sized order, recommended leverage, `governor_max_position_size`, `executable` flag; 500 leaks `err.message` in `detail` | **High** (reachable sizing + leak) | Retired (410 after Pro check) |
| L | `/api/execute-trade` | Signed in only (no paid check) | — | None | LIVE refused; PAPER writes journal; DRY_RUN default. No broker code in `lib/execution` | Medium | Retired (410 after sign-in check) |
| M | `/api/confluence-scan` | Pro | GPT-4o (`full` mode) | `hierarchical`: `components/time/TimeScannerPage.tsx:426`; `calendar`: `CloseCalendar.tsx:116`, `TimeGravityMapWidget.tsx:905`, `app/v2/_lib/api.ts:786` | POST default `mode='forecast'`; GET default `'full'` → `confluenceAgent.scan` asks GPT-4o for "specific levels and risk parameters", parses target, stop, confidence %, pattern win rate. **Live:** TimeScannerPage maps `sd.tradeSetup` to entry/stopLoss/takeProfit/riskReward/riskPct/rewardPct (lines 455–521) and `bestEntryWindow` (342–343) | **High** (live UI shows levels) | Restrict public modes to `hierarchical`/`calendar`; strip `tradeSetup`/`bestEntryWindow` in a public serializer; drop TimeScanner level rows |
| N | `/api/research-case` | Signed in | — | `lib/clientResearchCases.ts` | Built from capital-flow `probability_matrix` (continuation/pin/expansion probabilities) | Medium | Public contract without probabilities (as done for DVE) |
| O1 | `/api/news-sentiment` | Per route | gpt-4o-mini | `app/v2/_lib/api.ts:558`, `app/tools/news/page.tsx:470`, `components/NewsSentiment.tsx`, `components/CryptoNewsWidget.tsx` | `NEWS_BRIEF_SYSTEM_PROMPT` descriptive-only, `stripAdviceSentences` guard, label | Low (compliant) | None |
| O2 | `/api/earnings-calendar` | Per route | OpenAI | `app/tools/news/page.tsx` | "You are a financial analyst… beats vs misses": descriptive, but no advice guard or AI label | Low | Reuse `stripAdviceSentences` + label |
| O3 | `/api/deep-analysis` | — | — | — | W3-compliant (#492) | Done | None |
| P | `/api/ai/actions` | Per ACT (#488, #491) | — | ACT | Tool cases `generate_trade_plan` (≈l.464) and `risk_position_size` (≈l.467) still dispatchable | Medium | Remove both tools from the public tool list (see §3, shared with Copilot) |

## 2. Shared modules and admin dependencies

Admin AI routes (`app/api/admin/{arca, daily-brief, earnings-analyzer, equity-research, macro-outlook,
options-architect, quant-screener, risk-assessment, sector-rotation, growth/generate, marketing}`) import **none** of
the public prompt modules below. Only `components/admin/*` call `/api/admin/*`. Admin is therefore unaffected by
changes to the public prompt layer, with two exceptions marked ⚠.

| Module | Importers | Admin/private dependency |
|---|---|---|
| `lib/prompts/mspAnalystV2`, `arcaV3Engine`, `publicAiSafety` | copilot, msp-analyst | None. **Copilot depends on it** |
| `lib/prompts/scannerExplainerRules`, `platformKnowledge`, `outputValidator`, `dataFreshness` | public AI routes | None |
| `lib/ai/performanceThrottle`, `sessionPhase`, `intelligenceContext` | public AI routes | None |
| `lib/ai/regimeScoring` | msp-analyst | ⚠ `lib/operator/regime-engine.ts` (private) — do not change its outputs |
| `lib/institutionalFilter` | msp-analyst, public scanner routes | ⚠ `lib/quant/discoveryEngine.ts` (admin quant) — do not change its outputs |
| `lib/adaptiveTrader` | msp-analyst, ai/suggest, options-scan, scanner run/bulk, adaptive/profile | None (public-only) |
| `lib/ai/tools.ts` (`generate_trade_plan`, `risk_position_size`) | ai/actions, ai/suggest, copilot | None. **Copilot depends on it** |

Changes should be made in the public serializer/prompt layer (as for DVE and Options), not in `regimeScoring` or
`institutionalFilter`.

## 3. Coordination with Codex (MSP Copilot)

Codex branch `codex/public-copilot-education` @ `2cd1cf3f`. Claude will not edit these; flagged for Codex:

1. `app/api/ai/copilot` imports `buildV3EnginePrompt` → `TRADE_CONSTRUCTION_PROMPT` (Entry/Stop/Targets/R:R/Size).
   Educational Copilot should not include it.
2. It imports `MSP_ANALYST_V2` (options strategy lines, ALIGNED/CONDITIONAL verdict).
3. It handles the `generate_trade_plan` tool (copilot ≈l.612) from `lib/ai/tools.ts`.

Proposed sequencing: Codex removes these from Copilot first. After that, `arcaV3Engine`'s trade-construction block,
`mspAnalystV2` options lines and the two tools in `lib/ai/tools.ts` have no remaining required consumers and can be
deleted together with `/api/msp-analyst` and `/api/ai/suggest` in one Claude PR.

## 4. Suggested order of work

1. Security: I1, I2 (auth + limit), K generic 500.
2. Live UI: M (`confluence-scan` public serializer; TimeScanner level rows).
3. Uncalled advice routes: retire A, G, H1, H2, J, K, F1/F3 (after confirming no external consumers in logs).
4. Wording: D, F2, O2, N.
5. After Codex's Copilot lands: shared prompt/tool deletions (§3).

## 5. Status (2026-10-08)

- I1/I2: fixed in the ai-scanner auth PR.
- M: fixed in the Time Confluence evidence PR.
- H2, J, K, L, F3: retired (410 after the existing access check).
- Not retired yet, by design: A `msp-analyst`, G `ai/analyst-context`, H1 `ai/explain` (Codex is adding the public
  AI quota to these on `codex/public-copilot-education`), and F1 `market-focus/generate` (accepts `ADMIN_API_KEY`, so
  an external scheduler may call it; confirm before retiring).
