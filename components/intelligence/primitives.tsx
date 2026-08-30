'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { SemanticState, GateState } from '@/lib/intelligence/types';
import { STATE_STYLES, gateToSemantic } from '@/lib/intelligence/states';

/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence primitives — the shared cell + label vocabulary used by every
   spreadsheet-style analytics table. All colour comes from the centralised
   STATE_STYLES map; nothing here hard-codes state colours.
   ════════════════════════════════════════════════════════════════════════════ */

const cellBase: CSSProperties = {
  padding: '6px 10px',
  fontSize: '0.78rem',
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--msp-border)',
};

/** Coloured pill for a discrete state label (PASS / STRONG LONG / SHORT …). */
export function StateCell({
  label,
  semantic,
  align = 'center',
  title,
}: {
  label: string;
  semantic: SemanticState;
  align?: 'left' | 'center' | 'right';
  title?: string;
}) {
  const s = STATE_STYLES[semantic];
  return (
    <td style={{ ...cellBase, textAlign: align }} title={title}>
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.72rem',
          letterSpacing: '0.02em',
          color: s.fg,
          background: s.bg,
          border: `1px solid ${s.border}`,
        }}
      >
        {label}
      </span>
    </td>
  );
}

/** Numeric score cell; colours itself from an explicit or derived semantic. */
export function ScoreCell({
  value,
  semantic,
  suffix = '',
  align = 'right',
  title,
}: {
  value: number | string;
  semantic: SemanticState;
  suffix?: string;
  align?: 'left' | 'center' | 'right';
  title?: string;
}) {
  const s = STATE_STYLES[semantic];
  return (
    <td style={{ ...cellBase, textAlign: align, color: s.fg, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} title={title}>
      {value}
      {suffix}
    </td>
  );
}

/** Gate cell (PASS / WAIT / FAIL / BLOCKER / PRE-EDGE). */
export function GateCell({ gate, align = 'center' }: { gate: GateState; align?: 'left' | 'center' | 'right' }) {
  return <StateCell label={gate} semantic={gateToSemantic(gate)} align={align} />;
}

/** Neutral text/metric cell. */
export function MetricCell({
  children,
  align = 'left',
  muted = false,
  strong = false,
  title,
}: {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
  muted?: boolean;
  strong?: boolean;
  title?: string;
}) {
  return (
    <td
      style={{
        ...cellBase,
        textAlign: align,
        color: muted ? 'var(--msp-text-muted)' : 'var(--msp-text)',
        fontWeight: strong ? 600 : 400,
        fontVariantNumeric: 'tabular-nums',
      }}
      title={title}
    >
      {children}
    </td>
  );
}

/** Section band above a table or group of tables. */
export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        margin: '20px 0 8px',
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 700 }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--msp-text-faint)' }}>{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

/** "Last updated HH:MM:SS" badge. */
export function LastUpdatedBadge({ timestamp }: { timestamp?: string }) {
  const label = timestamp ? new Date(timestamp).toLocaleTimeString() : '—';
  return (
    <span
      style={{
        fontSize: '0.68rem',
        color: 'var(--msp-text-faint)',
        border: '1px solid var(--msp-border)',
        borderRadius: 6,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
      title="Last updated"
    >
      Last updated: {label}
    </span>
  );
}
