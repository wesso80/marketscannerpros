/**
 * MSP Brain Layer — Phase 5: Learning Memory Rules
 *
 * Single source of truth for what the edge memory is ALLOWED to remember.
 *
 * The system remembers (positive scope — `MemoryDimension`):
 *   1. setup_by_regime        — which setup types worked / failed by regime
 *   2. symbol_false_positive  — which symbols produce false positives
 *   3. timeframe_noise        — which timeframes are noisy
 *   4. confluence_component   — which confluence components are predictive / useless
 *   5. alert_timing           — which alerts fired too early
 *   6. arca_calibration       — which ARCA verdicts were correctly downgraded vs over-confident
 *   7. dve_state              — which DVE states led to real expansion
 *   8. trap_warning           — which trap warnings actually trapped
 *   9. options_signal         — which options signals followed through
 *  10. time_confluence        — which time-confluence clusters mattered
 *
 * The system MUST NOT remember as edge (negative scope):
 *   - one-off lucky wins                       → covered by sample-size pen. (L4)
 *   - tiny sample-size results                 → covered by sample-size pen. (L4)
 *   - results from stale data                  → DISQUALIFIED here
 *   - results from simulated/mock data         → DISQUALIFIED here
 *   - outcomes during provider failures        → DISQUALIFIED here
 *   - results where input snapshot is missing  → DISQUALIFIED here
 *   - results where horizon is undefined       → DISQUALIFIED here
 *   - results that relied on future info       → DISQUALIFIED here (and by DB CHECK)
 *
 * The schema-level guarantee lives in migrations/074_brain_memory_rules.sql
 * (`learning_eligible` column + `brain_edge_memory_pool` view). This module
 * is the runtime enforcer that decides the value of that column.
 */

import type {
  BrainEvent,
  BrainEventType,
  BrainOutcomeRecord,
  DataFreshness,
  OutcomeHorizon,
} from './types';
import { q } from '@/lib/db';

export const MEMORY_RULE_VERSION = 'v1';

// ─── The 13 dimensions we DO remember ────────────────────────────────────────

export type MemoryDimension =
  | 'setup_by_regime'
  | 'symbol_false_positive'
  | 'timeframe_noise'
  | 'confluence_component'
  | 'alert_timing'
  | 'arca_calibration'
  | 'dve_state'
  | 'trap_warning'
  | 'options_signal'
  | 'time_confluence';

export const MEMORY_DIMENSION_DESCRIPTIONS: Record<MemoryDimension, string> = {
  setup_by_regime:
    'Setup type performance conditioned on market regime (worked vs failed).',
  symbol_false_positive:
    'Per-symbol failed_before_confirmation rate — which tickers are noise traps.',
  timeframe_noise:
    'Per-timeframe outcome distribution — which timeframes produce unreliable signals.',
  confluence_component:
    'Per-component (SQ/TA/VA/LL/MTF/FD) predictive power vs uselessness.',
  alert_timing:
    'Whether alert fired_at preceded actual move by too long (early) or too late.',
  arca_calibration:
    'ARCA conditional verdict accuracy: downgraded_stale, downgraded_simulated, over-confident.',
  dve_state:
    'Directional Volatility Engine state → real volatility expansion follow-through.',
  trap_warning:
    'Whether trap warnings actually preceded a confirmed_then_failed outcome.',
  options_signal:
    'Whether options confluence signals (gamma walls, unusual flow) led to follow-through.',
  time_confluence:
    'Whether time-cluster predictions coincided with actual reaction zones.',
};

// ─── Negative-scope reason codes ─────────────────────────────────────────────

export type IneligibilityReason =
  | 'stale_data'
  | 'simulated_data'
  | 'provider_failure'
  | 'missing_snapshot'
  | 'snapshot_hash_missing'
  | 'horizon_undefined'
  | 'horizon_not_respected'
  | 'lookahead_violation'
  | 'no_resolution'
  | 'insufficient_data'
  | 'unknown_freshness'
  | 'data_quality_unknown';

