'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { detectAssetClass } from '@/lib/detectAssetClass';
import { formatPrice, formatPriceRaw } from '@/lib/formatPrice';

/* ═══════════════════════════════════════════════════════════════
   PORTFOLIO V2 — v1-style portfolio with:
   - Cash level (editable), KPI header, Overview (allocation + perf + metrics)
   - Add Position with symbol tips, strategy dropdown & options fields
   - Holdings with Size%, P&L%, Risk Remaining, Stop Dist%, 
     Close / Reduce 50% / Move Stop / Delete actions
   - Auto-refresh prices every 2 min + Refresh Prices button
   - History tab
   ═══════════════════════════════════════════════════════════════ */

interface Position {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pl: number;
  plPercent: number;
  entryDate: string;
  strategy?: string;
  optionType?: 'call' | 'put';
  strikePrice?: number;
  expirationDate?: string;
  journalEntryId?: number;
}

interface ClosedPosition extends Position {
  closeDate: string;
  closePrice: number;
  realizedPL: number;
}

interface PerformanceSnapshot {
  timestamp: string;
  totalValue: number;
  totalPL: number;
}

interface CashLedgerEntry {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  timestamp: string;
  note?: string;
}

type SubTab = 'overview' | 'add' | 'holdings' | 'history';

const ALLOC_COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#84CC16', '#F97316', '#6366F1'];

const STRATEGIES = [
  { value: '', label: 'Strategy (optional)' },
  { value: 'swing', label: 'Swing Trade' },
  { value: 'longterm', label: 'Long Term Hold' },
  { value: 'breakout', label: 'Breakout' },
  { value: 'daytrade', label: 'Day Trade' },
  { value: 'ai_signal', label: 'AI Signal' },
  { value: 'options', label: 'Options' },
  { value: 'dividend', label: 'Dividend' },
];

