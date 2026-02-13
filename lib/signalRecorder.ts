/**
 * Signal Recorder - Records scanner signals to signals_fired table
 * 
 * This is part of the AI learning system:
 * 1. Scanner fires → recordSignal() writes to signals_fired (this file)
 * 2. Worker runs → label-outcomes.ts fills signal_outcomes with actual results
 * 3. Stats refresh → accuracy stats computed for dashboard
 */

import { q } from './db';

const SCANNER_VERSION = 'v3.0';

export interface SignalFeatures {
  rsi?: number;
  macd_hist?: number;
  macd_line?: number;
  macd_signal?: number;
  ema9?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  atr?: number;
  adx?: number;
  plus_di?: number;
  minus_di?: number;
  stoch_k?: number;
  stoch_d?: number;
  cci?: number;
  aroon_up?: number;
  aroon_down?: number;
  obv?: number;
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  in_squeeze?: boolean;
  price?: number;
  score?: number;
  [key: string]: any;
}

export interface RecordSignalParams {
  symbol: string;
  signalType: string;          // 'squeeze', 'momentum', 'confluence', etc.
  direction: 'bullish' | 'bearish';
  score: number;               // 0-100
  priceAtSignal: number;
  timeframe?: string;          // '15m', '1h', '4h', '1d'
  features?: SignalFeatures;   // Indicator snapshot
}

/**
 * Record a scanner signal for outcome tracking
 * Returns the signal_id if successful, null if disabled/failed
 */
export async function recordSignal(params: RecordSignalParams): Promise<number | null> {
  // Check if signal tracking is enabled
  if (process.env.ENABLE_SIGNAL_TRACKING !== 'true') {
    return null;
  }
  
  const {
    symbol,
    signalType,
    direction,
    score,
    priceAtSignal,
    timeframe = 'daily',
    features
  } = params;
  
  // Validate score
  const validScore = Math.max(0, Math.min(100, Math.round(score)));
  
  try {
    const result = await q<{ id: number }>(
      `INSERT INTO signals_fired (
        symbol, signal_type, direction, score,
        signal_at, price_at_signal,
        timeframe, features_json, scanner_version
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
      RETURNING id`,
      [
        symbol,
        signalType,
        direction,
        validScore,
        priceAtSignal,
        timeframe,
        features ? JSON.stringify(features) : null,
        SCANNER_VERSION
      ]
    );
    
    return result[0]?.id || null;
  } catch (err) {
    // Don't let signal recording failures break the scanner
    console.warn('[signalRecorder] Failed to record signal:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Batch record multiple signals (more efficient for scanner results)
 */
export async function recordSignalsBatch(signals: RecordSignalParams[]): Promise<number> {
  if (process.env.ENABLE_SIGNAL_TRACKING !== 'true' || signals.length === 0) {
    return 0;
  }
  
  let recorded = 0;
  
  try {
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;
    
    for (const sig of signals) {
      const validScore = Math.max(0, Math.min(100, Math.round(sig.score)));
      placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      values.push(
        sig.symbol,
        sig.signalType,
        sig.direction,
        validScore,
        sig.priceAtSignal,
        sig.timeframe || 'daily',
        sig.features ? JSON.stringify(sig.features) : null,
        SCANNER_VERSION
      );
    }
    
    await q(
      `INSERT INTO signals_fired (
        symbol, signal_type, direction, score,
        signal_at, price_at_signal,
        timeframe, features_json, scanner_version
      ) VALUES ${placeholders.join(', ')}`,
      values
    );
    
    recorded = signals.length;
  } catch (err) {
    console.warn('[signalRecorder] Batch insert failed:', err instanceof Error ? err.message : err);
  }
  
  return recorded;
}

/**
 * Get accuracy stats for display
 */
export async function getAccuracyStats(signalType?: string, horizonMinutes?: number) {
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    
    if (signalType) {
      conditions.push(`sas.signal_type = $${paramIdx++}`);
      params.push(signalType);
    }
    if (horizonMinutes) {
      conditions.push(`sas.horizon_minutes = $${paramIdx++}`);
      params.push(horizonMinutes);
    }
    
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const stats = await q(`
      SELECT 
        sas.signal_type,
        sas.direction,
        ot.horizon_label,
        sas.horizon_minutes,
        sas.total_signals,
        sas.correct_count,
        sas.wrong_count,
        sas.accuracy_pct as win_rate,
        sas.precision_pct,
        sas.avg_pct_when_correct as avg_win,
        sas.avg_pct_when_wrong as avg_loss,
        sas.accuracy_score_76_100 as high_score_winrate,
        sas.computed_at
      FROM signal_accuracy_stats sas
      LEFT JOIN outcome_thresholds ot ON sas.horizon_minutes = ot.horizon_minutes
      ${where}
      ORDER BY sas.signal_type, sas.horizon_minutes
    `, params);
    
    return stats;
  } catch (err) {
    console.warn('[signalRecorder] Failed to get accuracy stats:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Get recent signals with their outcomes
 */
export async function getRecentSignals(limit: number = 50) {
  try {
    const signals = await q(`
      SELECT 
        sf.id,
        sf.symbol,
        sf.signal_type,
        sf.direction,
        sf.score,
        sf.signal_at,
        sf.price_at_signal,
        sf.timeframe,
        sf.scanner_version,
        (
          SELECT json_agg(json_build_object(
            'horizon', ot.horizon_label,
            'pct_move', so.pct_move,
            'outcome', so.outcome
          ) ORDER BY so.horizon_minutes)
          FROM signal_outcomes so
          LEFT JOIN outcome_thresholds ot ON so.horizon_minutes = ot.horizon_minutes
          WHERE so.signal_id = sf.id
        ) as outcomes
      FROM signals_fired sf
      ORDER BY sf.signal_at DESC
      LIMIT $1
    `, [limit]);
    
    return signals;
  } catch (err) {
    console.warn('[signalRecorder] Failed to get recent signals:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Get overall summary stats
 */
export async function getOverallStats() {
  try {
    const result = await q(`
      SELECT 
        COUNT(DISTINCT sf.id) as total_signals,
        COUNT(DISTINCT sf.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM signal_outcomes so WHERE so.signal_id = sf.id
        )) as signals_with_outcomes,
        (SELECT COUNT(*) FROM signal_outcomes) as total_outcomes,
        (SELECT COUNT(*) FROM signal_outcomes WHERE outcome = 'correct') as correct_outcomes,
        (SELECT COUNT(*) FROM signal_outcomes WHERE outcome = 'wrong') as wrong_outcomes
      FROM signals_fired sf
      WHERE sf.signal_at > NOW() - INTERVAL '90 days'
    `);
    
    return result[0] || {};
  } catch (err) {
    console.warn('[signalRecorder] Failed to get overall stats:', err instanceof Error ? err.message : err);
    return {};
  }
}