export const INELIGIBILITY_REASON_DESCRIPTIONS: Record<IneligibilityReason, string> = {
  stale_data:
    'Event data_freshness was "stale" — outcome cannot be attributed to live conditions.',
  simulated_data:
    'Event data_freshness was "simulated" or feature snapshot contained simulated fields.',
  provider_failure:
    'Outcome window overlapped a provider.failed/provider.degraded event for this symbol.',
  missing_snapshot:
    'No brain_features row exists for this event — features were not frozen.',
  snapshot_hash_missing:
    'brain_features.snapshot_hash is null — cannot prove feature integrity.',
  horizon_undefined:
    'horizon_seconds <= 0 or horizon string not in HORIZON_SECONDS map.',
  horizon_not_respected:
    'data_through_ts did not span the full horizon (DB CHECK should also block this).',
  lookahead_violation:
    'data_through_ts <= as_of_ts (DB CHECK should also block this).',
  no_resolution:
    'Outcome class was no_resolution — no win/loss signal to learn from.',
  insufficient_data:
    'Outcome class was insufficient_data — too few bars to evaluate.',
  unknown_freshness:
    'Event data_freshness was "unknown" — cannot certify input quality.',
  data_quality_unknown:
    'Outcome data_quality was "unknown" — bar series provenance not certified.',
};

// ─── Inputs to the eligibility check ─────────────────────────────────────────

export interface MemoryEligibilityInput {
  outcome: Pick<
    BrainOutcomeRecord,
    | 'asOfTs'
    | 'dataThroughTs'
    | 'horizon'
    | 'horizonSeconds'
    | 'outcomeClass'
    | 'dataQuality'
  >;
  event: Pick<
    BrainEvent,
    'eventType' | 'dataFreshness' | 'inputSnapshotHash'
  >;
  /** Optional — if present, sourced from brain_features. */
  feature?: {
    snapshotHash: string | null;
    simulatedFieldCount: number;
    missingDataCount: number;
    staleDataCount: number;
  } | null;
  /** True if a provider.failed / provider.degraded event for this symbol overlapped the outcome window. */
  providerFailureDuringWindow?: boolean;
}

export interface MemoryEligibilityResult {
  eligible: boolean;
  /** When eligible=false: the reasons; when eligible=true: empty. */
  reasons: IneligibilityReason[];
  /** Recommended dimension for this outcome (best fit only). May be null when ineligible. */
  dimension: MemoryDimension | null;
  /** Always populated for audit trail. */
  ruleVersion: string;
}

// ─── The predicate ───────────────────────────────────────────────────────────

const VALID_HORIZONS: OutcomeHorizon[] = ['1h', '4h', '1d', '3d', '1w', 'custom'];

const DISQUALIFYING_FRESHNESS = new Set<DataFreshness>([
  'stale',
  'simulated',
  'unknown',
]);

/**
 * Pure decision function. Decides if an outcome is allowed to influence edge memory.
 *
 * Hard rules (any TRUE → eligible=false):
 *   - event.dataFreshness ∈ {stale, simulated, unknown}
 *   - feature.simulatedFieldCount > 0
 *   - inputSnapshotHash is missing AND no feature snapshot exists
 *   - feature.snapshotHash is null
 *   - horizon not in valid set OR horizonSeconds <= 0
 *   - dataThroughTs <= asOfTs (look-ahead)
 *   - dataThroughTs - asOfTs < horizonSeconds AND outcomeClass not in {insufficient_data,no_resolution}
 *     (then we already have insufficient_data flag — also disqualified separately)
 *   - outcomeClass ∈ {insufficient_data, no_resolution}
 *   - dataQuality === 'unknown'
 *   - providerFailureDuringWindow is true
 */
