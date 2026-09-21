import { pool, tx } from '@/lib/db';
import { evaluateDiamondConfirmation, type DiamondConfirmationResult } from '@/lib/diamondHunterValidation';
import type { DiamondAttention, DiamondConfidence, DiamondStage } from '@/lib/diamondHunter';

export interface DiamondHistoryCandidate {
  id: string;
  network: string;
  poolAddress: string;
  tokenAddress: string | null;
  symbol: string;
  name: string;
  priceUsd: number;
  score: number;
  stage: DiamondStage;
  confidence: DiamondConfidence;
  attention: DiamondAttention;
  hardReject: boolean;
  riskFlags: string[];
  metrics: {
    ageMinutes: number | null;
    liquidityUsd: number;
    fdvUsd: number;
    volume5mUsd: number;
    buyers5m: number;
    sellers5m: number;
  };
  security: {
    isHoneypot: boolean | 'unknown' | null;
  } | null;
}

export interface DiamondHistoryState {
  firstSeenAt: string;
  firstDetectedAt: string | null;
  firstTrendingAt: string | null;
  confirmedAt: string | null;
  scanCount: number;
  qualifyingScanCount: number;
  diamondScanCount: number;
  deepCheckCount: number;
  scoreDelta5m: number;
  liquidityChangePct: number | null;
  detectedMinutesAgo: number | null;
  discoveryLeadMinutes: number | null;
  confirmation: DiamondConfirmationResult;
}

let schemaPromise: Promise<void> | null = null;

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pctChange(current: number, initial: number): number | null {
  if (!(initial > 0) || !Number.isFinite(current)) return null;
  return Math.round((((current / initial) - 1) * 100) * 10) / 10;
}

