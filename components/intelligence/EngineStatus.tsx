'use client';

import Link from 'next/link';
import type { EngineStatusRow } from '@/lib/intelligence/types';
import { STATE_STYLES, trendMeta } from '@/lib/intelligence/states';

/* ═══════════════════════════════════════════════════════════════════════════
   EngineStatus — the Intelligence-home status strip. Each row links to the
   associated engine page.
   ════════════════════════════════════════════════════════════════════════════ */

const th: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '0.66rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: 'var(--msp-text-muted)',
  background: 'var(--msp-panel-2)',
  borderBottom: '1px solid var(--msp-border-strong)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '0.82rem',
  borderBottom: '1px solid var(--msp-border)',
  whiteSpace: 'nowrap',
};

export default function EngineStatus({ rows }: { rows: EngineStatusRow[] }) {
  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--msp-border)',
        borderRadius: 'var(--msp-radius-card)',
        background: 'var(--msp-panel)',
      }}
    >
      <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Engine</th>
            <th style={{ ...th, textAlign: 'right' }}>Score</th>
            <th style={th}>State</th>
            <th style={th}>Trend</th>
            <th style={{ ...th, textAlign: 'right' }}>Last Update</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const s = STATE_STYLES[row.semantic];
            const trend = trendMeta(row.trend);
            const trendStyle = STATE_STYLES[trend.semantic];
            const zebra = idx % 2 === 0 ? 'var(--msp-card)' : 'var(--msp-panel)';
            return (
              <tr key={row.engine} style={{ background: zebra }}>
                <td style={td}>
                  <Link
                    href={row.href}
                    style={{ color: 'var(--msp-accent)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {row.label}
                  </Link>
                </td>
                <td style={{ ...td, textAlign: 'right', color: s.fg, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {row.score}
                </td>
                <td style={td}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: s.fg,
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                    }}
                  >
                    {row.state}
                  </span>
                </td>
                <td style={{ ...td, color: trendStyle.fg }}>
                  {trend.glyph} {trend.label}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--msp-text-faint)', fontSize: '0.72rem' }}>
                  {new Date(row.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
