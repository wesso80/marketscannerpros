/**
 * Layer 3 — Brain Outcome Labeller
 *
 * Resolves outcomes for a (event, horizon) pair using ONLY price bars
 * whose timestamp is strictly greater than as_of_ts. Any attempt to
 * label with bars before/at as_of_ts is rejected.
 *
 * Outcome class taxonomy:
 *   - failed_before_confirmation   : invalidation hit before confirmation
 *   - confirmed_then_failed        : confirmation hit, then invalidation
 *   - confirmed_followed_through   : confirmation hit, no invalidation, MFE >= 1R
 *   - no_resolution                : neither side hit, horizon expired
 *   - insufficient_data            : not enough bars covered the horizon
 *
 * Hard rules:
 *   - data_through_ts > as_of_ts (CHECK enforced at DB too)
 *   - data_through_ts >= as_of_ts + horizon OR class ∈ {insufficient_data, no_resolution}
 *   - Never reads anything not present in `bars` argument.
 */

import { randomUUID } from 'crypto';
import { q } from '@/lib/db';
import {
  HORIZON_SECONDS,
  type BrainOutcomeRecord,
  type DataFreshness,
  type OutcomeClass,
  type OutcomeContext,
  type OutcomeHorizon,
  type PriceBar,
} from './types';
import {
  evaluateMemoryEligibility,
  MEMORY_RULE_VERSION,
  type IneligibilityReason,
  type MemoryDimension,
} from './memoryRules';

export interface LabelOutcomeParams {
  eventId: string;
  workspaceId: string;
  symbol: string;
  horizon: OutcomeHorizon;
  /** Required for `horizon === 'custom'`. */
  customHorizonSeconds?: number;
  context: OutcomeContext;
  /** Bars MUST be sorted ascending by ts. Only bars with ts > as_of_ts will be used. */
  bars: PriceBar[];
  dataSource?: string;
  dataQuality?: 'clean' | 'partial' | 'gap' | 'unknown';
}

export interface LabelOutcomeResult {
  record: BrainOutcomeRecord;
  /** True if this row was inserted; false if it already existed (idempotent). */
  inserted: boolean;
  /** Phase 5 — memory eligibility decision for this outcome. */
  learningEligible: boolean;
  eligibilityReasons: IneligibilityReason[];
  memoryDimension: MemoryDimension | null;
}

/**
 * Public function — pure (no DB) labelling for testing and reuse.
 */
