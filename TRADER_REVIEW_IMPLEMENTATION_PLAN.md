# Trader Review — Implementation Plan

**Governing constraint:** MarketScanner Pros is an **educational market-analysis & research platform**. Every change below makes the *analysis more sophisticated* while presenting it as **market intelligence / research / education** — never as personalised buy/sell/hold instructions. Composite scores are never presented as statistical probabilities. Delayed/estimated/derived/stale data is always labelled as such.

This plan maps each finding from the professional-trader review to an action, then defines the staged build. **No production functionality is removed.** Route consolidation uses redirects. Payments/Stripe/auth/URLs/mobile/deploy are preserved.

---

## A. Existing foundations we build ON (do NOT duplicate)

| Capability | Where it already lives | How we use it |
|---|---|---|
| Unified regime classification | `lib/regime-classifier.ts` (`classifyRegime`, `UnifiedRegime`) | Source of truth for regime; new context reads it, never recomputes. |
| Global regime React context | `lib/useRegime.tsx` (`RegimeProvider`/`useRegime` → `/api/regime`) | The platform-wide regime channel; extended, not replaced. |
| Scoring regime taxonomy | `lib/ai/regimeScoring.ts` | Reused for regime-aware interpretation. |
| Shared vocabulary | `app/v2/_lib/types.ts` (`Bias`, `VolRegime`, `RegimePriority`) | New analysis types import/align with these. |
| Data freshness / provider status | `lib/scanner/providerStatus.ts` (`MarketDataProviderStatus`) | Evidence-quality layer consumes this. |
| Evidence-quality scoring (admin) | ARCA / quant surfaces (`evidenceQualityScore`) | Public evidence-quality helper mirrors the concept for user surfaces. |

---

## B. Finding → Action mapping

| # | Trader-review finding | Action | Why |
|---|---|---|---|
| 1 | No single "command screen"; must click across tools | **IMPROVE** (Stage 2: Command Center) | Largest UX gap; consolidates existing data, adds no new data source. |
| 2 | Regime only affects scanner scoring, not platform-wide | **IMPROVE** (Stage 1 context + Stage 3 interpretation) | Regime is a real strength; make it global *context*, not a siloed score. |
| 3 | Scores look like probabilities but aren't | **IMPROVE** (Stage 1 terminology + Stage 3 UI) | Core credibility fix; relabel composite scores, never imply probability. |
| 4 | Correlated indicators inflate "confluence" | **IMPROVE** (Stage 1 factor groups + Stage 3) | Count independent factor *groups*, not indicators. |
| 5 | Freshness only per-row; evidence quality not surfaced everywhere | **IMPROVE** (Stage 1 evidence-quality helper) | Extend existing freshness into a first-class evidence-quality object. |
| 6 | Movers show what already ran (late) | **IMPROVE** (Stage 4: Building/Early engine) | Adds the "what's starting" layer; keeps existing Movers. |
| 7 | Golden Egg says "bullish", not why / no invalidation / no scenario | **IMPROVE** (Stage 5: educational scenario analysis) | Deepen as education; add invalidation + alternative scenario, not trade calls. |
| 8 | Crypto derivatives shown as raw numbers | **IMPROVE** (Stage 6: leverage/participation state) | Fuse price/OI/funding/liq/vol into an interpretable *state*. |
| 9 | Research disconnected from tools | **IMPROVE** (Stage 7: contextual links) | macro→sector→asset→analysis education. |
| 10 | Workspace underused | **IMPROVE** (Stage 7) | Personal research workspace (watchlists/notes/catalysts/saved analysis). |
| 11 | Workflow directs between tools, not through a decision | **IMPROVE** (Stage 7) | Educational decision framework ending in "analysis complete", not "signal". |
| 12 | Cross-asset relationships not surfaced | **IMPROVE, minimal** (Stage 6/7: BTC↔Nasdaq, DXY↔risk, VIX-regime only) | High-value few, honestly framed (association not causation). |
| 13 | Equities lack breadth/internals | **IMPROVE where data allows; otherwise LABEL the limitation** (Stage 7) | Never fake real-time; disclose data cadence. |
| 14 | Overlapping routes/names (Movers=Gainers/Losers, Deep Analysis=Golden Egg, Command Hub vs Dashboard) | **CONSOLIDATE** (Stage 8: redirects, nav) | Reduce duplicate pathways without removing capability. |
| 15 | Time Scanner / Time Gravity | **DEMOTE, do not delete** | One reviewer's preference ≠ no value; move lower in hierarchy, label specialist. |
| 16 | Liquidity Sweep | **DEMOTE, do not delete** | Same rationale; label as specialist/experimental. |
| 17 | Duplicate heatmaps (×5) | **CONSOLIDATE later** (post-Stage 8, analytics-guided) | Real duplication, but not urgent; needs care. |
| 18 | Personality/adaptive cards | **DEMOTE** | Gamification; keep but de-prioritise in hierarchy. |
| 19 | "Signal Accuracy" could manufacture confidence | **IMPROVE / GATE** (Stage 3) | Only show when sample is statistically honest; else label INSUFFICIENT. |
| 20 | Add more indicators / DOM / social / execution | **DO NOT IMPLEMENT** | Out of scope; bloat; contradicts educational + no-execution positioning. |

