/**
 * Unified Signal Service
 * 
 * Single pipeline for all predictive engines:
 * - Scanner (squeeze, momentum, macd_cross, rsi_bounce)
 * - Confluence alignment
 * - Options flow analysis
 * - Deep analysis
 * 
 * This ensures:
 * 1. Consistent feature snapshots
 * 2. Deduplication (same signal won't record twice)
 * 3. Versioning
 * 4. Single source of truth
 * 
 * Pages that should record signals:
 * ✅ Scanner, Confluence, Options Analysis, Deep Analysis
 * 
 * Pages that should NOT record signals:
 * ❌ Portfolio (outcome data), Journal (links to signals), Quote/Chart (display only)
 */

import { Pool } from 'pg';

// Lazy pool for worker context (allows dotenv to run first)
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: { rejectUnauthorized: false }
    });
  }
  return _pool;
}

async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}

/**
 * Compute signal bucket based on timeframe for deduplication
 * Matches the bucketing logic from the SQL migration
 */
function computeSignalBucket(signalAt: Date, timeframe: string): Date {
  const tf = (timeframe || 'daily').toLowerCase();
  
  switch (tf) {
    case '15m': {
      // Bucket to 15-minute intervals
      const bucket = new Date(signalAt);
      bucket.setSeconds(0, 0);
      bucket.setMinutes(Math.floor(bucket.getMinutes() / 15) * 15);
      return bucket;
    }
    case '1h':
    case '60min': {
      // Bucket to hour
      const bucket = new Date(signalAt);
      bucket.setMinutes(0, 0, 0);
      return bucket;
    }
    case '4h': {
      // Bucket to 4-hour intervals
      const bucket = new Date(signalAt);
      bucket.setMinutes(0, 0, 0);
      bucket.setHours(Math.floor(bucket.getHours() / 4) * 4);
      return bucket;
    }
    case '1d':
    case 'd':
    case 'daily': {
      // Bucket to day
      const bucket = new Date(signalAt);
      bucket.setHours(0, 0, 0, 0);
      return bucket;
    }
    default: {
      // Default to hourly
      const bucket = new Date(signalAt);
      bucket.setMinutes(0, 0, 0);
      return bucket;
    }
  }
}

// Current scanner/signal engine version
export const SIGNAL_ENGINE_VERSION = 'v3.0';

// Signal types by source
export const SIGNAL_TYPES = {
  // Scanner signals
  SQUEEZE: 'squeeze',
  MACD_CROSS: 'macd_cross',
  RSI_BOUNCE: 'rsi_bounce',
  MOMENTUM: 'momentum',
  
  // Confluence signals
  CONFLUENCE_ALIGNMENT: 'confluence_alignment',
  
  // Options signals (future)
  OPTIONS_FLOW: 'options_flow',
  GAMMA_BIAS: 'gamma_bias',
  
  // Deep analysis signals
  DEEP_ANALYSIS: 'deep_analysis',
} as const;

export type SignalType = typeof SIGNAL_TYPES[keyof typeof SIGNAL_TYPES];
export type SignalDirection = 'bullish' | 'bearish';

export interface SignalFeatures {
  // Price data
  price?: number;
  
  // Trend indicators
  rsi?: number;
  macd_hist?: number;
  macd_line?: number;
  macd_signal?: number;
  ema9?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  
  // Volatility/momentum
  atr?: number;
  adx?: number;
  plus_di?: number;
  minus_di?: number;
  
  // Oscillators
  stoch_k?: number;
  stoch_d?: number;
  cci?: number;
  
  // Bollinger/squeeze
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  in_squeeze?: boolean;
  squeeze_strength?: number;
  
  // Options data (when available)
  pcr?: number;
  iv_rank?: number;
  gamma_exposure?: number;
  
  // Confluence data
  confluence_score?: number;
  bullish_signals?: number;
  bearish_signals?: number;
  
  // Meta
  score?: number;
  [key: string]: any;
}

export interface RecordSignalInput {
  symbol: string;
  signalType: SignalType | string;
  direction: SignalDirection;
  score: number;                    // 0-100
  priceAtSignal: number;
  timeframe?: string;               // '15m', '1h', '4h', 'daily'
  features?: SignalFeatures;
  source?: string;                  // 'worker', 'scanner_api', 'confluence', etc.
}

interface RecordResult {
  success: boolean;
  signalId?: number;
  duplicate?: boolean;
  error?: string;
}

/**
 * Record a signal through the unified pipeline.
 * Handles deduplication automatically via unique index.
 * 
 * @returns RecordResult with success status and signal_id if recorded
 */
