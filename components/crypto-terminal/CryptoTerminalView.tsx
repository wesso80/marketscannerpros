'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useCryptoDerivatives,
  useMultiCoinDerivatives,
  buildFundingHeatmap,
  buildSignals,
} from '@/hooks/useCryptoDerivatives';
import type { DerivativeRow, DerivedSignal, FundingHeatmapCell } from '@/types/cryptoTerminal';

/* ══════════════════════════════════════════════════
   UI PRIMITIVES (same zinc-950 desk theme)
   ══════════════════════════════════════════════════ */

function Card({ title, right, children, className = '' }: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-zinc-800 bg-zinc-950/80 backdrop-blur ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-zinc-800/60 px-5 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          {right}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Badge({ children, color = 'zinc' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30',
    red: 'bg-red-500/10 text-red-400 border-red-600/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-600/30',
    zinc: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-600/30',
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${colors[color] || colors.zinc}`}>{children}</span>;
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-base font-bold text-zinc-100">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function Th({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return <th onClick={onClick} className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400 ${onClick ? 'cursor-pointer hover:text-zinc-200' : ''} ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 text-sm text-zinc-300 ${className}`}>{children}</td>;
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800'}`}>
      {children}
    </button>
  );
}

/* ── formatters ───────────────────────────────── */
const fmt = (n: number, d = 2) => isNaN(n) ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => {
  if (isNaN(n) || n === 0) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};
