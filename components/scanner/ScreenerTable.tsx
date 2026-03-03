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
    <>
      {/* ── Mobile: finger-expandable cards ── */}
      <div className="md:hidden space-y-2">
        {sorted.map((row) => {
          const isSelected = selectedSymbol && row.symbol === selectedSymbol;
          return (
            <details
              key={row.symbol}
              className={`rounded-xl border ${isSelected ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-[rgba(51,65,85,0.4)] bg-[rgba(15,23,42,0.3)]'}`}
            >
              <summary
                className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                onClick={(e) => { if (onRowClick) { e.preventDefault(); onRowClick(row); } }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>#{row.rank}</span>
                  <span style={{ fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.02em' }}>{row.symbol}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: dirColor(row.direction),
                    background: `${dirColor(row.direction)}18`, borderRadius: 4, padding: '1px 5px',
                  }}>{row.direction}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span style={{ fontWeight: 700, color: confColor(row.confidence), fontSize: 13 }}>{row.confidence}%</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: permColor(row.permission),
                    background: `${permColor(row.permission)}15`, borderRadius: 4, padding: '1px 5px',
                  }}>{row.permission ?? '—'}</span>
                  <span style={{ color: '#475569', fontSize: 12 }}>▸</span>
                </div>
              </summary>
              <div className="border-t border-white/5 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-slate-500">Quality</span> <span className="font-semibold" style={{ color: qualityColor(row.quality) }}>{row.quality}</span></div>
                <div><span className="text-slate-500">Strategy</span> <span className="font-semibold text-slate-200">{row.strategy || '—'}</span></div>
                <div><span className="text-slate-500">RSI</span> <span className="font-semibold text-slate-200">{formatNum(row.rsi, 0)}</span></div>
                <div><span className="text-slate-500">ADX</span> <span className="font-semibold text-slate-200">{formatNum(row.adx, 0)}</span></div>
                <div><span className="text-slate-500">Vol%</span> <span className="font-semibold text-slate-200">{row.atrPct != null ? `${formatNum(row.atrPct)}%` : '—'}</span></div>
                <div><span className="text-slate-500">MTF</span> <span className="font-semibold text-slate-200">{row.tfAlignment != null ? `${row.tfAlignment}/4` : '—'}</span></div>
                <div><span className="text-slate-500">Volume</span> <span className="font-semibold text-slate-200">{formatVol(row.volume24h)}</span></div>
                <div><span className="text-slate-500">Price</span> <span className="font-semibold text-slate-200">{row.price ? `$${row.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</span></div>
              </div>
            </details>
          );
        })}
      </div>

      {/* ── Desktop: full table ── */}
      <div className="hidden md:block" style={{
        overflowX: 'auto',
        borderRadius: 12,
        border: '1px solid rgba(51, 65, 85, 0.4)',
        background: 'rgba(15, 23, 42, 0.3)',
      }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
    </>
  );
}
