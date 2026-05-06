'use client';

import { useState } from 'react';
import type { Resolution } from '@/lib/trade/marketdata';

const RES_OPTIONS: Resolution[] = ['1', '5', '15', '30', '60', '240', 'D'];

// Continuous front-month CME futures available under the GLBX-OHLCV-1m
// historical bundle currently funded on the Databento account.
const PRESET_SYMBOLS: Array<{ value: string; label: string }> = [
  { value: 'ES.c.0', label: 'ES — E-mini S&P 500' },
  { value: 'NQ.c.0', label: 'NQ — E-mini Nasdaq-100' },
  { value: 'MES.c.0', label: 'MES — Micro E-mini S&P 500' },
  { value: 'MNQ.c.0', label: 'MNQ — Micro E-mini Nasdaq-100' },
];

interface Props {
  symbol: string;
  resolution: Resolution;
  onChange: (next: { symbol: string; resolution: Resolution }) => void;
}

export default function SymbolPicker({ symbol, resolution, onChange }: Props) {
  const [draft, setDraft] = useState(symbol);
  const presetMatch = PRESET_SYMBOLS.some((p) => p.value === draft);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ symbol: draft.trim().toUpperCase(), resolution });
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <select
        value={presetMatch ? draft : '__custom'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom') return;
          setDraft(v);
          onChange({ symbol: v, resolution });
        }}
        style={{
          background: '#1E293B',
          color: '#E2E8F0',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 13,
          fontFamily: 'monospace',
        }}
        aria-label="Preset symbol"
      >
        {PRESET_SYMBOLS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        {!presetMatch && <option value="__custom">{draft || 'Custom'}</option>}
      </select>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. ES.c.0"
        spellCheck={false}
        style={{
          background: '#1E293B',
          color: '#E2E8F0',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 13,
          width: 110,
          fontFamily: 'monospace',
        }}
        aria-label="Custom symbol"
      />
      <select
        value={resolution}
        onChange={(e) => onChange({ symbol, resolution: e.target.value as Resolution })}
        style={{
          background: '#1E293B',
          color: '#E2E8F0',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 13,
        }}
        aria-label="Resolution"
      >
        {RES_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r === 'D' ? '1D' : `${r}m`}
          </option>
        ))}
      </select>
      <button
        type="submit"
        style={{
          background: '#10B981',
          color: '#0F172A',
          border: 'none',
          borderRadius: 4,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Load
      </button>
    </form>
  );
}