const fmtPct = (n: number) => isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtFunding = (n: number) => isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(4)}%`;
const pctColor = (n: number) => n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-400';
const fundingColor = (pct: number) => {
  if (pct > 0.03) return 'text-emerald-400';
  if (pct < -0.01) return 'text-red-400';
  return 'text-zinc-300';
};

/* ── top coins quick pick ─────────────────────── */
const TOP_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  { symbol: 'SOL', name: 'Solana', icon: '◎' },
  { symbol: 'BNB', name: 'BNB', icon: '⬡' },
  { symbol: 'XRP', name: 'XRP', icon: '✕' },
  { symbol: 'DOGE', name: 'Doge', icon: '🐕' },
  { symbol: 'ADA', name: 'Cardano', icon: '₳' },
  { symbol: 'AVAX', name: 'Avalanche', icon: '🔺' },
  { symbol: 'LINK', name: 'Chainlink', icon: '⬡' },
  { symbol: 'DOT', name: 'Polkadot', icon: '●' },
  { symbol: 'NEAR', name: 'Near', icon: 'Ⓝ' },
  { symbol: 'LTC', name: 'Litecoin', icon: 'Ł' },
  { symbol: 'ARB', name: 'Arbitrum', icon: '🔵' },
  { symbol: 'OP', name: 'Optimism', icon: '🔴' },
  { symbol: 'UNI', name: 'Uniswap', icon: '🦄' },
];

/* ══════════════════════════════════════════════════
   SPARKLINE MINI-CHART (SVG)
   ══════════════════════════════════════════════════ */

function Sparkline({ data, width = 120, height = 36 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div style={{ width, height }} className="bg-zinc-900/40 rounded" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} className="block">
      <polyline fill="none" stroke={up ? '#10B981' : '#EF4444'} strokeWidth="1.5" points={points} />
    </svg>
  );
}

/* ══════════════════════════════════════════════════
   FUNDING HEATMAP (inline)
   ══════════════════════════════════════════════════ */

function FundingHeatmapInline({ cells, topExchanges }: { cells: FundingHeatmapCell[]; topExchanges: string[] }) {
  const symbols = [...new Set(cells.map(c => c.symbol))];
  const cellMap = new Map(cells.map(c => [`${c.symbol}|${c.exchange}`, c]));

  const bgForFunding = (pct: number) => {
    if (pct > 0.05) return 'bg-emerald-600/40';
    if (pct > 0.02) return 'bg-emerald-600/20';
    if (pct > 0) return 'bg-emerald-600/10';
    if (pct < -0.02) return 'bg-red-600/40';
    if (pct < -0.01) return 'bg-red-600/20';
    if (pct < 0) return 'bg-red-600/10';
    return 'bg-zinc-900';
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-zinc-950 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 z-10">Coin</th>
            {topExchanges.map(ex => (
              <th key={ex} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">{ex.replace(' (Futures)', '').replace(' (Derivatives)', '').slice(0, 10)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map(sym => (
            <tr key={sym} className="border-t border-zinc-800/40">
              <td className="sticky left-0 bg-zinc-950 px-2 py-1.5 font-medium text-zinc-200 z-10 whitespace-nowrap">{sym}</td>
              {topExchanges.map(ex => {
                const cell = cellMap.get(`${sym}|${ex}`);
                if (!cell) return <td key={ex} className="px-2 py-1.5 text-center text-zinc-700">—</td>;
                return (
                  <td key={ex} className={`px-2 py-1.5 text-center font-mono ${bgForFunding(cell.fundingPct)} rounded`}>
                    <span className={fundingColor(cell.fundingPct)}>{fmtFunding(cell.fundingPct)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   SIGNALS CARD (inline)
   ══════════════════════════════════════════════════ */

function SignalsInline({ signals }: { signals: DerivedSignal[] }) {
  if (!signals.length) {
    return <p className="text-sm text-zinc-500 italic">No significant signals detected for current data.</p>;
  }
  const icon = (s: DerivedSignal['severity']) => s === 'bullish' ? '🟢' : s === 'bearish' ? '🔴' : '🟡';
  return (
    <div className="space-y-3">
      {signals.map((s, i) => (
        <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center gap-2">
            <span>{icon(s.severity)}</span>
            <span className="text-sm font-semibold text-zinc-100">{s.label}</span>
            <Badge color={s.type === 'funding' ? 'sky' : s.type === 'oi' ? 'amber' : 'zinc'}>{s.type}</Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{s.detail}</p>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN VIEW
   ══════════════════════════════════════════════════ */

export default function CryptoTerminalView() {
  const searchParams = useSearchParams();
  const [selectedSymbol, setSelectedSymbol] = useState(searchParams.get('symbol')?.toUpperCase() || 'BTC');
  const [selectedRow, setSelectedRow] = useState<DerivativeRow | null>(null);
  const [sortCol, setSortCol] = useState<'oi' | 'funding' | 'volume' | 'basis' | 'spread'>('oi');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Data hooks
  const single = useCryptoDerivatives(selectedSymbol);
  const multi = useMultiCoinDerivatives();

  // Switch coin
  const switchCoin = useCallback((sym: string) => {
    setSelectedSymbol(sym);
    setSelectedRow(null);
    single.fetch(sym);
  }, [single]);

  // Sort handler
  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  // Sorted rows
  const sortedRows = useMemo(() => {
    if (!single.data) return [];
    const rows = [...single.data.rows];
    const m = sortDir === 'asc' ? 1 : -1;
    switch (sortCol) {
      case 'oi': rows.sort((a, b) => (a.openInterest - b.openInterest) * m); break;
      case 'funding': rows.sort((a, b) => (a.fundingPct - b.fundingPct) * m); break;
      case 'volume': rows.sort((a, b) => (a.volume24h - b.volume24h) * m); break;
      case 'basis': rows.sort((a, b) => (a.basis - b.basis) * m); break;
      case 'spread': rows.sort((a, b) => (a.spread - b.spread) * m); break;
    }
    return rows;
  }, [single.data, sortCol, sortDir]);

  // Signals
  const signals = useMemo(() => single.data ? buildSignals(single.data) : [], [single.data]);

  // Heatmap
  const heatmapData = useMemo(() => {
    if (!multi.data) return { cells: [] as FundingHeatmapCell[], topExchanges: [] as string[] };
    const cells = buildFundingHeatmap(multi.data);
    // Get top exchanges by occurrence
    const exchangeCount: Record<string, number> = {};
    for (const c of cells) exchangeCount[c.exchange] = (exchangeCount[c.exchange] || 0) + 1;
    const topExchanges = Object.entries(exchangeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(e => e[0]);
    return { cells: cells.filter(c => topExchanges.includes(c.exchange)), topExchanges };
  }, [multi.data]);

  const coin = single.data?.coin;
  const aggFunding = single.data?.aggregatedFunding;
  const aggOI = single.data?.aggregatedOI;
  const sortArrow = (col: typeof sortCol) => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Sticky top strip ─────────────────────────── */}
      <div className="sticky top-12 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="w-full px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Coin name / price */}
            <div className="flex items-center gap-3 mr-4">
              <span className="text-xl font-bold">{coin?.name ?? selectedSymbol}</span>
              <Badge color="zinc">{selectedSymbol}</Badge>
              {coin && (
                <>
                  <span className="text-xl font-mono font-bold">${fmt(coin.price, coin.price < 1 ? 6 : 2)}</span>
                  <span className={`text-sm font-semibold ${pctColor(coin.change24h)}`}>{fmtPct(coin.change24h)}</span>
                </>
              )}
            </div>
            {/* Quick stats */}
            {coin && (
              <div className="hidden lg:flex items-center gap-4 text-xs text-zinc-400">
                <span>Rank #{coin.rank}</span>
                <span>MCap {fmtUsd(coin.marketCap)}</span>
                <span>Vol {fmtUsd(coin.volume24h)}</span>
                <span>24h {fmtUsd(coin.low24h)} – {fmtUsd(coin.high24h)}</span>
                {coin.sparkline7d.length > 0 && <Sparkline data={coin.sparkline7d} width={100} height={28} />}
              </div>
            )}
            {/* Loading / refresh */}
            <div className="ml-auto flex items-center gap-2">
              {single.loading && <span className="text-xs text-zinc-500 animate-pulse">Loading…</span>}
              <button onClick={() => { single.fetch(selectedSymbol); multi.fetch(); }} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition">
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────── */}
      {single.error && (
        <div className="w-full px-4 pt-4">
          <div className="rounded-2xl border border-red-600/30 bg-red-500/10 p-4 text-sm text-red-300">{single.error}</div>
        </div>
      )}

      {/* ── Page shell ───────────────────────────────── */}
      <div className="w-full px-4 py-4 space-y-4">
        {/* === DESK GRID === */}
        <div className="grid grid-cols-12 gap-4">
          {/* ── Left: Coin Navigator ─────────────────── */}
          <div className="col-span-12 xl:col-span-3 space-y-4">
            <Card title="Coin Navigator" right={<span className="text-xs text-zinc-400">{TOP_COINS.length} coins</span>}>
              <div className="space-y-3">
                {/* Quick picks grid */}
                <div className="grid grid-cols-3 gap-2">
                  {TOP_COINS.map(c => (
                    <button
                      key={c.symbol}
                      onClick={() => switchCoin(c.symbol)}
                      className={`rounded-2xl border p-2.5 text-left transition ${
                        c.symbol === selectedSymbol
                          ? 'border-emerald-600/40 bg-emerald-600/10'
                          : 'border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="text-lg leading-none">{c.icon}</div>
                      <div className="mt-1 text-[11px] font-semibold">{c.symbol}</div>
                    </button>
                  ))}
                </div>

                {/* Coin overview stats */}
                {coin && (
                  <div className="space-y-2 border-t border-zinc-800/60 pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStat label="Market Cap" value={fmtUsd(coin.marketCap)} />
                      <MiniStat label="24h Volume" value={fmtUsd(coin.volume24h)} />
                      <MiniStat label="7d Change" value={fmtPct(coin.change7d)} />
                      <MiniStat label="Supply" value={coin.circulatingSupply ? `${(coin.circulatingSupply / 1e6).toFixed(1)}M` : '—'} />
                    </div>
                  </div>
                )}

                {/* Aggregated derivatives stats */}
                {aggFunding && aggOI && (
                  <div className="space-y-2 border-t border-zinc-800/60 pt-3">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Derivatives Summary</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStat label="Avg Funding" value={fmtFunding(aggFunding.fundingRatePct)} sub={`Annualised: ${fmt(aggFunding.annualised, 1)}%`} />
                      <MiniStat label="Sentiment" value={aggFunding.sentiment} />
                      <MiniStat label="Total OI" value={fmtUsd(aggOI.totalOI)} sub={`${aggOI.exchangeCount} exchanges`} />
                      <MiniStat label="Perps Volume" value={fmtUsd(aggOI.totalVolume24h)} />
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ── Center: Derivatives Table ────────────── */}
          <div className="col-span-12 xl:col-span-6">
            <Card
              title={`${selectedSymbol} Perpetuals — ${sortedRows.length} Exchanges`}
              right={
                <div className="flex items-center gap-2">
                  {['oi', 'funding', 'volume', 'basis'].map(col => (
                    <Chip key={col} active={sortCol === col} onClick={() => toggleSort(col as any)}>
                      {col === 'oi' ? 'OI' : col.charAt(0).toUpperCase() + col.slice(1)}{sortArrow(col as any)}
                    </Chip>
                  ))}
                </div>
              }
            >
              <div className="overflow-auto max-h-[calc(100vh-320px)] min-h-[400px] rounded-xl">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10 bg-zinc-950">
                    <tr>
                      <Th>Exchange</Th>
                      <Th className="text-right cursor-pointer" onClick={() => toggleSort('funding')}>Funding{sortArrow('funding')}</Th>
                      <Th className="text-right cursor-pointer" onClick={() => toggleSort('oi')}>Open Interest{sortArrow('oi')}</Th>
                      <Th className="text-right cursor-pointer" onClick={() => toggleSort('volume')}>Volume 24h{sortArrow('volume')}</Th>
                      <Th className="text-right cursor-pointer" onClick={() => toggleSort('basis')}>Basis{sortArrow('basis')}</Th>
                      <Th className="text-right cursor-pointer" onClick={() => toggleSort('spread')}>Spread{sortArrow('spread')}</Th>
                      <Th className="text-right">Price</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.length === 0 && !single.loading && (
                      <tr><td colSpan={7} className="py-12 text-center text-sm text-zinc-500">No perpetual contracts found for {selectedSymbol}</td></tr>
                    )}
                    {single.loading && !single.data && (
                      <tr><td colSpan={7} className="py-12 text-center text-sm text-zinc-500 animate-pulse">Loading derivatives data…</td></tr>
                    )}
                    {sortedRows.map((row, i) => {
                      const isSelected = selectedRow?.market === row.market;
                      return (
                        <tr
                          key={`${row.market}-${i}`}
                          onClick={() => setSelectedRow(isSelected ? null : row)}
                          className={`cursor-pointer border-t border-zinc-800/40 transition ${
                            isSelected ? 'bg-emerald-600/10' : 'hover:bg-zinc-900/60'
                          }`}
                        >
                          <Td>
                            <div className="font-medium text-zinc-200">{row.market.replace(' (Futures)', '').replace(' (Derivatives)', '')}</div>
                            <div className="text-[10px] text-zinc-500">{row.symbol}</div>
                          </Td>
                          <Td className="text-right">
                            <span className={`font-mono font-semibold ${fundingColor(row.fundingPct)}`}>
                              {fmtFunding(row.fundingPct)}
                            </span>
                          </Td>
                          <Td className="text-right font-mono">{fmtUsd(row.openInterest)}</Td>
                          <Td className="text-right font-mono">{fmtUsd(row.volume24h)}</Td>
                          <Td className="text-right">
                            <span className={`font-mono ${row.basis > 0.01 ? 'text-emerald-400' : row.basis < -0.01 ? 'text-red-400' : 'text-zinc-400'}`}>
                              {fmt(row.basis, 4)}
                            </span>
                          </Td>
                          <Td className="text-right font-mono text-zinc-400">{fmt(row.spread, 2)}</Td>
                          <Td className="text-right font-mono">${fmt(row.price, row.price < 1 ? 6 : 2)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* ── Right: Inspector ─────────────────────── */}
          <div className="col-span-12 xl:col-span-3 space-y-4">
            {selectedRow ? (
              <Card title={`${selectedRow.market.replace(' (Futures)', '').replace(' (Derivatives)', '')}`} right={<Badge>{selectedRow.symbol}</Badge>}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Funding Rate" value={fmtFunding(selectedRow.fundingPct)} sub={`Ann: ${fmt(selectedRow.fundingPct * 3 * 365, 1)}%`} />
                    <MiniStat label="Open Interest" value={fmtUsd(selectedRow.openInterest)} />
                    <MiniStat label="24h Volume" value={fmtUsd(selectedRow.volume24h)} />
                    <MiniStat label="Basis" value={fmt(selectedRow.basis, 4)} />
                    <MiniStat label="Bid-Ask Spread" value={fmt(selectedRow.spread, 2)} />
                    <MiniStat label="Index Price" value={`$${fmt(selectedRow.index, selectedRow.index < 1 ? 6 : 2)}`} />
                  </div>

                  {/* OI share bar */}
                  {aggOI && aggOI.totalOI > 0 && (
                    <div className="border-t border-zinc-800/60 pt-3">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
                        <span>OI Share</span>
                        <span>{((selectedRow.openInterest / aggOI.totalOI) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min((selectedRow.openInterest / aggOI.totalOI) * 100, 100)}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Funding vs Average */}
                  {aggFunding && (
                    <div className="border-t border-zinc-800/60 pt-3">
                      <div className="text-[11px] text-zinc-500 mb-2">Funding vs Market Avg</div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className={fundingColor(selectedRow.fundingPct)}>This: {fmtFunding(selectedRow.fundingPct)}</span>
                        <span className="text-zinc-600">|</span>
                        <span className={fundingColor(aggFunding.fundingRatePct)}>Avg: {fmtFunding(aggFunding.fundingRatePct)}</span>
                      </div>
                      {Math.abs(selectedRow.fundingPct - aggFunding.fundingRatePct) > 0.01 && (
                        <p className="mt-1 text-[11px] text-amber-400">
                          ⚠ {Math.abs(selectedRow.fundingPct - aggFunding.fundingRatePct).toFixed(4)}% deviation from average
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card title="Inspector">
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <p className="text-4xl mb-3">👈</p>
                  <p className="text-sm">Click an exchange row</p>
                  <p className="text-xs text-zinc-600 mt-1">to inspect derivatives detail</p>
                </div>
              </Card>
            )}

            {/* Signals */}
            <Card title="Positioning Signals" right={<Badge color={signals.length > 0 ? 'amber' : 'zinc'}>{signals.length}</Badge>}>
              <SignalsInline signals={signals} />
            </Card>
          </div>
        </div>

        {/* === ANALYTICS ROW === */}
        <div className="grid grid-cols-12 gap-4">
          {/* ── Funding Heatmap ──────────────────────── */}
          <div className="col-span-12 xl:col-span-8">
            <Card title="Funding Rate Heatmap" right={<span className="text-xs text-zinc-400">Top 20 coins × 8 exchanges</span>}>
              {multi.loading && !multi.data ? (
                <div className="py-8 text-center text-sm text-zinc-500 animate-pulse">Loading heatmap data…</div>
              ) : heatmapData.cells.length > 0 ? (
                <FundingHeatmapInline cells={heatmapData.cells} topExchanges={heatmapData.topExchanges} />
              ) : (
                <p className="py-8 text-center text-sm text-zinc-500">No heatmap data available</p>
              )}
            </Card>
          </div>

          {/* ── Market Overview ──────────────────────── */}
          <div className="col-span-12 xl:col-span-4">
            <Card title="Market Overview" right={<span className="text-xs text-zinc-400">{multi.data?.coins?.length ?? 0} coins</span>}>
              {multi.data?.coins ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {multi.data.coins.map(c => (
                    <button
                      key={c.symbol}
                      onClick={() => switchCoin(c.symbol)}
                      className={`w-full flex items-center justify-between rounded-xl border p-2.5 transition text-left ${
                        c.symbol === selectedSymbol
                          ? 'border-emerald-600/40 bg-emerald-600/10'
                          : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-zinc-200">{c.symbol}</div>
                        <div className="text-[10px] text-zinc-500">{c.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono">${fmt(c.price, c.price < 1 ? 6 : 2)}</div>
                        <div className={`text-[10px] font-mono ${pctColor(c.change24h)}`}>{fmtPct(c.change24h)}</div>
                      </div>
                      <div className="text-right ml-3">
                        <div className={`text-[10px] font-mono ${fundingColor(c.aggregatedFunding.fundingRatePct)}`}>
                          F: {fmtFunding(c.aggregatedFunding.fundingRatePct)}
                        </div>
                        <div className="text-[10px] text-zinc-500">OI: {fmtUsd(c.aggregatedOI.totalOI)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-zinc-500 animate-pulse">Loading…</div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
