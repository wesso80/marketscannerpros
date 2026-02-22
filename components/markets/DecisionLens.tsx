'use client';

import { useMemo } from 'react';
import { useRegime, regimeLabel } from '@/lib/useRegime';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import type { TickerContext, DecisionVerdict, DecisionLensData } from './types';

interface DecisionLensProps {
  ctx: TickerContext;
}

/**
 * The Institutional Decision Lens.
 * Within 5 seconds of selecting any ticker, this tells you:
 *   "This is tradable" or "This is noise."
 *
 * 3-column layout:
 *   Left   — Alignment, Confidence, Authorization, R-Budget
 *   Center — Bull/Bear scenarios, R-multiple, Verdict stamp
 *   Right  — Vol State, Event Risk, Liquidity, Expected Move
 */
export default function DecisionLens({ ctx }: DecisionLensProps) {
  const { data: regime } = useRegime();
  const { snapshot, isLocked, guardEnabled } = useRiskPermission();

  const lens = useMemo<DecisionLensData | null>(() => {
    if (!ctx.symbol || ctx.loading) return null;

    const scan = ctx.scanner;
    const flow = ctx.flow;
    const opts = ctx.options;

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
    }

    // ── Confidence (scanner score + flow conviction) ──
    let confidence = scan?.confidence ?? 0;
    if (flow?.conviction) {
      confidence = Math.round((confidence + flow.conviction * 100) / 2);
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
    const ruBudget = `${remainR.toFixed(1)}R / ${maxR}R`;

    // ── Scenarios ──
    const bullScenario = scan
      ? `${scan.direction === 'LONG' ? 'Long' : 'Short'} ${scan.setup || 'setup'} → target $${scan.target?.toFixed(2) ?? '—'}`
      : flow?.most_likely_path?.[0] ?? 'Awaiting scan data';
    const bearScenario = scan
      ? `Stop breach below $${scan.stop?.toFixed(2) ?? '—'} invalidates thesis`
      : flow?.risk?.[0] ?? 'No risk factors loaded';

    // ── R-Multiple ──
    const rMultiple = scan?.rMultiple ?? 0;

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
      ? `±${opts.expectedMove.toFixed(1)}%`
      : ctx.quote
        ? `±${(Math.abs(ctx.quote.changePercent) * 1.5).toFixed(1)}%`
        : '—';

    // ── Verdict ──
    let verdict: DecisionVerdict = 'noise';
    if (authorization === 'BLOCK') {
      verdict = 'blocked';
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

  if (!ctx.symbol) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--msp-border)] bg-[var(--msp-panel)] p-6 text-center">
        <p className="text-sm text-[var(--msp-text-faint)]">Select a ticker above to activate the Decision Lens</p>
        <p className="mt-1 text-[10px] text-[var(--msp-text-faint)]">Regime + Flow + Options + Structure → Tradable or Noise in 5 seconds</p>
      </div>
    );
  }

  if (ctx.loading || !lens) {
    return (
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-3 animate-pulse">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-32 rounded-md bg-[var(--msp-panel-2)]" />
        ))}
      </div>
    );
  }

  const verdictStyles: Record<DecisionVerdict, { bg: string; border: string; text: string; label: string }> = {
    tradable: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', label: 'TRADABLE' },
    conditional: { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', label: 'CONDITIONAL' },
    noise: { bg: 'bg-slate-500/10', border: 'border-slate-500/40', text: 'text-slate-400', label: 'NOISE — SKIP' },
    blocked: { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-400', label: 'BLOCKED' },
  };
  const vs = verdictStyles[lens.verdict];

  return (
    <div className={`rounded-lg border ${vs.border} ${vs.bg} p-3`}>
      {/* Verdict stamp */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--msp-text-faint)]">Institutional Decision Lens</p>
          <h3 className="text-sm font-bold text-[var(--msp-text)]">{ctx.symbol}</h3>
        </div>
        <div className={`rounded-md border ${vs.border} px-3 py-1 text-xs font-black tracking-wider ${vs.text}`}>
          {vs.label}
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {/* LEFT — Authorization */}
        <div className="space-y-2 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <LensMetric label="Alignment" value={`${lens.alignment}%`} color={lens.alignment >= 70 ? 'text-emerald-400' : lens.alignment >= 50 ? 'text-amber-400' : 'text-red-400'} />
          <LensBar value={lens.alignment} />
          <LensMetric label="Confidence" value={`${lens.confidence}%`} color={lens.confidence >= 60 ? 'text-emerald-400' : lens.confidence >= 40 ? 'text-amber-400' : 'text-red-400'} />
          <LensBar value={lens.confidence} />
          <LensMetric
            label="Authorization"
            value={lens.authorization}
            color={lens.authorization === 'ALLOW' ? 'text-emerald-400' : lens.authorization === 'ALLOW_REDUCED' ? 'text-amber-400' : 'text-red-400'}
          />
          <LensMetric label="R Budget" value={lens.ruBudget} color="text-slate-300" />
        </div>

        {/* CENTER — Scenarios */}
        <div className="space-y-2 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-500">Bull Scenario</p>
            <p className="text-[11px] text-[var(--msp-text-muted)] leading-tight">{lens.bullScenario}</p>
          </div>
          <div className="border-t border-[var(--msp-divider)]" />
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-rose-500">Bear Scenario</p>
            <p className="text-[11px] text-[var(--msp-text-muted)] leading-tight">{lens.bearScenario}</p>
          </div>
          <div className="border-t border-[var(--msp-divider)]" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[var(--msp-text-faint)]">R-Multiple</span>
            <span className={`text-sm font-black ${lens.rMultiple >= 2 ? 'text-emerald-400' : lens.rMultiple >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
              {lens.rMultiple.toFixed(1)}R
            </span>
          </div>
        </div>

        {/* RIGHT — Context */}
        <div className="space-y-2 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <LensMetric label="Vol State" value={lens.volState} color="text-slate-300" />
          <LensMetric
            label="Event Risk"
            value={lens.eventRisk.toUpperCase()}
            color={lens.eventRisk === 'high' ? 'text-red-400' : lens.eventRisk === 'medium' ? 'text-amber-400' : 'text-emerald-400'}
          />
          <LensMetric
            label="Liquidity"
            value={lens.liquidityGrade}
            color={lens.liquidityGrade === 'A' ? 'text-emerald-400' : lens.liquidityGrade === 'B' ? 'text-cyan-400' : lens.liquidityGrade === 'C' ? 'text-amber-400' : 'text-red-400'}
          />
          <LensMetric label="Exp. Move" value={lens.expectedMove} color="text-slate-300" />
        </div>
      </div>
    </div>
  );
}

function LensMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">{label}</span>
      <span className={`text-[11px] font-bold ${color}`}>{value}</span>
    </div>
  );
}

function LensBar({ value }: { value: number }) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const barColor = clampedValue >= 70 ? 'bg-emerald-500' : clampedValue >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-1 w-full rounded-full bg-[var(--msp-panel)]">
      <div className={`h-1 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${clampedValue}%` }} />
    </div>
  );
}
