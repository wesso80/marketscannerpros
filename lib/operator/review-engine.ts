/**
 * MSP Operator — Review Engine
 * Post-trade decomposition: classifies outcome, computes efficiency, assigns root cause.
 * @internal
 */

import type {
  ReviewRequest, TradeReview, OutcomeClass,
} from '@/types/operator';
import { nowISO } from './shared';

/* ── Efficiency Metrics ─────────────────────────────────────── */

function computeMAE(bars: { low: number; high: number }[], entryPrice: number, direction: string): number {
  // Maximum Adverse Excursion in R-multiples (placeholder)
  if (bars.length === 0) return 0;
  if (direction === 'LONG') {
    const worst = Math.min(...bars.map(b => b.low));
    return entryPrice > 0 ? (entryPrice - worst) / entryPrice : 0;
  } else {
    const worst = Math.max(...bars.map(b => b.high));
    return entryPrice > 0 ? (worst - entryPrice) / entryPrice : 0;
  }
}

function computeMFE(bars: { low: number; high: number }[], entryPrice: number, direction: string): number {
  // Maximum Favorable Excursion in R-multiples (placeholder)
  if (bars.length === 0) return 0;
  if (direction === 'LONG') {
    const best = Math.max(...bars.map(b => b.high));
    return entryPrice > 0 ? (best - entryPrice) / entryPrice : 0;
  } else {
    const best = Math.min(...bars.map(b => b.low));
    return entryPrice > 0 ? (entryPrice - best) / entryPrice : 0;
  }
}

function computeEntryEfficiency(entryPrice: number, mfe: number, mae: number): number {
  // How well we timed entry: 1 = perfect (small MAE, large MFE)
  if (mfe + mae === 0) return 0.5;
  return mfe / (mfe + mae);
}

function computeExitEfficiency(exitPrice: number, entryPrice: number, mfe: number, direction: string): number {
  // How much of MFE we captured
  if (mfe === 0) return 0;
  const captured = direction === 'LONG'
    ? (exitPrice - entryPrice) / entryPrice
    : (entryPrice - exitPrice) / entryPrice;
  return captured > 0 ? Math.min(captured / mfe, 1) : 0;
}

/* ── Outcome Classification ─────────────────────────────────── */

function classifyOutcome(req: ReviewRequest, mae: number, mfe: number): { cls: OutcomeClass; root: string } {
  const pnl = req.position.realizedPnl;
  const direction = req.verdict.direction;
  const regime = req.verdict.regime;

  // Profitable trade
  if (pnl > 0) {
    return { cls: 'CLEAN_EXECUTION', root: 'Trade executed as planned' };
  }

  // Loss analysis
  const regimeTimeline = req.marketReplayContext.regimeTimeline;
  const regimeChanged = regimeTimeline.length > 1 &&
    regimeTimeline[regimeTimeline.length - 1].regime !== regime;

  if (regimeChanged) {
    return { cls: 'REGIME_MISMATCH', root: 'Regime shifted after entry' };
  }

  // Large MFE but still lost → bad exit
  if (mfe > mae * 1.5 && pnl < 0) {
    return { cls: 'BAD_EXECUTION', root: 'Had favorable excursion but failed to capture' };
  }

  // Small MAE and small MFE → no move, wrong timing
  if (mae < 0.01 && mfe < 0.01) {
    return { cls: 'RIGHT_IDEA_WRONG_TIMING', root: 'Price did not move directionally' };
  }

  // Check for event interference
  const eventInterference = req.marketReplayContext.regimeTimeline.some(
    r => r.regime === 'EVENT_SHOCK'
  );
  if (eventInterference) {
    return { cls: 'GOOD_SETUP_EVENT_INTERFERENCE', root: 'Event shock disrupted thesis' };
  }

  // Default
  return { cls: 'RIGHT_TIMING_BAD_STRUCTURE', root: 'Structure did not support the trade' };
}

/* ── Main Review ────────────────────────────────────────────── */

export function reviewTrade(req: ReviewRequest): TradeReview {
  const bars = req.marketReplayContext.bars;
  const direction = req.verdict.direction;

  const mae = computeMAE(bars, req.position.entryPrice, direction);
  const mfe = computeMFE(bars, req.position.entryPrice, direction);
  const entryEfficiency = computeEntryEfficiency(req.position.entryPrice, mfe, mae);
  const exitEfficiency = computeExitEfficiency(
    req.position.exitPrice, req.position.entryPrice, mfe, direction
  );

  const { cls, root } = classifyOutcome(req, mae, mfe);

  return {
    positionId: req.position.positionId,
    timestamp: nowISO(),
    outcomeClass: cls,
    rootCause: root,
    entryEfficiency,
    exitEfficiency,
    mae,
    mfe,
    reviewNotes: [],
  };
}
