# Phase 4 — Anti-Bias Audit (MSP Learning Engine)

> Date: 2026-05-05. Scope: every Learning Engine surface inventoried in [LEARNING_ENGINE_PHASE1_INVENTORY.md](LEARNING_ENGINE_PHASE1_INVENTORY.md).
>
> Methodology: read each subsystem against the six bias categories below, then either FIX inline or assign disposition.
>
> Disposition codes:
> - `FIXED` — change shipped in this audit pass
> - `LAUNCH_BLOCKER` — must be fixed before public launch
> - `POST_LAUNCH` — meaningful improvement, schedule for next iteration
> - `ACCEPTED` — risk acknowledged and either guarded structurally or judged tolerable for current scope
> - `FALSE_ALARM` — investigated and not actually a bug

Severity: 🔴 critical · 🟡 medium · 🟢 hygiene

---

## 1. LOOK-AHEAD BIAS

| # | Finding | Where | Severity | Disposition |
|---|---|---|---|---|
| 1.1 | **Outcome labeller matched journal/portfolio entries placed BEFORE the signal** — `ABS(EXTRACT(EPOCH FROM (entry_date − signal_at))) ≤ 3600` accepted entries up to 1 hour pre-signal as fulfillment. Classic look-ahead bias because the labeller "found" trades that pre-existed the prediction. | [lib/signals/outcomeLabeler.ts](lib/signals/outcomeLabeler.ts) | 🔴 | **FIXED** — replaced ABS-window with `entry_date >= signal_at AND entry_date <= signal_at + 60min AND close_date >= signal_at`. Same fix applied to portfolio_closed branch. |
| 1.2 | **Outcome enrichment uses live indicators** — risk that closed-trade enrichment recomputes regime/RSI/ADX from current bars, not entry-phase snapshot. | [lib/intelligence/ingestOutcome.ts](lib/intelligence/ingestOutcome.ts) | 🔴 → 🟢 | **FALSE_ALARM** — verified: module reads from `journal_trade_snapshots` (frozen entry payload). Header comment confirms this and the SELECT proves it. No live recompute. |
| 1.3 | **Brain layer outcome labeller — pure function** must filter bars to `ts > as_of_ts` only, no equality. | [lib/brain/outcomeLabeller.ts](lib/brain/outcomeLabeller.ts) | 🔴 | **FIXED** at construction — Phase 2 implementation enforces strictly `b.ts.getTime() > asOfMs`. DB also enforces via `CHECK (data_through_ts > as_of_ts)`. |
| 1.4 | **Daily/weekly/monthly close clusters used before close occurs** — `time-confluence.ts` and friends should never mark a "monthly close cluster" until the actual monthly bar is sealed. | [lib/time-confluence.ts](lib/time-confluence.ts) (and consumers) | 🟡 | **POST_LAUNCH** — add explicit `bar_sealed: boolean` to every time-confluence record so consumers know not to count an in-progress bar as "closed". |
| 1.5 | **Earnings/news calendar leakage** — feature engines treating future earnings as "known" is fine for *risk* (we know the date), but using post-event price reaction as a feature would be leakage. | `lib/engines/earningsRisk.ts`, `lib/catalyst/*` | 🟡 | **POST_LAUNCH** — add unit test asserting catalyst-event features computed at as_of_ts contain only `event.scheduled_at` and never `event.actual_outcome`/`event.post_reaction`. |
| 1.6 | **"Confirmed breakout state" computed before confirmation** — risk that scanner scoring marks a candidate `breakout.confirmed=true` from the same bar that the breakout occurred in. | `lib/engines/setupClassifier.ts`, scanner pipeline | 🟡 | **POST_LAUNCH** — add `confirmation_bar_index >= signal_bar_index + 1` invariant to setup classifier; assert in test. |
| 1.7 | **Backtest engine** must never read the close of bar `i` before the open of bar `i` for entries, or future highs/lows for stops. | [lib/backtest/runStrategy.ts](lib/backtest/runStrategy.ts), [lib/backtest/engine.ts](lib/backtest/engine.ts) | 🟡 | **POST_LAUNCH** — add a regression harness: shuffle future bars; results must not change. (Standard look-ahead detection technique.) |

