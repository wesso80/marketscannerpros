'use client';

import type { ReactNode, CSSProperties } from 'react';
import ExpandableMetricRow from './ExpandableMetricRow';

/* ═══════════════════════════════════════════════════════════════════════════
   IntelligenceTable — the shared institutional spreadsheet table.
   Dense rows, sticky header, optional sticky first column, horizontal scroll on
   small screens, and optional expandable detail rows.
   ════════════════════════════════════════════════════════════════════════════ */

export interface IntelColumn {
  key: string;
  label: string;
  tooltip?: string;
  align?: 'left' | 'center' | 'right';
}

export interface IntelRow {
  id: string;
  /** Pre-rendered <td> cells (use the primitives: StateCell / ScoreCell / …). */
  cells: ReactNode[];
  /** Optional drill-down panel revealed when the row is expanded. */
  detail?: ReactNode;
}

interface IntelligenceTableProps {
  columns: IntelColumn[];
  rows: IntelRow[];
  stickyFirst?: boolean;
  minWidth?: number;
}

const thBase: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  padding: '8px 10px',
  fontSize: '0.68rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: 'var(--msp-text-muted)',
  background: 'var(--msp-panel-2)',
  borderBottom: '1px solid var(--msp-border-strong)',
  whiteSpace: 'nowrap',
};

export default function IntelligenceTable({
  columns,
  rows,
  stickyFirst = false,
  minWidth = 720,
}: IntelligenceTableProps) {
  const expandable = rows.some((r) => Boolean(r.detail));

  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--msp-border)',
        borderRadius: 'var(--msp-radius-card)',
        background: 'var(--msp-panel)',
      }}
    >
      <table style={{ width: '100%', minWidth, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {expandable && <th style={{ ...thBase, width: 26 }} aria-hidden />}
            {columns.map((col, i) => (
              <th
                key={col.key}
                title={col.tooltip}
                style={{
                  ...thBase,
                  textAlign: col.align ?? (i === 0 ? 'left' : 'center'),
                  ...(stickyFirst && i === 0
                    ? { left: expandable ? 26 : 0, zIndex: 3 }
                    : {}),
                  cursor: col.tooltip ? 'help' : 'default',
                }}
              >
                {col.label}
                {col.tooltip ? <span style={{ marginLeft: 4, opacity: 0.5 }}>ⓘ</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <ExpandableMetricRow
              key={row.id}
              cells={row.cells}
              detail={row.detail}
              expandable={expandable}
              stickyFirst={stickyFirst}
              rowIndex={idx}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
