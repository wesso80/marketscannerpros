import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { q } from '../lib/db';

type Regime = 'risk_on' | 'neutral' | 'risk_off';
type CapitalMode = 'normal' | 'reduced' | 'defensive';
type Eligibility = 'eligible' | 'conditional' | 'blocked';

type AssetClass = 'equity' | 'crypto';

type SourceRow = {
  symbol: string;
  asset_type: AssetClass;
  tier: number;
  change_percent: number | null;
  volume: number | null;
  rsi14: number | null;
  adx14: number | null;
  macd_hist: number | null;
  atr14: number | null;
  close_latest: number | null;
  close_20: number | null;
  avg_volume20: number | null;
};

type GlobalSnapshot = {
  id: string | null;
  regime: Regime;
  capital_mode: CapitalMode;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFinite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sign(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function classifyCluster(row: SourceRow): string {
  if (row.asset_type === 'equity') {
    const volume = toFinite(row.volume);
    if (Math.abs(toFinite(row.change_percent)) >= 6 && volume >= 1_500_000) return 'high_beta';
    if (volume >= 20_000_000) return 'large_cap';
    if (volume >= 8_000_000) return 'mid_cap';
    if (volume >= 2_000_000) return 'small_cap';
    return 'micro_cap';
  }

  const memecoinSet = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'MEME', 'POPCAT', 'TURBO', 'BRETT', 'MEW']);
  if (memecoinSet.has(row.symbol.toUpperCase())) return 'high_beta';
  if (row.tier <= 1) return 'top_10';
  if (row.tier === 2) return 'top_11_50';
  return 'top_51_200';
}

function computeRarScore(row: SourceRow): number {
  const latest = toFinite(row.close_latest);
  const close20 = toFinite(row.close_20);
  const atr = toFinite(row.atr14);

  if (latest <= 0 || close20 <= 0) return 50;

  const ret20 = ((latest - close20) / close20) * 100;
  const atrPct = latest > 0 ? (atr / latest) * 100 : 0;
  const rawRar = ret20 / Math.max(atrPct, 0.25);

  return clamp(50 + rawRar * 6, 0, 100);
}

function computeConfluence(row: SourceRow, regime: Regime): number {
  const rsi = toFinite(row.rsi14);
  const adx = toFinite(row.adx14);
  const macdHist = toFinite(row.macd_hist);
  const changePercent = toFinite(row.change_percent);
  const relVol = toFinite(row.volume) / Math.max(1, toFinite(row.avg_volume20, toFinite(row.volume) || 1));

  let score = 50;

  if (rsi >= 45 && rsi <= 65) score += 8;
  else if (rsi > 70) score -= 6;
  else if (rsi < 35) score -= 8;

  if (macdHist > 0) score += 6;
  else if (macdHist < 0) score -= 6;

  if (adx >= 20) score += 5;
  if (adx >= 30) score += 2;

  score += clamp(changePercent, -3.5, 3.5) * 2;
  score += clamp((relVol - 1) * 10, -6, 10);

  if (regime === 'risk_off') score -= 4;
  if (regime === 'risk_on') score += 2;

  return clamp(Math.round(score), 0, 100);
}

function computeMicroRaw(row: SourceRow): number {
  const changePercent = toFinite(row.change_percent);
  const relVol = toFinite(row.volume) / Math.max(1, toFinite(row.avg_volume20, toFinite(row.volume) || 1));

  const momentum = clamp(changePercent * 0.9, -5.5, 5.5);
  const liquidity = clamp((relVol - 1) * 4, -3.5, 3.5);

  return clamp(momentum + liquidity, -8, 8);
}

async function getLatestGlobalSnapshot(): Promise<GlobalSnapshot> {
  const rows = await q<{ id: string; regime: Regime; capital_mode: CapitalMode }>(
    `SELECT id, regime, capital_mode
       FROM global_regime_snapshots
      ORDER BY created_at DESC
      LIMIT 1`,
  );

  if (!rows.length) {
    return {
      id: null,
      regime: 'neutral',
      capital_mode: 'reduced',
    };
  }

  return rows[0];
}