---

## 2. SURVIVORSHIP BIAS

| # | Finding | Where | Severity | Disposition |
|---|---|---|---|---|
| 2.1 | **Universe selector uses hardcoded current-day leaders** — `EQUITY_CORE = {AAPL, MSFT, GOOGL, ...}` and `EQUITY_UNIVERSE`/`CRYPTO_UNIVERSE` are static present-day sets. Any historical replay or backtest that uses this universe sees only symbols that *survived to today*. | [lib/quant/universeSelector.ts](lib/quant/universeSelector.ts), `lib/quant/discoveryEngine.ts` | 🔴 | **LAUNCH_BLOCKER for backtests / POST_LAUNCH for live scans.** Live scanning of "today's mega-caps" is fine; backtest/replay must use point-in-time membership. Action: add `selectUniverse(regime, asOf?: Date)` that, when `asOf` is passed, reads from a `symbol_universe_snapshots` table (to be created). Document this gap on the public Backtest Lab tooltip until shipped. |
| 2.2 | **Failed/delisted symbols dropped from `signals_fired`** — when a symbol is delisted, its signals stay but its outcome can no longer be labelled. Survivorship via attrition. | `signals_fired`, [lib/signals/outcomeLabeler.ts](lib/signals/outcomeLabeler.ts) | 🟡 | **ACCEPTED with mitigation** — labeller now logs `insufficient_data` for unresolvable signals (Brain L3 enforces this taxonomy). Edge scorer treats `insufficient_data` as neither win nor loss → no survivorship inflation. |
| 2.3 | **Only successful alerts stored** — concern: `alerts.fired_at` only records firings; failed/skipped alerts not captured. | `lib/alerts/*` | 🟡 | **POST_LAUNCH** — Brain L1 event types `alert.fired` AND `alert.failed` are defined. Wiring step is in Phase 5. |
| 2.4 | **Failed scans discarded** — Phase 1 inventory showed `scanner_results_cache` keeps the last successful scan; failed pipeline runs are not preserved. | `lib/scanner/*`, `lib/quant/orchestrator.ts` | 🟢 | **POST_LAUNCH** — record `provider.failed` / `provider.degraded` Brain events. |
| 2.5 | **`admin_research_cases` saved by operator** — the operator only saves research s/he found interesting. Pure selection event; learning *off this set alone* would be biased. | [lib/engines/journalLearning.ts](lib/engines/journalLearning.ts) | 🟢 | **ACCEPTED** — engine doc-comment already states "research patterns over saved research cases" and is a *pattern-matcher*, not a population-level learner. Boundary intact. |

---

## 3. SELECTION BIAS

| # | Finding | Where | Severity | Disposition |
|---|---|---|---|---|
| 3.1 | **Edge profile only learns from journaled trades** — users who don't journal contribute nothing; users who journal selectively (only winners or only losers) skew their own profile. | [lib/intelligence/edgeProfile.ts](lib/intelligence/edgeProfile.ts), [lib/intelligence/ingestOutcome.ts](lib/intelligence/ingestOutcome.ts) | 🟡 | **ACCEPTED + UI mitigation** — edge profile is a *personal* tool by design; it makes no global claim. Action: add a "journal completeness %" badge to the EdgeInsightCards so the user sees their own selection bias. **POST_LAUNCH**. |
| 3.2 | **Ignored scanner results excluded** — only signals that fire are recorded into `signals_fired`; the dog that didn't bark (filter rejection) is invisible. | `lib/signalRecorder.ts`, `lib/scanner/scoring.ts` | 🟡 | **POST_LAUNCH** — Brain L1 will record `scanner.result_generated` for all evaluated candidates with `published: boolean`, so the rejection rate is observable. |
| 3.3 | **Admin-only research candidates handled differently** — `lib/admin/signal-recorder.ts` writes with `WORKSPACE_ID = "operator-terminal"` constant. If any per-workspace edge-profile query forgets to exclude this workspace_id, admin signals contaminate user edge profiles. | [lib/admin/signal-recorder.ts](lib/admin/signal-recorder.ts) | 🟡 | **LAUNCH_BLOCKER** — add a hard filter in `edgeProfile.ts` and any other per-workspace aggregator: `WHERE workspace_id NOT IN ('operator-terminal')`. (Will ship in Phase 5 wiring.) |
| 3.4 | **Learning off favourites/watchlists only** — risk that `useUserMemory` or adaptive trader weights are computed only on saved/favourited symbols. | [lib/ai/useUserMemory.ts](lib/ai/useUserMemory.ts), [lib/adaptiveTrader.ts](lib/adaptiveTrader.ts) | 🟢 | **POST_LAUNCH** — audit query origins; if confirmed, broaden to all interacted symbols and tag samples with `interaction_type` for transparency. |

