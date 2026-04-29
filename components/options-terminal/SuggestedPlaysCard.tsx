'use client';

import React, { useMemo } from 'react';
import type { IVMetrics, TerminalMode } from '@/types/optionsTerminal';

interface Props {
  ivMetrics: IVMetrics;
  mode: TerminalMode;
}

interface StructureExample {
  title: string;
  description: string;
  context: string;
  code: string;
}

export default function SuggestedPlaysCard({ ivMetrics, mode }: Props) {
  const { ivLevel } = ivMetrics;

  const examples: StructureExample[] = useMemo(() => {
    const result: StructureExample[] = [];

    // Bullish + high IV
    if (ivLevel === 'high' || ivLevel === 'extreme') {
      result.push({
        title: 'Bull Put Credit Spread',
        description: 'Defined-risk credit framework to review when IV is elevated and downside reference levels are clear.',
        context: `Bullish research bias, IV is ${ivLevel}`,
        code: 'BP',
      });
      result.push({
        title: 'Iron Condor (Neutral)',
        description: 'Neutral framework for comparing expected-move boundaries, wing width, and event risk.',
        context: `Neutral research bias, IV is ${ivLevel}`,
        code: 'IC',
      });
      result.push({
        title: 'Bear Call Credit Spread',
        description: 'Defined-risk bearish framework to compare against upside reference levels and liquidity.',
        context: `Bearish research bias, IV is ${ivLevel}`,
        code: 'BC',
      });
    }

    // Low IV
    if (ivLevel === 'low') {
      result.push({
        title: 'Long Call / Long Put',
        description: 'Debit framework to review when premium is lower relative to history and directional evidence is strong.',
        context: `Directional research view, IV is ${ivLevel}`,
        code: 'DR',
      });
      result.push({
        title: 'Calendar Spread',
        description: 'Calendar framework for studying IV expansion assumptions and time-decay differences.',
        context: `IV expansion scenario, IV is ${ivLevel}`,
        code: 'CA',
      });
    }

    // Normal IV
    if (ivLevel === 'normal') {
      result.push({
        title: 'Debit Spread (Directional)',
        description: 'Defined-risk debit framework for comparing directional evidence, spread width, and liquidity.',
        context: `Directional research view, IV is ${ivLevel}`,
        code: 'DB',
      });
      result.push({
        title: 'Butterfly Spread (Precision)',
        description: 'Range framework for studying expected-move zones and expiration sensitivity.',
        context: `Range-bound research view, IV is ${ivLevel}`,
        code: 'BF',
      });
    }

    // Always show educational disclaimer entry
    result.push({
      title: 'Educational Only',
      description: 'These are structure examples based on IV regime, not personal advice. Evaluate liquidity, event risk, and assumptions independently.',
      context: 'All market contexts',
      code: 'ED',
    });

    return result;
  }, [ivLevel]);

  return (
    <div
      className="rounded-xl border p-4 h-full"
      style={{ background: 'var(--msp-card)', borderColor: 'var(--msp-border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--msp-text-faint)' }}>
          Structure Examples
        </h3>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--msp-text-faint)' }}>
          Educational
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {examples.map((p, i) => (
          <div
            key={i}
            className="rounded-lg p-3 transition-colors"
            style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/50 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{p.code}</span>
              <span className="text-xs font-bold" style={{ color: 'var(--msp-text)' }}>
                {p.title}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--msp-text-muted)' }}>
              {p.description}
            </p>
            <p className="text-[9px] mt-1 font-semibold" style={{ color: 'var(--msp-text-faint)' }}>
              {p.context}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