async function loadSourceRows(): Promise<SourceRow[]> {
  return q<SourceRow>(
    `SELECT
        su.symbol,
        su.asset_type,
        su.tier,
        ql.change_percent,
        ql.volume,
        il.rsi14,
        il.adx14,
        il.macd_hist,
        il.atr14,
        latest.close_latest,
        d20.close_20,
        vol20.avg_volume20
      FROM symbol_universe su
      LEFT JOIN quotes_latest ql
        ON ql.symbol = su.symbol
      LEFT JOIN indicators_latest il
        ON il.symbol = su.symbol
       AND il.timeframe = 'daily'
      LEFT JOIN LATERAL (
        SELECT ob.close AS close_latest
          FROM ohlcv_bars ob
         WHERE ob.symbol = su.symbol
           AND ob.timeframe = 'daily'
         ORDER BY ob.ts DESC
         LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT ob.close AS close_20
          FROM ohlcv_bars ob
         WHERE ob.symbol = su.symbol
           AND ob.timeframe = 'daily'
         ORDER BY ob.ts DESC
         OFFSET 20
         LIMIT 1
      ) d20 ON TRUE
      LEFT JOIN LATERAL (
        SELECT AVG(v.volume)::numeric AS avg_volume20
          FROM (
            SELECT ob.volume
              FROM ohlcv_bars ob
             WHERE ob.symbol = su.symbol
               AND ob.timeframe = 'daily'
             ORDER BY ob.ts DESC
             LIMIT 20
          ) v
      ) vol20 ON TRUE
      WHERE su.enabled = TRUE
        AND su.asset_type IN ('equity', 'crypto')`,
  );
}

async function loadPreviousMicroAdjustments(hourStart: Date): Promise<Map<string, number[]>> {
  const rows = await q<{ symbol: string; micro_adjustment: number }>(
    `SELECT symbol, micro_adjustment
       FROM crcs_hourly_base
      WHERE computed_at < $1
      ORDER BY computed_at DESC
      LIMIT 4000`,
    [hourStart.toISOString()],
  );

  const output = new Map<string, number[]>();

  for (const row of rows) {
    const key = row.symbol.toUpperCase();
    const bucket = output.get(key) || [];
    if (bucket.length < 2) {
      bucket.push(toFinite(row.micro_adjustment));
      output.set(key, bucket);
    }
  }

  return output;
}

function computeEligibility(
  confluenceScore: number,
  cluster: string,
  relVol: number,
  globalSnapshot: GlobalSnapshot,
): Eligibility {
  if (confluenceScore < 42) return 'blocked';
  if (relVol < 0.55) return 'blocked';

  if (globalSnapshot.capital_mode === 'defensive') {
    if (cluster === 'micro_cap' || cluster === 'high_beta' || cluster === 'top_51_200') return 'blocked';
    if (confluenceScore < 58) return 'conditional';
    return 'conditional';
  }

  if (globalSnapshot.capital_mode === 'reduced') {
    if (cluster === 'micro_cap' && confluenceScore < 65) return 'blocked';
    if (confluenceScore >= 65 && relVol >= 0.9) return 'eligible';
    return 'conditional';
  }

  if (confluenceScore >= 62 && relVol >= 0.8) return 'eligible';
  return 'conditional';
}

