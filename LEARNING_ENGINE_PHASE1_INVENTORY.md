# MSP Learning Engine — Phase 1 Inventory

> Date: 2026-05-05. Scope: every file, table, route and component participating in the MSP learning loop (signal capture → outcome labeling → edge profiling → adaptive scoring → AI context → governance).
>
> Numbers found: **~30 DB tables**, **~35 lib modules**, **~25 API routes**, **~20 components**.
>
> Classification legend:
> - **DATA_INPUT** — raw fact captured into the system (no model)
> - **FEATURE_ENGINE** — derives features from raw data (regime, volatility, flow, etc.)
> - **OUTCOME_LABEL** — converts post-event facts into labels (correct/wrong, big_win/etc.)
> - **LEARNING_MODEL** — adapts weights, thresholds or distributions from historical outcomes
> - **SCORING_LAYER** — applies current weights to produce a score for a candidate
> - **AI_CONTEXT_LAYER** — injects learned context into LLM prompts
> - **ADMIN_ONLY** — operator/admin surface; must not leak to public
> - **PUBLIC_SAFE** — anonymous-allowed, generic only
> - **RISK_REVIEW_REQUIRED** — has at least one bias / leakage / look-ahead risk; flagged inline
> - **UNUSED_OR_STALE** — present but not wired in or superseded by a newer module

---

## 1. Database tables (raw substrate)

### 1.1 Trade & journal facts (DATA_INPUT)

| Table | Purpose | Live? | Workspace-scoped | Class | Bias risk |
|---|---|---|---|---|---|
| `journal_entries` | Open/closed user journal entries | live | yes (`workspace_id`) | DATA_INPUT | — |
| `journal_trade_snapshots` | Frozen entry-time payload (regime, indicators) | live (mig 031) | yes | DATA_INPUT | **Critical** for no-look-ahead — must be captured at entry, never re-derived. Audit Phase 2. |
| `portfolio_positions` | Open positions | live | yes | DATA_INPUT | — |
| `portfolio_closed` | Closed positions w/ pnl | live | yes | DATA_INPUT | — |
| `portfolio_cash_ledger` | Cash flows | live | yes | DATA_INPUT | — |
| `portfolio_performance` | Daily snapshots | live | yes | DATA_INPUT | — |
| `trade_events` | Append-only trade event log | live | yes | DATA_INPUT | — |
| `trade_outcomes` | Enriched closed-trade rollup (R-multiple, regime tag) | live (mig 051/055) | yes | OUTCOME_LABEL | **R/MAE/MFE must be derived from exit-time close, not future bars.** Audit `lib/intelligence/ingestOutcome.ts`. |

### 1.2 Signal & forward-test substrate (DATA_INPUT + OUTCOME_LABEL)

| Table | Purpose | Class | Bias risk |
|---|---|---|---|
| `signals_fired` | Every scanner/confluence/options/deep signal record (mig 003) | DATA_INPUT | Snapshot must contain features-as-of signal time only |
| `signal_outcomes` | Labeled outcome 24h/72h/7d after signal_fired | OUTCOME_LABEL | **RISK_REVIEW**: labeler uses `ABS(... ≤ 3600)` window on `entry_date` — accepts journal entries placed *before* signal as a "match" — that is look-ahead bias |
| `outcome_thresholds` | Per-strategy thresholds (mig 003) | LEARNING_MODEL config | — |
| `signal_accuracy_stats` | Aggregated accuracy by setup/regime | SCORING_LAYER input | — |
| `forward_tests` | Auto-paper trades attached to signal_id | OUTCOME_LABEL | — |
| `ai_signal_log` | Admin-side scanner pipeline hits (mig 048) | DATA_INPUT (admin) | ADMIN_ONLY |
| `ai_outcomes` | LLM/AI prediction outcomes | OUTCOME_LABEL | — |
| `learning_predictions` / `learning_outcomes` / `learning_stats` | Generic prediction-then-result loop (mig 015) | LEARNING_MODEL | UNUSED_OR_STALE? — verify current writers |

### 1.3 Adaptive / learned state

| Table | Purpose | Class | Notes |
|---|---|---|---|
| `evolution_adjustments` | Bounded weight deltas per cycle (mig 019) | LEARNING_MODEL | Pro Trader gate; max delta per cycle enforced |
| `operator_weights` | Operator scoring-engine weights (mig 060) | LEARNING_MODEL | ADMIN_ONLY |
| `decision_snapshots` | Replayable decision packets (mig 061) | DATA_INPUT (replay) | ADMIN_ONLY; needed for no-overfitting audits |
| `decision_packets` / `decision_packet_aliases` (mig 022/023) | Workflow decision packets | DATA_INPUT | yes |
| `tenant_profiles` | Per-workspace model config | LEARNING_MODEL | yes |
| `user_memory` | LLM memory blob | AI_CONTEXT_LAYER | yes; **must strip admin scores before serving to LLM** |
| `symbol_state_machine` / `symbol_state_transitions` (mig 018) | Per-symbol state | FEATURE_ENGINE | Pro Trader |

### 1.4 Regime / context substrate (FEATURE_ENGINE inputs)

