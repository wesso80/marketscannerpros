'use client';

import {
  useState,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  type CSSProperties,
} from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   ExpandableMetricRow — a spreadsheet row that can reveal a detail panel
   (drill-down) beneath it. Keeps tables compact for experienced users while
   letting learning users expand any row for an explanation.
   ════════════════════════════════════════════════════════════════════════════ */

interface ExpandableMetricRowProps {
  cells: ReactNode[];
  detail?: ReactNode;
  /** Table reserves a leading expander column when any row is expandable. */
  expandable: boolean;
  stickyFirst?: boolean;
  rowIndex: number;
}

const expanderCell: CSSProperties = {
  padding: '6px 6px',
  textAlign: 'center',
  color: 'var(--msp-text-faint)',
  borderBottom: '1px solid var(--msp-border)',
  width: 26,
};

export default function ExpandableMetricRow({
  cells,
  detail,
  expandable,
  stickyFirst = false,
  rowIndex,
}: ExpandableMetricRowProps) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(detail);
  const columnCount = cells.length + (expandable ? 1 : 0);
  const zebra = rowIndex % 2 === 0 ? 'var(--msp-card)' : 'var(--msp-panel)';

  const renderedCells = cells.map((cell, i) => {
    if (i === 0 && stickyFirst && isValidElement(cell)) {
      const el = cell as ReactElement<{ style?: CSSProperties }>;
      return cloneElement(el, {
        key: i,
        style: {
          ...(el.props.style ?? {}),
          position: 'sticky',
          left: 0,
          zIndex: 1,
          background: zebra,
        },
      });
    }
    return isValidElement(cell) ? cloneElement(cell as ReactElement, { key: i }) : <td key={i}>{cell}</td>;
  });

  return (
    <>
      <tr
        onClick={hasDetail ? () => setOpen((v) => !v) : undefined}
        style={{ background: zebra, cursor: hasDetail ? 'pointer' : 'default' }}
      >
        {expandable && (
          <td style={{ ...expanderCell, background: stickyFirst ? zebra : undefined }} aria-hidden>
            {hasDetail ? (open ? '▾' : '▸') : ''}
          </td>
        )}
        {renderedCells}
      </tr>
      {open && hasDetail && (
        <tr>
          <td
            colSpan={columnCount}
            style={{
              padding: '10px 14px',
              background: 'var(--msp-bg)',
              borderBottom: '1px solid var(--msp-border)',
              fontSize: '0.78rem',
              color: 'var(--msp-text-muted)',
            }}
          >
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
