/**
 * Layer 6 — Outcome Engine (Memory / Learning Loop)
 * @internal — NEVER import into user-facing components.
 *
 * Tracks the lifecycle of every signal from alert → outcome.
 * Records to DB for post-mortem analysis and weight adaptation.
 *
 * Signal Lifecycle:
 *   ACTIVE → TRACKED → { WIN | LOSS | FLAT | EXPIRED }
 *
 * After enough outcomes accumulate, this data feeds back into
 * weight tuning for the Fusion Engine's regime profiles.
 */

import type { InternalAlert, OutcomeLabel, SignalLifecycle, MarketPhase } from './types';
import { q as dbQuery } from '@/lib/db';

// ─── In-memory lifecycle tracking ───────────────────────────────────────────

const lifecycles = new Map<string, SignalLifecycle>();

// ─── Create lifecycle from alert ────────────────────────────────────────────

export function trackSignal(
  alert: InternalAlert,
  priceAtSignal: number,
): SignalLifecycle {
  const lifecycle: SignalLifecycle = {
    alertId: alert.id,
    symbol: alert.symbol,
    direction: alert.direction === 'NEUTRAL' ? 'LONG' : alert.direction,
    fusionScoreAtEntry: alert.fusionScore,
    regimeAtEntry: alert.regime,
    priceAtSignal,
    outcome: 'PENDING',
    dimensionScoresAtEntry: Object.fromEntries(
      alert.topDimensions.map(d => [d.name, d.score]),
    ),
  };

  lifecycles.set(alert.id, lifecycle);
  return lifecycle;
}

// ─── Update lifecycle with price data ───────────────────────────────────────

export function updateLifecycle(
  alertId: string,
  currentPrice: number,
): SignalLifecycle | null {
  const lc = lifecycles.get(alertId);
  if (!lc || lc.outcome !== 'PENDING') return null;

  // Track MFE / MAE
  if (lc.direction === 'LONG') {
    const excursion = ((currentPrice - lc.priceAtSignal) / lc.priceAtSignal) * 100;
    if (!lc.mfe || excursion > lc.mfe) lc.mfe = excursion;
    if (!lc.mae || excursion < lc.mae) lc.mae = excursion;
    lc.priceAtPeak = Math.max(lc.priceAtPeak ?? 0, currentPrice);
    lc.priceAtTrough = Math.min(lc.priceAtTrough ?? Infinity, currentPrice);
  } else {
    const excursion = ((lc.priceAtSignal - currentPrice) / lc.priceAtSignal) * 100;
    if (!lc.mfe || excursion > lc.mfe) lc.mfe = excursion;
    if (!lc.mae || excursion < lc.mae) lc.mae = excursion;
    lc.priceAtPeak = Math.min(lc.priceAtPeak ?? Infinity, currentPrice);
    lc.priceAtTrough = Math.max(lc.priceAtTrough ?? 0, currentPrice);
  }

  lc.holdBars = (lc.holdBars ?? 0) + 1;
  return lc;
}

// ─── Close lifecycle with outcome ───────────────────────────────────────────

export function closeLifecycle(
  alertId: string,
  closePrice: number,
  outcome?: OutcomeLabel,
): SignalLifecycle | null {
  const lc = lifecycles.get(alertId);
  if (!lc) return null;

  lc.priceAtClose = closePrice;
  lc.closedAt = new Date().toISOString();

  // Auto-determine outcome if not provided
  if (outcome) {
    lc.outcome = outcome;
  } else {
    const pct = lc.direction === 'LONG'
      ? ((closePrice - lc.priceAtSignal) / lc.priceAtSignal) * 100
      : ((lc.priceAtSignal - closePrice) / lc.priceAtSignal) * 100;

    if (pct > 0.5) {
      lc.outcome = 'WIN';
      lc.rMultiple = pct / (Math.abs(lc.mae ?? 1) || 1);
    } else if (pct < -0.5) {
      lc.outcome = 'LOSS';
      lc.rMultiple = -(Math.abs(pct) / (Math.abs(lc.mfe ?? 1) || 1));
    } else {
      lc.outcome = 'FLAT';
      lc.rMultiple = 0;
    }
  }

  return lc;
}

// ─── Persist to DB ──────────────────────────────────────────────────────────

