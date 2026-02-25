'use client';

import React, { useMemo } from 'react';
import type { IVMetrics, TerminalMode } from '@/types/optionsTerminal';

interface Props {
  ivMetrics: IVMetrics;
  mode: TerminalMode;
}

interface Play {
  title: string;
  description: string;
  condition: string;
  icon: string;
}

export default function SuggestedPlaysCard({ ivMetrics, mode }: Props) {
  const { ivLevel } = ivMetrics;

  const plays: Play[] = useMemo(() => {
    const result: Play[] = [];

    // Bullish + high IV
    if (ivLevel === 'high' || ivLevel === 'extreme') {
      result.push({
        title: 'Bull Put Credit Spread',
        description: 'Sell elevated premium with defined risk. Collect credit, profit if underlying stays above short strike.',
        condition: `Bullish bias, IV is ${ivLevel}`,
        icon: '🐂',
      });
      result.push({
        title: 'Iron Condor (Neutral)',
        description: 'Sell both sides — high IV makes credit spreads wider and more rewarding for neutral views.',
        condition: `Neutral bias, IV is ${ivLevel}`,
        icon: '⚖️',
      });
      result.push({
        title: 'Bear Call Credit Spread',
        description: 'Sell call spread above resistance. High IV inflates the credit received.',
        condition: `Bearish bias, IV is ${ivLevel}`,
        icon: '🐻',
      });
    }

    // Low IV
    if (ivLevel === 'low') {
      result.push({
        title: 'Long Call / Long Put',
        description: 'Options are cheap relative to history. Defined-risk directional bets are attractive when IV is low.',
        condition: `Directional view, IV is ${ivLevel}`,
        icon: '🎯',
      });
      result.push({
        title: 'Calendar Spread',
        description: 'Buy further-dated option, sell near-dated. Benefits from IV expansion and time decay difference.',
        condition: `Expecting IV increase, IV is ${ivLevel}`,
        icon: '📅',
      });
    }

    // Normal IV
    if (ivLevel === 'normal') {
      result.push({
        title: 'Debit Spread (Directional)',
        description: 'Balanced risk/reward with moderate premium. Define your risk with a spread.',
        condition: `Directional view, IV is ${ivLevel}`,
        icon: '↗️',
      });
      result.push({
        title: 'Butterfly Spread (Precision)',
        description: 'Low-cost structure for pinpoint targets. Use around expected move zone for expiration plays.',
        condition: `Range-bound view, IV is ${ivLevel}`,
        icon: '🦋',
      });
    }

    // Always show educational disclaimer entry
    result.push({
      title: 'Educational Only',
      description: 'These are structure suggestions based on IV regime — not recommendations. Always evaluate your own risk tolerance, position sizing, and thesis.',
      condition: 'All conditions',
      icon: '📚',
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
          Suggested Structures
        </h3>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--msp-text-faint)' }}>
          Educational
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {plays.map((p, i) => (
          <div
            key={i}
            className="rounded-lg p-3 transition-colors"
            style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{p.icon}</span>
              <span className="text-xs font-bold" style={{ color: 'var(--msp-text)' }}>
                {p.title}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--msp-text-muted)' }}>
              {p.description}
            </p>
            <p className="text-[9px] mt-1 font-semibold" style={{ color: 'var(--msp-text-faint)' }}>
              {p.condition}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
