'use client';

import { useState, useEffect, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════
   PORTFOLIO V2 — Clean portfolio tracker for v2 workspace
   Fetches from /api/portfolio (same backend as v1)
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
}

interface ClosedPosition extends Position {
  closeDate: string;
  closePrice: number;
  realizedPL: number;
}

type SubTab = 'positions' | 'closed' | 'add';

export default function PortfolioV2() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('positions');

  /* ─── Add Position form ─── */
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [quantity, setQuantity] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');

  /* ─── Close Position modal ─── */
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closePrice, setClosePrice] = useState('');

  /* ─── Fetch ─── */
  const fetchPortfolio = useCallback(async () => {
    try {
      const r = await fetch('/api/portfolio');
      if (!r.ok) throw new Error('Failed to load');
      const data = await r.json();
      setPositions(data.positions || []);
      setClosedPositions(data.closedPositions || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  /* ─── Sync helper ─── */
  const syncPortfolio = useCallback(async (pos: Position[], closed: ClosedPosition[]) => {
    setSyncing(true);
    try {
      await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: pos, closedPositions: closed, performanceHistory: [] }),
      });
    } catch { /* silent */ } finally {
      setSyncing(false);
    }
  }, []);

  /* ─── Add Position ─── */
  const handleAdd = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || !quantity || !entryPrice) return;
    const qty = parseFloat(quantity);
    const entry = parseFloat(entryPrice);
    const current = currentPrice ? parseFloat(currentPrice) : entry;
    if (!qty || !entry) return;

    const pl = side === 'LONG' ? (current - entry) * qty : (entry - current) * qty;
    const plPct = ((current - entry) / entry) * 100 * (side === 'LONG' ? 1 : -1);

    const newPos: Position = {
      id: Date.now(),
      symbol: sym,
      side,
      quantity: qty,
      entryPrice: entry,
      currentPrice: current,
      pl,
      plPercent: plPct,
      entryDate: new Date().toISOString(),
    };

    const updated = [newPos, ...positions];
    setPositions(updated);
    setSymbol(''); setQuantity(''); setEntryPrice(''); setCurrentPrice('');
    setSubTab('positions');
    await syncPortfolio(updated, closedPositions);
  }, [symbol, side, quantity, entryPrice, currentPrice, positions, closedPositions, syncPortfolio]);

  /* ─── Close Position ─── */
  const handleClose = useCallback(async () => {
    if (closingId == null || !closePrice) return;
    const pos = positions.find(p => p.id === closingId);
    if (!pos) return;

    const cp = parseFloat(closePrice);
    const realizedPL = pos.side === 'LONG' ? (cp - pos.entryPrice) * pos.quantity : (pos.entryPrice - cp) * pos.quantity;
    const plPct = ((cp - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'LONG' ? 1 : -1);

    const closed: ClosedPosition = {
      ...pos,
      currentPrice: cp,
      closePrice: cp,
      closeDate: new Date().toISOString(),
      realizedPL,
      pl: realizedPL,
      plPercent: plPct,
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

  /* ─── KPIs ─── */
  const totalValue = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
  const totalCost = positions.reduce((s, p) => s + p.entryPrice * p.quantity, 0);
  const unrealizedPL = positions.reduce((s, p) => s + p.pl, 0);
  const realizedPL = closedPositions.reduce((s, p) => s + (p.realizedPL || 0), 0);
  const totalPLPct = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
  const winners = closedPositions.filter(p => (p.realizedPL || 0) > 0).length;
  const winRate = closedPositions.length > 0 ? (winners / closedPositions.length) * 100 : 0;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plColor = (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400';

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Portfolio Value" value={`$${fmt(totalValue)}`} />
        <KPI label="Unrealized P&L" value={`${unrealizedPL >= 0 ? '+' : ''}$${fmt(unrealizedPL)}`} sub={`${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(1)}%`} color={plColor(unrealizedPL)} />
        <KPI label="Realized P&L" value={`${realizedPL >= 0 ? '+' : ''}$${fmt(realizedPL)}`} color={plColor(realizedPL)} />
        <KPI label="Win Rate" value={closedPositions.length > 0 ? `${winRate.toFixed(0)}%` : '—'} sub={closedPositions.length > 0 ? `${closedPositions.length} trades` : 'No closed trades'} />
      </div>

      {/* ── Sub Tabs ── */}
      <div className="flex items-center gap-1">
        {(['positions', 'closed', 'add'] as SubTab[]).map(t => (
          <button key={t} onClick={() => setSubTab(t)} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${subTab === t ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
            {t === 'positions' ? `Open (${positions.length})` : t === 'closed' ? `Closed (${closedPositions.length})` : '+ Add Position'}
          </button>
        ))}
        {syncing && <span className="text-[10px] text-slate-500 ml-auto">Syncing...</span>}
      </div>

      {error && <div className="text-[10px] text-red-400/60 px-1">Error: {error}</div>}

      {/* ── Open Positions ── */}
      {subTab === 'positions' && (
        <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 overflow-hidden">
          {positions.length === 0 ? (
            <div className="text-xs text-slate-500 py-12 text-center">No open positions. Click "+ Add Position" to get started.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="text-left py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Symbol</th>
                    <th className="text-left py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Side</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Qty</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Entry</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Current</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">P&L</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">%</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Value</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 group">
                      <td className="py-2.5 px-3 text-white font-semibold">{p.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.side === 'LONG' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{p.side}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">{p.quantity}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">${fmt(p.entryPrice)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">${fmt(p.currentPrice)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-medium ${plColor(p.pl)}`}>{p.pl >= 0 ? '+' : ''}${fmt(p.pl)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${plColor(p.plPercent)}`}>{p.plPercent >= 0 ? '+' : ''}{p.plPercent.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right text-slate-400 font-mono">${fmt(p.currentPrice * p.quantity)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => { setClosingId(p.id); setClosePrice(String(p.currentPrice)); }} className="text-[10px] text-sky-400 hover:text-sky-300">Close</button>
                          <button onClick={() => handleDelete(p.id)} className="text-[10px] text-red-400/50 hover:text-red-400">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Closed Positions ── */}
      {subTab === 'closed' && (
        <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 overflow-hidden">
          {closedPositions.length === 0 ? (
            <div className="text-xs text-slate-500 py-12 text-center">No closed trades yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="text-left py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Symbol</th>
                    <th className="text-left py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Side</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Qty</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Entry</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Close</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">P&L</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">%</th>
                    <th className="text-right py-2.5 px-3 text-[10px] uppercase text-slate-500 font-medium">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map(p => (
                    <tr key={p.id} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                      <td className="py-2.5 px-3 text-white font-semibold">{p.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.side === 'LONG' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{p.side}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">{p.quantity}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">${fmt(p.entryPrice)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">${fmt(p.closePrice)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-medium ${plColor(p.realizedPL)}`}>{p.realizedPL >= 0 ? '+' : ''}${fmt(p.realizedPL)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${plColor(p.plPercent)}`}>{p.plPercent >= 0 ? '+' : ''}{p.plPercent.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">{p.closeDate ? new Date(p.closeDate).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Position Form ── */}
      {subTab === 'add' && (
        <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Add Position</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input label="Symbol" value={symbol} onChange={setSymbol} placeholder="AAPL" />
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1 font-medium">Side</label>
              <div className="flex gap-1">
                <button onClick={() => setSide('LONG')} className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${side === 'LONG' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'text-slate-400 border-slate-700/40 hover:border-slate-600/40'}`}>Long</button>
                <button onClick={() => setSide('SHORT')} className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${side === 'SHORT' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'text-slate-400 border-slate-700/40 hover:border-slate-600/40'}`}>Short</button>
              </div>
            </div>
            <Input label="Quantity" value={quantity} onChange={setQuantity} placeholder="100" type="number" />
            <Input label="Entry Price" value={entryPrice} onChange={setEntryPrice} placeholder="150.00" type="number" />
            <Input label="Current Price (optional)" value={currentPrice} onChange={setCurrentPrice} placeholder="Same as entry" type="number" />
          </div>
          <button onClick={handleAdd} disabled={!symbol.trim() || !quantity || !entryPrice} className="w-full py-2.5 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-30 transition-colors font-medium">
            Add Position
          </button>
        </div>
      )}

      {/* ── Close Position Modal ── */}
      {closingId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setClosingId(null)}>
          <div className="bg-[#0D1321] border border-slate-700/50 rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white">Close Position</h3>
            <p className="text-xs text-slate-400">
              Closing <span className="text-white font-semibold">{positions.find(p => p.id === closingId)?.symbol}</span> — enter the exit price.
            </p>
            <Input label="Close Price" value={closePrice} onChange={setClosePrice} placeholder="0.00" type="number" />
            <div className="flex gap-2">
              <button onClick={() => setClosingId(null)} className="flex-1 py-2 text-xs rounded-lg text-slate-400 border border-slate-700/40 hover:bg-slate-800/60 transition-colors">Cancel</button>
              <button onClick={handleClose} disabled={!closePrice} className="flex-1 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-30 transition-colors font-medium">Confirm Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Reusable sub-components ─── */

function KPI({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0D1321]/80 px-4 py-3">
      <div className="text-[10px] uppercase text-slate-500 font-medium mb-1">{label}</div>
      <div className={`text-sm font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-[10px] uppercase text-slate-500 mb-1 font-medium">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 transition-colors"
      />
    </div>
  );
}