| Table | Purpose |
|---|---|
| `global_regime_snapshots` | Global regime samples |
| `micro_regime_snapshots` | Per-symbol micro-regime |
| `derivatives_snapshots` | OI, funding, L/S |
| `crcs_hourly_base` (mig 049) | Composite indices base |
| `composite_indices` (mig 049) | Composite indices |
| `catalyst_events`, `catalyst_event_studies`, `catalyst_event_members` (mig 038–040) | Earnings / catalyst event store |
| `daily_picks` (mig 008/009) | Nightly research picks |
| `scanner_results_cache` | Last scan rollup |
| `indicators_latest` | Current indicator snapshot |
| `quotes_latest`, `daily_prices`, `ohlcv_bars` | Market data substrate |
| `options_chain_latest`, `options_metrics_latest`, `options_cache` | Options substrate |
| `stablecoin_snapshots` | Stablecoin liquidity |
| `timeframe_midpoints` | Untagged midpoint targets |

### 1.5 Admin learning artifacts (ADMIN_ONLY)

| Table | Purpose |
|---|---|
| `saved_research_cases` (mig 062) | Operator-curated research cases (used by journal-learning engine) |
| `admin_research_event_tape` (mig 069) | Append-only research event tape |
| `admin_research_scheduler_runs` (mig 070) | 24/7 scan run history |
| `admin_research_packet_snapshots` (mig 071) | Frozen packet snapshots for replay |
| `admin_morning_briefs` / `admin_morning_brief_*` (mig 063–067) | Morning brief + outcome grades |
| `admin_morning_trade_plans` | Trade plan candidates |
| `admin_broker_fill_sync_runs` | (No execution — sync log only) |

### 1.6 AI usage / feedback

| Table | Purpose | Class |
|---|---|---|
| `ai_usage` | Token accounting | DATA_INPUT |
| `ai_responses` | Cached LLM responses | DATA_INPUT |
| `ai_feedback` | Thumbs/correction feedback | OUTCOME_LABEL |
| `ai_evaluations` | Eval suite outputs | OUTCOME_LABEL |
| `ai_explain_cache`, `ai_actions`, `ai_suggestions`, `ai_events`, `ai_rate_limits` | Surface state | DATA_INPUT |
| `msp_knowledge` | Knowledge base | AI_CONTEXT_LAYER |

---

## 2. Library modules (engines)

### 2.1 Recorders (DATA_INPUT writers)

| File | Class | Notes |
|---|---|---|
| [lib/signalRecorder.ts](lib/signalRecorder.ts) | DATA_INPUT | Writes `signals_fired`. **Must capture features at signal time only.** Confirmed: all features come from a single `SignalFeatures` snapshot at call time — OK. |
| [lib/signalService.ts](lib/signalService.ts) | DATA_INPUT | Unified pipeline + dedup. |
| [lib/admin/signal-recorder.ts](lib/admin/signal-recorder.ts) | DATA_INPUT, ADMIN_ONLY | Writes `ai_signal_log` with `WORKSPACE_ID = "operator-terminal"` constant. **RISK_REVIEW**: hard-coded workspace string couples admin signals to a fake workspace; confirm it's filtered out of every per-workspace edge-profile query. |
| [lib/signals/forwardTestTracker.ts](lib/signals/forwardTestTracker.ts) | DATA_INPUT + OUTCOME_LABEL | Auto paper-trade. Uses `forward_tests`. Workspace-scoping must be verified. |

### 2.2 Outcome labelers (OUTCOME_LABEL)

| File | Class | Bias risk |
|---|---|---|
| [lib/signals/outcomeLabeler.ts](lib/signals/outcomeLabeler.ts) | OUTCOME_LABEL, **RISK_REVIEW_REQUIRED** | Uses `ABS(EXTRACT(EPOCH FROM (entry_date - signal_at)) ≤ 3600)` against `journal_entries.entry_date` — this matches journal entries placed BEFORE the signal too. Should be `entry_date >= signal_at AND entry_date - signal_at ≤ 3600`. Look-ahead bias. **Recommended fix in Phase 7.** |
| [lib/intelligence/outcomeClassifier.ts](lib/intelligence/outcomeClassifier.ts) | OUTCOME_LABEL | Pure R-multiple buckets. Safe. |
| [lib/intelligence/ingestOutcome.ts](lib/intelligence/ingestOutcome.ts) | OUTCOME_LABEL | Enriches closed entries → `trade_outcomes`. **RISK_REVIEW**: must read regime/indicators from `journal_trade_snapshots` (entry-phase), NOT recompute from current bars. Audit Phase 2. |
| [lib/quant/outcomeEngine.ts](lib/quant/outcomeEngine.ts) | OUTCOME_LABEL, ADMIN_ONLY | Lifecycle ACTIVE → TRACKED → WIN/LOSS/FLAT/EXPIRED. In-memory `lifecycles` map — **RISK_REVIEW**: in-memory only loses on cold start; verify DB durability. |
| [lib/cron / api jobs/learning-outcomes/route.ts](app/api/jobs/learning-outcomes/route.ts) | OUTCOME_LABEL job runner | CRON_INTERNAL |
| [api jobs/signal-lifecycle/route.ts](app/api/jobs/signal-lifecycle/route.ts) | OUTCOME_LABEL job runner | CRON_INTERNAL |