async function upsertMicroRegimeSnapshots(
  rows: Array<{ assetClass: AssetClass; changePercent: number; relVol: number; microAdjustment: number }>,
  computedAt: Date,
) {
  const byAsset = new Map<AssetClass, Array<{ changePercent: number; relVol: number; microAdjustment: number }>>();

  for (const row of rows) {
    const bucket = byAsset.get(row.assetClass) || [];
    bucket.push({
      changePercent: row.changePercent,
      relVol: row.relVol,
      microAdjustment: row.microAdjustment,
    });
    byAsset.set(row.assetClass, bucket);
  }

  for (const [assetClass, bucket] of byAsset.entries()) {
    const positives = bucket.filter((entry) => entry.changePercent > 0).length;
    const breadth = bucket.length > 0 ? (positives / bucket.length) * 100 : 50;
    const avgAbsMove = bucket.length > 0
      ? bucket.reduce((sum, entry) => sum + Math.abs(entry.changePercent), 0) / bucket.length
      : 0;
    const avgRelVol = bucket.length > 0
      ? bucket.reduce((sum, entry) => sum + entry.relVol, 0) / bucket.length
      : 1;

    const stateScore = ((breadth - 50) * 0.12) + ((avgRelVol - 1) * 4) - Math.max(0, avgAbsMove - 2.5);
    const microState = stateScore >= 2 ? 'risk_on' : stateScore <= -2 ? 'risk_off' : 'neutral';

    await q(
      `INSERT INTO micro_regime_snapshots (asset_class, micro_state, adjustment_cap, components_json, computed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        assetClass,
        microState,
        8,
        JSON.stringify({
          breadthPercent: Number(breadth.toFixed(2)),
          avgAbsMove: Number(avgAbsMove.toFixed(4)),
          avgRelVol: Number(avgRelVol.toFixed(4)),
          symbolCount: bucket.length,
        }),
        computedAt.toISOString(),
      ],
    );
  }
}

async function runHourly() {
  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  const hourEnd = new Date(hourStart.getTime() + (60 * 60 * 1000));
  const computedAt = new Date(hourStart.getTime() + (5 * 60 * 1000));

  const globalSnapshot = await getLatestGlobalSnapshot();
  const sourceRows = await loadSourceRows();
  const previousAdjustments = await loadPreviousMicroAdjustments(hourStart);

  await q(
    `DELETE FROM crcs_hourly_base
      WHERE computed_at >= $1
        AND computed_at < $2`,
    [hourStart.toISOString(), hourEnd.toISOString()],
  );

  const microInputs: Array<{ assetClass: AssetClass; changePercent: number; relVol: number; microAdjustment: number }> = [];

  for (const row of sourceRows) {
    const cluster = classifyCluster(row);
    const rarScore = computeRarScore(row);
    const confluenceScore = computeConfluence(row, globalSnapshot.regime);

    const relVol = toFinite(row.volume) / Math.max(1, toFinite(row.avg_volume20, toFinite(row.volume) || 1));
    const eligibility = computeEligibility(confluenceScore, cluster, relVol, globalSnapshot);

    const eligibilityModifier = eligibility === 'eligible' ? 100 : eligibility === 'conditional' ? 70 : 0;
    const crcsBase = clamp((0.4 * rarScore) + (0.5 * confluenceScore) + (0.1 * eligibilityModifier), 0, 100);

    const rawMicro = computeMicroRaw(row);
    const previous = previousAdjustments.get(row.symbol.toUpperCase()) || [];

    let microAdjustment = rawMicro;
    if (previous.length >= 2 && sign(rawMicro) !== 0) {
      const prevSign = sign(previous[0]);
      const prev2Sign = sign(previous[1]);
      if (prevSign !== 0 && prevSign === prev2Sign && sign(rawMicro) !== prevSign) {
        microAdjustment = rawMicro * 0.5;
      }
    }

    if (globalSnapshot.regime === 'risk_off' && microAdjustment > 0) {
      microAdjustment *= 0.7;
    }

    microAdjustment = clamp(Number(microAdjustment.toFixed(2)), -8, 8);
    const crcsFinal = clamp(Number((crcsBase + microAdjustment).toFixed(2)), 0, 100);

    await q(
      `INSERT INTO crcs_hourly_base (
         symbol,
         asset_class,
         cluster,
         global_eligibility,
         confluence_score,
         rar_score,
         crcs_base,
         micro_adjustment,
         crcs_final,
         capital_mode,
         regime_snapshot_id,
         computed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        row.symbol.toUpperCase(),
        row.asset_type,
        cluster,
        eligibility,
        Number(confluenceScore.toFixed(2)),
        Number(rarScore.toFixed(2)),
        Number(crcsBase.toFixed(2)),
        microAdjustment,
        crcsFinal,
        globalSnapshot.capital_mode,
        globalSnapshot.id,
        computedAt.toISOString(),
      ],
    );

    microInputs.push({
      assetClass: row.asset_type,
      changePercent: toFinite(row.change_percent),
      relVol,
      microAdjustment,
    });
  }

  await upsertMicroRegimeSnapshots(microInputs, computedAt);

  console.log('[upe-crcs-hourly] completed', {
    symbolsProcessed: sourceRows.length,
    computedAt: computedAt.toISOString(),
    globalRegime: globalSnapshot.regime,
    capitalMode: globalSnapshot.capital_mode,
  });
}

runHourly().catch((error) => {
  console.error('[upe-crcs-hourly] fatal error', error);
  process.exit(1);
});
