/**
 * Layer 2 — Brain Feature Store
 *
 * Persists frozen feature snapshots tied 1:1 to a brain_event.
 *
 * Integrity guarantees:
 *   - snapshot_hash = sha256 of all bucketed features → detects mutation.
 *   - Rows are write-once; never UPDATE.
 *   - missing_data_count / stale_data_count / simulated_field_count are
 *     computed from the inputs, never silently nulled.
 *   - options_data_missing and derivatives_data_missing are REQUIRED so
 *     downstream layers cannot mistake "absent" for "available".
 */

import { createHash, randomUUID } from 'crypto';
import { q } from '@/lib/db';
import {
  BRAIN_FEATURE_SCHEMA_VERSION,
  type AiEvidenceFeatures,
  type AssetClass,
  type BrainFeatureSnapshot,
  type DerivativesFeatures,
  type MacroContextFeatures,
  type MarketStructureFeatures,
  type OptionsFeatures,
  type TimeContextFeatures,
  type VolatilityFeatures,
  type VolumeLiquidityFeatures,
} from './types';

export interface BrainFeatureInput {
  eventId: string;
  workspaceId: string;
  symbol: string;
  assetClass: AssetClass;
  timeframe: string;
  asOfTs: Date;
  marketStructure?: MarketStructureFeatures;
  volatility?: VolatilityFeatures;
  volumeLiquidity?: VolumeLiquidityFeatures;
  options?: OptionsFeatures;
  derivatives?: DerivativesFeatures;
  timeContext?: TimeContextFeatures;
  macroContext?: MacroContextFeatures;
  aiEvidence?: AiEvidenceFeatures;
  /** Explicit lists of bucket-qualified field names that were stale/simulated. */
  staleFields?: string[];
  simulatedFields?: string[];
}

const REQUIRED_OPTIONS_MISSING_FLAG = 'options_data_missing';
const REQUIRED_DERIV_MISSING_FLAG = 'derivatives_data_missing';

function snapshotHash(buckets: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(buckets)).digest('hex');
}

function countMissing(features: object | undefined | null): number {
  if (!features) return 0;
  let n = 0;
  for (const v of Object.values(features as Record<string, unknown>)) {
    if (v === null || v === undefined) n++;
  }
  return n;
}

export async function recordBrainFeatures(
  input: BrainFeatureInput,
): Promise<BrainFeatureSnapshot> {
  if (!input.eventId) throw new Error('recordBrainFeatures: eventId required');
  if (!input.workspaceId) throw new Error('recordBrainFeatures: workspaceId required');
  if (!input.symbol) throw new Error('recordBrainFeatures: symbol required');
  if (!input.asOfTs) throw new Error('recordBrainFeatures: asOfTs required');

  // Hard-require explicit missing flags so we cannot silently fabricate.
  if (input.options && !(REQUIRED_OPTIONS_MISSING_FLAG in input.options)) {
    throw new Error(
      `recordBrainFeatures: options bucket must include '${REQUIRED_OPTIONS_MISSING_FLAG}'`,
    );
  }
  if (input.derivatives && !(REQUIRED_DERIV_MISSING_FLAG in input.derivatives)) {
    throw new Error(
      `recordBrainFeatures: derivatives bucket must include '${REQUIRED_DERIV_MISSING_FLAG}'`,
    );
  }

  const market_structure = input.marketStructure ?? {};
  const volatility = input.volatility ?? {};
  const volume_liquidity = input.volumeLiquidity ?? {};
  const options = input.options ?? { options_data_missing: true };
  const derivatives = input.derivatives ?? { derivatives_data_missing: true };
  const time_context = input.timeContext ?? {};
  const macro_context = input.macroContext ?? {};
  const ai_evidence: AiEvidenceFeatures = input.aiEvidence ?? {
    missing_data_count: 0,
    stale_data_count: 0,
  };

  const buckets = {
    market_structure,
    volatility,
    volume_liquidity,
    options,
    derivatives,
    time_context,
    macro_context,
    ai_evidence,
  };

  const missing =
    countMissing(market_structure) +
    countMissing(volatility) +
    countMissing(volume_liquidity) +
    countMissing(options) +
    countMissing(derivatives) +
    countMissing(time_context) +
    countMissing(macro_context) +
    (options.options_data_missing ? 1 : 0) +
    (derivatives.derivatives_data_missing ? 1 : 0);

  const stale = input.staleFields?.length ?? ai_evidence.stale_data_count ?? 0;
  const simulated = input.simulatedFields?.length ?? 0;

  const featureId = randomUUID();
  const hash = snapshotHash(buckets);
  const ingestedAt = new Date();

  await q(
    `INSERT INTO brain_features (
       feature_id, event_id, workspace_id, symbol, asset_class, timeframe,
       as_of_ts, ingested_at, snapshot_hash, feature_schema_version,
       market_structure, volatility, volume_liquidity, options, derivatives,
       time_context, macro_context, ai_evidence,
       missing_data_count, stale_data_count, simulated_field_count
     ) VALUES (
       $1,$2,$3,$4,$5,$6,
       $7,$8,$9,$10,
       $11,$12,$13,$14,$15,
       $16,$17,$18,
       $19,$20,$21
     )`,
    [
      featureId,
      input.eventId,
      input.workspaceId,
      input.symbol,
      input.assetClass,
      input.timeframe,
      input.asOfTs,
      ingestedAt,
      hash,
      BRAIN_FEATURE_SCHEMA_VERSION,
      JSON.stringify(market_structure),
      JSON.stringify(volatility),
      JSON.stringify(volume_liquidity),
      JSON.stringify(options),
      JSON.stringify(derivatives),
      JSON.stringify(time_context),
      JSON.stringify(macro_context),
      JSON.stringify(ai_evidence),
      missing,
      stale,
      simulated,
    ],
  );

  return {
    featureId,
    eventId: input.eventId,
    workspaceId: input.workspaceId,
    symbol: input.symbol,
    assetClass: input.assetClass,
    timeframe: input.timeframe,
    asOfTs: input.asOfTs,
    ingestedAt,
    snapshotHash: hash,
    featureSchemaVersion: BRAIN_FEATURE_SCHEMA_VERSION,
    marketStructure: market_structure,
    volatility,
    volumeLiquidity: volume_liquidity,
    options,
    derivatives,
    timeContext: time_context,
    macroContext: macro_context,
    aiEvidence: ai_evidence,
    missingDataCount: missing,
    staleDataCount: stale,
    simulatedFieldCount: simulated,
  };
}