### 2.3 Edge profile / personalization (LEARNING_MODEL → AI_CONTEXT_LAYER)

| File | Class | Notes |
|---|---|---|
| [lib/intelligence/edgeProfile.ts](lib/intelligence/edgeProfile.ts) | LEARNING_MODEL | `MIN_SAMPLE_SIZE=10`, `MIN_COMBO_SIZE=15`. Good. **DEFAULT_LOOKBACK_DAYS=null = all-time** — risk of stale regime contamination. Recommend rolling window option. |
| [lib/intelligence/edgeContextBuilder.ts](lib/intelligence/edgeContextBuilder.ts) | AI_CONTEXT_LAYER | Builds prompt block. Says "context, NOT override" — good guardrail. Verify prompt template enforces it. |
| [lib/adaptiveTrader.ts](lib/adaptiveTrader.ts) | LEARNING_MODEL | Adaptive layer per workspace |
| [lib/ai/adaptiveConfidenceLens.ts](lib/ai/adaptiveConfidenceLens.ts) | SCORING_LAYER | 5-step confidence pipeline |
| [lib/ai/performanceThrottle.ts](lib/ai/performanceThrottle.ts) | LEARNING_MODEL | Drawdown-driven throttle |
| [lib/ai/regimeScoring.ts](lib/ai/regimeScoring.ts) | SCORING_LAYER | 5 regime × 6 component matrix |
| [lib/ai/useUserMemory.ts](lib/ai/useUserMemory.ts) | AI_CONTEXT_LAYER | LLM memory hook |
| [lib/ai/intelligenceContext.ts](lib/ai/intelligenceContext.ts) | AI_CONTEXT_LAYER | Aggregates context for analyst |

### 2.4 Backtest substrate (LEARNING_MODEL validator)

| File | Class | Notes |
|---|---|---|
| [lib/backtest/runStrategy.ts](lib/backtest/runStrategy.ts) | LEARNING_MODEL validator | Pure function — good. |
| [lib/backtest/engine.ts](lib/backtest/engine.ts) | LEARNING_MODEL validator | |
| [lib/backtest/signalReplay.ts](lib/backtest/signalReplay.ts) | LEARNING_MODEL validator | Replays brain signals. Verify it never reads from bars after signal time inside the per-bar loop. |
| [lib/backtest/signalSnapshots.ts](lib/backtest/signalSnapshots.ts) | DATA_INPUT contract | Zod schema. |
| [lib/backtest/edgeGroups.ts](lib/backtest/edgeGroups.ts) | FEATURE_ENGINE | Strategy → edge-group mapping |
| [lib/backtest/diagnostics.ts](lib/backtest/diagnostics.ts) | OUTCOME_LABEL | Coverage/quality |
| [lib/backtest/inverseComparison.ts](lib/backtest/inverseComparison.ts) | OUTCOME_LABEL | Compare vs inverse signal — useful for **noise-vs-edge separation** |
| [lib/backtest/tradeForensics.ts](lib/backtest/tradeForensics.ts) | OUTCOME_LABEL | Per-trade enrichment |
| [lib/backtest/validationPayload.ts](lib/backtest/validationPayload.ts) | OUTCOME_LABEL | |
| [lib/backtest/assumptions.ts](lib/backtest/assumptions.ts) | constants | Slippage/commission. **Verify realistic.** |
| [lib/backtest/strategyExecutors.ts](lib/backtest/strategyExecutors.ts) | LEARNING_MODEL validator | |

### 2.5 Operator / admin learning (ADMIN_ONLY)

