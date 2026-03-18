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
  };
  color: string;
}

export const SCAN_TEMPLATES: ScanTemplate[] = [
  {
    id: 'momentum',
    label: 'Momentum',
    icon: '🚀',
    description: 'Strong trend + high ADX + RSI 55–70 zone',
    config: {
      minConfidence: 65,
      mtfAlignment: 3,
      volatilityState: 'moderate',
      quality: 'high',
    },
    color: '#10B981',
  },
  {
    id: 'breakout',
    label: 'Breakout',
    icon: '💥',
    description: 'Volatility expansion from compression zones',
    config: {
      minConfidence: 60,
      mtfAlignment: 2,
      volatilityState: 'high',
      quality: 'all',
    },
    color: '#F59E0B',
  },
  {
    id: 'mean_reversion',
    label: 'Mean Reversion',
    icon: '🔄',
    description: 'Oversold/overbought RSI + low ADX choppy markets',
    config: {
      minConfidence: 55,
      mtfAlignment: 2,
      volatilityState: 'low',
      quality: 'all',
    },
    color: '#8B5CF6',
  },
  {
    id: 'squeeze',
    label: 'Squeeze Play',
    icon: '🔥',
    description: 'Bollinger inside Keltner compression — imminent expansion',
    config: {
      minConfidence: 50,
      mtfAlignment: 2,
      volatilityState: 'low',
      quality: 'all',
    },
    color: '#EC4899',
  },
  {
    id: 'relative_strength',
    label: 'Relative Strength',
    icon: '💪',
    description: 'Outperforming benchmark (BTC for crypto, SPY for equities)',
    config: {
      minConfidence: 60,
      mtfAlignment: 3,
      volatilityState: 'all',
      direction: 'long',
      quality: 'high',
    },
    color: '#06B6D4',
  },
  {
    id: 'high_conviction',
    label: 'High Alignment',
    icon: '🎯',
    description: 'Only A-setups: 70%+ confidence, 3+ MTF alignment, high quality',
    config: {
      minConfidence: 70,
      mtfAlignment: 3,
      volatilityState: 'all',
      quality: 'high',
    },
    color: '#10B981',
  },
];

interface ScanTemplatesBarProps {
  onSelect: (template: ScanTemplate) => void;
  activeId?: string;
}

export default function ScanTemplatesBar({ onSelect, activeId }: ScanTemplatesBarProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
      {SCAN_TEMPLATES.map((tmpl) => {
        const isActive = activeId === tmpl.id;
        return (
          <button
            key={tmpl.id}
            onClick={() => onSelect(tmpl)}
            title={tmpl.description}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 8,
              border: `1px solid ${isActive ? tmpl.color : 'rgba(51, 65, 85, 0.5)'}`,
              background: isActive ? `${tmpl.color}18` : 'rgba(15, 23, 42, 0.4)',
              color: isActive ? tmpl.color : '#94a3b8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 14 }}>{tmpl.icon}</span>
            {tmpl.label}
          </button>
        );
      })}
    </div>
  );
}