export function evaluateMemoryEligibility(
  input: MemoryEligibilityInput,
): MemoryEligibilityResult {
  const reasons: IneligibilityReason[] = [];
  const { outcome, event, feature, providerFailureDuringWindow } = input;

  // Provenance: data freshness must be live or delayed (delayed is acceptable).
  if (event.dataFreshness === 'stale') reasons.push('stale_data');
  if (event.dataFreshness === 'simulated') reasons.push('simulated_data');
  if (event.dataFreshness === 'unknown') reasons.push('unknown_freshness');

  // Simulated features taint the outcome regardless of event freshness.
  if (feature && feature.simulatedFieldCount > 0) reasons.push('simulated_data');

  // Input snapshot must exist somewhere — either inline hash on the event or via feature row.
  const hasEventHash = !!event.inputSnapshotHash;
  const hasFeatureHash = !!(feature && feature.snapshotHash);
  if (!hasEventHash && !hasFeatureHash) reasons.push('missing_snapshot');
  if (feature !== undefined && feature !== null && !feature.snapshotHash) {
    reasons.push('snapshot_hash_missing');
  }

  // Horizon must be defined and positive.
  if (!VALID_HORIZONS.includes(outcome.horizon)) reasons.push('horizon_undefined');
  if (!Number.isFinite(outcome.horizonSeconds) || outcome.horizonSeconds <= 0) {
    reasons.push('horizon_undefined');
  }

  // Look-ahead — DB CHECK should already block this; defence in depth.
  const asOfMs = outcome.asOfTs.getTime();
  const throughMs = outcome.dataThroughTs.getTime();
  if (throughMs <= asOfMs) reasons.push('lookahead_violation');

  // Horizon must be respected unless the outcome itself reports no resolution.
  const horizonMs = outcome.horizonSeconds * 1000;
  if (
    throughMs - asOfMs < horizonMs &&
    outcome.outcomeClass !== 'insufficient_data' &&
    outcome.outcomeClass !== 'no_resolution'
  ) {
    reasons.push('horizon_not_respected');
  }

  // Outcomes with no actionable label cannot teach the system.
  if (outcome.outcomeClass === 'insufficient_data') reasons.push('insufficient_data');
  if (outcome.outcomeClass === 'no_resolution') reasons.push('no_resolution');

  // Data quality must be certified.
  if (outcome.dataQuality === 'unknown') reasons.push('data_quality_unknown');

  // Provider failure during the window invalidates anything we observed.
  if (providerFailureDuringWindow) reasons.push('provider_failure');

  if (reasons.length > 0) {
    return {
      eligible: false,
      reasons: dedupe(reasons),
      dimension: null,
      ruleVersion: MEMORY_RULE_VERSION,
    };
  }

  return {
    eligible: true,
    reasons: [],
    dimension: pickDimension(event.eventType),
    ruleVersion: MEMORY_RULE_VERSION,
  };
}

/**
 * Map an event type to its primary memory dimension.
 * One outcome can statistically inform multiple dimensions, but for storage
 * we tag the single best fit (other dimensions can still query the row via
 * the event_type / setup_key fields).
 */
export function pickDimension(eventType: BrainEventType): MemoryDimension | null {
  switch (eventType) {
    case 'scanner.result_generated':
    case 'golden_egg.analysis_generated':
      return 'setup_by_regime';
    case 'dve.output_generated':
      return 'dve_state';
    case 'options.confluence_generated':
      return 'options_signal';
    case 'time.confluence_cluster_generated':
      return 'time_confluence';
    case 'alert.fired':
    case 'alert.failed':
      return 'alert_timing';
    case 'arca.conditional_verdict':
    case 'arca.downgraded_stale':
    case 'arca.downgraded_simulated':
      return 'arca_calibration';
    // setup lifecycle events feed back into the parent setup_by_regime stat
    case 'setup.reached_key_level':
    case 'setup.hit_invalidation':
    case 'setup.expired':
      return 'setup_by_regime';
    // user/journal/backtest events are not direct edge sources
    case 'user.saved_setup':
    case 'user.journaled_setup':
    case 'backtest.completed':
    case 'provider.failed':
    case 'provider.degraded':
      return null;
    default:
      return null;
  }
}

// ─── Setup-key builders (canonical strings for cross-row aggregation) ────────

export interface SetupKeyParts {
  dimension: MemoryDimension;
  setupType?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  regime?: string | null;
  component?: string | null;
  /** Free-form discriminator for ARCA / DVE state / trap-warning sub-types. */
  state?: string | null;
}

/**
 * Build a stable, dimension-aware setup_key for brain_edge_scores.
 * Format: `dimension|field=value|field=value|...` with empty fields omitted.
 * Always lower-cased, stable ordering.
 */