| File | Class | Notes |
|---|---|---|
| [lib/operator/learning-engine.ts](lib/operator/learning-engine.ts) | LEARNING_MODEL | Bounded delta `MAX_WEIGHT_DELTA=0.03`, `MIN_LEARNING_SAMPLE=30`. Good — explicit overfitting guard. |
| [lib/operator/scoring-engine.ts](lib/operator/scoring-engine.ts) | SCORING_LAYER | |
| [lib/operator/feature-engine.ts](lib/operator/feature-engine.ts) | FEATURE_ENGINE | |
| [lib/operator/regime-engine.ts](lib/operator/regime-engine.ts) | FEATURE_ENGINE | |
| [lib/operator/playbook-engine.ts](lib/operator/playbook-engine.ts) | SCORING_LAYER | |
| [lib/operator/elite-score.ts](lib/operator/elite-score.ts) | SCORING_LAYER | |
| [lib/operator/decision-replay.ts](lib/operator/decision-replay.ts) | LEARNING_MODEL replay | Hot ring (500) + DB. Good. **Required for no-overfitting audits.** |
| [lib/operator/feedback.v1.ts](lib/operator/feedback.v1.ts) | OUTCOME_LABEL | Zod-typed feedback contract |
| [lib/operator/review-engine.ts](lib/operator/review-engine.ts) | LEARNING_MODEL | |
| [lib/operator/governance-engine.ts](lib/operator/governance-engine.ts) | SCORING_LAYER | |
| [lib/operator/meta-health.ts](lib/operator/meta-health.ts) | OUTCOME_LABEL | Engine health metrics |
| [lib/operator/symbol-trust.ts](lib/operator/symbol-trust.ts) | LEARNING_MODEL | Per-symbol trust scoring |
| [lib/operator/thesis-monitor.ts](lib/operator/thesis-monitor.ts) | OUTCOME_LABEL | |
| [lib/operator/version-registry.ts](lib/operator/version-registry.ts) | metadata | Engine versions for replay determinism |
| [lib/admin/expectancy.ts](lib/admin/expectancy.ts) | OUTCOME_LABEL aggregator | Per-setup expectancy |
| [lib/admin/scoring.ts](lib/admin/scoring.ts) | SCORING_LAYER | Three-layer score contract: Opportunity / EvidenceQuality / PersonalExposure — **MUST stay separate**. Already enforced by type contract. |
| [lib/admin/truthLayer.ts](lib/admin/truthLayer.ts) | governance | TruthEnvelope wrapper |
| [lib/admin/operatorBiasCheck.ts](lib/admin/operatorBiasCheck.ts) | LEARNING_MODEL (anti-bias) | |
| [lib/admin/researchPacketHistory.ts](lib/admin/researchPacketHistory.ts) | DATA_INPUT | |
| [lib/admin/researchScheduler.ts](lib/admin/researchScheduler.ts) | scheduler | |
| [lib/admin/researchEventTape.ts](lib/admin/researchEventTape.ts) | DATA_INPUT | |
| [lib/admin/researchDelta.ts](lib/admin/researchDelta.ts) | OUTCOME_LABEL | |
| [lib/admin/getAdminResearchPacket.ts](lib/admin/getAdminResearchPacket.ts) | AI_CONTEXT_LAYER | |
| [lib/engines/journalLearning.ts](lib/engines/journalLearning.ts) | LEARNING_MODEL | Pattern detection over `saved_research_cases`. Boundary: research patterns only. |
| [lib/engines/setupClassifier.ts](lib/engines/setupClassifier.ts) | FEATURE_ENGINE | |
| [lib/engines/trapDetection.ts](lib/engines/trapDetection.ts) | FEATURE_ENGINE | |
| [lib/engines/internalResearchScore.ts](lib/engines/internalResearchScore.ts) | SCORING_LAYER | ADMIN_ONLY |
| [lib/engines/researchAlertEngine.ts](lib/engines/researchAlertEngine.ts) | SCORING_LAYER | |
| [lib/engines/researchReadiness.ts](lib/engines/researchReadiness.ts) | SCORING_LAYER | |
| [lib/engines/cryptoRegimeIntelligence.ts](lib/engines/cryptoRegimeIntelligence.ts) | FEATURE_ENGINE | |
| [lib/engines/optionsIntelligence.ts](lib/engines/optionsIntelligence.ts) | FEATURE_ENGINE | |
| [lib/engines/earningsRisk.ts](lib/engines/earningsRisk.ts) | FEATURE_ENGINE | |
| [lib/engines/dataTruth.ts](lib/engines/dataTruth.ts) | governance | |

### 2.6 Quant fusion / discovery (ADMIN_ONLY)

| File | Class | Notes |
|---|---|---|
| [lib/quant/fusionEngine.ts](lib/quant/fusionEngine.ts) | SCORING_LAYER | Combines multi-signal evidence |
| [lib/quant/discoveryEngine.ts](lib/quant/discoveryEngine.ts) | FEATURE_ENGINE | |
| [lib/quant/escalationEngine.ts](lib/quant/escalationEngine.ts) | governance | |
| [lib/quant/regimeEngine.ts](lib/quant/regimeEngine.ts) | FEATURE_ENGINE | |
| [lib/quant/catalystGate.ts](lib/quant/catalystGate.ts) | governance | Earnings/catalyst block |
| [lib/quant/correlationDedup.ts](lib/quant/correlationDedup.ts) | LEARNING_MODEL | **Critical for separating real edge from correlated noise** |
| [lib/quant/extractMRI.ts](lib/quant/extractMRI.ts) | FEATURE_ENGINE | |
| [lib/quant/intradayFetcher.ts](lib/quant/intradayFetcher.ts) | DATA_INPUT | |
| [lib/quant/operatorAuth.ts](lib/quant/operatorAuth.ts) | auth | |
| [lib/quant/orchestrator.ts](lib/quant/orchestrator.ts) | orchestrator | |
| [lib/quant/permissionEngine.ts](lib/quant/permissionEngine.ts) | governance | |
| [lib/quant/universeSelector.ts](lib/quant/universeSelector.ts) | FEATURE_ENGINE | **RISK_REVIEW**: universe selection is the #1 source of survivorship bias. Verify: does it backfill with delisted/inactive symbols when running historical replays? |
| [lib/quant/alertMailer.ts](lib/quant/alertMailer.ts) | output | |

### 2.7 Other learning surfaces

