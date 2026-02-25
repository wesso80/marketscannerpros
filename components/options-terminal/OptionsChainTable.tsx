'use client';

import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import type { StrikeGroup, TerminalMode, QuickFilter, OptionsContract } from '@/types/optionsTerminal';

/* ── Props ─────────────────────────────────────────────────────── */
interface Props {
  strikeGroups: StrikeGroup[];
  spot: number;
  mode: TerminalMode;
  activeFilter: QuickFilter | null;
  selectedStrike: number | null;
  onSelectContract: (contract: OptionsContract) => void;
  strikeRange: number;          // % from ATM to show
  onStrikeRangeChange: (r: number) => void;
  showCalls: boolean;
  showPuts: boolean;
  onToggleCalls: () => void;
  onTogglePuts: () => void;
  minOI: number;
  minVol: number;
  maxSpreadPct: number;
  onMinOIChange: (v: number) => void;
  onMinVolChange: (v: number) => void;
  onMaxSpreadPctChange: (v: number) => void;
}

/* ── Row height constant for virtual scroll ──────────────────── */
const ROW_H = 36;
const HEADER_H = 32;
const OVERSCAN = 8;

/* ── Helpers ──────────────────────────────────────────────────── */
function fmtNum(n: number, d: number = 2): string {
  if (n === 0) return '—';
  return n.toFixed(d);
}
function fmtK(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtIV(n: number): string {
  if (n === 0) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function contractCell(c: OptionsContract | undefined, field: keyof OptionsContract, d: number = 2): string {
  if (!c) return '—';
  const v = c[field];
  if (typeof v === 'number') {
    if (field === 'iv') return fmtIV(v);
    if (field === 'volume' || field === 'openInterest') return fmtK(v);
    return fmtNum(v, d);
  }
  return String(v ?? '—');
}

/* ── Retail / Institutional columns ───────────────────────────── */
interface Col {
  key: string;
  label: string;
  field: keyof OptionsContract;
  decimals?: number;
  instOnly?: boolean;
}

const SIDE_COLS: Col[] = [
  { key: 'bid', label: 'Bid', field: 'bid' },
  { key: 'ask', label: 'Ask', field: 'ask' },
  { key: 'last', label: 'Last', field: 'last' },
  { key: 'vol', label: 'Vol', field: 'volume' },
  { key: 'oi', label: 'OI', field: 'openInterest' },
  { key: 'iv', label: 'IV', field: 'iv' },
  { key: 'delta', label: 'Δ', field: 'delta' },
  { key: 'theta', label: 'Θ', field: 'theta', decimals: 4 },
  { key: 'gamma', label: 'Γ', field: 'gamma', decimals: 5, instOnly: true },
  { key: 'vega', label: 'Vega', field: 'vega', decimals: 4, instOnly: true },
  { key: 'rho', label: 'Rho', field: 'rho', decimals: 4, instOnly: true },
];

/* ── Component ────────────────────────────────────────────────── */
export default function OptionsChainTable({
  strikeGroups,
  spot,
  mode,
  activeFilter,
  selectedStrike,
  onSelectContract,
  strikeRange,
  onStrikeRangeChange,
  showCalls,
  showPuts,
  onToggleCalls,
  onTogglePuts,
  minOI,
  minVol,
  maxSpreadPct,
  onMinOIChange,
  onMinVolChange,
  onMaxSpreadPctChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerH, setContainerH] = useState(600);

  // observe container resize
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const obs = new ResizeObserver(([e]) => setContainerH(e.contentRect.height));
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  /* ── Visible columns ───────────────────────────────────────── */
  const cols = useMemo(
    () => SIDE_COLS.filter((c) => (mode === 'retail' ? !c.instOnly : true)),
    [mode],
  );

  /* ── Filtered rows ─────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let rows = strikeGroups;

    // Strike range filter
    if (spot > 0 && strikeRange < 100) {
      const lo = spot * (1 - strikeRange / 100);
      const hi = spot * (1 + strikeRange / 100);
      rows = rows.filter((g) => g.strike >= lo && g.strike <= hi);
    }

    // Liquidity filters
    if (minOI > 0) {
      rows = rows.filter((g) => (g.call?.openInterest ?? 0) >= minOI || (g.put?.openInterest ?? 0) >= minOI);
    }
    if (minVol > 0) {
      rows = rows.filter((g) => (g.call?.volume ?? 0) >= minVol || (g.put?.volume ?? 0) >= minVol);
    }
    if (maxSpreadPct < 100) {
      rows = rows.filter((g) => {
        const cs = g.call?.spreadPct ?? 0;
        const ps = g.put?.spreadPct ?? 0;
        return cs <= maxSpreadPct || ps <= maxSpreadPct;
      });
    }

    // Quick filter emphasis (not removal — ATM focus centres the list)
    // We don't filter these out; the row renderer will highlight them

    return rows;
  }, [strikeGroups, spot, strikeRange, minOI, minVol, maxSpreadPct]);

  /* ── Virtual window ────────────────────────────────────────── */
  const totalH = filtered.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + containerH) / ROW_H) + OVERSCAN);
  const visible = filtered.slice(startIdx, endIdx);

  /* ── Highlight logic ───────────────────────────────────────── */
  const isHighOI = useCallback((g: StrikeGroup): boolean => {
    const max = Math.max(...strikeGroups.map((r) => (r.call?.openInterest ?? 0) + (r.put?.openInterest ?? 0)));
    const total = (g.call?.openInterest ?? 0) + (g.put?.openInterest ?? 0);
    return max > 0 && total >= max * 0.7;
  }, [strikeGroups]);

  const isHighVol = useCallback((g: StrikeGroup): boolean => {
    const max = Math.max(...strikeGroups.map((r) => (r.call?.volume ?? 0) + (r.put?.volume ?? 0)));
    const total = (g.call?.volume ?? 0) + (g.put?.volume ?? 0);
    return max > 0 && total >= max * 0.7;
  }, [strikeGroups]);

  const wideSpread = (c?: OptionsContract) => c && c.spreadPct > 5;

  /* ── Render side cols ──────────────────────────────────────── */
  const renderSide = (c: OptionsContract | undefined, side: 'call' | 'put') => (
    cols.map((col) => (
      <td
        key={`${side}-${col.key}`}
        className="px-1.5 py-0 text-right font-mono text-[11px] tabular-nums whitespace-nowrap cursor-pointer"
        style={{
          color: c ? 'var(--msp-text)' : 'var(--msp-text-faint)',
          opacity: c ? 1 : 0.4,
        }}
        onClick={() => c && onSelectContract(c)}
      >
        {contractCell(c, col.field, col.decimals)}
      </td>
    ))
  );

  return (
    <div
      className="flex flex-col rounded-xl border h-full overflow-hidden"
      style={{ background: 'var(--msp-card)', borderColor: 'var(--msp-border)' }}
    >
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-3 px-3 py-2 border-b"
        style={{ borderColor: 'var(--msp-border)' }}
      >
        {/* Calls / Puts toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCalls}
            className="text-[10px] font-bold px-2 py-1 rounded transition-all"
            style={{
              background: showCalls ? 'var(--msp-bull-tint)' : 'transparent',
              color: showCalls ? 'var(--msp-bull)' : 'var(--msp-text-faint)',
              border: showCalls ? '1px solid var(--msp-bull)' : '1px solid var(--msp-border)',
            }}
          >
            CALLS
          </button>
          <button
            onClick={onTogglePuts}
            className="text-[10px] font-bold px-2 py-1 rounded transition-all"
            style={{
              background: showPuts ? 'var(--msp-bear-tint)' : 'transparent',
              color: showPuts ? 'var(--msp-bear)' : 'var(--msp-text-faint)',
              border: showPuts ? '1px solid var(--msp-bear)' : '1px solid var(--msp-border)',
            }}
          >
            PUTS
          </button>
        </div>

        {/* Strike range */}
        <div className="flex items-center gap-1.5">
          <label className="text-[9px] uppercase tracking-wider font-bold" style={{ color: 'var(--msp-text-faint)' }}>
            ±{strikeRange}%
          </label>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={strikeRange}
            onChange={(e) => onStrikeRangeChange(Number(e.target.value))}
            className="w-16 h-1 accent-emerald-500"
          />
        </div>

        {/* Liquidity filters (institutional mode) */}
        {mode === 'institutional' && (
          <>
            <div className="flex items-center gap-1">
              <label className="text-[9px] uppercase font-bold" style={{ color: 'var(--msp-text-faint)' }}>Min OI</label>
              <input
                type="number"
                value={minOI}
                onChange={(e) => onMinOIChange(Number(e.target.value))}
                className="w-14 text-[10px] font-mono rounded border px-1 py-0.5"
                style={{ background: 'var(--msp-bg)', borderColor: 'var(--msp-border)', color: 'var(--msp-text)' }}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[9px] uppercase font-bold" style={{ color: 'var(--msp-text-faint)' }}>Min Vol</label>
              <input
                type="number"
                value={minVol}
                onChange={(e) => onMinVolChange(Number(e.target.value))}
                className="w-14 text-[10px] font-mono rounded border px-1 py-0.5"
                style={{ background: 'var(--msp-bg)', borderColor: 'var(--msp-border)', color: 'var(--msp-text)' }}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[9px] uppercase font-bold" style={{ color: 'var(--msp-text-faint)' }}>Max Spread%</label>
              <input
                type="number"
                value={maxSpreadPct}
                onChange={(e) => onMaxSpreadPctChange(Number(e.target.value))}
                className="w-14 text-[10px] font-mono rounded border px-1 py-0.5"
                style={{ background: 'var(--msp-bg)', borderColor: 'var(--msp-border)', color: 'var(--msp-text)' }}
              />
            </div>
          </>
        )}

        <span className="ml-auto text-[9px] tabular-nums" style={{ color: 'var(--msp-text-faint)' }}>
          {filtered.length} strikes
        </span>
      </div>

      {/* ── Table (virtualised) ─────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {/* Sticky header */}
        <div
          className="flex items-center text-[9px] font-bold uppercase tracking-wider"
          style={{ height: HEADER_H, background: 'var(--msp-panel-2)', color: 'var(--msp-text-faint)' }}
        >
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                {showCalls && cols.map((col) => (
                  <th key={`ch-${col.key}`} className="px-1.5 py-1 text-right font-bold" style={{ color: 'var(--msp-bull)', width: `${100 / (cols.length * (showCalls && showPuts ? 2 : 1) + 3)}%` }}>
                    {col.label}
                  </th>
                ))}
                <th className="px-1.5 py-1 text-center font-bold" style={{ color: 'var(--msp-text)', width: '60px' }}>Strike</th>
                <th className="px-1.5 py-1 text-center font-bold" style={{ color: 'var(--msp-text-faint)', width: '40px' }}>Dist</th>
                <th className="px-1 py-1 text-center" style={{ width: '28px' }}></th>
                {showPuts && cols.map((col) => (
                  <th key={`ph-${col.key}`} className="px-1.5 py-1 text-right font-bold" style={{ color: 'var(--msp-bear)', width: `${100 / (cols.length * (showCalls && showPuts ? 2 : 1) + 3)}%` }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable body */}
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="overflow-y-auto"
          style={{ height: `calc(100% - ${HEADER_H}px)` }}
        >
          <div style={{ height: totalH, position: 'relative' }}>
            <table
              className="w-full table-fixed border-collapse"
              style={{ position: 'absolute', top: startIdx * ROW_H }}
            >
              <tbody>
                {visible.map((g) => {
                  const atm = g.isAtm;
                  const selected = g.strike === selectedStrike;
                  const hiOI = activeFilter === 'high_oi' && isHighOI(g);
                  const hiVol = activeFilter === 'high_vol' && isHighVol(g);
                  const callWide = wideSpread(g.call);
                  const putWide = wideSpread(g.put);

                  let bg = 'transparent';
                  if (selected) bg = 'rgba(16,185,129,0.10)';
                  else if (atm) bg = 'rgba(255,255,255,0.04)';
                  else if (hiOI || hiVol) bg = 'rgba(216,162,67,0.06)';

                  return (
                    <tr
                      key={g.strike}
                      style={{ height: ROW_H, background: bg }}
                      className="border-b transition-colors hover:bg-white/[.03]"
                    >
                      {/* Calls side */}
                      {showCalls && renderSide(g.call, 'call')}

                      {/* Strike */}
                      <td className="px-1.5 py-0 text-center">
                        <span className="font-mono font-bold text-[12px] tabular-nums" style={{ color: atm ? 'var(--msp-accent)' : 'var(--msp-text)' }}>
                          {g.strike.toFixed(2)}
                        </span>
                        {atm && (
                          <span className="ml-1 text-[8px] font-black" style={{ color: 'var(--msp-accent)' }}>ATM</span>
                        )}
                      </td>

                      {/* Distance from spot */}
                      <td className="px-1 py-0 text-center text-[10px] tabular-nums font-mono" style={{ color: g.distFromSpot >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                        {g.distFromSpot >= 0 ? '+' : ''}{g.distFromSpot.toFixed(1)}%
                      </td>

                      {/* Warnings */}
                      <td className="px-0.5 py-0 text-center text-[9px]">
                        {(callWide || putWide) && (
                          <span title="Wide spread" style={{ color: 'var(--msp-warn)' }}>⚠</span>
                        )}
                      </td>

                      {/* Puts side */}
                      {showPuts && renderSide(g.put, 'put')}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