export default function PortfolioV2() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [perfHistory, setPerfHistory] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('overview');

  /* ─── Cash ─── */
  const [startingCapital, setStartingCapital] = useState(0);
  const [editingCapital, setEditingCapital] = useState(false);
  const [capitalInput, setCapitalInput] = useState('');
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);

  /* ─── Stop tracking per position ─── */
  const [positionStopMap, setPositionStopMap] = useState<Record<number, number>>({});

  /* ─── Add Position form ─── */
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [quantity, setQuantity] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [strategy, setStrategy] = useState('');
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [strikePrice, setStrikePrice] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  /* ─── Close Position modal ─── */
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closePrice, setClosePrice] = useState('');



  /* ─── Price refresh ─── */
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const positionsRef = useRef<Position[]>(positions);
  positionsRef.current = positions;

  /* ──────────────────────────────────────────────────────────── */
  /* Price fetching (from /api/quote)                            */
  /* ──────────────────────────────────────────────────────────── */

  function normalizeSymbol(raw: string): string {
    let s = raw.toUpperCase().trim();
    s = s.replace(/[-_\/]?USDT?$/i, '');
    s = s.replace(/[-_\/]?EUR$/i, '');
    s = s.replace(/[-_\/]?PERP$/i, '');
    return s;
  }

  const fetchAutoPrice = useCallback(async (sym: string): Promise<number | null> => {
    const s = normalizeSymbol(sym);
    const cacheBust = Date.now();

    const tryFetch = async (url: string) => {
      try {
        const r = await fetch(`${url}&_t=${cacheBust}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (!r.ok) return null;
        const j = await r.json();
        if (j?.ok && typeof j.price === 'number') return j.price as number;
        return null;
      } catch { return null; }
    };

    if (detectAssetClass(s) === 'equity') {
      const stock = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=stock`);
      if (stock !== null) return stock;
      const crypto = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=crypto&market=USD`);
      if (crypto !== null) return crypto;
    } else {
      const crypto = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=crypto&market=USD`);
      if (crypto !== null) return crypto;
      const stock = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=stock`);
      if (stock !== null) return stock;
    }
    return null;
  }, []);

  /* ─── Refresh all prices (parallel batches of 4) ─── */
  const refreshAllPrices = useCallback(async (positionsToUpdate: Position[]) => {
    if (positionsToUpdate.length === 0) return;
    setRefreshingAll(true);
    const updates: { id: number; price: number }[] = [];
    const BATCH = 4;
    for (let i = 0; i < positionsToUpdate.length; i += BATCH) {
      const batch = positionsToUpdate.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async p => ({ id: p.id, price: await fetchAutoPrice(p.symbol) })));
      for (const r of results) {
        if (r.price !== null && !isNaN(r.price)) updates.push({ id: r.id, price: r.price });
      }
    }
    if (updates.length > 0) {
      setPositions(prev => prev.map(p => {
        const u = updates.find(x => x.id === p.id);
        if (!u) return p;
        const pl = p.side === 'LONG' ? (u.price - p.entryPrice) * p.quantity : (p.entryPrice - u.price) * p.quantity;
        const denom = p.entryPrice * p.quantity;
        return { ...p, currentPrice: u.price, pl, plPercent: denom > 0 ? (pl / denom) * 100 : 0 };
      }));
    }
    setRefreshingAll(false);
  }, [fetchAutoPrice]);

  /* Auto-refresh every 2 min */
  useEffect(() => {
    if (!dataLoaded) return;
    const INTERVAL = 120_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => { if (positionsRef.current.length > 0) refreshAllPrices(positionsRef.current); }, INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.hidden) stop(); else { if (positionsRef.current.length > 0) refreshAllPrices(positionsRef.current); start(); } };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [dataLoaded, refreshAllPrices]);

  /* ──────────────────────────────────────────────────────────── */
  /* Load / sync                                                 */
  /* ──────────────────────────────────────────────────────────── */

  const fetchPortfolio = useCallback(async () => {
    try {
      const r = await fetch('/api/portfolio');
      if (!r.ok) throw new Error('Failed to load');
      const data = await r.json();
      const loadedPositions = data.positions || [];
      setPositions(loadedPositions);
      setClosedPositions(data.closedPositions || []);
      setPerfHistory(data.performanceHistory || []);
      if (data.cashState) {
        setStartingCapital(Number(data.cashState.startingCapital || 10000));
        setCashLedger(Array.isArray(data.cashState.cashLedger) ? data.cashState.cashLedger : []);
      }
      setError(null);
      setDataLoaded(true);
      if (loadedPositions.length > 0) refreshAllPrices(loadedPositions);
    } catch (e: any) {
      setError(e.message);
      setDataLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [refreshAllPrices]);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  /* ─── Sync to server (debounced) ─── */
  const syncPortfolio = useCallback(async (pos: Position[], closed: ClosedPosition[]) => {
    setSyncing(true);
    try {
      await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: pos.filter(p => !p.journalEntryId),
          closedPositions: closed.filter(p => !p.journalEntryId),
          performanceHistory: perfHistory,
          cashState: { startingCapital, cashLedger },
        }),
      });
    } catch { /* silent */ } finally {
      setSyncing(false);
    }
  }, [perfHistory, startingCapital, cashLedger]);

  /* ──────────────────────────────────────────────────────────── */
  /* Actions                                                     */
  /* ──────────────────────────────────────────────────────────── */

  /* ─── Add Position ─── */
  const handleAdd = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || !quantity || !entryPrice) return;
    const qty = parseFloat(quantity);
    const entry = parseFloat(entryPrice);
    let current = currentPrice ? parseFloat(currentPrice) : entry;
    if (!qty || !entry) return;

    // Try to auto-fetch live price if user didn't provide one
    if (!currentPrice) {
      const fetched = await fetchAutoPrice(sym);
      if (fetched !== null) current = fetched;
    }

    const pl = side === 'LONG' ? (current - entry) * qty : (entry - current) * qty;
    const denom = entry * qty;
    const plPct = denom > 0 ? (pl / denom) * 100 : 0;

    const newPos: Position = {
      id: Date.now(),
      symbol: sym, side,
      quantity: qty, entryPrice: entry, currentPrice: current,
      pl, plPercent: plPct,
      entryDate: new Date().toISOString(),
      strategy: strategy || undefined,
      ...(strategy === 'options' ? {
        optionType,
        strikePrice: strikePrice ? parseFloat(strikePrice) : undefined,
        expirationDate: expirationDate || undefined,
      } : {}),
    };

    const updated = [newPos, ...positions];
    setPositions(updated);
    setSymbol(''); setQuantity(''); setEntryPrice(''); setCurrentPrice(''); setStrategy('');
    setOptionType('call'); setStrikePrice(''); setExpirationDate('');
    setSubTab('holdings');
    await syncPortfolio(updated, closedPositions);
  }, [symbol, side, quantity, entryPrice, currentPrice, strategy, optionType, strikePrice, expirationDate, positions, closedPositions, syncPortfolio, fetchAutoPrice]);

  /* ─── Close Position ─── */
  const handleClose = useCallback(async () => {
    if (closingId == null || !closePrice) return;
    const pos = positions.find(p => p.id === closingId);
    if (!pos) return;

    const cp = parseFloat(closePrice);
    const realizedPL = pos.side === 'LONG' ? (cp - pos.entryPrice) * pos.quantity : (pos.entryPrice - cp) * pos.quantity;
    const denom = pos.entryPrice * pos.quantity;
    const plPct = denom > 0 ? (realizedPL / denom) * 100 : 0;

    const closed: ClosedPosition = {
      ...pos, currentPrice: cp, closePrice: cp, closeDate: new Date().toISOString(),
      realizedPL, pl: realizedPL, plPercent: plPct,
    };

    const newPositions = positions.filter(p => p.id !== closingId);
    const newClosed = [closed, ...closedPositions];
    setPositions(newPositions);
    setClosedPositions(newClosed);
    setClosingId(null);
    setClosePrice('');
    await syncPortfolio(newPositions, newClosed);
  }, [closingId, closePrice, positions, closedPositions, syncPortfolio]);

  /* ─── Delete Position ─── */
  const handleDelete = useCallback(async (id: number) => {
    const updated = positions.filter(p => p.id !== id);
    setPositions(updated);
    await syncPortfolio(updated, closedPositions);
  }, [positions, closedPositions, syncPortfolio]);

  /* ─── Reduce 50% ─── */
  const reduceHalf = useCallback(async (id: number) => {
    const updated = positions.map(p => {
      if (p.id !== id) return p;
      const qty = Math.max(0, p.quantity * 0.5);
      const pl = p.side === 'LONG' ? (p.currentPrice - p.entryPrice) * qty : (p.entryPrice - p.currentPrice) * qty;
      const denom = p.entryPrice * qty;
      return { ...p, quantity: qty, pl, plPercent: denom > 0 ? (pl / denom) * 100 : 0 };
    });
    setPositions(updated);
    await syncPortfolio(updated, closedPositions);
  }, [positions, closedPositions, syncPortfolio]);

  /* ─── Move Stop to Breakeven ─── */
  const moveStop = useCallback((id: number) => {
    const pos = positions.find(p => p.id === id);
    if (!pos) return;
    setPositionStopMap(prev => ({ ...prev, [id]: pos.entryPrice }));
  }, [positions]);



  /* ──────────────────────────────────────────────────────────── */
  /* KPIs & calculations                                         */
  /* ──────────────────────────────────────────────────────────── */

  const totalValue = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
  const totalCost = positions.reduce((s, p) => s + p.entryPrice * p.quantity, 0);
  const unrealizedPL = positions.reduce((s, p) => s + p.pl, 0);
  const realizedPL = closedPositions.reduce((s, p) => s + (p.realizedPL || 0), 0);
  const totalPL = unrealizedPL + realizedPL;
  const totalReturn = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
  const winners = closedPositions.filter(p => (p.realizedPL || 0) > 0).length;
  const winRate = closedPositions.length > 0 ? (winners / closedPositions.length) * 100 : 0;

  /* Cash level: starting capital + deposits - withdrawals - cost of open positions + realized P&L */
  const cashDeposits = cashLedger.filter(e => e.type === 'deposit').reduce((s, e) => s + e.amount, 0);
  const cashWithdrawals = cashLedger.filter(e => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0);
  const currentCash = startingCapital + cashDeposits - cashWithdrawals - totalCost + realizedPL;

  /* Allocation data */
  const allocation = useMemo(() => {
    if (positions.length === 0) return [];
    const total = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    return positions
      .map(p => ({ symbol: p.symbol, value: p.currentPrice * p.quantity, pct: total > 0 ? ((p.currentPrice * p.quantity) / total) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [positions]);

  /* Performance chart data */
  const chartData = useMemo(() => {
    if (perfHistory.length === 0) return null;
    const max = Math.max(...perfHistory.map(p => p.totalValue));
    const min = Math.min(...perfHistory.map(p => p.totalValue));
    return { points: perfHistory, max, min, range: max - min || 1 };
  }, [perfHistory]);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plColor = (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400';

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-800/50 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold mb-1">Portfolio Tracker</div>
          <h2 className="text-lg font-bold text-white">Portfolio Tracking</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manually add a position to track in your portfolio. Use the refresh button on active positions to fetch live prices.</p>
        </div>
        <button onClick={() => setSubTab('add')} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors font-medium">+ Add Position</button>
      </div>

      {/* ═══ KPI ROW ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 px-4 py-3.5">
          <div className="text-[10px] uppercase text-slate-500 font-medium tracking-wider mb-1.5">Cash Level</div>
          {editingCapital ? (
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold font-mono text-white">$</span>
              <input
                autoFocus
                value={capitalInput}
                onChange={e => setCapitalInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = parseFloat(capitalInput);
                    if (!isNaN(v) && v >= 0) setStartingCapital(v);
                    setEditingCapital(false);
                  } else if (e.key === 'Escape') {
                    setEditingCapital(false);
                  }
                }}
                onBlur={() => {
                  const v = parseFloat(capitalInput);
                  if (!isNaN(v) && v >= 0) setStartingCapital(v);
                  setEditingCapital(false);
                }}
                type="number"
                step="any"
                className="w-full bg-transparent text-base font-bold font-mono text-emerald-400 outline-none border-b border-emerald-500/40"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => { setCapitalInput(String(startingCapital)); setEditingCapital(true); }}>
              <span className={`text-base font-bold font-mono ${currentCash >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${fmt(currentCash)}</span>
              <span className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">✏️</span>
            </div>
          )}
        </div>
        <KPICard label="Market Value" value={`$${fmt(totalValue)}`} />
        <KPICard label="Total Return" value={`${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`} color={plColor(totalReturn)} />
        <KPICard label="Unrealized P&L" value={`${unrealizedPL >= 0 ? '+' : ''}$${fmt(unrealizedPL)}`} color={plColor(unrealizedPL)} />
        <KPICard label="Positions" value={String(positions.length)} />
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex items-center gap-1 border-b border-slate-700/30">
        {([
          { key: 'overview' as SubTab, label: '📊 Overview' },
          { key: 'add' as SubTab, label: '+ Add' },
          { key: 'holdings' as SubTab, label: 'Holdings' },
          { key: 'history' as SubTab, label: 'History' },
        ]).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${subTab === t.key ? 'text-emerald-400 border-emerald-400' : 'text-slate-400 border-transparent hover:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
        {syncing && <span className="text-[10px] text-slate-500 ml-auto">Syncing...</span>}
      </div>

      {error && <div className="text-[10px] text-red-400/60 px-1">Error: {error}</div>}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ═══ OVERVIEW TAB                                      ═══ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          {/* Concentration Insight */}
          {positions.length > 0 && allocation[0] && allocation[0].pct > 50 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
              <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-white">Portfolio Insight</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">Concentration</span>
                </div>
                <p className="text-xs text-slate-400">{allocation[0].symbol} represents {allocation[0].pct.toFixed(0)}% of your portfolio. Consider rebalancing if unintentional.</p>
              </div>
            </div>
          )}



          {/* ALLOCATION + PERFORMANCE GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Allocation Donut */}
            <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 p-4">
              <h3 className="text-xs font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-emerald-400">●</span> Portfolio Allocation
              </h3>
              {positions.length === 0 ? (
                <div className="text-xs text-slate-500 py-8 text-center">No positions to show</div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-40 h-40">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      {(() => {
                        let offset = 0;
                        return allocation.map((a, i) => {
                          const circumference = 2 * Math.PI * 45;
                          const stroke = (a.pct / 100) * circumference;
                          const gap = circumference - stroke;
                          const el = (
                            <circle key={a.symbol} cx="50" cy="50" r="45" fill="none" stroke={ALLOC_COLORS[i % ALLOC_COLORS.length]} strokeWidth="10" strokeDasharray={`${stroke} ${gap}`} strokeDashoffset={-offset} className="transition-all duration-500" />
                          );
                          offset += stroke;
                          return el;
                        });
                      })()}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-white">{positions.length}</span>
                      <span className="text-[10px] text-slate-500">positions</span>
                    </div>
                  </div>
                  <div className="w-full space-y-2.5">
                    {allocation.map((a, i) => (
                      <div key={a.symbol} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                          <span className="text-xs text-white font-medium">{a.symbol}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold" style={{ color: ALLOC_COLORS[i % ALLOC_COLORS.length] }}>{a.pct.toFixed(1)}%</span>
                          <div className="text-[10px] text-slate-500">${fmt(a.value)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Performance Over Time */}
            <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 p-4">
              <h3 className="text-xs font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-emerald-400">●</span> Performance Over Time
              </h3>
              {!chartData ? (
                <div className="text-xs text-slate-500 py-8 text-center">Performance history will appear as positions are tracked over time</div>
              ) : (
                <div className="relative h-44">
                  <svg viewBox={`0 0 ${Math.max(chartData.points.length - 1, 1) * 20} 120`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M0,120 ${chartData.points.map((p, i) => `L${i * 20},${120 - ((p.totalValue - chartData.min) / chartData.range) * 100}`).join(' ')} L${(chartData.points.length - 1) * 20},120 Z`}
                      fill="url(#perfGrad)"
                    />
                    <polyline
                      points={chartData.points.map((p, i) => `${i * 20},${120 - ((p.totalValue - chartData.min) / chartData.range) * 100}`).join(' ')}
                      fill="none" stroke="#10B981" strokeWidth="2"
                    />
                  </svg>
                  <div className="flex justify-between mt-1">
                    {chartData.points.filter((_, i) => i === 0 || i === chartData.points.length - 1 || i === Math.floor(chartData.points.length / 2)).map((p, idx) => (
                      <span key={idx} className="text-[10px] text-slate-600">{new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PORTFOLIO METRICS */}
          <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 p-4">
            <h3 className="text-xs font-semibold text-white mb-4 flex items-center gap-2">📊 Portfolio Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <MetricCell label="Cash Level" value={`$${fmt(currentCash)}`} color={currentCash >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <MetricCell label="Total Market Value" value={`$${fmt(totalValue)}`} />
              <MetricCell label="Total Cost Basis" value={`$${fmt(totalCost)}`} />
              <MetricCell label="Unrealized P&L" value={`$${fmt(unrealizedPL)}`} color={plColor(unrealizedPL)} />
              <MetricCell label="Realized P&L" value={`$${fmt(realizedPL)}`} color={plColor(realizedPL)} />
              <MetricCell label="Total Return %" value={`${totalReturn.toFixed(2)}%`} color={plColor(totalReturn)} />
              <MetricCell label="Positions" value={String(positions.length)} />
            </div>
          </div>

          {closedPositions.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 px-4 py-3 text-center">
                <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">Win Rate</div>
                <div className={`text-sm font-bold font-mono ${winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winRate.toFixed(0)}%</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 px-4 py-3 text-center">
                <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">Total Trades</div>
                <div className="text-sm font-bold font-mono text-white">{closedPositions.length}</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 px-4 py-3 text-center">
                <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">Winners</div>
                <div className="text-sm font-bold font-mono text-emerald-400">{winners}</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 px-4 py-3 text-center">
                <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">Losers</div>
                <div className="text-sm font-bold font-mono text-red-400">{closedPositions.length - winners}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ═══ ADD POSITION TAB                                  ═══ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {subTab === 'add' && (
        <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Add Position</h3>
          <p className="text-xs text-slate-400">Manually add a position to track in your portfolio. Use the refresh button on active positions to fetch live prices.</p>

          {/* Symbol Tips */}
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold mb-1">Symbol Tips</div>
            <p className="text-xs text-slate-300">
              <span className="text-emerald-400 font-medium">Crypto:</span> BTC, ETH, XRP, SOL &nbsp;·&nbsp;
              <span className="text-blue-400 font-medium">Stocks:</span> AAPL, TSLA, NVDA &nbsp;·&nbsp;
              <span className="text-amber-400 font-medium">Forex:</span> EURUSD, GBPUSD
            </p>
          </div>

          {/* Symbol */}
          <div>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              placeholder="Symbol (e.g. BTC, AAPL)"
              className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 transition-colors"
            />
          </div>

          {/* Side + Strategy row */}
          <div className="grid grid-cols-2 gap-3">
            <select
              value={side}
              onChange={e => setSide(e.target.value as 'LONG' | 'SHORT')}
              className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs px-3 py-3 text-emerald-400 font-semibold focus:outline-none appearance-none cursor-pointer"
              style={side === 'SHORT' ? { background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' } : {}}
            >
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value)}
              className="bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-3 text-slate-400 focus:outline-none appearance-none cursor-pointer"
            >
              {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Options-specific fields */}
          {strategy === 'options' && (
            <div className="space-y-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-violet-400 font-semibold">Options Details</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase text-slate-500 mb-1.5 font-medium tracking-wider">Type</label>
                  <div className="flex gap-1">
                    <button onClick={() => setOptionType('call')} className={`flex-1 py-2 text-xs rounded-lg font-semibold border transition-colors ${optionType === 'call' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-[#0A101C] border-slate-700/40 text-slate-500'}`}>Call</button>
                    <button onClick={() => setOptionType('put')} className={`flex-1 py-2 text-xs rounded-lg font-semibold border transition-colors ${optionType === 'put' ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-[#0A101C] border-slate-700/40 text-slate-500'}`}>Put</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-500 mb-1.5 font-medium tracking-wider">Strike Price</label>
                  <input value={strikePrice} onChange={e => setStrikePrice(e.target.value)} placeholder="0.00" type="number" step="any" className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-600/40 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-500 mb-1.5 font-medium tracking-wider">Expiration</label>
                  <input value={expirationDate} onChange={e => setExpirationDate(e.target.value)} type="date" className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2.5 text-white focus:outline-none focus:border-violet-600/40 transition-colors" />
                </div>
              </div>
            </div>
          )}

          {/* Quantity / Entry / Current row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5 font-medium tracking-wider">Quantity</label>
              <input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" type="number" className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5 font-medium tracking-wider">Entry Price</label>
              <input value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="0.00" type="number" step="any" className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5 font-medium tracking-wider">Current Price</label>
              <input value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="0.00" type="number" step="any" className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 transition-colors" />
            </div>
          </div>

          <button onClick={handleAdd} disabled={!symbol.trim() || !quantity || !entryPrice} className="w-full py-3.5 text-xs rounded-lg bg-emerald-600 text-white border border-emerald-500/50 hover:bg-emerald-700 disabled:opacity-30 transition-colors font-bold uppercase tracking-wider">
            ↓ Add Position
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ═══ HOLDINGS TAB                                      ═══ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {subTab === 'holdings' && (
        <div className="space-y-3">
          {/* Refresh bar */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Prices refresh every 2 min</span>
            <button
              onClick={() => refreshAllPrices(positions)}
              disabled={refreshingAll || positions.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded border border-slate-700/40 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 transition-colors font-medium"
            >
              {refreshingAll ? (
                <span className="animate-spin inline-block w-3 h-3 border border-slate-400 border-t-transparent rounded-full" />
              ) : (
                <span>🔄</span>
              )}
              Refresh Prices
            </button>
          </div>

          <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 overflow-hidden">
            {positions.length === 0 ? (
              <div className="text-xs text-slate-500 py-12 text-center">No open positions. Click &quot;+ Add&quot; to get started.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/40 bg-slate-800/20">
                      <TH align="left">Symbol</TH>
                      <TH align="left">Side</TH>
                      <TH>Size %</TH>
                      <TH>Entry</TH>
                      <TH>Current</TH>
                      <TH>P&amp;L %</TH>
                      <TH>Risk Remaining</TH>
                      <TH>Stop Dist %</TH>
                      <TH align="left">Actions</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(p => {
                      const notional = p.currentPrice * p.quantity;
                      const sizePct = totalValue > 0 ? (notional / totalValue) * 100 : 0;
                      const stop = positionStopMap[p.id] ?? (p.side === 'LONG' ? p.entryPrice * 0.95 : p.entryPrice * 1.05);
                      const initialRiskUnit = Math.abs(p.entryPrice - stop);
                      const stopDistPct = p.currentPrice > 0 ? (Math.abs(p.currentPrice - stop) / p.currentPrice) * 100 : 0;
                      const distFromEntry = Math.abs(p.currentPrice - p.entryPrice);
                      const riskRemainingPct = initialRiskUnit > 0 ? Math.max(0, Math.min(100, ((initialRiskUnit - distFromEntry) / initialRiskUnit) * 100)) : 0;

                      return (
                        <tr key={p.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 group">
                          <td className="py-3 px-3 text-white font-semibold">
                            {p.symbol}
                            {p.journalEntryId && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium align-middle">Journal</span>}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`${p.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'} font-semibold`}>{p.side}</span>
                          </td>
                          <td className="py-3 px-3 text-right text-slate-300 font-mono">{sizePct.toFixed(1)}%</td>
                          <td className="py-3 px-3 text-right text-slate-300 font-mono">{formatPriceRaw(p.entryPrice)}</td>
                          <td className="py-3 px-3 text-right text-slate-300 font-mono">{formatPriceRaw(p.currentPrice)}</td>
                          <td className={`py-3 px-3 text-right font-mono font-semibold ${plColor(p.plPercent)}`}>{p.plPercent >= 0 ? '+' : ''}{p.plPercent.toFixed(2)}%</td>
                          <td className="py-3 px-3 text-right text-slate-300">{riskRemainingPct.toFixed(0)}%</td>
                          <td className="py-3 px-3 text-right text-slate-300">{stopDistPct.toFixed(2)}%</td>
                          <td className="py-3 px-3">
                            {/* Risk bar */}
                            <div className="mb-1.5 h-1.5 overflow-hidden rounded bg-slate-700/50">
                              <div className="h-full bg-emerald-400/60 rounded" style={{ width: `${Math.max(5, Math.min(100, riskRemainingPct))}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <button onClick={() => { setClosingId(p.id); setClosePrice(String(p.currentPrice)); }} className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-300 hover:bg-red-500/20 transition-colors">Close</button>
                              <button onClick={() => reduceHalf(p.id)} className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300 hover:bg-amber-500/20 transition-colors">Reduce 50%</button>
                              <button onClick={() => moveStop(p.id)} className="rounded border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-300 hover:bg-blue-500/20 transition-colors">Move Stop</button>
                              <button onClick={() => handleDelete(p.id)} className="rounded border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-400 hover:text-red-300 hover:border-red-500/40 transition-colors">✕ Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ═══ HISTORY TAB                                       ═══ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {subTab === 'history' && (
        <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 overflow-hidden">
          {closedPositions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-2xl mb-2">📋</div>
              <div className="text-sm font-semibold text-white mb-1">Trade History</div>
              <div className="text-xs text-slate-500">View your closed positions and trading history</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <TH align="left">Symbol</TH>
                    <TH align="left">Side</TH>
                    <TH>Qty</TH>
                    <TH>Entry</TH>
                    <TH>Close</TH>
                    <TH>Realized P&amp;L</TH>
                    <TH>%</TH>
                    <TH>Date</TH>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map(p => (
                    <tr key={p.id} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                      <td className="py-3 px-3 text-white font-semibold">
                        {p.symbol}
                        {p.journalEntryId && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium align-middle">Journal</span>}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`${p.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'} font-semibold`}>{p.side}</span>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-300 font-mono">{p.quantity}</td>
                      <td className="py-3 px-3 text-right text-slate-300 font-mono">{formatPriceRaw(p.entryPrice)}</td>
                      <td className="py-3 px-3 text-right text-slate-300 font-mono">{formatPriceRaw(p.closePrice)}</td>
                      <td className={`py-3 px-3 text-right font-mono font-semibold ${plColor(p.realizedPL)}`}>{p.realizedPL >= 0 ? '+' : ''}${fmt(p.realizedPL)}</td>
                      <td className={`py-3 px-3 text-right font-mono ${plColor(p.plPercent)}`}>{p.plPercent >= 0 ? '+' : ''}{p.plPercent.toFixed(1)}%</td>
                      <td className="py-3 px-3 text-right text-slate-500">{p.closeDate ? new Date(p.closeDate).toLocaleDateString() : '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ CLOSE POSITION MODAL ═══ */}
      {closingId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setClosingId(null)}>
          <div className="bg-[#0D1321] border border-slate-700/50 rounded-xl p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white">Close Position</h3>
            <p className="text-xs text-slate-400">
              Closing <span className="text-white font-semibold">{positions.find(p => p.id === closingId)?.symbol}</span> &mdash; enter the exit price.
            </p>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5 font-medium tracking-wider">Close Price</label>
              <input
                value={closePrice}
                onChange={e => setClosePrice(e.target.value)}
                placeholder="0.00"
                type="number"
                step="any"
                className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setClosingId(null)} className="flex-1 py-2.5 text-xs rounded-lg text-slate-400 border border-slate-700/40 hover:bg-slate-800/60 transition-colors">Cancel</button>
              <button onClick={handleClose} disabled={!closePrice} className="flex-1 py-2.5 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-30 transition-colors font-semibold">Confirm Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Sub-Components ═══ */

function KPICard({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 px-4 py-3.5">
      <div className="text-[10px] uppercase text-slate-500 font-medium tracking-wider mb-1.5">{label}</div>
      <div className={`text-base font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

function MetricCell({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center py-2">
      <div className="text-[10px] uppercase text-slate-500 font-medium tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

function TH({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`${align === 'left' ? 'text-left' : 'text-right'} py-3 px-3 text-[10px] uppercase text-slate-500 font-medium tracking-wider`}>{children}</th>;
}