| File | Class | Notes |
|---|---|---|
| [lib/learning-engine.ts](lib/learning-engine.ts) | LEARNING_MODEL | Top-level engine: `tagOutcome` + `computeLearningUpdate` |
| [lib/evolution-engine.ts](lib/evolution-engine.ts) | LEARNING_MODEL | Bounded weight evolution (Pro Trader) |
| [lib/evolution-store.ts](lib/evolution-store.ts) | DATA_INPUT | `evolution_adjustments` write/read |
| [lib/institutional-brain.ts](lib/institutional-brain.ts) | SCORING_LAYER | |
| [lib/confluence-learning-agent.ts](lib/confluence-learning-agent.ts) | LEARNING_MODEL | |
| [lib/copilot/derive-copilot-presence.ts](lib/copilot/derive-copilot-presence.ts) | AI_CONTEXT_LAYER | |
| [lib/doctrine/classifier.ts](lib/doctrine/classifier.ts) | FEATURE_ENGINE | |
| [lib/doctrine/registry.ts](lib/doctrine/registry.ts) | config | |
| [lib/doctrine/stats.ts](lib/doctrine/stats.ts) | OUTCOME_LABEL aggregator | |
| [lib/correlation-regime-engine.ts](lib/correlation-regime-engine.ts) | FEATURE_ENGINE | |
| [lib/regime-engine.ts](lib/regime-engine.ts) | FEATURE_ENGINE | |
| [lib/regime-classifier.ts](lib/regime-classifier.ts) | FEATURE_ENGINE | |
| [lib/state-machine-store.ts](lib/state-machine-store.ts) | DATA_INPUT (state) | |
| [lib/tradeExitEngine.ts](lib/tradeExitEngine.ts) | OUTCOME_LABEL | |
| [lib/capitalFlowEngine.ts](lib/capitalFlowEngine.ts) | FEATURE_ENGINE | |
| [lib/risk-governor.ts](lib/risk-governor.ts) / [lib/risk-governor-hard.ts](lib/risk-governor-hard.ts) | governance | |
| [lib/institutional-state-machine.ts](lib/institutional-state-machine.ts), [lib/institutional-flow-state-engine.ts](lib/institutional-flow-state-engine.ts), [lib/institutional-risk-governor.ts](lib/institutional-risk-governor.ts), [lib/institutional-filter.ts](lib/institutional-filter.ts), [lib/institutionalFilter.ts](lib/institutionalFilter.ts) | SCORING_LAYER | **DUPE**: `institutional-filter.ts` and `institutionalFilter.ts` exist side-by-side. UNUSED_OR_STALE candidate — pick canonical. |
| [lib/scoring/options-v21.ts](lib/scoring/options-v21.ts) | SCORING_LAYER | |
| [lib/scoring/config.ts](lib/scoring/config.ts) | config | |
| [lib/scanner/scoring.ts](lib/scanner/scoring.ts) | SCORING_LAYER | |
| [lib/scanner/rankExplanation.ts](lib/scanner/rankExplanation.ts) | output | |
| [lib/scanner/dataQuality.ts](lib/scanner/dataQuality.ts) | governance | |
| [lib/scanner/compliance.ts](lib/scanner/compliance.ts) | governance | |
| [lib/workflow/scoring.ts](lib/workflow/scoring.ts) | SCORING_LAYER | |
| [lib/workflow/decisionPacketLifecycle.ts](lib/workflow/decisionPacketLifecycle.ts) | DATA_INPUT (lifecycle) | |
| [lib/journal/playbookExpectancy.ts](lib/journal/playbookExpectancy.ts) | OUTCOME_LABEL aggregator | |
| [lib/journal/computeKpis.ts](lib/journal/computeKpis.ts) | OUTCOME_LABEL aggregator | |
| [lib/journal/riskAtEntry.ts](lib/journal/riskAtEntry.ts) | DATA_INPUT freezer | **Critical anti-look-ahead**: must capture risk-at-entry once and never recompute. |
| [lib/strategies/registry.ts](lib/strategies/registry.ts) | config | |

---

## 3. API routes (transport)

### 3.1 Outcome / labeling jobs (CRON_INTERNAL)

| Route | Class |
|---|---|
| [app/api/jobs/learning-outcomes/route.ts](app/api/jobs/learning-outcomes/route.ts) | CRON_INTERNAL — outcome rollup |
| [app/api/jobs/signal-lifecycle/route.ts](app/api/jobs/signal-lifecycle/route.ts) | CRON_INTERNAL — signal aging/lifecycle |
| [app/api/cron/label-ai-outcomes/route.ts](app/api/cron/label-ai-outcomes/route.ts) | CRON_INTERNAL or admin |
| [app/api/signals/label-outcomes/route.ts](app/api/signals/label-outcomes/route.ts) | session-gated manual trigger |
| [app/api/intelligence/ingest-outcomes/route.ts](app/api/intelligence/ingest-outcomes/route.ts) | session OR cron |

### 3.2 Edge / adaptive (session-gated)