---

## 4. OVERFITTING

| # | Finding | Where | Severity | Disposition |
|---|---|---|---|---|
| 4.1 | **No walk-forward / out-of-sample harness exists** — codebase has zero references to walk-forward, holdout, in_sample evaluation. Brain L4 exposes a `walkForwardRatio` parameter but nothing computes it. | repo-wide | 🔴 | **POST_LAUNCH (high priority)** — implement: (a) hold out last 60d frozen, (b) compute in-sample vs out-of-sample win-rate per setup_key, (c) feed ratio into `OverfittingInputs.walkForwardRatio`. Until shipped, treat any "elite" tier with caution and label tooltips accordingly. |
| 4.2 | **Filter stacking is implicit** — strategies under `lib/strategies/*` and `lib/scanner/*` can stack arbitrary filters; no count of "stacked filters" is exported into the scoring layer. | `lib/strategies/*` | 🟡 | **POST_LAUNCH** — strategy registry should expose `filterCount` so `OverfittingInputs.filterStackCount` can populate. |
| 4.3 | **Single-regime overfitting risk** — adaptive trader weights are computed across all available history regardless of regime mix. | [lib/adaptiveTrader.ts](lib/adaptiveTrader.ts), [lib/ai/regimeScoring.ts](lib/ai/regimeScoring.ts) | 🟡 | **POST_LAUNCH** — require per-regime sample sizes ≥ N before per-regime weight updates; reject regime-specific learning if only one regime is represented. (Operator engine already enforces `MIN_LEARNING_SAMPLE=30` globally — extend to per-regime.) |
| 4.4 | **Engine optimised to old market conditions** — `DEFAULT_LOOKBACK_DAYS = null` (all-time) in `edgeProfile.ts` blends 2023 regime bars with current. | [lib/intelligence/edgeProfile.ts](lib/intelligence/edgeProfile.ts) | 🟡 | **POST_LAUNCH** — change default to 365d rolling window; expose `?lookback=` parameter (already exists). Document tradeoff. |
| 4.5 | **Hand-tuned weights without validation** — `BASELINE_WEIGHTS` in `app/api/evolution/route.ts` (`regimeFit: 0.25`, `capitalFlow: 0.2`, `structureQuality: 0.2`, …) — magic numbers with no validation suite. | [app/api/evolution/route.ts](app/api/evolution/route.ts) | 🟡 | **POST_LAUNCH** — add a baseline backtest per release that re-derives weights from the last 90d edge scorer output and asserts hand-set weights are within ±20% of derived. |
| 4.6 | **Brain L4 has overfitting penalty already** — `overfittingPenaltyMultiplier()` penalises single-axis specialisation, filter stacking >5, dimension >3, and walk-forward degradation. | [lib/brain/finalEdgeScore.ts](lib/brain/finalEdgeScore.ts) | — | **FIXED at construction.** |
| 4.7 | **DVE projection min sample = 5** — too small to publish a confident projection. | [lib/directionalVolatilityEngine.constants.ts](lib/directionalVolatilityEngine.constants.ts) | 🟡 | **POST_LAUNCH** — raise to 20 minimum, with a "thin sample" badge. |