---

## C. Educational-language standard (applies to all stages)

- **Allowed:** "analysis indicates", "current evidence suggests", "conditions consistent with", "historically associated with", bullish/bearish/mixed **evidence**, "relative strength", "compression/expansion", "thesis", "structural level", "thesis invalidation", "evidence quality", "insufficient evidence", "low-conviction environment".
- **Forbidden on user surfaces:** "buy", "sell", "enter/exit now", "take this trade", "guaranteed", "will rise/fall", "sure thing", "can't lose", and any "X% probability" unless a probability has been *statistically calibrated and validated* (none currently are).
- **Composite scores** render as e.g. **"Composite Strength 78 / 100"** with an explicit "not a probability" affordance — never "78% likely".
- **Data honesty:** delayed/estimated/derived/stale/partial/modelled data is always labelled. Correlation is never stated as causation.

---

## D. Staged build (test after every stage: `tsc --noEmit`, `vitest run`, and — for UI stages — build + mobile + missing/stale-data states)

- **Stage 1 — Shared analytical foundations (done):** pure, tested `lib/analysis/` modules — factor groups + analytical confluence, evidence quality, and educational terminology / composite-score framing. Nothing else imports them yet → zero regression risk. Encodes the probability-honest standard as code.
- **Stage 2 — 30-Second Command Center (done):** `/tools/command-center` consolidates existing regime + risk tone + strength/weakness + crypto participation + risk/event clock + areas-deserving-research + an evidence-quality footer, driven by the tested `lib/analysis/commandCenter.ts` helper. Legacy `command-hub` key now routes here (catalog + redirect).
- **Stage 3 — Confluence/scoring transparency (done):** `lib/analysis/goldenEggConfluence.ts` maps Golden Egg's per-domain verdicts into independent factor groups; `components/analysis/ConfluencePanel.tsx` renders composite strength (never a probability, with a `ScoreTypeBadge` truth label), the independent-factor breakdown, and evidence quality. Integrated into Golden Egg as an "Analytical Confluence" section. Correlated indicators can no longer masquerade as independent evidence.
- **Stage 4 — Building/Early engine (done):** `lib/analysis/buildingEngine.ts` classifies developing activity into DORMANT/BUILDING/EXPANDING/EXTENDED/FADING from grouped evidence (participation, price, volatility, momentum/strength), with a probability-honest strength score and honest evidence-quality degradation for missing layers. `components/analysis/BuildingInterestPanel.tsx` renders it; wired into the Command Center's “Areas Deserving Further Research” using cohort-relative volume from the movers already fetched (labelled as a proxy).
- **Stage 5 — Golden Egg educational scenario analysis (done):** `lib/analysis/scenarioAnalysis.ts` builds why-interesting, supporting vs contradicting evidence, a primary conditional scenario, an explicit alternative scenario, the “Structural invalidation level” (never “stop”), reference/reaction zones (never “target”), and hypothetical-only R framing. `components/analysis/ScenarioAnalysisPanel.tsx` renders it; integrated into Golden Egg as a “Scenario Analysis” section, reusing the Stage 3 confluence for supporting/contradicting factors.
- **Stage 6 — Crypto leverage state + cross-asset (done):** `lib/analysis/leverageState.ts` fuses price/OI/funding/liquidations/volatility into one educational state (healthy participation, leverage building, crowded long/short, short-covering, long-liquidation, deleveraging, compression/expansion, mixed). `lib/analysis/crossAsset.ts` describes a small set of relationships (association, not causation) + a volatility-regime band. `LeverageStatePanel`/`CrossAssetPanel` render them; both wired into the Command Center (BTC leverage via the derivatives hook; a crypto-cap ↔ equity-breadth driver from available data).
- **Stage 7 — Research ↔ Workspace ↔ Workflow connection** (contextual education, decision framework).
- **Stage 8 — Navigation consolidation** (redirects; COMMAND CENTER / MARKETS / SCANNER / GOLDEN EGG / CRYPTO / RESEARCH / WORKSPACE / TOOLS mental model).

---

## E. Explicitly NOT doing
- No personalised buy/sell/hold recommendations or execution.
- No deletion of Time Scanner / Time Gravity / Liquidity Sweep / heatmaps in this plan (demote/consolidate only).
- No new raw indicators, DOM, social, or copy-trading.
- No presenting delayed data as real-time or composite scores as probabilities.
- No major dependency upgrades or architecture rebuild.

---

*Status: Stages 1–6 implemented and tested (`tsc --noEmit` clean, 58 analysis tests green). Subsequent stages follow, each independently tested.*