| Route | Class |
|---|---|
| [app/api/intelligence/edge-profile/route.ts](app/api/intelligence/edge-profile/route.ts) | LEARNING_MODEL read (60s cache) |
| [app/api/edge-profile/route.ts](app/api/edge-profile/route.ts) | LEARNING_MODEL read |
| [app/api/adaptive/profile/route.ts](app/api/adaptive/profile/route.ts) | LEARNING_MODEL read |
| [app/api/doctrine/profile/route.ts](app/api/doctrine/profile/route.ts) | LEARNING_MODEL read |
| [app/api/doctrine/playbooks/route.ts](app/api/doctrine/playbooks/route.ts) | **RISK_REVIEW** — file head shows corrupted box-drawing chars; cannot confirm auth |
| [app/api/doctrine/outcome/route.ts](app/api/doctrine/outcome/route.ts) | OUTCOME_LABEL write |
| [app/api/evolution/route.ts](app/api/evolution/route.ts) | LEARNING_MODEL — Pro Trader gated |
| [app/api/state-machine/route.ts](app/api/state-machine/route.ts) | FEATURE_ENGINE read — Pro Trader |
| [app/api/ai-signals/route.ts](app/api/ai-signals/route.ts) | DATA_INPUT (write) — Pro |
| [app/api/ai/memory/route.ts](app/api/ai/memory/route.ts) | AI_CONTEXT_LAYER read/write |
| [app/api/operator/engine/learning/route.ts](app/api/operator/engine/learning/route.ts) | LEARNING_MODEL — operator OR admin |

### 3.3 Backtest (validators)

| Route | Class |
|---|---|
| [app/api/backtest/route.ts](app/api/backtest/route.ts) | LEARNING_MODEL validator |
| [app/api/backtest/brain/route.ts](app/api/backtest/brain/route.ts) | Pro Trader |
| [app/api/backtest/options/route.ts](app/api/backtest/options/route.ts) | Pro Trader |
| [app/api/backtest/scanner/route.ts](app/api/backtest/scanner/route.ts) | Pro Trader |
| [app/api/backtest/symbol-range/route.ts](app/api/backtest/symbol-range/route.ts) | Pro Trader |
| [app/api/backtest/time-scanner/route.ts](app/api/backtest/time-scanner/route.ts) | Pro Trader |

### 3.4 Admin learning surfaces (ADMIN_ONLY)

| Route | Class |
|---|---|
| [app/api/admin/signals/route.ts](app/api/admin/signals/route.ts) | DATA_INPUT read |
| [app/api/admin/signals/stats/route.ts](app/api/admin/signals/stats/route.ts) | OUTCOME_LABEL aggregate |
| [app/api/admin/signals/scorecard/route.ts](app/api/admin/signals/scorecard/route.ts) | LEARNING_MODEL output |
| [app/api/admin/journal-learning/route.ts](app/api/admin/journal-learning/route.ts) | LEARNING_MODEL |
| [app/api/admin/backtest-lab/route.ts](app/api/admin/backtest-lab/route.ts) | LEARNING_MODEL aggregate |
| [app/api/admin/research-cases/route.ts](app/api/admin/research-cases/route.ts) | DATA_INPUT |
| [app/api/admin/research-events/route.ts](app/api/admin/research-events/route.ts) | DATA_INPUT |
| [app/api/admin/research-packet/route.ts](app/api/admin/research-packet/route.ts) | AI_CONTEXT_LAYER |
| [app/api/admin/morning-brief/feedback/route.ts](app/api/admin/morning-brief/feedback/route.ts) | OUTCOME_LABEL |
| [app/api/admin/model-diagnostics/route.ts](app/api/admin/model-diagnostics/route.ts) | LEARNING_MODEL diagnostics |

### 3.5 Catalyst / event learning

| Route | Class |
|---|---|
| [app/api/catalyst/events/route.ts](app/api/catalyst/events/route.ts) | DATA_INPUT |
| [app/api/catalyst/ingest/route.ts](app/api/catalyst/ingest/route.ts) | DATA_INPUT |
| [app/api/catalyst/study/route.ts](app/api/catalyst/study/route.ts) | LEARNING_MODEL aggregate |
| [app/api/catalyst/study/compute/route.ts](app/api/catalyst/study/compute/route.ts) | CRON_INTERNAL |

---

## 4. UI components (output surfaces)

