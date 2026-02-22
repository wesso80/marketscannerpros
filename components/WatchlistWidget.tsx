'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';

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

type IdeaStage = 'Pre-Staging' | 'Structure Building' | 'Trigger Watch' | 'Execution Ready' | 'Conflict' | 'Invalidated';
type WatchlistMode = 'PRE-STAGING' | 'ACTIVE' | 'RISK-CONTROL';
type SortMode = 'confidence' | 'edge' | 'volatility' | 'momentum' | 'recent';

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
  const { isLocked: riskLocked } = useRiskPermission();
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
  const [watchlistMode, setWatchlistMode] = useState<WatchlistMode>('PRE-STAGING');
  const [stageFilter, setStageFilter] = useState<'all' | IdeaStage>('all');
  const [biasFilter, setBiasFilter] = useState<'all' | 'long' | 'short' | 'neutral'>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<50 | 60 | 70>(60);
  const [volatilityFilter, setVolatilityFilter] = useState<'all' | 'expanding' | 'controlled' | 'compressed'>('all');
  const [alignmentFilter, setAlignmentFilter] = useState<1 | 2 | 3 | 4>(1);
  const [readyOnly, setReadyOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('confidence');
  const [compactView, setCompactView] = useState(false);

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

  const ideaRows = useMemo(() => {
    return items.map((item) => {
      const quote = quotes[item.symbol];
      const changePercent = quote?.changePercent ?? 0;
      const absChange = Math.abs(changePercent);
      const confidence = Math.max(35, Math.min(95, Math.round(55 + (changePercent * 8))));
      const alignmentScore = confidence >= 80 ? 4 : confidence >= 68 ? 3 : confidence >= 58 ? 2 : 1;
      const edge: 'Bullish' | 'Bearish' | 'Neutral' = changePercent > 0.35 ? 'Bullish' : changePercent < -0.35 ? 'Bearish' : 'Neutral';
      const quality: 'High' | 'Medium' | 'Low' = confidence >= 75 ? 'High' : confidence >= 60 ? 'Medium' : 'Low';
      const momentumState: 'Rising' | 'Mixed' | 'Fading' = absChange >= 1.2 ? 'Rising' : absChange >= 0.5 ? 'Mixed' : 'Fading';
      const volatilityState: 'Expanding' | 'Controlled' | 'Compressed' = absChange >= 2 ? 'Expanding' : absChange >= 0.8 ? 'Controlled' : 'Compressed';

      let stage: IdeaStage = 'Pre-Staging';
      if (!quote) {
        stage = 'Pre-Staging';
      } else if (changePercent <= -3) {
        stage = 'Invalidated';
      } else if (edge === 'Neutral' && absChange >= 0.8) {
        stage = 'Conflict';
      } else if (confidence >= 78 && alignmentScore >= 3) {
        stage = 'Execution Ready';
      } else if (confidence >= 66) {
        stage = 'Trigger Watch';
      } else if (confidence >= 56) {
        stage = 'Structure Building';
      }

      const structureState = stage === 'Execution Ready'
        ? 'Confirmed'
        : stage === 'Trigger Watch'
        ? 'Watching Trigger'
        : stage === 'Structure Building'
        ? 'Building'
        : stage === 'Conflict'
        ? 'Conflicted'
        : stage === 'Invalidated'
        ? 'Broken'
        : 'Pre-Staging';

      const edgeTemperature = Math.max(5, Math.min(100, confidence + (stage === 'Execution Ready' ? 8 : 0) - (stage === 'Invalidated' ? 20 : 0)));

      return {
        item,
        quote,
        confidence,
        alignmentScore,
        edge,
        quality,
        momentumState,
        volatilityState,
        stage,
        structureState,
        edgeTemperature,
        updatedAt: quote ? Date.now() : new Date(item.created_at).getTime(),
      };
    });
  }, [items, quotes]);

  const readyToTrack = ideaRows.filter((row) => row.stage === 'Execution Ready').length;
  const structureBuilding = ideaRows.filter((row) => row.stage === 'Structure Building').length;
  const triggerWatch = ideaRows.filter((row) => row.stage === 'Trigger Watch').length;
  const conflictCount = ideaRows.filter((row) => row.stage === 'Conflict').length;
  const invalidatedCount = ideaRows.filter((row) => row.stage === 'Invalidated').length;
  const coolingCount = ideaRows.filter((row) => row.momentumState === 'Fading').length;
  const hotSignals = ideaRows.filter((row) => row.edgeTemperature >= 75).length;

  const avgChangePercent = items.length > 0
    ? items.reduce((sum, item) => sum + (quotes[item.symbol]?.changePercent ?? 0), 0) / Math.max(1, items.length)
    : 0;
  const biasLabel = avgChangePercent > 0.3 ? 'Bullish' : avgChangePercent < -0.3 ? 'Bearish' : 'Neutral';
  const avgConfidence = ideaRows.length > 0
    ? Math.round(ideaRows.reduce((sum, row) => sum + row.confidence, 0) / ideaRows.length)
    : 0;
  const avgAlignment = ideaRows.length > 0
    ? (ideaRows.reduce((sum, row) => sum + row.alignmentScore, 0) / ideaRows.length).toFixed(1)
    : '0.0';
  const trackingReadinessPct = activeSymbols > 0 ? Math.round((readyToTrack / activeSymbols) * 100) : 0;

  const filteredIdeas = useMemo(() => {
    const rows = ideaRows.filter((row) => {
      if (readyOnly && row.stage !== 'Execution Ready') return false;
      if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
      if (biasFilter !== 'all') {
        const bias = row.edge === 'Bullish' ? 'long' : row.edge === 'Bearish' ? 'short' : 'neutral';
        if (bias !== biasFilter) return false;
      }
      if (row.confidence < confidenceFilter) return false;
      if (volatilityFilter !== 'all' && (row.volatilityState ?? '').toLowerCase() !== volatilityFilter) return false;
      if (row.alignmentScore < alignmentFilter) return false;
      return true;
    });

    const volatilityRank: Record<'Expanding' | 'Controlled' | 'Compressed', number> = {
      Expanding: 3,
      Controlled: 2,
      Compressed: 1,
    };
    const momentumRank: Record<'Rising' | 'Mixed' | 'Fading', number> = {
      Rising: 3,
      Mixed: 2,
      Fading: 1,
    };

    rows.sort((a, b) => {
      if (sortMode === 'edge') return b.edgeTemperature - a.edgeTemperature;
      if (sortMode === 'volatility') return volatilityRank[b.volatilityState] - volatilityRank[a.volatilityState];
      if (sortMode === 'momentum') return momentumRank[b.momentumState] - momentumRank[a.momentumState];
      if (sortMode === 'recent') return b.updatedAt - a.updatedAt;
      return b.confidence - a.confidence;
    });

    return rows;
  }, [ideaRows, readyOnly, stageFilter, biasFilter, confidenceFilter, volatilityFilter, alignmentFilter, sortMode]);

  const runScanAll = () => {
    const first = filteredIdeas[0]?.item?.symbol || items[0]?.symbol;
    if (!first) return;
    window.location.href = `/tools/scanner?symbol=${encodeURIComponent(first)}`;
  };

  const runConfluenceCheck = () => {
    if (items.length === 0) return;
    void fetchQuotes(items.map((i) => i.symbol));
  };

  const exportWatchlist = () => {
    const headers = ['symbol', 'asset_type', 'stage', 'confidence', 'alignment', 'edge', 'quality', 'momentum', 'volatility', 'last_updated'];
    const rows = filteredIdeas.map((row) => [
      row.item.symbol,
      row.item.asset_type,
      row.stage,
      String(row.confidence),
      `${row.alignmentScore}/4`,
      row.edge,
      row.quality,
      row.momentumState,
      row.volatilityState,
      new Date(row.updatedAt).toISOString(),
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedWatchlist?.name || 'watchlist'}-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/50">
      <div className="p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {watchlists.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mb-3 text-4xl">📋</div>
            <p className="mb-1 text-slate-300">No active watchlists</p>
            <p className="mb-4 text-sm text-slate-500">Initialize your first idea pipeline</p>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-500"
            >
              Create Watchlist
            </button>
          </div>
        ) : selectedWatchlist ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {watchlists.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWatchlist(w)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] ${
                        selectedWatchlist.id === w.id
                          ? `${getColorClass(w.color)} text-white`
                          : 'border border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      {ICONS[w.icon] || '⭐'} {w.name} ({w.item_count})
                    </button>
                  ))}
                </div>
                <select
                  value={watchlistMode}
                  onChange={(e) => setWatchlistMode(e.target.value as WatchlistMode)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-100"
                >
                  <option value="PRE-STAGING">PRE-STAGING</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="RISK-CONTROL">RISK-CONTROL</option>
                </select>
              </div>
            </div>

            <div className={`rounded-xl border px-4 py-4 ${
              invalidatedCount > 0
                ? 'border-red-500/40 bg-red-500/10'
                : conflictCount > readyToTrack
                ? 'border-amber-500/40 bg-amber-500/10'
                : readyToTrack > 0
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-slate-700 bg-slate-900/40'
            }`}>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">Watchlist</div>
                  <div className="mt-1 text-lg font-black text-white">{(selectedWatchlist.name ?? '').toUpperCase()}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-slate-300">Mode: {watchlistMode}</div>
                  <div className={`mt-1 text-xs font-semibold uppercase tracking-[0.06em] ${biasLabel === 'Bullish' ? 'text-emerald-400' : biasLabel === 'Bearish' ? 'text-red-400' : 'text-amber-300'}`}>
                    Bias: {biasLabel}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">Hot Signals</div>
                    <div className="font-bold text-amber-300">{hotSignals}</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">Ready to Track</div>
                    <div className="font-bold text-emerald-400">{readyToTrack}</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">Avg Confidence</div>
                    <div className="font-bold text-slate-100">{avgConfidence}%</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">Avg Alignment</div>
                    <div className="font-bold text-slate-100">{avgAlignment}/4</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  <div className="text-xs text-slate-400">{activeSymbols} symbols • readiness {trackingReadinessPct}%</div>
                  {riskLocked && (
                    <div className="text-[11px] font-semibold text-rose-300">Rule Guard active: marked setups remain staged; new tracking actions are locked.</div>
                  )}
                  <div className="flex w-full flex-wrap gap-2 md:justify-end">
                    <button
                      onClick={() => setShowAddSymbol(true)}
                      disabled={items.length >= currentLimits.items}
                      className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      + Add Symbol
                    </button>
                    <button
                      onClick={() => setShowCreate(true)}
                      disabled={watchlists.length >= currentLimits.watchlists}
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-50"
                    >
                      + Create List
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-5">
              {[
                { label: 'Ready to Track', value: readyToTrack, pct: activeSymbols ? Math.round((readyToTrack / activeSymbols) * 100) : 0, tone: 'text-emerald-400' },
                { label: 'Structure Building', value: structureBuilding, pct: activeSymbols ? Math.round((structureBuilding / activeSymbols) * 100) : 0, tone: 'text-cyan-300' },
                { label: 'Trigger Watch', value: triggerWatch, pct: activeSymbols ? Math.round((triggerWatch / activeSymbols) * 100) : 0, tone: 'text-amber-300' },
                { label: 'Conflict', value: conflictCount, pct: activeSymbols ? Math.round((conflictCount / activeSymbols) * 100) : 0, tone: 'text-orange-300' },
                { label: 'Invalidated', value: invalidatedCount, pct: activeSymbols ? Math.round((invalidatedCount / activeSymbols) * 100) : 0, tone: 'text-red-400' },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-2">
                  <div className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-slate-500">{metric.label}</div>
                  <div className={`mt-1 text-lg font-black ${metric.tone}`}>{metric.value}</div>
                  <div className="text-[0.65rem] text-slate-500">{metric.pct}% of total</div>
                </div>
              ))}
            </div>

            <div className="sticky top-4 z-20 rounded-xl border border-slate-700 bg-slate-900/75 p-3 backdrop-blur">
              <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as 'all' | IdeaStage)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100">
                  <option value="all">Stage: All</option>
                  <option value="Execution Ready">Stage: Ready</option>
                  <option value="Structure Building">Stage: Building</option>
                  <option value="Trigger Watch">Stage: Trigger Watch</option>
                  <option value="Conflict">Stage: Conflict</option>
                  <option value="Invalidated">Stage: Invalid</option>
                </select>
                <select value={biasFilter} onChange={(e) => setBiasFilter(e.target.value as 'all' | 'long' | 'short' | 'neutral')} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100">
                  <option value="all">Bias: All</option>
                  <option value="long">Bias: Long</option>
                  <option value="short">Bias: Short</option>
                  <option value="neutral">Bias: Neutral</option>
                </select>
                <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(Number(e.target.value) as 50 | 60 | 70)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100">
                  <option value={50}>Confidence: &gt;50</option>
                  <option value={60}>Confidence: &gt;60</option>
                  <option value={70}>Confidence: &gt;70</option>
                </select>
                <select value={volatilityFilter} onChange={(e) => setVolatilityFilter(e.target.value as 'all' | 'expanding' | 'controlled' | 'compressed')} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100">
                  <option value="all">Volatility: All</option>
                  <option value="expanding">Volatility: Expanding</option>
                  <option value="controlled">Volatility: Controlled</option>
                  <option value="compressed">Volatility: Compressed</option>
                </select>
                <select value={alignmentFilter} onChange={(e) => setAlignmentFilter(Number(e.target.value) as 1 | 2 | 3 | 4)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100">
                  <option value={1}>Alignment: 1TF+</option>
                  <option value={2}>Alignment: 2TF+</option>
                  <option value={3}>Alignment: 3TF+</option>
                  <option value={4}>Alignment: 4TF</option>
                </select>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100">
                  <option value="confidence">Sort: Confidence</option>
                  <option value="edge">Sort: Edge Temperature</option>
                  <option value="volatility">Sort: Volatility</option>
                  <option value="momentum">Sort: Momentum</option>
                  <option value="recent">Sort: Recently Updated</option>
                </select>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setReadyOnly((prev) => !prev)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase ${readyOnly ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>
                    {readyOnly ? 'Ready Only: On' : 'Ready Only'}
                  </button>
                  <span className="text-xs text-slate-500">{filteredIdeas.length} visible</span>
                </div>
                <button onClick={() => setCompactView((prev) => !prev)} className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-300">
                  {compactView ? 'Compact View' : 'Grid View'}
                </button>
              </div>
            </div>

            {itemsLoading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((row) => (
                  <div key={row} className="h-44 animate-pulse rounded-xl bg-slate-700/40" />
                ))}
              </div>
            ) : filteredIdeas.length === 0 ? (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 py-10 text-center text-slate-400">
                <p>No symbols match current filters</p>
                <button onClick={() => { setStageFilter('all'); setBiasFilter('all'); setReadyOnly(false); }} className="mt-2 text-sm text-emerald-400 hover:text-emerald-300">
                  Reset filters
                </button>
              </div>
            ) : (
              <div className={`grid gap-3 ${compactView ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
                {filteredIdeas.map((row) => {
                  const { item, quote } = row;
                  const stageTone = row.stage === 'Execution Ready'
                    ? 'border-emerald-500/60'
                    : row.stage === 'Trigger Watch'
                    ? 'border-amber-500/60'
                    : row.stage === 'Structure Building'
                    ? 'border-cyan-400/50'
                    : row.stage === 'Conflict'
                    ? 'border-orange-500/50'
                    : row.stage === 'Invalidated'
                    ? 'border-red-500/60'
                    : 'border-blue-500/40';

                  return (
                    <div key={item.id} className={`flex h-full flex-col rounded-xl border bg-slate-900/55 p-3 ${stageTone}`}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-lg font-black text-white">{item.symbol}</div>
                          <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">{item.asset_type}</div>
                        </div>
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-slate-200">
                          {row.stage}
                        </span>
                      </div>

                      <div className="grid gap-1 text-[12px] text-slate-300">
                        <div>Confidence: <span className="font-bold text-white">{row.confidence}%</span></div>
                        <div>Timeframe Alignment: <span className="font-bold text-white">{row.alignmentScore}/4</span></div>
                        <div>Edge: <span className={`font-bold ${row.edge === 'Bullish' ? 'text-emerald-400' : row.edge === 'Bearish' ? 'text-red-400' : 'text-amber-300'}`}>{row.edge}</span></div>
                        <div>Quality: <span className="font-bold text-white">{row.quality}</span></div>
                        <div>Momentum: <span className="font-bold text-white">{row.momentumState}</span></div>
                        <div>Volatility: <span className="font-bold text-white">{row.volatilityState}</span></div>
                        <div>Structure: <span className="font-bold text-white">{row.structureState}</span></div>
                        <div>Price: <span className="font-mono font-bold text-slate-100">{formatPrice(quote?.price)}</span></div>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className={`h-full ${row.edgeTemperature >= 75 ? 'bg-emerald-400' : row.edgeTemperature >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${row.edgeTemperature}%` }}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-400">
                        {row.volatilityState === 'Expanding' && <span>⚡ Volatility Expansion</span>}
                        {row.alignmentScore >= 3 && <span>🧠 Multi-TF Aligned</span>}
                        {row.stage === 'Conflict' && <span>⚠ Conflict</span>}
                        {row.momentumState === 'Rising' && <span>🔥 Momentum Shift</span>}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        <button onClick={() => launchTool('scan', item.symbol)} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-1 text-[10px] font-semibold uppercase text-emerald-300">Scan</button>
                        <button onClick={() => launchTool('deep', item.symbol)} className="rounded border border-slate-600 bg-slate-800 px-1.5 py-1 text-[10px] font-semibold uppercase text-slate-200">Deep</button>
                        <button onClick={() => launchTool('flow', item.symbol)} className="rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-1 text-[10px] font-semibold uppercase text-purple-300">Options</button>
                        <button onClick={() => launchTool('alert', item.symbol)} className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-[10px] font-semibold uppercase text-amber-300">Alert</button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => window.location.href = `/tools/scanner?symbol=${encodeURIComponent(item.symbol)}`} className="flex-1 rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-blue-300">Open Cockpit</button>
                        <button onClick={() => removeSymbol(item.id)} className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-red-300">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
              <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-400">Bulk Actions</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={runScanAll} className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase text-emerald-300">Scan All Symbols</button>
                <button onClick={runConfluenceCheck} className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase text-cyan-300">Run Confluence Check</button>
                <button onClick={() => setReadyOnly(true)} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold uppercase text-amber-300">Filter Ready Only</button>
                <button onClick={exportWatchlist} className="rounded-md border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold uppercase text-purple-300">Export Watchlist</button>
                <button onClick={() => launchTool('alert', filteredIdeas[0]?.item.symbol || '')} disabled={filteredIdeas.length === 0 || riskLocked} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold uppercase text-slate-200 disabled:opacity-50">Send Alerts for Ready</button>
              </div>
              {riskLocked && <div className="mt-2 text-[11px] text-rose-300">Send Alerts for Ready is disabled while Tracking Lock is active.</div>}
            </div>
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
