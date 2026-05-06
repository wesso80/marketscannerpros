'use client';

import { useState } from 'react';
import type { Resolution } from '@/lib/trade/marketdata';

const RES_OPTIONS: Resolution[] = ['1', '5', '15', '30', '60', '240', 'D'];

interface Props {
  symbol: string;
  resolution: Resolution;
  onChange: (next: { symbol: string; resolution: Resolution }) => void;
}

export default function SymbolPicker({ symbol, resolution, onChange }: Props) {
  const [draft, setDraft] = useState(symbol);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ symbol: draft.trim().toUpperCase(), resolution });
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
    >
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