| Component | Class | Notes |
|---|---|---|
| [components/admin/AdminScoreCard.tsx](components/admin/AdminScoreCard.tsx) | ADMIN_ONLY | Renders three-layer score |
| [components/admin/AdminResearchScoreBreakdown.tsx](components/admin/AdminResearchScoreBreakdown.tsx) | ADMIN_ONLY | |
| [components/admin/AdminBiasCheckPanel.tsx](components/admin/AdminBiasCheckPanel.tsx) | ADMIN_ONLY | Anti-bias surface |
| [components/admin/AdminJournalDNAPanel.tsx](components/admin/AdminJournalDNAPanel.tsx) | ADMIN_ONLY | Journal pattern viewer |
| [components/admin/operator/TruthRail.tsx](components/admin/operator/TruthRail.tsx) | ADMIN_ONLY | Truth envelope rail |
| [components/admin/shared/DataTruthBadge.tsx](components/admin/shared/DataTruthBadge.tsx) | ADMIN_ONLY | |
| [components/admin/terminal/ConfidenceCard.tsx](components/admin/terminal/ConfidenceCard.tsx) | ADMIN_ONLY | |
| [components/intelligence/EdgeInsightCards.tsx](components/intelligence/EdgeInsightCards.tsx) | user-facing | Renders edge profile (workspace-scoped) |
| [components/AdaptivePersonalityCard.tsx](components/AdaptivePersonalityCard.tsx) | user-facing | |
| [components/AdaptiveTraderPersonalityBar.tsx](components/AdaptiveTraderPersonalityBar.tsx) | user-facing | |
| [components/EvolutionStatusCard.tsx](components/EvolutionStatusCard.tsx) | Pro Trader | |
| [components/backtest/BacktestHub.tsx](components/backtest/BacktestHub.tsx) | Pro Trader | |
| [components/backtest/PerformanceMetrics.tsx](components/backtest/PerformanceMetrics.tsx) | Pro Trader | |
| [components/journal/JournalPage.tsx](components/journal/JournalPage.tsx) | user-facing | |
| [components/journal/layer3/Layer3JournalIntelligenceDock.tsx](components/journal/layer3/Layer3JournalIntelligenceDock.tsx) | user-facing | |
| [components/terminal/SignalRail.tsx](components/terminal/SignalRail.tsx) | user-facing | |
| [components/msp/core/ScoreBadge.tsx](components/msp/core/ScoreBadge.tsx) | shared | |
| [components/ui/ScoreTypeBadge.tsx](components/ui/ScoreTypeBadge.tsx) | shared | |
| [components/catalyst/CatalystImpactCard.tsx](components/catalyst/CatalystImpactCard.tsx) | shared | |
| [components/catalyst/CatalystDetailsDrawer.tsx](components/catalyst/CatalystDetailsDrawer.tsx) | shared | |

---

## 5. Bias / leakage risk register (PHASE 2 INPUT)

Items below are flagged for Phase 2 fixes. Severity: 🔴 critical · 🟡 medium · 🟢 hygiene.

| # | Risk | Location | Class | Severity | Recommendation |
|---|---|---|---|---|---|
| 1 | **Look-ahead in journal match window** — `ABS(epoch difference) ≤ 3600` allows journal entries placed *before* signal to count as fulfillment | [lib/signals/outcomeLabeler.ts](lib/signals/outcomeLabeler.ts) | OUTCOME_LABEL | 🔴 | Change to `entry_date >= signal_at AND entry_date - signal_at <= 3600` (+1h forward only). Same fix for `portfolio_closed` `entered_at`. |
| 2 | **Survivorship bias** — universe selector likely uses current-active symbols only | [lib/quant/universeSelector.ts](lib/quant/universeSelector.ts) | FEATURE_ENGINE | 🔴 | When backtesting/replaying, select universe from `symbol_universe` snapshot at the historical date; never from current. |
| 3 | **Outcome enrichment may recompute regime from current bars** instead of frozen entry-snapshot | [lib/intelligence/ingestOutcome.ts](lib/intelligence/ingestOutcome.ts) | OUTCOME_LABEL | 🔴 | Read from `journal_trade_snapshots` only; never from live indicators. |
| 4 | **Hard-coded `WORKSPACE_ID = "operator-terminal"`** in admin signal recorder leaks admin signals into per-workspace edge profiles unless explicitly filtered | [lib/admin/signal-recorder.ts](lib/admin/signal-recorder.ts) | DATA_INPUT | 🟡 | Add `WHERE workspace_id <> 'operator-terminal'` filter to every per-workspace edge query OR move admin signals to a separate table (`admin_signal_log`). |
| 5 | **All-time `DEFAULT_LOOKBACK_DAYS = null`** in edge profile blends regimes from years ago into current confidence | [lib/intelligence/edgeProfile.ts](lib/intelligence/edgeProfile.ts) | LEARNING_MODEL | 🟡 | Default to 365d rolling window; expose param. Document tradeoff. |
| 6 | **In-memory lifecycle map** in `quant/outcomeEngine.ts` loses tracking on cold-start | [lib/quant/outcomeEngine.ts](lib/quant/outcomeEngine.ts) | OUTCOME_LABEL | 🟡 | Confirm DB write parity; rebuild map on boot from active `signals_fired` rows. |
| 7 | **Backtest assumptions may be too optimistic** | [lib/backtest/assumptions.ts](lib/backtest/assumptions.ts) | constants | 🟡 | Review slippage/commission against actual broker tiers; document realism level. |
| 8 | **Duplicate institutional-filter modules** | `lib/institutional-filter.ts` vs `lib/institutionalFilter.ts` | LEARNING_MODEL | 🟢 | Pick canonical, remove the other. Risk of divergent scoring logic. |
| 9 | **`learning_predictions` / `learning_outcomes` / `learning_stats`** (mig 015) — unverified writers | DB | LEARNING_MODEL | 🟢 | Confirm live writers; if dead, schedule retirement. |
| 10 | **`doctrine/playbooks/route.ts` head appears corrupted** — cannot read auth header | [app/api/doctrine/playbooks/route.ts](app/api/doctrine/playbooks/route.ts) | LEARNING_MODEL read | 🔴 | Open in editor; restore file. |
| 11 | **`user_memory` blob may be passed verbatim into LLM**; can carry admin scores or other-user content if any cross-write exists | [lib/ai/useUserMemory.ts](lib/ai/useUserMemory.ts), [lib/ai/context.ts](lib/ai/context.ts) | AI_CONTEXT_LAYER | 🟡 | Add deny-list filter for keys: `opportunity_score`, `evidence_quality`, `personal_exposure`, `admin_*`, `operator_*` before serving to LLM. |
| 12 | **Adaptive confidence lens & performance throttle** must read session P&L from journal/portfolio, never from the *open* trade currently being scored (would be self-referential) | [lib/ai/adaptiveConfidenceLens.ts](lib/ai/adaptiveConfidenceLens.ts), [lib/ai/performanceThrottle.ts](lib/ai/performanceThrottle.ts) | LEARNING_MODEL | 🟡 | Confirm input separation in Phase 2. |
| 13 | **Signal scorecard / edge profile cache TTL = 60 s** — fine for read but could mask very recent labels in a tight feedback loop | [app/api/intelligence/edge-profile/route.ts](app/api/intelligence/edge-profile/route.ts) | LEARNING_MODEL | 🟢 | Acceptable; document. |
| 14 | **`forward_tests` workspace scoping** unverified | [lib/signals/forwardTestTracker.ts](lib/signals/forwardTestTracker.ts) | OUTCOME_LABEL | 🟡 | Audit: confirm `workspace_id` column exists and is filtered everywhere. |
| 15 | **Weight evolution thresholds** — `MAX_WEIGHT_DELTA=0.03` good, but combined with broad time windows can drift | [lib/operator/learning-engine.ts](lib/operator/learning-engine.ts) | LEARNING_MODEL | 🟢 | Add a per-quarter rollback safety check (revert if Sharpe degrades > X). |
| 16 | **Public surfaces must never receive admin scoring fields** | grep `opportunity_score`, `evidence_quality_score`, `personal_exposure` in non-admin pages/routes | governance | 🟡 | Phase 5 task. |