export async function recordSignal(input: RecordSignalInput): Promise<RecordResult> {
  const {
    symbol,
    signalType,
    direction,
    score,
    priceAtSignal,
    timeframe = 'daily',
    features,
    source = 'unknown'
  } = input;
  
  // Validate
  if (!symbol || !signalType || !direction || score == null || !priceAtSignal) {
    return { success: false, error: 'Missing required fields' };
  }
  
  const validScore = Math.max(0, Math.min(100, Math.round(score)));
  
  // Compute signal bucket for deduplication
  const signalAt = new Date();
  const signalBucket = computeSignalBucket(signalAt, timeframe);
  
  // Add source to features for debugging
  const enrichedFeatures = {
    ...features,
    _source: source,
    _recorded_at: signalAt.toISOString()
  };
  
  try {
    // ON CONFLICT DO NOTHING handles deduplication via unique index
    // Dedupe index: (symbol, signal_type, direction, timeframe, scanner_version, signal_bucket)
    const result = await q<{ id: number }>(
      `INSERT INTO signals_fired (
        symbol, signal_type, direction, score,
        signal_at, price_at_signal,
        timeframe, features_json, scanner_version, signal_bucket
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (symbol, signal_type, direction, timeframe, scanner_version, signal_bucket)
      DO NOTHING
      RETURNING id`,
      [
        symbol.toUpperCase(),
        signalType,
        direction,
        validScore,
        signalAt,
        priceAtSignal,
        timeframe,
        JSON.stringify(enrichedFeatures),
        SIGNAL_ENGINE_VERSION,
        signalBucket
      ]
    );
    
    if (result.length === 0) {
      // Duplicate signal (already recorded in this bucket for this direction)
      return { success: true, duplicate: true };
    }
    
    return { success: true, signalId: result[0].id };
    
  } catch (err: any) {
    // Handle unique constraint violation gracefully
    if (err?.code === '23505') {
      return { success: true, duplicate: true };
    }
    console.error('[signalService] Failed to record signal:', err?.message || err);
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

/**
 * Batch record multiple signals (more efficient for scanner results)
 * Duplicates are silently ignored.
 */
export async function recordSignalsBatch(signals: RecordSignalInput[]): Promise<{ recorded: number; duplicates: number; errors: number }> {
  const stats = { recorded: 0, duplicates: 0, errors: 0 };
  
  if (signals.length === 0) return stats;
  
  // Process in parallel batches of 10
  const batchSize = 10;
  for (let i = 0; i < signals.length; i += batchSize) {
    const batch = signals.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(s => recordSignal(s)));
    
    for (const r of results) {
      if (r.success && r.duplicate) stats.duplicates++;
      else if (r.success) stats.recorded++;
      else stats.errors++;
    }
  }
  
  return stats;
}

/**
 * Get a signal by ID (for linking from journal entries)
 */
export async function getSignalById(signalId: number) {
  const result = await q(`
    SELECT 
      sf.*,
      (
        SELECT json_agg(json_build_object(
          'horizon_minutes', so.horizon_minutes,
          'pct_move', so.pct_move,
          'outcome', so.outcome,
          'labeled_at', so.labeled_at
        ) ORDER BY so.horizon_minutes)
        FROM signal_outcomes so
        WHERE so.signal_id = sf.id
      ) as outcomes
    FROM signals_fired sf
    WHERE sf.id = $1
  `, [signalId]);
  
  return result[0] || null;
}

/**
 * Find signals matching criteria (for journal linking UI)
 */
export async function findSignals(params: {
  symbol?: string;
  signalType?: string;
  direction?: SignalDirection;
  fromDate?: Date;
  toDate?: Date;
  minScore?: number;
  limit?: number;
}) {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;
  
  if (params.symbol) {
    conditions.push(`symbol = $${paramIdx++}`);
    values.push(params.symbol.toUpperCase());
  }
  if (params.signalType) {
    conditions.push(`signal_type = $${paramIdx++}`);
    values.push(params.signalType);
  }
  if (params.direction) {
    conditions.push(`direction = $${paramIdx++}`);
    values.push(params.direction);
  }
  if (params.fromDate) {
    conditions.push(`signal_at >= $${paramIdx++}`);
    values.push(params.fromDate);
  }
  if (params.toDate) {
    conditions.push(`signal_at <= $${paramIdx++}`);
    values.push(params.toDate);
  }
  if (params.minScore) {
    conditions.push(`score >= $${paramIdx++}`);
    values.push(params.minScore);
  }
  
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 50;
  
  return q(`
    SELECT id, symbol, signal_type, direction, score, signal_at, price_at_signal, timeframe
    FROM signals_fired
    ${where}
    ORDER BY signal_at DESC
    LIMIT ${limit}
  `, values);
}

/**
 * Link a journal entry to a signal
 * (Call this from journal API when user associates an entry with a signal)
 */
export async function linkJournalToSignal(journalEntryId: number, signalId: number): Promise<boolean> {
  try {
    await q(`
      UPDATE journal_entries 
      SET signal_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [signalId, journalEntryId]);
    return true;
  } catch (err) {
    console.error('[signalService] Failed to link journal entry:', err);
    return false;
  }
}