export function computeOutcome(
  params: Omit<LabelOutcomeParams, 'eventId' | 'workspaceId' | 'symbol' | 'dataSource' | 'dataQuality'>,
): {
  outcomeClass: OutcomeClass;
  resolutionReason: string;
  mfePct: number | null;
  maePct: number | null;
  mfeR: number | null;
  maeR: number | null;
  timeToMoveSecs: number | null;
  invalidationTouched: boolean | null;
  keyLevelTouched: boolean | null;
  reactionZoneTouched: boolean | null;
  volExpansionOccurred: boolean | null;
  resolvedAtTs: Date;
  dataThroughTs: Date;
  barsConsumed: number;
} {
  const { context, bars, horizon, customHorizonSeconds } = params;
  const horizonSecs = horizon === 'custom'
    ? (customHorizonSeconds ?? 0)
    : HORIZON_SECONDS[horizon];

  if (horizon === 'custom' && (!customHorizonSeconds || customHorizonSeconds <= 0)) {
    throw new Error('computeOutcome: customHorizonSeconds must be > 0 for horizon=custom');
  }

  const asOfMs = context.asOfTs.getTime();
  const horizonEndMs = asOfMs + horizonSecs * 1000;

  // No-look-ahead guard: only bars strictly after as_of_ts are eligible.
  const eligible = bars.filter((b) => b.ts.getTime() > asOfMs);
  // Stop at horizon: only bars whose ts ≤ horizon-end count toward the label.
  const inWindow = eligible.filter((b) => b.ts.getTime() <= horizonEndMs);

  if (eligible.length === 0) {
    return {
      outcomeClass: 'insufficient_data',
      resolutionReason: 'No bars after as_of_ts',
      mfePct: null,
      maePct: null,
      mfeR: null,
      maeR: null,
      timeToMoveSecs: null,
      invalidationTouched: null,
      keyLevelTouched: null,
      reactionZoneTouched: null,
      volExpansionOccurred: null,
      resolvedAtTs: new Date(),
      dataThroughTs: new Date(asOfMs + 1), // satisfies CHECK
      barsConsumed: 0,
    };
  }

  // Did we get bars covering the full horizon?
  const lastBar = inWindow[inWindow.length - 1] ?? eligible[eligible.length - 1];
  const dataThroughTs = lastBar.ts;
  const horizonCovered = dataThroughTs.getTime() >= horizonEndMs;

  if (!horizonCovered && inWindow.length === 0) {
    return {
      outcomeClass: 'insufficient_data',
      resolutionReason: 'No bars within horizon window',
      mfePct: null,
      maePct: null,
      mfeR: null,
      maeR: null,
      timeToMoveSecs: null,
      invalidationTouched: null,
      keyLevelTouched: null,
      reactionZoneTouched: null,
      volExpansionOccurred: null,
      resolvedAtTs: new Date(),
      dataThroughTs,
      barsConsumed: 0,
    };
  }

  const dir = context.direction === 'long' ? 1 : -1;
  const entry = context.entryPrice;
  const rUnit = context.rUnit ?? null;

  let mfePct = 0;
  let maePct = 0;
  let timeToMoveSecs: number | null = null;
  let invalidationTouched = false;
  let confirmationTouched = false;
  let confirmationTouchedAt: number | null = null;
  let invalidationTouchedAt: number | null = null;
  let keyLevelTouched = false;
  let reactionZoneTouched = false;
  let volExpansionOccurred = false;

  // Pre-compute baseline volatility from the first up-to-3 in-window bars
  const baselineRange = inWindow.slice(0, 3).reduce(
    (acc, b) => acc + Math.abs(b.high - b.low),
    0,
  ) / Math.max(1, Math.min(3, inWindow.length));

  for (const bar of inWindow) {
    // Per-bar excursions (favourable uses high for long, low for short).
    const favPrice = dir === 1 ? bar.high : bar.low;
    const advPrice = dir === 1 ? bar.low : bar.high;
    const favPct = ((favPrice - entry) / entry) * 100 * dir;
    const advPct = ((advPrice - entry) / entry) * 100 * dir;
    if (favPct > mfePct) mfePct = favPct;
    if (advPct < maePct) maePct = advPct;

    // Time-to-1R if we have rUnit
    if (
      timeToMoveSecs === null &&
      rUnit !== null &&
      rUnit > 0 &&
      mfePct >= (rUnit / entry) * 100
    ) {
      timeToMoveSecs = Math.floor((bar.ts.getTime() - asOfMs) / 1000);
    }

    // Invalidation
    if (
      context.invalidationLevel != null &&
      ((dir === 1 && bar.low <= context.invalidationLevel) ||
        (dir === -1 && bar.high >= context.invalidationLevel))
    ) {
      if (!invalidationTouched) invalidationTouchedAt = bar.ts.getTime();
      invalidationTouched = true;
    }

    // Confirmation
    if (
      context.confirmationLevel != null &&
      ((dir === 1 && bar.high >= context.confirmationLevel) ||
        (dir === -1 && bar.low <= context.confirmationLevel))
    ) {
      if (!confirmationTouched) confirmationTouchedAt = bar.ts.getTime();
      confirmationTouched = true;
    }

    // Key levels
    if (context.keyLevels && context.keyLevels.length > 0) {
      for (const lvl of context.keyLevels) {
        if (bar.high >= lvl && bar.low <= lvl) {
          keyLevelTouched = true;
          break;
        }
      }
    }

    // Reaction zone
    if (context.reactionZone) {
      if (bar.high >= context.reactionZone.low && bar.low <= context.reactionZone.high) {
        reactionZoneTouched = true;
      }
    }

    // Volatility expansion (any bar's range > 1.5× baseline)
    if (baselineRange > 0 && Math.abs(bar.high - bar.low) > baselineRange * 1.5) {
      volExpansionOccurred = true;
    }
  }

  // Convert to R-multiples if we have rUnit
  const mfeR = rUnit && rUnit > 0 ? (mfePct / 100) * entry / rUnit : null;
  const maeR = rUnit && rUnit > 0 ? (maePct / 100) * entry / rUnit : null;

  // Classify
  let outcomeClass: OutcomeClass;
  let resolutionReason: string;

  if (!horizonCovered) {
    outcomeClass = 'insufficient_data';
    resolutionReason = `Bars cover only ${Math.floor((dataThroughTs.getTime() - asOfMs) / 1000)}s of ${horizonSecs}s horizon`;
  } else if (
    invalidationTouched &&
    invalidationTouchedAt !== null &&
    (!confirmationTouched ||
      (confirmationTouchedAt !== null && invalidationTouchedAt < confirmationTouchedAt))
  ) {
    outcomeClass = 'failed_before_confirmation';
    resolutionReason = 'Invalidation hit before confirmation';
  } else if (invalidationTouched && confirmationTouched) {
    outcomeClass = 'confirmed_then_failed';
    resolutionReason = 'Confirmation reached, then invalidation hit';
  } else if (
    confirmationTouched &&
    !invalidationTouched &&
    (mfeR === null || mfeR >= 1)
  ) {
    outcomeClass = 'confirmed_followed_through';
    resolutionReason = 'Confirmation reached, no invalidation, MFE ≥ 1R';
  } else if (!confirmationTouched && !invalidationTouched) {
    outcomeClass = 'no_resolution';
    resolutionReason = 'Neither confirmation nor invalidation hit within horizon';
  } else {
    outcomeClass = 'no_resolution';
    resolutionReason = 'Confirmation reached but MFE < 1R within horizon';
  }

  return {
    outcomeClass,
    resolutionReason,
    mfePct,
    maePct,
    mfeR,
    maeR,
    timeToMoveSecs,
    invalidationTouched: context.invalidationLevel != null ? invalidationTouched : null,
    keyLevelTouched: context.keyLevels && context.keyLevels.length > 0 ? keyLevelTouched : null,
    reactionZoneTouched: context.reactionZone ? reactionZoneTouched : null,
    volExpansionOccurred,
    resolvedAtTs: new Date(),
    dataThroughTs,
    barsConsumed: inWindow.length,
  };
}