---

## 6. UNUSED_OR_STALE candidates

- `lib/institutional-filter.ts` vs `lib/institutionalFilter.ts` (duplicate)
- `learning_predictions` / `learning_outcomes` / `learning_stats` tables (mig 015) — verify writers
- `migrations/AI_PLATFORM_FIX_FK.sql` / `AI_PLATFORM_SCHEMA.sql` / `AI_PLATFORM_SCHEMA_V2.sql` — appear pre-numbered ad-hoc files; confirm whether superseded by numbered migrations
- `migrations/COMPLETE_ALERTS_FIX.sql` — confirm not duplicating mig 010/011/014
- `lib/quant/outcomeEngine.ts` in-memory `lifecycles` map — duplicates DB persistence?

---

## 7. Phase 2 → 7 plan (next)

**Phase 2 — bias proofs.** For each 🔴 risk in §5, write a small SQL/JS proof and either fix or tag for manual review. Priority: items 1, 2, 3, 10.

**Phase 3 — model isolation.** Build a single `LearningSurface` interface with three subtypes:
1. `RawDataReader` — emits frozen-at-event-time facts
2. `OutcomeProvider` — emits labels resolved AFTER event time
3. `WeightApplier` — applies current weights to candidate features

…enforced by linting rules so future code can't bypass.

**Phase 4 — anti-overfitting guardrails.**
- Walk-forward eval framework using `decision_snapshots` + `signals_fired`
- Out-of-sample holdout (last 60d frozen) — never enter weight-update loops
- Cross-regime stability test (per-regime expectancy ≥ X before global weight change)

**Phase 5 — anti-survivorship.** Universe selector must use point-in-time `symbol_universe`. Add CI test: replay 2024 with only-2026-active universe vs full universe — flag if Sharpe diverges > 30%.

**Phase 6 — confidence calibration.** Track *actual* hit rate at each predicted-confidence bucket. If model says 75% confidence and observed is 50%, throttle the entire confidence pipeline by the calibration ratio.

**Phase 7 — public/admin separation enforcement.** Lint rule: no `lib/admin/*`, `lib/operator/*`, or `lib/quant/*` import from `app/(?!admin|operator|quant|api/admin|api/operator|api/quant)/**`.

---

## 8. Stats summary

| Category | Count |
|---|---|
| DB tables in learning loop | 30 |
| LEARNING_MODEL modules | 14 |
| OUTCOME_LABEL modules | 13 |
| FEATURE_ENGINE modules | 11 |
| SCORING_LAYER modules | 13 |
| AI_CONTEXT_LAYER modules | 6 |
| ADMIN_ONLY modules | 22 |
| Cron labelers | 5 |
| RISK_REVIEW_REQUIRED items (🔴) | 4 |
| RISK_REVIEW_REQUIRED items (🟡) | 8 |
| RISK_REVIEW_REQUIRED items (🟢) | 4 |
| UNUSED_OR_STALE candidates | 5 |
