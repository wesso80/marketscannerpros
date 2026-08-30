'use client';

import type { ReactNode } from 'react';
import type { SemanticState } from '@/lib/intelligence/types';
import { STATE_STYLES } from '@/lib/intelligence/states';

/* ═══════════════════════════════════════════════════════════════════════════
   CommandStrip — the dense top command row (Composite / Bias / Edge / …).
   ════════════════════════════════════════════════════════════════════════════ */

export interface CommandItem {
  label: string;
  value: ReactNode;
  semantic?: SemanticState;
  tooltip?: string;
}

export default function CommandStrip({ items }: { items: CommandItem[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`,
        gap: 1,
        background: 'var(--msp-border)',
        border: '1px solid var(--msp-border)',
        borderRadius: 'var(--msp-radius-card)',
        overflow: 'hidden',
      }}
    >
      {items.map((item) => {
        const s = item.semantic ? STATE_STYLES[item.semantic] : null;
        return (
          <div
            key={item.label}
            title={item.tooltip}
            style={{
              background: 'var(--msp-panel)',
              padding: '10px 12px',
              minWidth: 0,
              cursor: item.tooltip ? 'help' : 'default',
            }}
          >
            <div
              style={{
                fontSize: '0.62rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--msp-text-faint)',
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: s ? s.fg : 'var(--msp-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