export async function labelBrainOutcome(
  params: LabelOutcomeParams,
): Promise<LabelOutcomeResult> {
  const computed = computeOutcome(params);
  const horizonSecs =
    params.horizon === 'custom'
      ? (params.customHorizonSeconds ?? 0)
      : HORIZON_SECONDS[params.horizon];

  // Pre-flight guard mirroring the DB CHECK so we fail fast with a clear msg.
  if (computed.dataThroughTs.getTime() <= params.context.asOfTs.getTime()) {
    throw new Error('labelBrainOutcome: dataThroughTs must be strictly > as_of_ts (look-ahead guard)');
  }

  const outcomeId = randomUUID();
  const record: BrainOutcomeRecord = {
    outcomeId,
    eventId: params.eventId,
    workspaceId: params.workspaceId,
    symbol: params.symbol,
    horizon: params.horizon,
    horizonSeconds: horizonSecs,
    asOfTs: params.context.asOfTs,
    resolvedAtTs: computed.resolvedAtTs,
    dataThroughTs: computed.dataThroughTs,
    mfePct: computed.mfePct,
    maePct: computed.maePct,
    mfeR: computed.mfeR,
    maeR: computed.maeR,
    timeToMoveSecs: computed.timeToMoveSecs,
    invalidationTouched: computed.invalidationTouched,
    keyLevelTouched: computed.keyLevelTouched,
    reactionZoneTouched: computed.reactionZoneTouched,
    volExpansionOccurred: computed.volExpansionOccurred,
    outcomeClass: computed.outcomeClass,
    resolutionReason: computed.resolutionReason,
    barsConsumed: computed.barsConsumed,
    dataSource: params.dataSource ?? null,
    dataQuality: params.dataQuality ?? 'unknown',
  };

  // ── Phase 5: memory eligibility ────────────────────────────────────────────
  // Look up the parent event provenance + feature snapshot. These are required
  // to decide whether this outcome may influence edge memory.
  const eventRows = await q<{
    event_type: string;
    data_freshness: DataFreshness;
    input_snapshot_hash: string | null;
  }>(
    `SELECT event_type, data_freshness, input_snapshot_hash
       FROM brain_events
      WHERE event_id = $1`,
    [params.eventId],
  );
  const featureRows = await q<{
    snapshot_hash: string | null;
    simulated_field_count: number;
    missing_data_count: number;
    stale_data_count: number;
  }>(
    `SELECT snapshot_hash, simulated_field_count, missing_data_count, stale_data_count
       FROM brain_features
      WHERE event_id = $1
      LIMIT 1`,
    [params.eventId],
  );

  const eligibility = eventRows.length > 0
    ? evaluateMemoryEligibility({
        outcome: record,
        event: {
          eventType: eventRows[0].event_type as never,
          dataFreshness: eventRows[0].data_freshness,
          inputSnapshotHash: eventRows[0].input_snapshot_hash,
        },
        feature: featureRows.length > 0
          ? {
              snapshotHash: featureRows[0].snapshot_hash,
              simulatedFieldCount: Number(featureRows[0].simulated_field_count) || 0,
              missingDataCount: Number(featureRows[0].missing_data_count) || 0,
              staleDataCount: Number(featureRows[0].stale_data_count) || 0,
            }
          : null,
        // providerFailureDuringWindow is computed by callers that have the
        // provider-health timeline; default false here.
        providerFailureDuringWindow: false,
      })
    : {
        eligible: false,
        reasons: ['missing_snapshot' as IneligibilityReason],
        dimension: null,
        ruleVersion: MEMORY_RULE_VERSION,
      };

  const result = await q<{ outcome_id: string }>(
    `INSERT INTO brain_outcomes (
       outcome_id, event_id, workspace_id, symbol, horizon, horizon_seconds,
       as_of_ts, resolved_at_ts, data_through_ts,
       mfe_pct, mae_pct, mfe_r, mae_r, time_to_move_secs,
       invalidation_touched, key_level_touched, reaction_zone_touched, vol_expansion_occurred,
       outcome_class, resolution_reason,
       bars_consumed, data_source, data_quality,
       learning_eligible, eligibility_reasons, memory_dimension, memory_rule_version
     ) VALUES (
       $1,$2,$3,$4,$5,$6,
       $7,$8,$9,
       $10,$11,$12,$13,$14,
       $15,$16,$17,$18,
       $19,$20,
       $21,$22,$23,
       $24,$25,$26,$27
     )
     ON CONFLICT (event_id, horizon) DO NOTHING
     RETURNING outcome_id`,
    [
      record.outcomeId,
      record.eventId,
      record.workspaceId,
      record.symbol,
      record.horizon,
      record.horizonSeconds,
      record.asOfTs,
      record.resolvedAtTs,
      record.dataThroughTs,
      record.mfePct,
      record.maePct,
      record.mfeR,
      record.maeR,
      record.timeToMoveSecs,
      record.invalidationTouched,
      record.keyLevelTouched,
      record.reactionZoneTouched,
      record.volExpansionOccurred,
      record.outcomeClass,
      record.resolutionReason,
      record.barsConsumed,
      record.dataSource,
      record.dataQuality,
      eligibility.eligible,
      eligibility.reasons,
      eligibility.dimension,
      MEMORY_RULE_VERSION,
    ],
  );

  return {
    record,
    inserted: result.length > 0,
    learningEligible: eligibility.eligible,
    eligibilityReasons: eligibility.reasons,
    memoryDimension: eligibility.dimension,
  };
}