export function ensureDiamondHunterSchema(): Promise<void> {
  if (!process.env.DATABASE_URL) return Promise.resolve();
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS diamond_hunter_candidates (
        pool_id TEXT PRIMARY KEY,
        network TEXT NOT NULL,
        pool_address TEXT NOT NULL,
        token_address TEXT,
        symbol TEXT,
        name TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        first_detected_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        first_price_usd NUMERIC,
        latest_price_usd NUMERIC,
        first_liquidity_usd NUMERIC,
        latest_liquidity_usd NUMERIC,
        first_score INTEGER,
        latest_score INTEGER,
        peak_score INTEGER,
        scan_count INTEGER NOT NULL DEFAULT 0,
        qualifying_scan_count INTEGER NOT NULL DEFAULT 0,
        diamond_scan_count INTEGER NOT NULL DEFAULT 0,
        deep_check_count INTEGER NOT NULL DEFAULT 0,
        first_trending_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ,
        latest_attention TEXT,
        latest_stage TEXT,
        latest_validation_stage TEXT,
        last_risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_diamond_candidates_detected
        ON diamond_hunter_candidates (first_detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_diamond_candidates_validation
        ON diamond_hunter_candidates (latest_validation_stage, last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS diamond_hunter_snapshots (
        id BIGSERIAL PRIMARY KEY,
        pool_id TEXT NOT NULL REFERENCES diamond_hunter_candidates(pool_id) ON DELETE CASCADE,
        scanned_at TIMESTAMPTZ NOT NULL,
        score INTEGER NOT NULL,
        stage TEXT NOT NULL,
        validation_stage TEXT NOT NULL,
        confidence TEXT NOT NULL,
        attention TEXT NOT NULL,
        price_usd NUMERIC,
        liquidity_usd NUMERIC,
        fdv_usd NUMERIC,
        volume_5m_usd NUMERIC,
        buyers_5m INTEGER,
        sellers_5m INTEGER,
        score_delta_5m NUMERIC,
        liquidity_change_pct NUMERIC,
        hard_reject BOOLEAN NOT NULL DEFAULT FALSE,
        risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_diamond_snapshots_pool_time
        ON diamond_hunter_snapshots (pool_id, scanned_at DESC);
      CREATE INDEX IF NOT EXISTS idx_diamond_snapshots_time
        ON diamond_hunter_snapshots (scanned_at DESC);

      CREATE TABLE IF NOT EXISTS diamond_hunter_outcomes (
        pool_id TEXT NOT NULL REFERENCES diamond_hunter_candidates(pool_id) ON DELETE CASCADE,
        horizon TEXT NOT NULL CHECK (horizon IN ('1h','6h','24h','72h','7d')),
        target_at TIMESTAMPTZ NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL,
        start_price_usd NUMERIC,
        observed_price_usd NUMERIC,
        return_pct NUMERIC,
        mfe_pct NUMERIC,
        mae_pct NUMERIC,
        liquidity_change_pct NUMERIC,
        discovery_lead_minutes NUMERIC,
        PRIMARY KEY (pool_id, horizon)
      );
      CREATE INDEX IF NOT EXISTS idx_diamond_outcomes_observed
        ON diamond_hunter_outcomes (observed_at DESC);
    `).then(() => undefined).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function recordDiamondScan(
  candidates: DiamondHistoryCandidate[],
  scannedAt: Date,
): Promise<Map<string, DiamondHistoryState>> {
  const states = new Map<string, DiamondHistoryState>();
  if (!process.env.DATABASE_URL || candidates.length === 0) return states;

  await ensureDiamondHunterSchema();

  await tx(async (client) => {
    for (const candidate of candidates) {
      const previous = await client.query<{ score: number; scanned_at: Date }>(
        `SELECT score, scanned_at
         FROM diamond_hunter_snapshots
         WHERE pool_id = $1
         ORDER BY scanned_at DESC
         LIMIT 1`,
        [candidate.id],
      );

      const qualifies = candidate.score >= 60 && !candidate.hardReject ? 1 : 0;
      const diamondQualifies = candidate.score >= 80 && !candidate.hardReject ? 1 : 0;
      const deepChecked = candidate.confidence === 'DEEP_CHECKED' ? 1 : 0;
      const detectedAt = qualifies ? scannedAt : null;
      const trendingAt = candidate.attention === 'POOL_TRENDING' || candidate.attention === 'COINGECKO_TRENDING'
        ? scannedAt
        : null;

      const upsert = await client.query<{
        first_seen_at: Date;
        first_detected_at: Date | null;
        first_trending_at: Date | null;
        confirmed_at: Date | null;
        first_liquidity_usd: string | null;
        scan_count: number;
        qualifying_scan_count: number;
        diamond_scan_count: number;
        deep_check_count: number;
      }>(
        `INSERT INTO diamond_hunter_candidates (
           pool_id, network, pool_address, token_address, symbol, name,
           first_seen_at, first_detected_at, last_seen_at,
           first_price_usd, latest_price_usd,
           first_liquidity_usd, latest_liquidity_usd,
           first_score, latest_score, peak_score,
           scan_count, qualifying_scan_count, diamond_scan_count, deep_check_count,
           first_trending_at, latest_attention, latest_stage, last_risk_flags, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,
           $7,$8,$7,
           $9,$9,$10,$10,
           $11,$11,$11,
           1,$12,$13,$14,
           $15,$16,$17,$18::jsonb,$7
         )
         ON CONFLICT (pool_id) DO UPDATE SET
           network = EXCLUDED.network,
           pool_address = EXCLUDED.pool_address,
           token_address = COALESCE(EXCLUDED.token_address, diamond_hunter_candidates.token_address),
           symbol = EXCLUDED.symbol,
           name = EXCLUDED.name,
           first_detected_at = COALESCE(diamond_hunter_candidates.first_detected_at, EXCLUDED.first_detected_at),
           last_seen_at = EXCLUDED.last_seen_at,
           first_price_usd = COALESCE(diamond_hunter_candidates.first_price_usd, EXCLUDED.first_price_usd),
           latest_price_usd = EXCLUDED.latest_price_usd,
           first_liquidity_usd = COALESCE(diamond_hunter_candidates.first_liquidity_usd, EXCLUDED.first_liquidity_usd),
           latest_liquidity_usd = EXCLUDED.latest_liquidity_usd,
           latest_score = EXCLUDED.latest_score,
           peak_score = GREATEST(COALESCE(diamond_hunter_candidates.peak_score, EXCLUDED.peak_score), EXCLUDED.peak_score),
           scan_count = diamond_hunter_candidates.scan_count + 1,
           qualifying_scan_count = diamond_hunter_candidates.qualifying_scan_count + EXCLUDED.qualifying_scan_count,
           diamond_scan_count = diamond_hunter_candidates.diamond_scan_count + EXCLUDED.diamond_scan_count,
           deep_check_count = diamond_hunter_candidates.deep_check_count + EXCLUDED.deep_check_count,
           first_trending_at = COALESCE(diamond_hunter_candidates.first_trending_at, EXCLUDED.first_trending_at),
           latest_attention = EXCLUDED.latest_attention,
           latest_stage = EXCLUDED.latest_stage,
           last_risk_flags = EXCLUDED.last_risk_flags,
           updated_at = EXCLUDED.updated_at
         RETURNING first_seen_at, first_detected_at, first_trending_at, confirmed_at,
                   first_liquidity_usd, scan_count, qualifying_scan_count, diamond_scan_count, deep_check_count`,
        [
          candidate.id,
          candidate.network,
          candidate.poolAddress,
          candidate.tokenAddress,
          candidate.symbol,
          candidate.name,
          scannedAt,
          detectedAt,
          qualifies ? candidate.priceUsd : null,
          qualifies ? candidate.metrics.liquidityUsd : null,
          candidate.score,
          qualifies,
          diamondQualifies,
          deepChecked,
          trendingAt,
          candidate.attention,
          candidate.stage,
          JSON.stringify(candidate.riskFlags),
        ],
      );

      const row = upsert.rows[0];
      const firstLiquidity = num(row.first_liquidity_usd);
      const liquidityChangePct = pctChange(candidate.metrics.liquidityUsd, firstLiquidity);

      let scoreDelta5m = 0;
      const prev = previous.rows[0];
      if (prev) {
        const elapsed5m = Math.max((scannedAt.getTime() - new Date(prev.scanned_at).getTime()) / 300_000, 0.2);
        scoreDelta5m = Math.round(((candidate.score - num(prev.score)) / elapsed5m) * 10) / 10;
      }

      const confirmation = evaluateDiamondConfirmation({
        score: candidate.score,
        stage: candidate.stage,
        confidence: candidate.confidence,
        attention: candidate.attention,
        hardReject: candidate.hardReject,
        riskFlags: candidate.riskFlags,
        ageMinutes: candidate.metrics.ageMinutes,
        liquidityUsd: candidate.metrics.liquidityUsd,
        isHoneypot: candidate.security?.isHoneypot,
        qualifyingScanCount: row.qualifying_scan_count,
        diamondScanCount: row.diamond_scan_count,
        liquidityChangePct,
      });

      const firstDetectedAt = row.first_detected_at ? new Date(row.first_detected_at) : null;
      const firstTrendingAt = row.first_trending_at ? new Date(row.first_trending_at) : null;
      const discoveryLeadMinutes = firstDetectedAt && firstTrendingAt
        ? Math.round(((firstTrendingAt.getTime() - firstDetectedAt.getTime()) / 60_000) * 10) / 10
        : null;
      const detectedMinutesAgo = firstDetectedAt
        ? Math.max(0, Math.round(((scannedAt.getTime() - firstDetectedAt.getTime()) / 60_000) * 10) / 10)
        : null;

      const confirmedAt = confirmation.validationStage === 'CONFIRMED_DIAMOND'
        ? (row.confirmed_at ? new Date(row.confirmed_at) : scannedAt)
        : (row.confirmed_at ? new Date(row.confirmed_at) : null);

      await client.query(
        `UPDATE diamond_hunter_candidates
         SET latest_validation_stage = $2,
             confirmed_at = CASE WHEN $2 = 'CONFIRMED_DIAMOND' THEN COALESCE(confirmed_at, $3) ELSE confirmed_at END
         WHERE pool_id = $1`,
        [candidate.id, confirmation.validationStage, confirmedAt],
      );

      await client.query(
        `INSERT INTO diamond_hunter_snapshots (
           pool_id, scanned_at, score, stage, validation_stage, confidence, attention,
           price_usd, liquidity_usd, fdv_usd, volume_5m_usd, buyers_5m, sellers_5m,
           score_delta_5m, liquidity_change_pct, hard_reject, risk_flags
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,
           $8,$9,$10,$11,$12,$13,
           $14,$15,$16,$17::jsonb
         )`,
        [
          candidate.id,
          scannedAt,
          candidate.score,
          candidate.stage,
          confirmation.validationStage,
          candidate.confidence,
          candidate.attention,
          candidate.priceUsd,
          candidate.metrics.liquidityUsd,
          candidate.metrics.fdvUsd,
          candidate.metrics.volume5mUsd,
          candidate.metrics.buyers5m,
          candidate.metrics.sellers5m,
          scoreDelta5m,
          liquidityChangePct,
          candidate.hardReject,
          JSON.stringify(candidate.riskFlags),
        ],
      );

      states.set(candidate.id, {
        firstSeenAt: new Date(row.first_seen_at).toISOString(),
        firstDetectedAt: firstDetectedAt?.toISOString() ?? null,
        firstTrendingAt: firstTrendingAt?.toISOString() ?? null,
        confirmedAt: confirmedAt?.toISOString() ?? null,
        scanCount: row.scan_count,
        qualifyingScanCount: row.qualifying_scan_count,
        diamondScanCount: row.diamond_scan_count,
        deepCheckCount: row.deep_check_count,
        scoreDelta5m,
        liquidityChangePct,
        detectedMinutesAgo,
        discoveryLeadMinutes,
        confirmation,
      });
    }
  });

  return states;
}

export interface DueDiamondOutcome {
  poolId: string;
  network: string;
  poolAddress: string;
  horizon: '1h' | '6h' | '24h' | '72h' | '7d';
  targetAt: Date;
  firstDetectedAt: Date;
  startPriceUsd: number;
  firstLiquidityUsd: number;
  firstTrendingAt: Date | null;
}

export async function getDueDiamondOutcomes(limit = 6): Promise<DueDiamondOutcome[]> {
  if (!process.env.DATABASE_URL) return [];
  await ensureDiamondHunterSchema();

  const result = await pool.query<{
    pool_id: string;
    network: string;
    pool_address: string;
    horizon: DueDiamondOutcome['horizon'];
    target_at: Date;
    first_detected_at: Date;
    first_price_usd: string;
    first_liquidity_usd: string;
    first_trending_at: Date | null;
  }>(
    `WITH horizons(horizon, mins) AS (
       VALUES ('1h',60),('6h',360),('24h',1440),('72h',4320),('7d',10080)
     )
     SELECT c.pool_id, c.network, c.pool_address, h.horizon,
            c.first_detected_at + make_interval(mins => h.mins) AS target_at,
            c.first_detected_at, c.first_price_usd, c.first_liquidity_usd, c.first_trending_at
     FROM diamond_hunter_candidates c
     CROSS JOIN horizons h
     LEFT JOIN diamond_hunter_outcomes o ON o.pool_id = c.pool_id AND o.horizon = h.horizon
     WHERE c.first_detected_at IS NOT NULL
       AND c.first_price_usd IS NOT NULL
       AND c.first_price_usd > 0
       AND o.pool_id IS NULL
       AND NOW() >= c.first_detected_at + make_interval(mins => h.mins)
       AND c.first_detected_at > NOW() - INTERVAL '10 days'
     ORDER BY target_at ASC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    poolId: row.pool_id,
    network: row.network,
    poolAddress: row.pool_address,
    horizon: row.horizon,
    targetAt: new Date(row.target_at),
    firstDetectedAt: new Date(row.first_detected_at),
    startPriceUsd: num(row.first_price_usd),
    firstLiquidityUsd: num(row.first_liquidity_usd),
    firstTrendingAt: row.first_trending_at ? new Date(row.first_trending_at) : null,
  }));
}

export async function getDiamondPriceExtremes(poolId: string, since: Date): Promise<{ max: number; min: number }> {
  if (!process.env.DATABASE_URL) return { max: 0, min: 0 };
  const result = await pool.query<{ max_price: string | null; min_price: string | null }>(
    `SELECT MAX(price_usd) AS max_price, MIN(price_usd) AS min_price
     FROM diamond_hunter_snapshots
     WHERE pool_id = $1 AND scanned_at >= $2 AND price_usd > 0`,
    [poolId, since],
  );
  return {
    max: num(result.rows[0]?.max_price),
    min: num(result.rows[0]?.min_price),
  };
}

export async function saveDiamondOutcome(input: {
  poolId: string;
  horizon: DueDiamondOutcome['horizon'];
  targetAt: Date;
  observedAt: Date;
  startPriceUsd: number;
  observedPriceUsd: number;
  returnPct: number | null;
  mfePct: number | null;
  maePct: number | null;
  liquidityChangePct: number | null;
  discoveryLeadMinutes: number | null;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await ensureDiamondHunterSchema();
  await pool.query(
    `INSERT INTO diamond_hunter_outcomes (
       pool_id, horizon, target_at, observed_at, start_price_usd, observed_price_usd,
       return_pct, mfe_pct, mae_pct, liquidity_change_pct, discovery_lead_minutes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (pool_id, horizon) DO NOTHING`,
    [
      input.poolId,
      input.horizon,
      input.targetAt,
      input.observedAt,
      input.startPriceUsd,
      input.observedPriceUsd,
      input.returnPct,
      input.mfePct,
      input.maePct,
      input.liquidityChangePct,
      input.discoveryLeadMinutes,
    ],
  );
}