---

## 5. DATA LEAKAGE

| # | Finding | Where | Severity | Disposition |
|---|---|---|---|---|
| 5.1 | **ARCA receives outcome labels not yet known at as_of_ts** — risk that the AI prompt builder injects the *latest* outcome instead of the entry-time outcome. | [lib/ai/intelligenceContext.ts](lib/ai/intelligenceContext.ts), [lib/intelligence/edgeContextBuilder.ts](lib/intelligence/edgeContextBuilder.ts) | 🔴 | **POST_LAUNCH (audit)** — add unit test: build context for a setup with `as_of_ts = T`, mutate trade outcome at `T+1d`; assert context payload identical. If test fails, the prompt is leaking. |
| 5.2 | **Public AI sees admin-only research** — Brain L1 enforces XOR via `CHECK (NOT (admin_only AND public_safe))`. But existing AI routes (`/api/msp-analyst`) need an audit. | `app/api/msp-analyst/route.ts`, `lib/prompts/*` | 🔴 | **LAUNCH_BLOCKER** — add a runtime guard: any payload from `lib/admin/*`, `lib/operator/*`, `lib/quant/*` flowing into a non-admin AI route throws. Implement as `assertNotAdminPayload()` helper called by route guards. |
| 5.3 | **Admin research uses private portfolio data unintentionally** — admin research packets are operator-only and may legitimately use operator-portfolio context, but workspace_id mixing must be impossible. | [lib/admin/getAdminResearchPacket.ts](lib/admin/getAdminResearchPacket.ts) | 🟡 | **POST_LAUNCH (audit)** — confirm admin research only ever queries `workspace_id = 'operator-terminal'` (or explicit operator workspace). Add lint rule: any `q(...)` call inside `lib/admin/*` without `workspace_id` filter is an error. |
| 5.4 | **Backtest shares future data into feature generation** — backtest must compute features per bar using only bars `≤ i` and never the precomputed indicators series for the full range. | [lib/backtest/runStrategy.ts](lib/backtest/runStrategy.ts), `lib/backtest/strategyExecutors.ts` | 🟡 | **POST_LAUNCH** — TA library functions (`calculateEMA`, `calculateRSI`, …) compute on a full series. Verify executor only consumes values at index `≤ i` per-bar. Add a "shuffle future" property test. |
| 5.5 | **`user_memory` blob piped verbatim into LLM** — could carry admin scoring fields if cross-write ever exists. | [lib/ai/useUserMemory.ts](lib/ai/useUserMemory.ts), `lib/ai/context.ts` | 🟡 | **POST_LAUNCH** — add deny-list filter for keys: `opportunity_score`, `evidence_quality_score`, `personal_exposure`, `admin_*`, `operator_*` before passing to LLM. |

---

## 6. FALSE PRECISION