export function buildSetupKey(parts: SetupKeyParts): string {
  const ordered: Array<[string, string | null | undefined]> = [
    ['setup', parts.setupType],
    ['symbol', parts.symbol],
    ['tf', parts.timeframe],
    ['regime', parts.regime],
    ['component', parts.component],
    ['state', parts.state],
  ];
  const fields = ordered
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${String(v).toLowerCase()}`);
  return [parts.dimension, ...fields].join('|');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

// ─── Memory pool loader ──────────────────────────────────────────────────────

/**
 * Row shape returned from the brain_edge_memory_pool view.
 * Use this as the input to scoreEdge() so the scorer NEVER sees disqualified
 * outcomes (no stale, no simulated, no provider-failure rows).
 */
export interface MemoryPoolRow {
  outcomeId: string;
  eventId: string;
  workspaceId: string;
  symbol: string;
  horizon: OutcomeHorizon;
  asOfTs: Date;
  outcomeClass: BrainOutcomeRecord['outcomeClass'];
  mfePct: number | null;
  maePct: number | null;
  memoryDimension: MemoryDimension | null;
  eventType: BrainEventType;
  eventDataFreshness: DataFreshness;
  missingDataCount: number;
  staleDataCount: number;
}

export interface MemoryPoolFilter {
  workspaceId: string;
  dimension?: MemoryDimension;
  horizon?: OutcomeHorizon;
  symbol?: string;
  eventType?: BrainEventType;
  /** Inclusive lower bound on as_of_ts. */
  windowStart?: Date;
  /** Inclusive upper bound on as_of_ts. */
  windowEnd?: Date;
  limit?: number;
}

/**
 * Load eligible outcomes from the brain_edge_memory_pool view. The view
 * already enforces learning_eligible = TRUE and excludes stale / simulated
 * sources. This loader applies dimension/horizon/symbol filters on top.
 *
 * Multi-tenant rule: workspaceId is required and ALWAYS filtered. Pass
 * workspaceId='global' to read the cross-workspace research pool.
 */
export async function loadEligibleMemoryPool(
  filter: MemoryPoolFilter,
): Promise<MemoryPoolRow[]> {
  if (!filter.workspaceId) {
    throw new Error('loadEligibleMemoryPool: workspaceId is required');
  }

  const where: string[] = ['workspace_id = $1'];
  const params: unknown[] = [filter.workspaceId];
  let i = 2;

  if (filter.dimension) {
    where.push(`memory_dimension = $${i++}`);
    params.push(filter.dimension);
  }
  if (filter.horizon) {
    where.push(`horizon = $${i++}`);
    params.push(filter.horizon);
  }
  if (filter.symbol) {
    where.push(`UPPER(symbol) = UPPER($${i++})`);
    params.push(filter.symbol);
  }
  if (filter.eventType) {
    where.push(`event_type = $${i++}`);
    params.push(filter.eventType);
  }
  if (filter.windowStart) {
    where.push(`as_of_ts >= $${i++}`);
    params.push(filter.windowStart);
  }
  if (filter.windowEnd) {
    where.push(`as_of_ts <= $${i++}`);
    params.push(filter.windowEnd);
  }

  const limit = Math.min(Math.max(filter.limit ?? 5000, 1), 50000);
  const sql = `
    SELECT outcome_id, event_id, workspace_id, symbol, horizon, as_of_ts,
           outcome_class, mfe_pct, mae_pct, memory_dimension,
           event_type, event_data_freshness,
           COALESCE(missing_data_count, 0) AS missing_data_count,
           COALESCE(stale_data_count, 0)   AS stale_data_count
      FROM brain_edge_memory_pool
     WHERE ${where.join(' AND ')}
     ORDER BY as_of_ts DESC
     LIMIT ${limit}
  `;

  const rows = await q<{
    outcome_id: string;
    event_id: string;
    workspace_id: string;
    symbol: string;
    horizon: OutcomeHorizon;
    as_of_ts: string | Date;
    outcome_class: BrainOutcomeRecord['outcomeClass'];
    mfe_pct: string | number | null;
    mae_pct: string | number | null;
    memory_dimension: MemoryDimension | null;
    event_type: BrainEventType;
    event_data_freshness: DataFreshness;
    missing_data_count: string | number;
    stale_data_count: string | number;
  }>(sql, params);

  return rows.map((r) => ({
    outcomeId: r.outcome_id,
    eventId: r.event_id,
    workspaceId: r.workspace_id,
    symbol: r.symbol,
    horizon: r.horizon,
    asOfTs: r.as_of_ts instanceof Date ? r.as_of_ts : new Date(r.as_of_ts),
    outcomeClass: r.outcome_class,
    mfePct: r.mfe_pct == null ? null : Number(r.mfe_pct),
    maePct: r.mae_pct == null ? null : Number(r.mae_pct),
    memoryDimension: r.memory_dimension,
    eventType: r.event_type,
    eventDataFreshness: r.event_data_freshness,
    missingDataCount: Number(r.missing_data_count) || 0,
    staleDataCount: Number(r.stale_data_count) || 0,
  }));
}
