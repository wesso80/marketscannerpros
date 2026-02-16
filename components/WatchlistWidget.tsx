'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier } from '@/lib/useUserTier';

interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_default: boolean;
  item_count: number;
  created_at: string;
}

interface WatchlistItem {
  id: string;
  symbol: string;
  asset_type: string;
  notes: string | null;
  added_price: number | null;
  sort_order: number;
  created_at: string;
}

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

const COLORS = [
  { name: 'emerald', class: 'bg-emerald-500', text: 'text-emerald-400' },
  { name: 'blue', class: 'bg-blue-500', text: 'text-blue-400' },
  { name: 'purple', class: 'bg-purple-500', text: 'text-purple-400' },
  { name: 'amber', class: 'bg-amber-500', text: 'text-amber-400' },
  { name: 'rose', class: 'bg-rose-500', text: 'text-rose-400' },
];

const ICONS: Record<string, string> = {
  star: '⭐',
  chart: '📈',
  fire: '🔥',
  rocket: '🚀',
  eye: '👁️',
};

export default function WatchlistWidget() {
  const { tier } = useUserTier();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlist, setSelectedWatchlist] = useState<Watchlist | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create watchlist modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState('emerald');
  const [newIcon, setNewIcon] = useState('star');

  // Add symbol modal
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newAssetType, setNewAssetType] = useState('equity');

  const getHeatState = (quote?: QuoteData) => {
    if (!quote) {
      return { icon: '🟡', label: 'WAIT', className: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    }
    if (quote.changePercent >= 1.25) {
      return { icon: '🟢', label: 'EDGE BUILDING', className: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
    }
    if (quote.changePercent <= -1.25) {
      return { icon: '🔴', label: 'NO TRADE', className: 'text-red-400 border-red-500/30 bg-red-500/10' };
    }
    return { icon: '🟡', label: 'WAIT', className: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
  };

  const launchTool = (tool: 'scan' | 'deep' | 'flow' | 'alert', symbol: string) => {
    const encodedSymbol = encodeURIComponent(symbol);
    const routes = {
      scan: `/tools/scanner?symbol=${encodedSymbol}`,
      deep: `/tools/deep-analysis?symbol=${encodedSymbol}`,
      flow: `/tools/options-confluence?symbol=${encodedSymbol}`,
      alert: `/tools/alerts?symbol=${encodedSymbol}`,
    };
    window.location.href = routes[tool];
  };

  // Fetch watchlists
  const fetchWatchlists = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlists');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setWatchlists(data.watchlists || []);
      
      // Auto-select first watchlist
      if (data.watchlists?.length > 0 && !selectedWatchlist) {
        const defaultList = data.watchlists.find((w: Watchlist) => w.is_default) || data.watchlists[0];
        setSelectedWatchlist(defaultList);
      }
    } catch (err) {
      setError('Failed to load watchlists');
    } finally {
      setLoading(false);
    }
  }, [selectedWatchlist]);

  // Fetch items for selected watchlist
  const fetchItems = useCallback(async (watchlistId: string) => {
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/watchlists/items?watchlistId=${watchlistId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems(data.items || []);
      
      // Fetch quotes for symbols
      if (data.items?.length > 0) {
        fetchQuotes(data.items.map((i: WatchlistItem) => i.symbol));
      }
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  // Fetch quotes for symbols
  const fetchQuotes = async (symbols: string[]) => {
    try {
      // Use scanner API to get quotes
      const res = await fetch('/api/scanner/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      if (res.ok) {
        const data = await res.json();
        const quotesMap: Record<string, QuoteData> = {};
        data.quotes?.forEach((q: QuoteData) => {
          quotesMap[q.symbol] = q;
        });
        setQuotes(quotesMap);
      }
    } catch (err) {
      console.error('Error fetching quotes:', err);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, [fetchWatchlists]);

  useEffect(() => {
    if (selectedWatchlist) {
      fetchItems(selectedWatchlist.id);
    }
  }, [selectedWatchlist, fetchItems]);

  // Create watchlist
  const createWatchlist = async () => {
    if (!newName.trim()) return;
    
    try {
      const res = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          color: newColor,
          icon: newIcon,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }

      const data = await res.json();
      setWatchlists([...watchlists, { ...data.watchlist, item_count: 0 }]);
      setSelectedWatchlist({ ...data.watchlist, item_count: 0 });
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Delete watchlist
  const deleteWatchlist = async (id: string) => {
    if (!confirm('Delete this watchlist and all its items?')) return;

    try {
      const res = await fetch(`/api/watchlists?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');

      setWatchlists(watchlists.filter(w => w.id !== id));
      if (selectedWatchlist?.id === id) {
        setSelectedWatchlist(watchlists[0] || null);
      }
    } catch (err) {
      setError('Failed to delete watchlist');
    }
  };

  // Add symbol
  const addSymbol = async () => {
    if (!newSymbol.trim() || !selectedWatchlist) return;

    try {
      const res = await fetch('/api/watchlists/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchlistId: selectedWatchlist.id,
          symbol: newSymbol.toUpperCase(),
          assetType: newAssetType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add');
      }

      const data = await res.json();
      setItems([...items, data.item]);
      setShowAddSymbol(false);
      setNewSymbol('');
      
      // Update count
      setWatchlists(watchlists.map(w => 
        w.id === selectedWatchlist.id 
          ? { ...w, item_count: w.item_count + 1 }
          : w
      ));
      
      // Fetch quote for new symbol
      fetchQuotes([data.item.symbol]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Remove symbol
  const removeSymbol = async (id: string) => {
    try {
      const res = await fetch(`/api/watchlists/items?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove');

      setItems(items.filter(i => i.id !== id));
      
      // Update count
      if (selectedWatchlist) {
        setWatchlists(watchlists.map(w => 
          w.id === selectedWatchlist.id 
            ? { ...w, item_count: Math.max(0, w.item_count - 1) }
            : w
        ));
      }
    } catch (err) {
      setError('Failed to remove symbol');
    }
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price == null) return '-';
    if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
  };

  const getColorClass = (colorName: string) => {
    return COLORS.find(c => c.name === colorName)?.class || 'bg-emerald-500';
  };

  const getTextColorClass = (colorName: string) => {
    return COLORS.find(c => c.name === colorName)?.text || 'text-emerald-400';
  };

  const limits: Record<string, { watchlists: number; items: number }> = {
    free: { watchlists: 3, items: 10 },
    pro: { watchlists: 10, items: 50 },
    pro_trader: { watchlists: 100, items: 500 },
  };
  const currentLimits = limits[tier] || limits.free;
  const activeSymbols = items.length;
  const scannerReady = items.filter((item) => {
    const quote = quotes[item.symbol];
    return getHeatState(quote).label === 'EDGE BUILDING';
  }).length;
  const hotSignals = items.filter((item) => {
    const quote = quotes[item.symbol];
    return !!quote && Math.abs(quote.changePercent) >= 2;
  }).length;
  const avgChangePercent = items.length > 0
    ? items.reduce((sum, item) => sum + (quotes[item.symbol]?.changePercent ?? 0), 0) / items.length
    : 0;
  const biasLabel = avgChangePercent > 0.3 ? 'Bullish' : avgChangePercent < -0.3 ? 'Bearish' : 'Neutral';

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-700 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-12 bg-slate-700 rounded" />
          <div className="h-12 bg-slate-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
          <div className="text-[0.68rem] uppercase tracking-[0.08em] text-slate-400 font-semibold mb-1">
            Watchlist Status
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="rounded border border-slate-700/70 bg-slate-800/40 px-2 py-1.5">
              <div className="text-slate-500 uppercase tracking-wide">Active Symbols</div>
              <div className="text-slate-100 font-semibold">{activeSymbols}</div>
            </div>
            <div className="rounded border border-slate-700/70 bg-slate-800/40 px-2 py-1.5">
              <div className="text-slate-500 uppercase tracking-wide">Scanner Ready</div>
              <div className="text-emerald-400 font-semibold">{scannerReady}</div>
            </div>
            <div className="rounded border border-slate-700/70 bg-slate-800/40 px-2 py-1.5">
              <div className="text-slate-500 uppercase tracking-wide">Bias</div>
              <div className={`font-semibold ${biasLabel === 'Bullish' ? 'text-emerald-400' : biasLabel === 'Bearish' ? 'text-red-400' : 'text-amber-400'}`}>{biasLabel}</div>
            </div>
            <div className="rounded border border-slate-700/70 bg-slate-800/40 px-2 py-1.5">
              <div className="text-slate-500 uppercase tracking-wide">Hot Signals</div>
              <div className="text-amber-400 font-semibold">{hotSignals}</div>
            </div>
            <div className="rounded border border-slate-700/70 bg-slate-800/40 px-2 py-1.5">
              <div className="text-slate-500 uppercase tracking-wide">Mode</div>
              <div className="text-slate-100 font-semibold">Pre-Staging</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📋 Watchlists
            <span className="text-xs text-slate-400">
              ({watchlists.length}/{currentLimits.watchlists})
            </span>
          </h2>
          <button
            onClick={() => setShowCreate(true)}
            disabled={watchlists.length >= currentLimits.watchlists}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 
              disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
          >
            + New List
          </button>
        </div>

        {/* Watchlist tabs */}
        {watchlists.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {watchlists.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedWatchlist(w)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all
                  ${selectedWatchlist?.id === w.id 
                    ? `${getColorClass(w.color)} text-white` 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
              >
                <span>{ICONS[w.icon] || '⭐'}</span>
                <span>{w.name}</span>
                <span className="text-xs opacity-70">({w.item_count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {watchlists.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-slate-400 mb-1">No Active Watchlists</p>
            <p className="text-slate-500 mb-4 text-sm">Initialize Tracking Set</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              Initialize Tracking Set
            </button>
          </div>
        ) : selectedWatchlist ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-lg font-semibold ${getTextColorClass(selectedWatchlist.color)}`}>
                  {ICONS[selectedWatchlist.icon]} {selectedWatchlist.name}
                </h3>
                {selectedWatchlist.description && (
                  <p className="text-sm text-slate-400">{selectedWatchlist.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddSymbol(true)}
                  disabled={items.length >= currentLimits.items}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  + Add Symbol
                </button>
                <button
                  onClick={() => deleteWatchlist(selectedWatchlist.id)}
                  className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
                >
                  🗑️
                </button>
              </div>
            </div>

            {itemsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="h-14 bg-slate-700/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p>No symbols in this watchlist</p>
                <button
                  onClick={() => setShowAddSymbol(true)}
                  className="mt-2 text-emerald-400 hover:text-emerald-300"
                >
                  Add your first symbol →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const quote = quotes[item.symbol];
                  const heatState = getHeatState(quote);
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.symbol}</p>
                            <p className="text-xs text-slate-400 capitalize">{item.asset_type}</p>
                          </div>
                          <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${heatState.className}`}>
                            <span>{heatState.icon}</span>
                            <span>{heatState.label}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          {quote ? (
                            <div className="text-right">
                              <p className="font-mono text-white">{formatPrice(quote.price)}</p>
                              <p className={`text-xs ${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent?.toFixed(2)}%
                              </p>
                            </div>
                          ) : (
                            <div className="text-right">
                              <p className="font-mono text-slate-500">-</p>
                            </div>
                          )}
                          <button
                            onClick={() => removeSymbol(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-all"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => launchTool('scan', item.symbol)}
                          className="px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold uppercase tracking-wide hover:bg-emerald-500/20"
                        >
                          Scan
                        </button>
                        <button
                          onClick={() => launchTool('deep', item.symbol)}
                          className="px-2 py-1 rounded border border-slate-500/40 bg-slate-700/40 text-slate-200 text-[11px] font-semibold uppercase tracking-wide hover:bg-slate-700/70"
                        >
                          Deep
                        </button>
                        <button
                          onClick={() => launchTool('flow', item.symbol)}
                          className="px-2 py-1 rounded border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[11px] font-semibold uppercase tracking-wide hover:bg-purple-500/20"
                        >
                          Option Flow
                        </button>
                        <button
                          onClick={() => launchTool('alert', item.symbol)}
                          className="px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] font-semibold uppercase tracking-wide hover:bg-amber-500/20"
                        >
                          Alert
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Create Watchlist Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">Create Watchlist</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Watchlist"
                  maxLength={50}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg 
                    text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description"
                  maxLength={200}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg 
                    text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Color</label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setNewColor(c.name)}
                      className={`w-8 h-8 rounded-full ${c.class} transition-transform
                        ${newColor === c.name ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110' : ''}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Icon</label>
                <div className="flex gap-2">
                  {Object.entries(ICONS).map(([key, icon]) => (
                    <button
                      key={key}
                      onClick={() => setNewIcon(key)}
                      className={`w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center 
                        text-xl transition-all
                        ${newIcon === key ? 'ring-2 ring-emerald-500 scale-110' : 'hover:bg-slate-600'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createWatchlist}
                disabled={!newName.trim()}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 
                  text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Symbol Modal */}
      {showAddSymbol && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">Add Symbol</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Symbol *</label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  placeholder="AAPL, BTC, EURUSD"
                  maxLength={20}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg 
                    text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 
                    uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Asset Type</label>
                <select
                  value={newAssetType}
                  onChange={(e) => setNewAssetType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg 
                    text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="equity">Stock</option>
                  <option value="crypto">Crypto</option>
                  <option value="forex">Forex</option>
                  <option value="commodity">Commodity</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAddSymbol(false); setNewSymbol(''); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addSymbol}
                disabled={!newSymbol.trim()}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 
                  text-white rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
