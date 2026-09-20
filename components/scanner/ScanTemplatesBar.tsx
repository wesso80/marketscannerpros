'use client';

import React from 'react';

/* ─── Scan Template Definition ─── */
export interface ScanTemplate {
  id: string;
  label: string;
  icon: string;
  description: string;
  config: {
    minConfidence: number;
    mtfAlignment: number;      // 2 or 3
    volatilityState: string;   // 'all' | 'low' | 'moderate' | 'high'
    direction?: string;        // 'all' | 'long' | 'short'
    quality?: string;          // 'all' | 'high' | 'medium'
    /** Row must be in a Bollinger-inside-Keltner squeeze. */
    squeeze?: boolean;
    /** Row must carry a positive sector/benchmark relative-strength reading (rows without RS data are excluded and counted). */
    requireRelativeStrength?: boolean;
    /** RSI band the row must sit in (inclusive). */
    rsiBand?: [number, number];
    /** Minimum ADX (trend strength). */
    minAdx?: number;
    /** Maximum ADX (range / chop). */
    maxAdx?: number;
  };
  color: string;
}

export const SCAN_TEMPLATES: ScanTemplate[] = [
  {
    id: 'momentum',
    label: 'Momentum',
    icon: 'MOM',
    description: 'ADX ≥ 25 with RSI in the 55–70 (long) / 30–45 (short) zone; 3/4+ alignment, match ≥ 65',
    config: {
      minConfidence: 65,
      mtfAlignment: 3,
      volatilityState: 'all',
      quality: 'all',
      minAdx: 25,
      rsiBand: [30, 70],
    },
    color: 'var(--msp-bull)',
  },
  {
    id: 'breakout',
    label: 'Breakout',
    icon: 'BRK',
    description: 'High volatility state (ATR ≥ 3% of price) with 2/4+ alignment — expansion candidates',
    config: {
      minConfidence: 60,
      mtfAlignment: 2,
      volatilityState: 'high',
      quality: 'all',
    },
    color: 'var(--msp-warn)',
  },
  {
    id: 'mean_reversion',
    label: 'Mean Reversion',
    icon: 'REV',
    description: 'RSI ≤ 35 or ≥ 65 with ADX < 20 (choppy) and low volatility state',
    config: {
      minConfidence: 55,
      mtfAlignment: 2,
      volatilityState: 'low',
      quality: 'all',
      maxAdx: 20,
      rsiBand: [0, 100],
    },
    color: '#8B5CF6',
  },
  {
    id: 'squeeze',
    label: 'Squeeze Play',
    icon: 'SQZ',
    description: 'Rows currently in a Bollinger-inside-Keltner squeeze (Squeeze filter = In squeeze)',
    config: {
      minConfidence: 50,
      mtfAlignment: 2,
      volatilityState: 'all',
      quality: 'all',
      squeeze: true,
    },
    color: '#EC4899',
  },
  {
    id: 'relative_strength',
    label: 'Relative Strength',
    icon: 'RS',
    description: 'Long rows with a positive sector RS reading (stock % − sector ETF %); rows without RS data are excluded',
    config: {
      minConfidence: 60,
      mtfAlignment: 3,
      volatilityState: 'all',
      direction: 'long',
      quality: 'all',
      requireRelativeStrength: true,
    },
    color: '#06B6D4',
  },
  {
    id: 'high_conviction',
    label: 'High Alignment',
    icon: 'ALN',
    description: 'Only A-setups: 70%+ confidence, 3+ MTF alignment, high quality',
    config: {
      minConfidence: 70,
      mtfAlignment: 3,
      volatilityState: 'all',
      quality: 'high',
    },
    color: 'var(--msp-bull)',
  },
];

interface ScanTemplatesBarProps {
  onSelect: (template: ScanTemplate) => void;
  onClear?: () => void;
  activeId?: string;
}

export default function ScanTemplatesBar({ onSelect, onClear, activeId }: ScanTemplatesBarProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0', alignItems: 'center' }}>
      {SCAN_TEMPLATES.map((tmpl) => {
        const isActive = activeId === tmpl.id;
        return (
          <button
            key={tmpl.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => (isActive && onClear ? onClear() : onSelect(tmpl))}
            title={`${tmpl.description}${isActive ? ' — click again to clear preset' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 8,
              border: `1px solid ${isActive ? tmpl.color : 'rgba(51, 65, 85, 0.5)'}`,
              background: isActive ? `${tmpl.color}18` : 'rgba(15, 23, 42, 0.4)',
              color: isActive ? tmpl.color : 'var(--msp-flat)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', opacity: 0.85 }}>{tmpl.icon}</span>
            {tmpl.label}
          </button>
        );
      })}
      {activeId && (
        <span style={{ fontSize: 11, color: 'var(--msp-flat)' }}>
          Preset active — it sets the filters above plus its own condition; changing any filter clears the preset.
        </span>
      )}
    </div>
  );
}