export async function persistLifecycle(lifecycle: SignalLifecycle): Promise<boolean> {
  try {
    await dbQuery(
      `INSERT INTO quant_signal_outcomes (
        alert_id, symbol, direction, fusion_score, regime,
        price_at_signal, price_at_peak, price_at_trough, price_at_close,
        outcome, r_multiple, hold_bars, mfe, mae,
        dimension_scores, closed_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (alert_id) DO UPDATE SET
        price_at_peak = EXCLUDED.price_at_peak,
        price_at_trough = EXCLUDED.price_at_trough,
        price_at_close = EXCLUDED.price_at_close,
        outcome = EXCLUDED.outcome,
        r_multiple = EXCLUDED.r_multiple,
        hold_bars = EXCLUDED.hold_bars,
        mfe = EXCLUDED.mfe,
        mae = EXCLUDED.mae,
        closed_at = EXCLUDED.closed_at,
        notes = EXCLUDED.notes`,
      [
        lifecycle.alertId,
        lifecycle.symbol,
        lifecycle.direction,
        lifecycle.fusionScoreAtEntry,
        lifecycle.regimeAtEntry,
        lifecycle.priceAtSignal,
        lifecycle.priceAtPeak ?? null,
        lifecycle.priceAtTrough ?? null,
        lifecycle.priceAtClose ?? null,
        lifecycle.outcome,
        lifecycle.rMultiple ?? null,
        lifecycle.holdBars ?? null,
        lifecycle.mfe ?? null,
        lifecycle.mae ?? null,
        JSON.stringify(lifecycle.dimensionScoresAtEntry),
        lifecycle.closedAt ?? null,
        lifecycle.notes ?? null,
      ],
    );
    return true;
  } catch (err) {
    console.error('[quant:outcome] Failed to persist lifecycle:', err);
    return false;
  }
}

// ─── Historical Outcome Statistics ──────────────────────────────────────────

export interface OutcomeStats {
  totalSignals: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  avgRMultiple: number;
  avgMFE: number;
  avgMAE: number;
  bestRegime: string;
  worstRegime: string;
  avgFusionScoreWins: number;
  avgFusionScoreLosses: number;
}

export async function getOutcomeStats(): Promise<OutcomeStats | null> {
  try {
    const rows = await dbQuery<{
      outcome: string;
      count: string;
      avg_r: string;
      avg_mfe: string;
      avg_mae: string;
      avg_fusion: string;
    }>(
      `SELECT outcome, COUNT(*) as count,
              AVG(r_multiple) as avg_r,
              AVG(mfe) as avg_mfe,
              AVG(mae) as avg_mae,
              AVG(fusion_score) as avg_fusion
       FROM quant_signal_outcomes
       WHERE outcome IN ('WIN', 'LOSS', 'FLAT')
       GROUP BY outcome`,
    );

    if (!rows || rows.length === 0) return null;

    const byOutcome = Object.fromEntries(rows.map(r => [r.outcome, r]));
    const wins = parseInt(byOutcome['WIN']?.count ?? '0');
    const losses = parseInt(byOutcome['LOSS']?.count ?? '0');
    const flats = parseInt(byOutcome['FLAT']?.count ?? '0');
    const total = wins + losses + flats;

    // Best/worst regime
    const regimeRows = await dbQuery<{ regime: string; win_rate: string }>(
      `SELECT regime,
              SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END)::float / COUNT(*) as win_rate
       FROM quant_signal_outcomes
       WHERE outcome IN ('WIN', 'LOSS')
       GROUP BY regime
       HAVING COUNT(*) >= 3
       ORDER BY win_rate DESC`,
    );

    return {
      totalSignals: total,
      wins,
      losses,
      flats,
      winRate: total > 0 ? wins / (wins + losses) : 0,
      avgRMultiple: parseFloat(byOutcome['WIN']?.avg_r ?? '0'),
      avgMFE: parseFloat(byOutcome['WIN']?.avg_mfe ?? '0'),
      avgMAE: parseFloat(byOutcome['LOSS']?.avg_mae ?? '0'),
      bestRegime: regimeRows?.[0]?.regime ?? 'N/A',
      worstRegime: regimeRows?.[regimeRows.length - 1]?.regime ?? 'N/A',
      avgFusionScoreWins: parseFloat(byOutcome['WIN']?.avg_fusion ?? '0'),
      avgFusionScoreLosses: parseFloat(byOutcome['LOSS']?.avg_fusion ?? '0'),
    };
  } catch (err) {
    console.error('[quant:outcome] Failed to fetch stats:', err);
    return null;
  }
}

// ─── Memory access ──────────────────────────────────────────────────────────

export function getActiveLifecycles(): SignalLifecycle[] {
  return Array.from(lifecycles.values()).filter(lc => lc.outcome === 'PENDING');
}

export function getLifecycle(alertId: string): SignalLifecycle | undefined {
  return lifecycles.get(alertId);
}
