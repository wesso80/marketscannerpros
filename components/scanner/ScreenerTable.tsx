'use client';

import React, { useState, useMemo } from 'react';

/* ─── Types ─── */
export interface ScreenerRow {
  rank: number;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  quality: string; // 'high' | 'medium' | 'low'
  strategy: string;
  rsi?: number;
  adx?: number;
  atrPct?: number;
  tfAlignment?: number;
  volume24h?: number;
  price?: number;
  change24h?: number;
  permission?: 'COMPLIANT' | 'TIGHT' | 'BLOCKED';
  squeeze?: boolean;
  squeezeStrength?: number;
  momentumAccel?: boolean;
  momentumAccelScore?: number;
  sectorRelStr?: number;
  // extra fields from bulk scan
  liquidityState?: string;
  volatilityState?: string;
  structureLabel?: string;
}

export type SortKey = keyof ScreenerRow;
type SortDir = 'asc' | 'desc';

interface ScreenerTableProps {
  rows: ScreenerRow[];
  onRowClick?: (row: ScreenerRow) => void;
  selectedSymbol?: string;
}

/* ─── Helpers ─── */
function formatNum(n: number | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function formatVol(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function dirColor(dir: string): string {
  if (dir === 'LONG') return '#10B981';
  if (dir === 'SHORT') return '#EF4444';
  return '#94a3b8';
}

function qualityColor(q: string): string {
  if (q === 'high') return '#10B981';
  if (q === 'medium') return '#FBBF24';
  return '#94a3b8';
}

function permColor(p: string | undefined): string {
  if (p === 'COMPLIANT') return '#10B981';
  if (p === 'TIGHT') return '#FBBF24';
  if (p === 'BLOCKED') return '#EF4444';
  return '#64748b';
}

function confColor(c: number): string {
  if (c >= 75) return '#10B981';
  if (c >= 60) return '#FBBF24';
  return '#94a3b8';
}

/* ─── Column definitions ─── */
interface Column {
  key: SortKey;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: ScreenerRow) => React.ReactNode;
}

const COLUMNS: Column[] = [
  { key: 'rank', label: '#', width: '40px', align: 'center' },
  {
    key: 'symbol', label: 'Symbol', width: '110px',
    render: (r) => (
      <span style={{ fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.02em' }}>{r.symbol}</span>
    ),
  },
  {
    key: 'direction', label: 'Dir', width: '70px', align: 'center',
    render: (r) => (
      <span style={{
        fontSize: 11, fontWeight: 700, color: dirColor(r.direction),
        background: `${dirColor(r.direction)}18`, borderRadius: 4, padding: '2px 6px',
      }}>
        {r.direction}
      </span>
    ),
  },
  {
    key: 'confidence', label: 'Conf', width: '70px', align: 'center',
    render: (r) => (
      <span style={{ fontWeight: 700, color: confColor(r.confidence) }}>
        {r.confidence}%
      </span>
    ),
  },
  {
    key: 'quality', label: 'Quality', width: '75px', align: 'center',
    render: (r) => (
      <span style={{
        fontSize: 11, fontWeight: 600, color: qualityColor(r.quality),
        textTransform: 'uppercase',
      }}>
        {r.quality}
      </span>
    ),
  },
  { key: 'strategy', label: 'Strategy', width: '130px' },
  {
    key: 'rsi', label: 'RSI', width: '55px', align: 'right',
    render: (r) => <span>{formatNum(r.rsi, 0)}</span>,
  },
  {
    key: 'adx', label: 'ADX', width: '55px', align: 'right',
    render: (r) => <span>{formatNum(r.adx, 0)}</span>,
  },
  {
    key: 'atrPct', label: 'Vol%', width: '60px', align: 'right',
    render: (r) => <span>{r.atrPct != null ? `${formatNum(r.atrPct)}%` : '—'}</span>,
  },
  {
    key: 'tfAlignment', label: 'MTF', width: '50px', align: 'center',
    render: (r) => <span>{r.tfAlignment != null ? `${r.tfAlignment}/4` : '—'}</span>,
  },
  {
    key: 'volume24h', label: 'Volume', width: '90px', align: 'right',
    render: (r) => <span>{formatVol(r.volume24h)}</span>,
  },
  {
    key: 'sectorRelStr', label: 'Sec RS', width: '70px', align: 'right',
    render: (r) => {
      if (r.sectorRelStr == null) return <span style={{ color: '#475569' }}>\u2014</span>;
      const color = r.sectorRelStr > 0 ? '#10B981' : r.sectorRelStr < 0 ? '#EF4444' : '#94a3b8';
      return <span style={{ fontSize: 11, fontWeight: 600, color }}>{r.sectorRelStr > 0 ? '+' : ''}{r.sectorRelStr.toFixed(1)}%</span>;
    },
  },
  {
    key: 'momentumAccelScore', label: 'Accel', width: '65px', align: 'center',
    render: (r) => (
      r.momentumAccel
        ? <span style={{ fontSize: 10, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.12)', borderRadius: 4, padding: '1px 5px' }}>
            \u26a1 {r.momentumAccelScore ?? 0}
          </span>
        : <span style={{ color: '#475569' }}>\u2014</span>
    ),
  },
  {
    key: 'squeeze', label: 'Squeeze', width: '75px', align: 'center',
    render: (r) => (
      r.squeeze
        ? <span style={{ fontSize: 10, fontWeight: 700, color: '#FBBF24', background: 'rgba(251,191,36,0.12)', borderRadius: 4, padding: '1px 5px' }}>
            🔥 {r.squeezeStrength != null ? `${r.squeezeStrength}%` : ''}
          </span>
        : <span style={{ color: '#475569' }}>—</span>
    ),
  },
  {
    key: 'permission', label: 'Rule', width: '85px', align: 'center',
    render: (r) => (
      <span style={{
        fontSize: 10, fontWeight: 700, color: permColor(r.permission),
        background: `${permColor(r.permission)}15`, borderRadius: 4, padding: '1px 5px',
      }}>
        {r.permission ?? '—'}
      </span>
    ),
  },
];

/* ─── Component ─── */
export default function ScreenerTable({ rows, onRowClick, selectedSymbol }: ScreenerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'confidence' || key === 'rank' ? 'desc' : 'asc');
    }
  };

  if (!rows.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
        No scan results yet. Run a scan to see candidates.
      </div>
    );
  }

  return (
    <div style={{
      display: 'block',
      visibility: 'visible',
      overflowX: 'auto',
      borderRadius: 12,
      border: '1px solid rgba(51, 65, 85, 0.4)',
      background: 'rgba(15, 23, 42, 0.3)',
      minHeight: 60,
    }}>
      <table style={{ display: 'table', visibility: 'visible', width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                style={{
                  padding: '8px 8px',
                  textAlign: col.align ?? 'left',
                  color: sortKey === col.key ? '#10B981' : '#64748b',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
                  whiteSpace: 'nowrap',
                  width: col.width,
                  position: 'sticky',
                  top: 0,
                  background: 'rgba(15, 23, 42, 0.95)',
                  zIndex: 1,
                }}
              >
                {col.label}
                {sortKey === col.key && (
                  <span style={{ marginLeft: 3, fontSize: 9 }}>
                    {sortDir === 'asc' ? '▲' : '▼'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isSelected = selectedSymbol && row.symbol === selectedSymbol;
            return (
              <tr
                key={row.symbol}
                onClick={() => onRowClick?.(row)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                  borderBottom: '1px solid rgba(51, 65, 85, 0.2)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget.style.background = 'rgba(51, 65, 85, 0.15)');
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget.style.background = 'transparent');
                }}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '7px 8px',
                      textAlign: col.align ?? 'left',
                      color: '#cbd5e1',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
