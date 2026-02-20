import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { q } from '../lib/db';

type SnapshotType = 'open' | 'close';
type Regime = 'risk_on' | 'neutral' | 'risk_off';
type CapitalMode = 'normal' | 'reduced' | 'defensive';

type LiquidityState = 'expanding' | 'stable' | 'contracting' | 'unknown';
type VolatilityState = 'low' | 'normal' | 'elevated' | 'unknown';

interface RegimeMetrics {
  equitiesCount: number;
  advancingCount: number;
  decliningCount: number;
  breadthPercent: number;
  avgAbsChangePercent: number;
  avgVolume: number;
  medianVolume: number;
}

interface RegimeSnapshotResult {
  regime: Regime;
  capitalMode: CapitalMode;
  volatilityState: VolatilityState;
  liquidityState: LiquidityState;
  adaptiveConfidence: number;
  components: Record<string, unknown>;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentile(values: number[], pct: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((pct / 100) * (sorted.length - 1))));
  return sorted[index];
}

async function loadRegimeMetrics(): Promise<RegimeMetrics> {
  const rows = await q<{
    change_percent: number | null;
    volume: number | null;
  }>(
    `SELECT ql.change_percent, ql.volume
       FROM quotes_latest ql
       JOIN symbol_universe su ON su.symbol = ql.symbol
      WHERE su.asset_type = 'equity'
        AND su.enabled = TRUE`
  );

  if (!rows.length) {
    return {
      equitiesCount: 0,
      advancingCount: 0,
      decliningCount: 0,
      breadthPercent: 50,
      avgAbsChangePercent: 0,
      avgVolume: 0,
      medianVolume: 0,
    };
  }

  let advancingCount = 0;
  let decliningCount = 0;
  let absChangeSum = 0;
  const volumes: number[] = [];

  for (const row of rows) {
    const changePercent = toNumber(row.change_percent);
    if (changePercent > 0) advancingCount += 1;
    if (changePercent < 0) decliningCount += 1;
    absChangeSum += Math.abs(changePercent);
    const volume = toNumber(row.volume);
    if (volume > 0) volumes.push(volume);
  }

  const equitiesCount = rows.length;
  const breadthPercent = equitiesCount > 0 ? (advancingCount / equitiesCount) * 100 : 50;
  const avgAbsChangePercent = equitiesCount > 0 ? absChangeSum / equitiesCount : 0;
  const avgVolume = volumes.length > 0 ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : 0;
  const medianVolume = percentile(volumes, 50);

  return {
    equitiesCount,
    advancingCount,
    decliningCount,
    breadthPercent,
    avgAbsChangePercent,
    avgVolume,
    medianVolume,
  };
}

function computeRegime(metrics: RegimeMetrics, snapshotType: SnapshotType): RegimeSnapshotResult {
  if (metrics.equitiesCount === 0) {
    return {
      regime: 'neutral',
      capitalMode: 'reduced',
      volatilityState: 'unknown',
      liquidityState: 'unknown',
      adaptiveConfidence: 45,
      components: {
        reason: 'No equity quote data available',
        snapshotType,
      },
    };
  }

  const volatilityState: VolatilityState =
    metrics.avgAbsChangePercent >= 2.0 ? 'elevated' : metrics.avgAbsChangePercent <= 0.7 ? 'low' : 'normal';

  const liquidityState: LiquidityState =
    metrics.medianVolume >= 8_000_000 ? 'expanding' : metrics.medianVolume >= 2_500_000 ? 'stable' : 'contracting';

  const breadthScore = (metrics.breadthPercent - 50) * 1.2;
  const volatilityPenalty = volatilityState === 'elevated' ? -8 : volatilityState === 'low' ? 2 : 0;
  const liquidityBoost = liquidityState === 'expanding' ? 6 : liquidityState === 'contracting' ? -6 : 0;
  const openCloseBias = snapshotType === 'open' ? 1 : 0;

  const postureScore = breadthScore + volatilityPenalty + liquidityBoost + openCloseBias;

  let regime: Regime = 'neutral';
  if (postureScore >= 8) regime = 'risk_on';
  else if (postureScore <= -8) regime = 'risk_off';

  let capitalMode: CapitalMode = 'reduced';
  if (regime === 'risk_on' && volatilityState !== 'elevated') capitalMode = 'normal';
  else if (regime === 'risk_off' || liquidityState === 'contracting') capitalMode = 'defensive';

  const adaptiveConfidence = Math.round(
    Math.max(30, Math.min(90, 50 + Math.abs(postureScore) * 2 + (snapshotType === 'open' ? 2 : 0))),
  );

  return {
    regime,
    capitalMode,
    volatilityState,
    liquidityState,
    adaptiveConfidence,
    components: {
      snapshotType,
      postureScore: Number(postureScore.toFixed(2)),
      equitiesCount: metrics.equitiesCount,
      breadthPercent: Number(metrics.breadthPercent.toFixed(2)),
      avgAbsChangePercent: Number(metrics.avgAbsChangePercent.toFixed(4)),
      avgVolume: Math.round(metrics.avgVolume),
      medianVolume: Math.round(metrics.medianVolume),
      advancingCount: metrics.advancingCount,
      decliningCount: metrics.decliningCount,
    },
  };
}

async function persistSnapshot(snapshotType: SnapshotType, result: RegimeSnapshotResult) {
  const inserted = await q<{ id: string; created_at: string }>(
    `INSERT INTO global_regime_snapshots (
       snapshot_type,
       regime,
       capital_mode,
       volatility_state,
       liquidity_state,
       adaptive_confidence,
       components_json,
       created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     RETURNING id, created_at`,
    [
      snapshotType,
      result.regime,
      result.capitalMode,
      result.volatilityState,
      result.liquidityState,
      result.adaptiveConfidence,
      JSON.stringify(result.components),
    ],
  );

  return inserted[0];
}

function getSnapshotTypeFromArgs(argv: string[]): SnapshotType {
  const explicitType = argv.find((arg) => arg.startsWith('--type='));
  if (explicitType) {
    const value = explicitType.split('=')[1];
    if (value === 'open' || value === 'close') return value;
  }

  if (argv.includes('--open')) return 'open';
  if (argv.includes('--close')) return 'close';
  return 'open';
}

async function main() {
  const snapshotType = getSnapshotTypeFromArgs(process.argv.slice(2));
  const dryRun = process.argv.includes('--dry-run');

  const metrics = await loadRegimeMetrics();
  const result = computeRegime(metrics, snapshotType);

  if (dryRun) {
    console.log('[upe-global-regime] dry-run', {
      snapshotType,
      ...result,
    });
    return;
  }

  const inserted = await persistSnapshot(snapshotType, result);
  console.log('[upe-global-regime] snapshot persisted', {
    id: inserted.id,
    createdAt: inserted.created_at,
    snapshotType,
    regime: result.regime,
    capitalMode: result.capitalMode,
    adaptiveConfidence: result.adaptiveConfidence,
  });
}

main().catch((error) => {
  console.error('[upe-global-regime] fatal error', error);
  process.exit(1);
});
