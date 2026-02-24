'use client';

import { useMemo } from 'react';
import { useRegime, regimeLabel } from '@/lib/useRegime';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import type { TickerContext, DecisionVerdict, DecisionLensData } from './types';

/**
 * Extracts the Decision Lens computation so it can be consumed by both:
 *   - DecisionLens.tsx  (render)
 *   - MarketsPage       (AI page-context registration)
 */
export function useDecisionLens(ctx: TickerContext): DecisionLensData | null {
  const { data: regime } = useRegime();
  const { snapshot, isLocked, guardEnabled } = useRiskPermission();

  return useMemo<DecisionLensData | null>(() => {
    if (!ctx.symbol || ctx.loading) return null;

    const scan = ctx.scanner;
    const flow = ctx.flow;
    const opts = ctx.options;
    const quote = ctx.quote;

    // ── Alignment (regime + scanner direction agreement) ──
    let alignment = 50;
    if (scan && regime) {
      const regimeBull = ['TREND_UP', 'VOL_CONTRACTION'].includes(regime.regime);
      const regimeBear = ['TREND_DOWN', 'RISK_OFF_STRESS'].includes(regime.regime);
      const scanBull = scan.direction === 'LONG';
      if ((regimeBull && scanBull) || (regimeBear && !scanBull)) {
        alignment = 75 + Math.min(scan.score, 25);
      } else if (regime.regime === 'RANGE_NEUTRAL') {
        alignment = 50 + Math.min(scan.score / 2, 25);
      } else {
        alignment = Math.max(20, 50 - scan.score / 2);
      }
    } else if (quote && regime) {
      const priceBull = (quote.changePercent ?? 0) >= 0;
      const regimeBull = ['TREND_UP', 'VOL_CONTRACTION'].includes(regime.regime);
      if ((regimeBull && priceBull) || (!regimeBull && !priceBull)) {
        alignment = 60;
      }
    }

    // ── Confidence (scanner score + flow conviction) ──
    let confidence = scan?.confidence ?? 0;
    if (confidence === 0 && scan?.score && scan.score > 0) {
      confidence = Math.min(99, Math.abs(scan.score));
    }
    if (flow?.conviction) {
      confidence = Math.round((confidence + flow.conviction) / 2);
    }
    if (confidence === 0 && quote) {
      confidence = 15;
    }
    confidence = Math.min(100, Math.max(0, confidence));

    // ── Authorization ──
    let authorization: 'ALLOW' | 'ALLOW_REDUCED' | 'BLOCK' = 'ALLOW';
    if (isLocked || !guardEnabled) {
      authorization = 'BLOCK';
    } else if (snapshot?.risk_mode === 'DEFENSIVE' || snapshot?.risk_mode === 'THROTTLED') {
      authorization = 'ALLOW_REDUCED';
    }

    // ── R Budget ──
    const remainR = snapshot?.session?.remaining_daily_R ?? 0;
    const maxR = snapshot?.session?.max_daily_R ?? 6;
    const ruBudget = `${Number(remainR ?? 0).toFixed(1)}R / ${maxR}R`;

    // ── Scenarios ──
    let bullScenario: string;
    let bearScenario: string;
    if (scan) {
      const targetStr = Number.isFinite(Number(scan.target)) ? `$${Number(scan.target).toFixed(2)}` : '—';
      const stopStr = Number.isFinite(Number(scan.stop)) ? `$${Number(scan.stop).toFixed(2)}` : '—';
      bullScenario = `${scan.direction === 'LONG' ? 'Long' : 'Short'} ${scan.setup || 'setup'} \u2192 target ${targetStr}`;
      bearScenario = `Stop breach at ${stopStr} invalidates thesis`;
    } else if (quote) {
      const chgDir = (quote.changePercent ?? 0) >= 0 ? 'bullish' : 'bearish';
      bullScenario = flow?.most_likely_path?.[0] ?? `Price ${chgDir} at $${Number(quote.price).toFixed(2)} — awaiting scan`;
      bearScenario = flow?.risk?.[0] ?? `Monitor for reversal — no stop computed yet`;
    } else {
      bullScenario = flow?.most_likely_path?.[0] ?? 'Loading market data...';
      bearScenario = flow?.risk?.[0] ?? 'Loading risk factors...';
    }

    // ── R-Multiple ──
    const rMultiple = Number.isFinite(scan?.rMultiple) ? scan!.rMultiple : 0;

    // ── Vol State ──
    const volState = regimeLabel(regime?.regime);

    // ── Event Risk ──
    let eventRisk: 'low' | 'medium' | 'high' = 'low';
    if (ctx.earnings.some(e => {
      const d = new Date(e.reportDate);
      const now = new Date();
      return Math.abs(d.getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000;
    })) {
      eventRisk = 'high';
    } else if (ctx.economic.some(e => e.impact === 'high')) {
      eventRisk = 'medium';
    }

    // ── Liquidity Grade ──
    let liquidityGrade: 'A' | 'B' | 'C' | 'D' = 'B';
    if (opts?.iv && opts.ivRank !== undefined) {
      if (opts.ivRank < 20) liquidityGrade = 'A';
      else if (opts.ivRank < 50) liquidityGrade = 'B';
      else if (opts.ivRank < 80) liquidityGrade = 'C';
      else liquidityGrade = 'D';
    }

    // ── Expected Move ──
    const expectedMove = opts?.expectedMove
      ? `±${Number(opts.expectedMove ?? 0).toFixed(1)}%`
      : ctx.quote
        ? `±${(Math.abs(Number(ctx.quote.changePercent ?? 0)) * 1.5).toFixed(1)}%`
        : '—';

    // ── Verdict ──
    let verdict: DecisionVerdict = 'noise';
    if (authorization === 'BLOCK') {
      verdict = 'blocked';
    } else if (remainR <= 0) {
      verdict = 'blocked'; // R-budget exhausted — no new risk allowed
    } else if (alignment >= 70 && confidence >= 60 && rMultiple >= 1.5) {
      verdict = 'tradable';
    } else if (alignment >= 50 && confidence >= 40) {
      verdict = 'conditional';
    }

    return {
      verdict,
      alignment: Math.round(alignment),
      confidence: Math.round(confidence),
      authorization,
      ruBudget,
      bullScenario,
      bearScenario,
      rMultiple,
      volState,
      eventRisk,
      liquidityGrade,
      expectedMove,
    };
  }, [ctx, regime, snapshot, isLocked, guardEnabled]);
}