| # | Finding | Where | Severity | Disposition |
|---|---|---|---|---|
| 6.1 | **Scores displayed with too many decimals in admin surfaces** — `accuracy_pct ROUND(...,2)` is fine; but UI components occasionally render `(value*100).toFixed(2)` for sample-size-of-7 stats. | `components/admin/AdminScoreCard.tsx`, `components/admin/AdminResearchScoreBreakdown.tsx`, `components/admin/terminal/ConfidenceCard.tsx` | 🟡 | **POST_LAUNCH** — wrap every published edge percentage in a helper that drops to 1 decimal place when `sample_size < 50` and to whole-percent when `< 20`. |
| 6.2 | **UI implies certainty** — any string like "Edge: 76%" with N=8 is misleading. | shared UI | 🟡 | **POST_LAUNCH** — render with `confidence_label` chip (low/med/high) directly adjacent to any percentage; if `tier === 'insufficient_sample'`, show "**Insufficient sample (N=8)**" instead of a percent. Brain L4 already produces these fields. |
| 6.3 | **AI says "high confidence" when sample size is tiny** — risk that prompt templates inherit `confidence: 0.78` and emit "I'm highly confident" regardless of N. | `lib/prompts/*` | 🔴 | **LAUNCH_BLOCKER** — patch every prompt template (`mspAnalystV11`, copilot, ARCA) to inject the `confidenceLabel` from `FinalEdgeResult` AND a literal sentence: "Sample size for this setup is N. Lower bound of 95% CI is X%." Use those exact phrasings in any output line that references confidence. |
| 6.4 | **Missing data fields silently ignored** — pre-Phase-2 engines used `?? 0` or `?? 1` to fill gaps. Brain L2 now requires explicit `options_data_missing` / `derivatives_data_missing` flags; legacy engines have not been migrated. | repo-wide (`lib/engines/optionsIntelligence.ts`, `lib/engines/cryptoRegimeIntelligence.ts`, `lib/scoring/options-v21.ts`) | 🔴 | **LAUNCH_BLOCKER for engines feeding admin AI; POST_LAUNCH for scanner UI hints.** Action: every options/derivatives engine must emit a `dataAvailability: { options: bool; derivatives: bool; missingFields: string[] }` block. Brain L2 then propagates → Brain L4 reduces edge_score via `missing_data_penalty`. |
| 6.5 | **`ai_signal_log` writes `confidence` as a single number** — collapses the three-layer score (Opportunity / EvidenceQuality / PersonalExposure) into one. Re-emerging anti-pattern called out in `lib/admin/scoring.ts` doc-comment. | [lib/admin/signal-recorder.ts](lib/admin/signal-recorder.ts) | 🟡 | **POST_LAUNCH** — store the three components in `score_snapshot` JSONB and keep a single number only as a UI display convenience. |

---

## 7. Disposition summary

| Disposition | Count |
|---|---|
| FIXED in this audit | 3 |
| FALSE_ALARM (downgraded after investigation) | 2 |
| LAUNCH_BLOCKER (must fix before public launch) | **5** |
| POST_LAUNCH | 22 |
| ACCEPTED with mitigation | 2 |

### Launch blockers (5)

1. **3.3** — admin signal `WORKSPACE_ID = "operator-terminal"` must be excluded from every per-workspace edge query.
2. **2.1** — universe selector must use point-in-time membership for backtests; add disclaimer until shipped.
3. **5.2** — runtime guard preventing admin payloads from reaching public AI routes.
4. **6.3** — every AI prompt template must inject `confidenceLabel` and N + Wilson lower bound, never raw "high confidence".
5. **6.4** — engines feeding admin AI must surface explicit `options_data_missing` / `derivatives_data_missing` instead of silent `?? 0`.

### Suggested launch sequencing

1. Wire Brain L1 events from existing engines (Phase 5).
2. Patch the 5 launch blockers.
3. Backfill Brain L2/L3/L4 against the last 30d of `signals_fired` to prove the new pipeline against history.
4. Ship walk-forward harness (4.1) as the first POST_LAUNCH item — it's the single biggest defence against overfitting drift.

---

## 8. Tests added or recommended

> Marker for the test plan — these are not yet implemented in this pass.

- `outcomeLabeller.spec.ts` — given a journal entry with `entry_date < signal.signal_at`, the labeller MUST NOT match it. (Regression test for fix 1.1.)
- `brain/outcomeLabeller.spec.ts` — given bars with `ts ≤ as_of_ts`, `computeOutcome` returns `insufficient_data` and never reads them.
- `brain/edgeScorer.spec.ts` — N=5 wins=4 produces lower `edgeScore` than N=500 wins=290.
- `brain/finalEdgeScore.spec.ts` — base=1.0, freshness=stale, sampleSize=10 → cap=0.35 enforced.
- `prompts.spec.ts` — every prompt template fed N<20 must include the literal "insufficient sample" phrase.
- `survivorship.spec.ts` — replay 2024 with current universe vs point-in-time universe; assert Sharpe divergence not silently masked.
- `lookahead.spec.ts` — shuffle future bars in backtest; trade list must be identical.
