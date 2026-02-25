'use client';

/**
 * OptionsTerminalView — Full options desk with live Alpha Vantage data.
 *
 * Visual scaffold adapted from the user's UI blueprint, data powered by
 * the useOptionsChain hook → /api/options-chain → AV REALTIME_OPTIONS_FMV.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOptionsChain } from '@/hooks/useOptionsChain';
import type {
  OptionsContract,
  StrikeGroup,
  BestStrike,
  ExpirationMeta,
  OIHeatmapRow,
  IVMetrics,
} from '@/types/optionsTerminal';

type Mode = 'retail' | 'institutional';
type CPFilter = 'BOTH' | 'CALLS' | 'PUTS';

/* ─────────────────────────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────────────────────────── */
export default function OptionsTerminalView() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get('symbol')?.toUpperCase() || '';

  /* ── Live data ─────────────────────────────────────────────── */
  const chain = useOptionsChain();

  /* ── UI state ──────────────────────────────────────────────── */
  const [ticker, setTicker] = useState(initialSymbol);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [mode, setMode] = useState<Mode>('retail');
  const [cp, setCp] = useState<CPFilter>('BOTH');
  const [rangePct, setRangePct] = useState(20);
  const [minOI, setMinOI] = useState(0);
  const [minVol, setMinVol] = useState(0);
  const [maxSpreadPct, setMaxSpreadPct] = useState(50);
  const [selected, setSelected] = useState<{ side: 'CALL' | 'PUT'; strike: number } | null>(null);

  /* ── Auto-fetch on ticker/expiry change ────────────────────── */
  useEffect(() => {
    if (ticker) {
      chain.fetch(ticker, selectedExpiry || undefined);
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, selectedExpiry]);

  /* ── Auto-select nearest weekly expiry once loaded ─────────── */
  useEffect(() => {
    if (chain.expirations.length && !selectedExpiry) {
      const weekly = chain.expirations.find((e) => e.dte > 0 && e.dte <= 10);
      const first = chain.expirations.find((e) => e.dte > 0);
      setSelectedExpiry((weekly || first)?.date || '');
    }
  }, [chain.expirations, selectedExpiry]);

  /* ── Build table rows from live strike groups ──────────────── */
  const rows = useMemo(() => {
    let groups = chain.strikeGroups;
    const spot = chain.underlyingPrice;

    // strike range filter
    if (spot > 0 && rangePct < 100) {
      const lo = spot * (1 - rangePct / 100);
      const hi = spot * (1 + rangePct / 100);
      groups = groups.filter((g) => g.strike >= lo && g.strike <= hi);
    }
    // liquidity filters
    if (minOI > 0) groups = groups.filter((g) => (g.call?.openInterest ?? 0) >= minOI || (g.put?.openInterest ?? 0) >= minOI);
    if (minVol > 0) groups = groups.filter((g) => (g.call?.volume ?? 0) >= minVol || (g.put?.volume ?? 0) >= minVol);
    if (maxSpreadPct < 100) groups = groups.filter((g) => (g.call?.spreadPct ?? 0) <= maxSpreadPct || (g.put?.spreadPct ?? 0) <= maxSpreadPct);

    return groups;
  }, [chain.strikeGroups, chain.underlyingPrice, rangePct, minOI, minVol, maxSpreadPct]);

  /* ── Selected row contract data ────────────────────────────── */
  const selectedRow = useMemo(() => {
    if (!selected) return null;
    return rows.find((r) => r.strike === selected.strike) ?? null;
  }, [rows, selected]);

  const selectedContract: OptionsContract | undefined = useMemo(() => {
    if (!selectedRow || !selected) return undefined;
    return selected.side === 'CALL' ? selectedRow.call : selectedRow.put;
  }, [selectedRow, selected]);

  /* ── Handlers ──────────────────────────────────────────────── */
  const handleTickerChange = useCallback((s: string) => {
    setTicker(s.toUpperCase());
    setSelectedExpiry('');
    setSelected(null);
  }, []);

  const spot = chain.underlyingPrice;
  const changePct = 0; // AV doesn't return change — use 0
  const updatedLabel = chain.loading
    ? 'Loading…'
    : chain.lastFetchedAt
      ? `Updated ${Math.round((Date.now() - chain.lastFetchedAt) / 1000)}s ago`
      : '';

  /* ── Landing state (no ticker) ─────────────────────────────── */
  if (!ticker && chain.contracts.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8">
        <div className="text-5xl mb-5">📊</div>
        <h2 className="text-xl font-bold mb-2">Options Terminal</h2>
        <p className="text-sm text-zinc-400 mb-6 max-w-md text-center">
          One ticker — the entire options decision surface. Enter a symbol to see
          the full chain with Greeks, IV, OI, volume, and suggested plays.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {['AAPL', 'SPY', 'TSLA', 'NVDA', 'QQQ', 'AMZN'].map((t) => (
            <button
              key={t}
              onClick={() => handleTickerChange(t)}
              className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/20 transition"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Sticky Top Strip ──────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-6 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Ticker */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">Ticker</div>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTickerChange(ticker); }}
                  className="w-28 bg-transparent text-sm font-semibold outline-none"
                  placeholder="AAPL"
                />
              </div>
              <Badge tone="info">Options Terminal</Badge>
              {chain.loading && (
                <div className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
              )}
            </div>

            {/* Center: Underlying tape */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 w-full lg:w-auto">
              <div className="space-y-0.5">
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">Underlying</div>
                <div className="flex items-baseline gap-3">
                  <div className="text-lg font-semibold">
                    {spot > 0 ? `$${spot.toFixed(2)}` : '—'}
                  </div>
                  {spot > 0 && (
                    <div className={`text-sm font-semibold ${changePct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
              <div className="hidden md:block text-xs text-zinc-400">{updatedLabel}</div>
              <Badge tone="neutral">
                {chain.provider === 'REALTIME_OPTIONS_FMV' ? 'LIVE' : chain.provider === 'HISTORICAL_OPTIONS' ? 'DELAYED' : '—'}
              </Badge>
            </div>

            {/* Right: Expiry + Mode */}
            <div className="flex items-center gap-3 justify-between lg:justify-end">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">Expiry</div>
                <select
                  value={selectedExpiry}
                  onChange={(e) => setSelectedExpiry(e.target.value)}
                  className="bg-transparent text-sm font-semibold outline-none"
                >
                  <option value="" className="bg-zinc-900">All</option>
                  {chain.expirations.map((exp) => (
                    <option key={exp.date} value={exp.date} className="bg-zinc-900">
                      {exp.label}
                    </option>
                  ))}
                </select>
              </div>

              <ModeToggle mode={mode} setMode={setMode} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────── */}
      {chain.error && (
        <div className="mx-auto max-w-[1600px] px-6 pt-4">
          <div className="rounded-2xl border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-300">
            ⚠️ {chain.error}
          </div>
        </div>
      )}

      {/* ── Page shell ────────────────────────────────────── */}
      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {/* === DESK GRID === */}
        <div className="grid grid-cols-12 gap-6">

          {/* ── Left: Chain Navigator ─────────────────────── */}
          <div className="col-span-12 xl:col-span-3 space-y-6">
            <Card title="Chain Navigator" right={<span className="text-xs text-zinc-400">{chain.expirations.length} expirations</span>}>
              <div className="space-y-4">
                {/* Expiry quick picks */}
                <div className="grid grid-cols-2 gap-3">
                  {chain.expirations.slice(0, 4).map((exp) => (
                    <button
                      key={exp.date}
                      onClick={() => setSelectedExpiry(exp.date)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        exp.date === selectedExpiry
                          ? 'border-emerald-600/40 bg-emerald-600/10'
                          : 'border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{exp.dte} DTE</div>
                      <div className="mt-1 text-sm font-semibold">{exp.date}</div>
                    </button>
                  ))}
                </div>

                {/* Quick Filters */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                  <div className="text-xs font-semibold">Quick Filters</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip>ATM Focus</Chip>
                    <Chip>25Δ Focus</Chip>
                    <Chip>High OI</Chip>
                    <Chip>High Volume</Chip>
                    <Chip>Tight Spreads</Chip>
                  </div>
                </div>

                {/* Best Strikes (auto-computed) */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                  <div className="text-xs font-semibold">Best Strikes (Auto)</div>
                  <div className="grid grid-cols-2 gap-3">
                    {chain.bestStrikes.slice(0, 6).map((bs, i) => (
                      <BestStrikeCard
                        key={`${bs.label}-${i}`}
                        label={bs.label}
                        value={`$${bs.strike.toFixed(0)}`}
                        sub={bs.reason}
                        tone={bs.type === 'call' ? 'ok' : 'bad'}
                        onClick={() => {
                          setSelected({ side: bs.type === 'call' ? 'CALL' : 'PUT', strike: bs.strike });
                        }}
                      />
                    ))}
                  </div>
                  {chain.bestStrikes.length === 0 && (
                    <div className="text-xs text-zinc-400">Load a chain to see auto-computed best strikes.</div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* ── Center: Options Chain Grid ─────────────────── */}
          <div className="col-span-12 xl:col-span-6 space-y-6">
            <Card
              title="Options Chain"
              right={
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">±{rangePct}%</Badge>
                  <Badge tone="neutral">{rows.length} strikes</Badge>
                </div>
              }
            >
              {/* Toolbar */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Segmented value={cp} onChange={setCp} options={[
                  { label: 'Both', value: 'BOTH' },
                  { label: 'Calls', value: 'CALLS' },
                  { label: 'Puts', value: 'PUTS' },
                ]} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full lg:w-auto">
                  <NumberField label="Range %" value={rangePct} setValue={setRangePct} min={5} max={100} />
                  <NumberField label="Min OI" value={minOI} setValue={setMinOI} min={0} max={100000} />
                  <NumberField label="Min Vol" value={minVol} setValue={setMinVol} min={0} max={100000} />
                  <NumberField label="Max Spread %" value={maxSpreadPct} setValue={setMaxSpreadPct} min={1} max={100} />
                </div>
              </div>

              {/* Chain Table */}
              <div className="mt-4 rounded-2xl border border-zinc-800 overflow-hidden">
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-zinc-900">
                      <tr className="text-left">
                        {cp !== 'PUTS' && (
                          <>
                            <Th>Bid</Th><Th>Ask</Th><Th>Last</Th><Th>Vol</Th><Th>OI</Th><Th>IV</Th><Th>Δ</Th>
                            {mode === 'institutional' && <><Th>Γ</Th><Th>Θ</Th><Th>Vega</Th></>}
                          </>
                        )}
                        <Th className="text-center">Strike</Th>
                        {cp !== 'CALLS' && (
                          <>
                            {mode === 'institutional' && <><Th>Vega</Th><Th>Θ</Th><Th>Γ</Th></>}
                            <Th>Δ</Th><Th>IV</Th><Th>OI</Th><Th>Vol</Th><Th>Last</Th><Th>Bid</Th><Th>Ask</Th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-zinc-950">
                      {rows.map((g) => {
                        const c = g.call;
                        const p = g.put;
                        const isSelCall = selected?.side === 'CALL' && selected.strike === g.strike;
                        const isSelPut = selected?.side === 'PUT' && selected.strike === g.strike;

                        return (
                          <tr
                            key={g.strike}
                            className={`border-t border-zinc-900 ${g.isAtm ? 'bg-zinc-900/40' : ''}`}
                          >
                            {/* Call side */}
                            {cp !== 'PUTS' && (
                              <>
                                <Td clickable selected={isSelCall} onClick={() => setSelected({ side: 'CALL', strike: g.strike })}>
                                  {fmt(c?.bid)}
                                </Td>
                                <Td clickable selected={isSelCall} onClick={() => setSelected({ side: 'CALL', strike: g.strike })}>
                                  {fmt(c?.ask)}
                                </Td>
                                <Td>{fmt(c?.last)}</Td>
                                <Td>{fmtInt(c?.volume)}</Td>
                                <Td>{fmtInt(c?.openInterest)}</Td>
                                <Td>{fmtPct(c?.iv)}</Td>
                                <Td>{fmt(c?.delta, 2)}</Td>
                                {mode === 'institutional' && (
                                  <>
                                    <Td>{fmt(c?.gamma, 4)}</Td>
                                    <Td>{fmt(c?.theta, 4)}</Td>
                                    <Td>{fmt(c?.vega, 4)}</Td>
                                  </>
                                )}
                              </>
                            )}

                            {/* Strike */}
                            <TdStrike strike={g.strike} underlying={spot} isATM={g.isAtm} />

                            {/* Put side */}
                            {cp !== 'CALLS' && (
                              <>
                                {mode === 'institutional' && (
                                  <>
                                    <Td>{fmt(p?.vega, 4)}</Td>
                                    <Td>{fmt(p?.theta, 4)}</Td>
                                    <Td>{fmt(p?.gamma, 4)}</Td>
                                  </>
                                )}
                                <Td>{fmt(p?.delta, 2)}</Td>
                                <Td>{fmtPct(p?.iv)}</Td>
                                <Td>{fmtInt(p?.openInterest)}</Td>
                                <Td>{fmtInt(p?.volume)}</Td>
                                <Td>{fmt(p?.last)}</Td>
                                <Td clickable selected={isSelPut} onClick={() => setSelected({ side: 'PUT', strike: g.strike })}>
                                  {fmt(p?.bid)}
                                </Td>
                                <Td clickable selected={isSelPut} onClick={() => setSelected({ side: 'PUT', strike: g.strike })}>
                                  {fmt(p?.ask)}
                                </Td>
                              </>
                            )}
                          </tr>
                        );
                      })}

                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={99} className="px-6 py-12 text-center text-sm text-zinc-400">
                            {chain.loading ? 'Loading options chain…' : 'No strikes match your filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 text-xs text-zinc-400">
                Click Bid/Ask on a strike to load the Contract Inspector →
              </div>
            </Card>
          </div>

          {/* ── Right: Contract Inspector ──────────────────── */}
          <div className="col-span-12 xl:col-span-3 space-y-6">
            <Card title="Contract Inspector" right={<span className="text-xs text-zinc-400">click a strike</span>}>
              {!selected || !selectedContract ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-400 text-center">
                  Select a contract from the chain to view Greeks, IV, OI/Vol, and liquidity.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold">
                          {ticker} {selectedContract.expiration} {selectedContract.strike}
                          {selected.side === 'CALL' ? 'C' : 'P'}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Mark: <span className="font-semibold text-zinc-200">${selectedContract.mark.toFixed(2)}</span>
                          {' · '}Spread: <span className="font-semibold text-zinc-200">${selectedContract.spread.toFixed(2)} ({selectedContract.spreadPct.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <Badge tone={selected.side === 'CALL' ? 'ok' : 'bad'}>{selected.side}</Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MiniStat label="OI" value={fmtInt(selectedContract.openInterest)} />
                      <MiniStat label="Vol" value={fmtInt(selectedContract.volume)} />
                      <MiniStat label="IV" value={fmtPct(selectedContract.iv)} />
                      <MiniStat label="Δ" value={fmt(selectedContract.delta, 3)} />
                    </div>
                  </div>

                  {/* Greeks */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-xs font-semibold">Greeks</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <MiniStat label="Delta" value={fmt(selectedContract.delta, 4)} />
                      <MiniStat label="Theta" value={fmt(selectedContract.theta, 4)} />
                      {mode === 'institutional' && (
                        <>
                          <MiniStat label="Gamma" value={fmt(selectedContract.gamma, 5)} />
                          <MiniStat label="Vega" value={fmt(selectedContract.vega, 4)} />
                          <MiniStat label="Rho" value={fmt(selectedContract.rho, 4)} />
                        </>
                      )}
                    </div>
                    {mode === 'retail' && (
                      <div className="mt-3 text-xs text-zinc-400">
                        Retail view shows core Greeks. Switch to Institutional for Γ, Vega, Rho.
                      </div>
                    )}
                  </div>

                  {/* Liquidity Check */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-xs font-semibold">Liquidity Check</div>
                    <div className="mt-3 space-y-2">
                      <LiquidityLine
                        label="Spread %"
                        value={`${selectedContract.spreadPct.toFixed(1)}%`}
                        tone={selectedContract.spreadPct < 3 ? 'ok' : selectedContract.spreadPct < 8 ? 'warn' : 'bad'}
                      />
                      <LiquidityLine
                        label="OI Depth"
                        value={selectedContract.openInterest > 5000 ? 'Strong' : selectedContract.openInterest > 500 ? 'Moderate' : 'Thin'}
                        tone={selectedContract.openInterest > 5000 ? 'ok' : selectedContract.openInterest > 500 ? 'warn' : 'bad'}
                      />
                      <LiquidityLine
                        label="Vol/OI"
                        value={selectedContract.openInterest > 0 ? (selectedContract.volume / selectedContract.openInterest).toFixed(2) : '—'}
                        tone={selectedContract.openInterest > 0 && selectedContract.volume / selectedContract.openInterest > 0.5 ? 'ok' : 'warn'}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-1 gap-3">
                    <button className="w-full rounded-2xl bg-zinc-950/40 border border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-800 transition">
                      Add to Watchlist
                    </button>
                    <button className="w-full rounded-2xl bg-zinc-950/40 border border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-800 transition">
                      Save Play
                    </button>
                    <button className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-500 transition">
                      Create Trade Plan
                    </button>
                  </div>
                  <div className="text-xs text-zinc-400 text-center">Educational purposes only · Not financial advice</div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* === ANALYTICS ROW === */}
        <div className="grid grid-cols-12 gap-6">
          {/* IV & Expected Move */}
          <div className="col-span-12 xl:col-span-4">
            <Card title="IV & Expected Move" right={<span className="text-xs text-zinc-400">{selectedExpiry || 'all expirations'}</span>}>
              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="ATM IV" value={chain.ivMetrics.avgIV > 0 ? `${(chain.ivMetrics.avgIV * 100).toFixed(1)}%` : '—'} />
                <MiniStat label="Expected Move" value={chain.ivMetrics.expectedMoveAbs > 0 ? `±$${chain.ivMetrics.expectedMoveAbs.toFixed(2)}` : '—'} />
                <MiniStat label="IV Level" value={chain.ivMetrics.ivLevel.toUpperCase()} />
                <MiniStat label="EM %" value={chain.ivMetrics.expectedMovePct > 0 ? `±${chain.ivMetrics.expectedMovePct.toFixed(1)}%` : '—'} />
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Desk Read</div>
                <div className="mt-1 text-sm font-semibold">
                  {chain.ivMetrics.ivLevel === 'high' || chain.ivMetrics.ivLevel === 'extreme'
                    ? 'Elevated IV: defined-risk structures preferred over naked longs. Credit spreads are rich.'
                    : chain.ivMetrics.ivLevel === 'low'
                      ? 'Low IV: options are cheap. Long options (debit) may be attractive if directional thesis is strong.'
                      : 'Normal IV: balanced environment. Debit spreads and defined-risk plays both viable.'}
                </div>
              </div>
            </Card>
          </div>

          {/* OI Map */}
          <div className="col-span-12 xl:col-span-4">
            <Card title="Open Interest Map" right={<span className="text-xs text-zinc-400">walls</span>}>
              {chain.oiHeatmap.length > 0 ? (
                <OIHeatmapInline heatmap={chain.oiHeatmap} spot={spot} />
              ) : (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-400 text-center">
                  Load a chain to see OI heatmap
                </div>
              )}
            </Card>
          </div>

          {/* Suggested Plays */}
          <div className="col-span-12 xl:col-span-4">
            <Card title="Suggested Plays (Educational)" right={<span className="text-xs text-zinc-400">no advice</span>}>
              <SuggestedPlaysInline ivLevel={chain.ivMetrics.ivLevel} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   UI Primitives (Tailwind · zinc dark theme)
   ═══════════════════════════════════════════════════════════════════ */

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="text-sm font-semibold">{title}</div>
        <div>{right}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' }) {
  const cls = tone === 'ok' ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-300'
    : tone === 'warn' ? 'border-yellow-600/30 bg-yellow-600/10 text-yellow-300'
    : tone === 'bad' ? 'border-red-600/30 bg-red-600/10 text-red-300'
    : tone === 'info' ? 'border-indigo-600/30 bg-indigo-600/10 text-indigo-300'
    : 'border-zinc-800 bg-zinc-950/40 text-zinc-300';
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}>{children}</span>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-full border border-zinc-800 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 transition">
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function BestStrikeCard({ label, value, sub, tone, onClick }: {
  label: string; value: string; sub: string; tone: 'ok' | 'bad' | 'warn' | 'info'; onClick: () => void;
}) {
  const cls = tone === 'ok' ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-300'
    : tone === 'bad' ? 'border-red-600/30 bg-red-600/10 text-red-300'
    : tone === 'warn' ? 'border-yellow-600/30 bg-yellow-600/10 text-yellow-300'
    : 'border-indigo-600/30 bg-indigo-600/10 text-indigo-300';
  return (
    <button onClick={onClick} className={`rounded-2xl border p-3 text-left transition hover:opacity-80 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      <div className="text-[10px] opacity-70">{sub}</div>
    </button>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex rounded-xl border border-zinc-800 overflow-hidden">
      <button onClick={() => setMode('retail')} className={`px-4 py-2 text-sm font-semibold transition ${mode === 'retail' ? 'bg-emerald-600/20 text-emerald-300' : 'text-zinc-400 hover:bg-zinc-900'}`}>
        Retail
      </button>
      <button onClick={() => setMode('institutional')} className={`px-4 py-2 text-sm font-semibold transition ${mode === 'institutional' ? 'bg-indigo-600/20 text-indigo-300' : 'text-zinc-400 hover:bg-zinc-900'}`}>
        Institutional
      </button>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { label: string; value: T }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950/40">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-4 py-2 text-sm font-semibold transition ${o.value === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({ label, value, setValue, min, max }: { label: string; value: number; setValue: (v: number) => void; min: number; max: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <input type="number" value={value} min={min} max={max} onChange={(e) => setValue(Number(e.target.value))}
        className="w-full bg-transparent text-sm font-semibold outline-none" />
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-3 text-[11px] uppercase tracking-wide text-zinc-400 ${className}`}>{children}</th>;
}

function Td({ children, clickable, selected, onClick }: { children: React.ReactNode; clickable?: boolean; selected?: boolean; onClick?: () => void }) {
  return (
    <td onClick={onClick}
      className={`px-3 py-3 text-sm ${clickable ? 'cursor-pointer hover:bg-zinc-900' : ''} ${selected ? 'bg-indigo-600/10' : ''}`}>
      <span className="text-zinc-200">{children}</span>
    </td>
  );
}

function TdStrike({ strike, underlying, isATM }: { strike: number; underlying: number; isATM: boolean }) {
  const dist = strike - underlying;
  const distPct = underlying > 0 ? (dist / underlying) * 100 : 0;
  return (
    <td className="px-3 py-3 text-center">
      <div className="inline-flex flex-col items-center">
        <div className="text-sm font-semibold text-zinc-100">
          {strike.toFixed(2)} {isATM && <span className="ml-1 text-[11px] text-emerald-300">ATM</span>}
        </div>
        <div className="text-[11px] text-zinc-400">
          {dist >= 0 ? '+' : ''}{dist.toFixed(2)} ({distPct >= 0 ? '+' : ''}{distPct.toFixed(1)}%)
        </div>
      </div>
    </td>
  );
}

function LiquidityLine({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' }) {
  const cls = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-yellow-300' : 'text-red-300';
  return (
    <div className="flex items-center justify-between">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-xs font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

/* ─── Inline OI Heatmap ──────────────────────────────────────── */
function OIHeatmapInline({ heatmap, spot }: { heatmap: OIHeatmapRow[]; spot: number }) {
  const topRows = useMemo(() => {
    return [...heatmap].sort((a, b) => b.totalOI - a.totalOI).slice(0, 15).sort((a, b) => a.strike - b.strike);
  }, [heatmap]);
  const maxOI = Math.max(...topRows.map((r) => r.totalOI), 1);

  return (
    <div className="space-y-1">
      {topRows.map((row) => {
        const callPct = (row.callOI / maxOI) * 100;
        const putPct = (row.putOI / maxOI) * 100;
        const isWall = row.totalOI >= maxOI * 0.7;
        const isAtm = spot > 0 && Math.abs(row.strike - spot) / spot < 0.015;

        return (
          <div key={row.strike} className="flex items-center gap-1 py-0.5">
            <div className="flex-1 h-3 flex justify-end">
              <div className="h-full rounded-l-sm" style={{ width: `${callPct}%`, background: isWall ? '#2FB36E' : 'rgba(47,179,110,0.3)' }} />
            </div>
            <div className={`text-[9px] font-mono font-bold text-center w-12 shrink-0 ${isAtm ? 'text-emerald-300' : isWall ? 'text-yellow-300' : 'text-zinc-400'}`}>
              {row.strike.toFixed(0)}
            </div>
            <div className="flex-1 h-3 flex justify-start">
              <div className="h-full rounded-r-sm" style={{ width: `${putPct}%`, background: isWall ? '#E46767' : 'rgba(228,103,103,0.3)' }} />
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-center gap-4 mt-2 text-[9px] text-zinc-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Calls</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Puts</span>
      </div>
    </div>
  );
}

/* ─── Inline Suggested Plays ─────────────────────────────────── */
function SuggestedPlaysInline({ ivLevel }: { ivLevel: IVMetrics['ivLevel'] }) {
  const plays = useMemo(() => {
    if (ivLevel === 'high' || ivLevel === 'extreme') {
      return [
        { title: 'Directional + Elevated IV', desc: 'Consider defined-risk credit spreads (bull put / bear call). Premium is rich — selling is favoured.' },
        { title: 'Neutral + Elevated IV', desc: 'Iron condor around expected move zone. High IV inflates credit; keep wings wide enough for safety.' },
        { title: 'Directional + Low IV', desc: 'Currently IV is high — skip naked longs unless you expect a further vol expansion event.' },
      ];
    }
    if (ivLevel === 'low') {
      return [
        { title: 'Directional + Low IV', desc: 'Long options may be viable — premium is cheap. Debit spreads keep cost defined.' },
        { title: 'Calendar Spread', desc: 'Sell near-dated, buy further-dated. Benefits from IV expansion and theta differential.' },
        { title: 'Neutral', desc: 'Skip premium selling in low IV — credits are thin. Wait for expansion or use directional plays.' },
      ];
    }
    return [
      { title: 'Directional', desc: 'Balanced IV: debit spreads offer clean risk/reward. Pick liquid strikes near 25–40Δ.' },
      { title: 'Range-Bound', desc: 'Butterfly or iron condor around expected move — moderate premium available.' },
      { title: 'Event Play', desc: 'Check earnings/catalyst schedule. If event is near, IV crush risk applies to long options.' },
    ];
  }, [ivLevel]);

  return (
    <div className="space-y-3">
      {plays.map((p, i) => (
        <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="text-sm font-semibold">{p.title}</div>
          <div className="mt-1 text-sm text-zinc-400 leading-relaxed">{p.desc}</div>
        </div>
      ))}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-xs text-zinc-400">
        These are educational frameworks only. Always validate structure, event risk, and liquidity before any trade.
      </div>
    </div>
  );
}

/* ─── Formatting helpers ─────────────────────────────────────── */
function fmt(n?: number, decimals: number = 2) {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return '—';
  return n.toFixed(decimals);
}
function fmtInt(n?: number) {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return '—';
  return Math.round(n).toLocaleString();
}
function fmtPct(n?: number) {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return '—';
  return `${(n * 100).toFixed(1)}%`;
}