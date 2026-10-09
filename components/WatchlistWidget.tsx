'use client';

import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { marketText } from '@/lib/marketsPresentation';
import UpgradeMoment, { useUpgradeMoment } from '@/components/free/UpgradeMoment';
import { FREE_COPY } from '@/components/free/copy';
import PriceStamp from '@/components/market/PriceStamp';
import {watchlistStamp} from '@/lib/market/trackStamp';
import {symbolHref,optionsHref} from '@/lib/market/links';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserTier, canExportCSV } from '@/lib/useUserTier';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { isPaidTier, watchlistLimitsFor } from '@/lib/tiers';
import { filterByMove, formatTodayMove, sortByMove, summarizeMoves, todayMove, type MoveFilter, type MoveSort } from '@/lib/watchlist/todayMove';
import { fetchWatchlistQuotes, formatQuoteAsOf, type WatchlistQuote } from '@/lib/watchlist/quotes';
import { afterWatchlistDeleted, upsertWatchlistItem, watchlistNameError, WATCHLIST_NAME_MAX } from '@/lib/watchlist/listState';

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
  confluenceScore?: number;
  confluenceSignals?: string[];
  current_price?: number;
  change_percent?: number;
  quote_fetched_at?: string | null;
  quote_trading_day?: string | null;
}

type QuoteData = WatchlistQuote;

type WatchlistMode = 'PRE-STAGING' | 'ACTIVE' | 'RISK-CONTROL';

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

const rowAction = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold';

function assetLabel(asset: string) {
  if (asset === 'equity') return 'Stock';
  if (asset === 'crypto') return 'Crypto';
  if (asset === 'option' || asset === 'options') return 'Option';
  if (asset === 'commodity') return 'Commodity';
  if (asset === 'forex') return 'Forex';
  return asset;
}

export default function WatchlistWidget() {
  const upgrade = useUpgradeMoment();
  const { tier } = useUserTier();
  const router = useRouter();
  const searchParams=useSearchParams();
  const { isLocked: riskLocked } = useRiskPermission();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlist, setSelectedWatchlist] = useState<Watchlist | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(true);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  // Every load owns its item and quote responses; late responses cannot cross lists.
  const itemLoadGeneration = useRef(0);
  const [error, setError] = useState<string | null>(null);
  // Informational messages (the save worked), shown in neutral styling rather than as an error.
  const [notice, setNotice] = useState<string | null>(null);

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
  useEffect(()=>{
    const draft=searchParams.get('addSymbol');
    if(draft){setNewSymbol(draft.toUpperCase());setNewAssetType(searchParams.get('type')==='crypto'?'crypto':'equity');setShowAddSymbol(true);}
  },[searchParams]);
  const [watchlistMode, setWatchlistMode] = useState<WatchlistMode>('PRE-STAGING');
  // Default shows every symbol, priced or not, in the list's saved order.
  const [moveFilter, setMoveFilter] = useState<MoveFilter>('all');
  const [sortMode, setSortMode] = useState<MoveSort>('saved');
  const [compactView, setCompactView] = useState(false);
  const [expandedSelection, setExpandedSelection] = useState<string | null>(null);
  const selectionKey = `${selectedWatchlist?.id}/${moveFilter}/${sortMode}`;
  const showAll = expandedSelection === selectionKey;

  const launchTool = (tool: 'scan' | 'deep' | 'flow' | 'alert' | 'research', symbol: string) => {
    const option = /^([A-Z0-9.\-]+) (\d{4}-\d{2}-\d{2}) [\d.]+[CP]$/.exec(symbol);
    if (option) {
      router.push(optionsHref(option[1],option[2]));
      return;
    }
    const encodedSymbol = encodeURIComponent(symbol);
    const asset=items.find(item=>item.symbol===symbol)?.asset_type??'equity';
    const routes = {
      scan: `/tools/scanner?symbol=${encodedSymbol}`,
      deep: symbolHref(symbol,asset),
      flow: asset==='crypto'?symbolHref(symbol,asset):optionsHref(symbol),
      alert: `/tools/workspace?tab=alerts&symbol=${encodedSymbol}`,
      research: `/tools/research?tab=earnings&symbol=${encodedSymbol}`,
    };
    router.push(routes[tool]);
  };

  // Fetch watchlists
  const fetchWatchlists = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlists');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setWatchlists(data.watchlists || []);
      setListsLoaded(true);
      setError((current) => current === 'Failed to load watchlists' ? null : current);

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
    const generation = ++itemLoadGeneration.current;
    setItemsLoading(true);
    setItemsError(null);
    setItems([]);
    setQuotes({});
    try {
      const res = await fetch(`/api/watchlists/items?watchlistId=${watchlistId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (generation !== itemLoadGeneration.current) return;
      setItems(data.items || []);
      
      // Fetch quotes for every item, by its saved asset type
      setQuotes({});
      if (data.items?.length > 0) {
        void fetchQuotes(data.items, generation);
      }
    } catch (err) {
      if (generation === itemLoadGeneration.current) {
        setItemsError('Symbols could not be loaded for this watchlist.');
      }
    } finally {
      if (generation === itemLoadGeneration.current) setItemsLoading(false);
    }
  }, []);

  // Fetch quotes for items: uses each item's asset type, batches lists over 20, and falls
  // back to the cached price (marked "cached"). Results merge into existing quotes.
  const fetchQuotes = async (forItems: WatchlistItem[], generation = itemLoadGeneration.current) => {
    try {
      await fetchWatchlistQuotes(forItems, undefined, (partial) => {
        if (generation !== itemLoadGeneration.current) return;
        setQuotes((prev) => ({ ...prev, ...partial }));
      });
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
    return () => { itemLoadGeneration.current += 1; };
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const confirmDeleteWatchlist = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;

    try {
      const res = await fetch(`/api/watchlists?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');

      // Select the first remaining list (the old code could re-select the deleted one).
      const next = afterWatchlistDeleted(watchlists, id, selectedWatchlist?.id);
      setWatchlists(next.lists);
      setSelectedWatchlist(next.selected);
      if (!next.selected) setItems([]);
    } catch (err) {
      setError('Failed to delete watchlist');
    }
  };

  const deleteWatchlist = (id: string) => {
    setPendingDeleteId(id);
  };

  // Rename watchlist
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  useEffect(() => { setRenaming(false); }, [selectedWatchlist?.id]);

  const startRename = () => {
    if (!selectedWatchlist) return;
    setRenameValue(selectedWatchlist.name ?? '');
    setRenaming(true);
  };

  const saveRename = async () => {
    if (!selectedWatchlist) return;
    const nameError = watchlistNameError(renameValue);
    if (nameError) {
      setError(nameError);
      return;
    }
    try {
      const res = await fetch('/api/watchlists', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedWatchlist.id, name: renameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to rename watchlist');
      const name = data.watchlist?.name ?? renameValue.trim();
      setWatchlists(watchlists.map(w => (w.id === selectedWatchlist.id ? { ...w, name } : w)));
      setSelectedWatchlist({ ...selectedWatchlist, name });
      setRenaming(false);
    } catch (err: any) {
      setError(err.message || 'Failed to rename watchlist');
    }
  };

  // Add symbol
  const addSymbol = async () => {
    if (!newSymbol.trim() || !selectedWatchlist) return;
    setNotice(null);

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
      // The server upserts on (list, symbol): re-adding returns the existing row, so update
      // it in place instead of appending a duplicate card and bumping the count.
      const merged = upsertWatchlistItem(items, data.item as WatchlistItem);
      setItems(merged.items);
      setShowAddSymbol(false);
      setNewSymbol('');

      if (merged.added) {
        setWatchlists(watchlists.map(w => 
          w.id === selectedWatchlist.id 
            ? { ...w, item_count: w.item_count + 1 }
            : w
        ));
      } else {
        setNotice(`${String(data.item?.symbol ?? newSymbol).toUpperCase()} is already on this list.`);
      }
      
      // Fetch quote for new symbol
      fetchQuotes([data.item]);
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

  const currentLimits = watchlistLimitsFor(isPaidTier(tier));
  const activeSymbols = items.length;

  const ideaRows = useMemo(() => {
    return items.map((item) => {
      const quote = quotes[item.symbol];
      return {
        item,
        quote,
        ...todayMove(quote?.changePercent),
        // The quote's own time (provider timestamp or trading day); 0 when unknown.
        updatedAt: quote?.asOf && Number.isFinite(Date.parse(quote.asOf)) ? Date.parse(quote.asOf) : 0,
      };
    });
  }, [items, quotes]);

  const moveSummary = summarizeMoves(ideaRows);

  const filteredIdeas = useMemo(
    () => sortByMove(filterByMove(ideaRows, moveFilter), sortMode),
    [ideaRows, moveFilter, sortMode],
  );

  const resetFilters = () => {
    setMoveFilter('all');
    setSortMode('saved');
  };

  const runScanAll = () => {
    const first = filteredIdeas[0]?.item?.symbol || items[0]?.symbol;
    if (!first) return;
    router.push(`/tools/scanner?symbol=${encodeURIComponent(first)}`);
  };

  const runConfluenceCheck = () => {
    if (items.length === 0) return;
    void fetchQuotes(items);
  };

  const exportWatchlist = () => {
    const headers = ['symbol', 'asset_type', 'price', 'change_percent_today', 'last_updated'];
    const rows = filteredIdeas.map((row) => [
      row.item.symbol,
      row.item.asset_type,
      row.quote?.price != null ? String(row.quote.price) : '',
      row.changePercent != null ? row.changePercent.toFixed(2) : '',
      row.quote?.asOf ?? '',
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
        <p data-watchlist-summary role="status" className="mb-3 text-sm font-semibold text-slate-200">{!listsLoaded ? 'The last watchlist request did not complete.' : itemsLoading ? 'Loading saved symbols…' : !watchlists.length ? 'No watchlists saved yet.' : `${selectedWatchlist?.name || 'Watchlist'} · ${items.length} saved symbols loaded`}</p>
        {upgrade.moment && <UpgradeMoment kind={upgrade.moment} dismiss={upgrade.dismiss} />}
        {(items.length >= currentLimits.items || watchlists.length >= currentLimits.watchlists) && <p className="text-xs">{FREE_COPY.moments.watchlists}</p>}
        {error && listsLoaded && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
            <button type="button" aria-label="Dismiss error message" onClick={() => setError(null)} className="min-h-10 ml-2 underline">Dismiss</button>
          </div>
        )}
        {notice && (
          <div role="status" className="mb-4 rounded-lg border border-slate-600/60 bg-slate-700/30 p-3 text-sm text-slate-200">
            {notice}
            <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="min-h-10 ml-2 underline">Dismiss</button>
          </div>
        )}

        {!listsLoaded ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-200">
            <p>Watchlists could not be loaded.</p>
            <button type="button" className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-3 text-sm" onClick={() => void fetchWatchlists()}>Retry loading watchlists</button>
          </div>
        ) : watchlists.length === 0 ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 overflow-hidden rounded-xl"><img src="/assets/platform-tools/watchlists.png" alt="Watchlists" className="h-full w-full object-contain p-0.5" /></div>
            <p className="mb-1 text-slate-300">Create your first watchlist</p>
            <p className="mb-4 text-sm text-slate-500">Create a list to save research symbols</p>
            <button
              type="button"
              onClick={() => watchlists.length >= currentLimits.watchlists ? upgrade.show('watchlists') : setShowCreate(true)}
              className="inline-flex min-h-10 items-center rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-500"
            >
              Create Watchlist
            </button>
          </div>
        ) : selectedWatchlist ? (
          <div className="space-y-4">
            <CollapsibleSection title="Switch list and mode">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {watchlists.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={selectedWatchlist.id === w.id}
                      onClick={() => setSelectedWatchlist(w)}
                      className={`inline-flex min-h-10 max-w-full items-center break-words rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                        selectedWatchlist.id === w.id
                          ? `${getColorClass(w.color)} text-white`
                          : 'border border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span aria-hidden="true">{ICONS[w.icon] || '⭐'}</span> {w.name} ({w.item_count})
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Watchlist mode"
                  value={watchlistMode}
                  onChange={(e) => setWatchlistMode(e.target.value as WatchlistMode)}
                  className="min-h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="PRE-STAGING">Research</option>
                  <option value="ACTIVE">Tracking</option>
                  <option value="RISK-CONTROL">Risk review</option>
                </select>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="List details and management">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">Watchlist</div>
                  {renaming ? (
                    <form
                      className="mt-1 flex items-center gap-2"
                      onSubmit={(e) => { e.preventDefault(); void saveRename(); }}
                    >
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        maxLength={WATCHLIST_NAME_MAX}
                        aria-label="Watchlist name"
                        autoFocus
                        className="min-h-10 w-full rounded-md border border-slate-600 bg-slate-800 px-2 text-sm text-white"
                      />
                      <button type="submit" className="inline-flex min-h-10 items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Save</button>
                      <button type="button" onClick={() => setRenaming(false)} className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm text-slate-300">Cancel</button>
                    </form>
                  ) : (
                    <div className="mt-1 text-lg font-black text-white">{(selectedWatchlist.name ?? '').toUpperCase()}</div>
                  )}
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-slate-300">Mode: {watchlistMode === 'PRE-STAGING' ? 'Research' : watchlistMode === 'ACTIVE' ? 'Tracking' : 'Risk review'}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-slate-300">
                    Avg move today:{' '}
                    {moveSummary.avgChangePercent == null
                      ? 'no prices yet'
                      : `${formatTodayMove(todayMove(moveSummary.avgChangePercent))} (${moveSummary.priced} of ${moveSummary.total} priced)`}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">Up today</div>
                    <div className="font-bold text-slate-100">{moveSummary.up}</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">Down today</div>
                    <div className="font-bold text-slate-100">{moveSummary.down}</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">Flat</div>
                    <div className="font-bold text-slate-100">{moveSummary.flat}</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5">
                    <div className="uppercase tracking-wide text-slate-500">No price</div>
                    <div className="font-bold text-slate-100">{moveSummary.unpriced}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  <div className="text-xs text-slate-400">{activeSymbols} symbols</div>
                  {riskLocked && (
                    <div className="text-sm font-semibold text-rose-300">Tracking lock is on. Saved symbols stay listed. New alerts stay off.</div>
                  )}
                  <div className="flex w-full flex-wrap gap-2 md:justify-end">
                    <button
                      type="button"
                      onClick={() => items.length >= currentLimits.items ? upgrade.show('watchlists') : setShowAddSymbol(true)}
                      aria-disabled={items.length >= currentLimits.items}
                      className="inline-flex min-h-10 items-center rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      + Add Symbol
                    </button>
                    <button
                      type="button"
                      onClick={() => watchlists.length >= currentLimits.watchlists ? upgrade.show('watchlists') : setShowCreate(true)}
                      aria-disabled={watchlists.length >= currentLimits.watchlists}
                      className="inline-flex min-h-10 items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-50"
                    >
                      + Create List
                    </button>
                    <button
                      type="button"
                      onClick={startRename}
                      className="inline-flex min-h-10 items-center rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteWatchlist(selectedWatchlist.id)}
                      className="inline-flex min-h-10 items-center rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300"
                    >
                      Delete List
                    </button>
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Filter and sort" summary={`${filteredIdeas.length} matching symbols`}>
              <div className="grid gap-2 md:grid-cols-3">
                <select aria-label="Filter by today's move" value={moveFilter} onChange={(e) => setMoveFilter(e.target.value as MoveFilter)} className="min-h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                  <option value="all">Today: All symbols</option>
                  <option value="up">Today: Up</option>
                  <option value="down">Today: Down</option>
                  <option value="flat">Today: Flat</option>
                  <option value="unpriced">Today: No price</option>
                </select>
                <select aria-label="Sort symbols" value={sortMode} onChange={(e) => setSortMode(e.target.value as MoveSort)} className="min-h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                  <option value="saved">Sort: Saved order</option>
                  <option value="move">Sort: Biggest move today (up or down)</option>
                  <option value="symbol">Sort: Symbol A-Z</option>
                </select>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{showAll || filteredIdeas.length <= 5 ? `${filteredIdeas.length} of ${ideaRows.length} listed` : `Showing 5 of ${filteredIdeas.length}`}</span>
                <button type="button" aria-pressed={compactView} onClick={() => setCompactView((prev) => !prev)} className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-300">
                  {compactView ? 'Compact View' : 'Grid View'}
                </button>
              </div>
            </CollapsibleSection>

            {itemsLoading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((row) => (
                  <div key={row} className="h-44 animate-pulse rounded-xl bg-slate-700/40" />
                ))}
              </div>
            ) : itemsError ? (
              <div role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-200">
                <p>{itemsError}</p>
                <button type="button" className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-3 text-sm" onClick={() => void fetchItems(selectedWatchlist.id)}>Retry loading symbols</button>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 py-6 text-center text-slate-400">
                <p>This watchlist is empty</p>
                <button type="button" onClick={() => items.length >= currentLimits.items ? upgrade.show('watchlists') : setShowAddSymbol(true)} className="mt-2 inline-flex min-h-10 items-center text-sm text-emerald-400 hover:text-emerald-300">
                  + Add a symbol
                </button>
              </div>
            ) : filteredIdeas.length === 0 ? (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 py-6 text-center text-slate-400">
                <p>No symbols match current filters</p>
                <button type="button" onClick={resetFilters} className="mt-2 inline-flex min-h-10 items-center text-sm text-emerald-400 hover:text-emerald-300">
                  Reset filters
                </button>
              </div>
            ) : (
              <div className={`grid gap-3 ${compactView ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
                {(showAll ? filteredIdeas : filteredIdeas.slice(0, 5)).map((row) => {
                  const { item, quote } = row;

                  return (
                    <div key={item.id} data-watchlist-row className="min-w-0 rounded-lg border border-slate-700 bg-slate-900/55 p-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={symbolHref(item.symbol.split(' ')[0],item.asset_type)} className="inline-flex min-h-10 min-w-10 items-center break-words text-base font-semibold text-white">{item.symbol}</Link>
                        <span className="text-xs text-slate-500">{assetLabel(item.asset_type)}</span>
                        <span className={`text-sm ${row.direction === 'up' ? 'text-emerald-400' : row.direction === 'down' ? 'text-red-400' : 'text-slate-300'}`}>Today: {formatTodayMove(row)}</span>
                      </div>
                      <details className="min-w-0">
                        <summary className="min-h-10 cursor-pointer content-center text-sm text-slate-300">Quote details and actions</summary>
                        <div className="grid gap-2 pb-1 text-sm text-slate-300">
                          <div>
                            <PriceStamp compact plain {...watchlistStamp(item.asset_type,quote)}/>
                            {quote?.source === 'cached' && <span className="ml-1 rounded bg-amber-500/15 px-1 text-xs font-semibold text-amber-300" title="No live quote right now; showing the last stored price">Cached</span>}
                            {quote?.note && <span className="ml-1 text-xs text-slate-400">({marketText(quote.note)})</span>}
                          </div>
                          {(item.confluenceScore ?? 0) > 0 && (
                            <p className="text-xs text-slate-400">
                              {item.confluenceScore} reading{(item.confluenceScore ?? 0) > 1 ? 's' : ''}: {marketText((item.confluenceSignals || []).join(', '))}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" aria-label={`Scan ${item.symbol}`} onClick={() => launchTool('scan', item.symbol)} className={`${rowAction} border-emerald-500/40 bg-emerald-500/10 text-emerald-300`}>Scan</button>
                            <button type="button" aria-label={`Symbol ${item.symbol}`} onClick={() => launchTool('deep', item.symbol)} className={`${rowAction} border-slate-600 bg-slate-800 text-slate-200`}>Symbol</button>
                            <button type="button" aria-label={`Options flow ${item.symbol}`} onClick={() => launchTool('flow', item.symbol)} className={`${rowAction} border-purple-500/40 bg-purple-500/10 text-purple-300`}>Options</button>
                            <button type="button" aria-label={`Set alert for ${item.symbol}`} onClick={() => launchTool('alert', item.symbol)} className={`${rowAction} border-amber-500/40 bg-amber-500/10 text-amber-300`}>Alert</button>
                            <button type="button" aria-label={`Open scanner for ${item.symbol}`} onClick={() => launchTool('scan', item.symbol)} className={`${rowAction} border-blue-500/40 bg-blue-500/10 text-blue-300`}>Open Scanner</button>
                            <button type="button" aria-label={`Research ${item.symbol}`} onClick={() => launchTool('research', item.symbol)} className={`${rowAction} border-cyan-500/40 bg-cyan-500/10 text-cyan-300`}>Research</button>
                            <button type="button" aria-label={`Remove ${item.symbol} from watchlist`} onClick={() => removeSymbol(item.id)} className={`${rowAction} border-red-500/40 bg-red-500/10 text-red-300`}>Remove</button>
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}

            {!itemsLoading && filteredIdeas.length > 5 && <button type="button" className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-3 text-sm" onClick={() => setExpandedSelection(showAll ? null : selectionKey)}>{showAll ? 'Show five' : `Show all ${filteredIdeas.length}`}</button>}
            {!itemsLoading && !itemsError && <SourceLine source="Saved watchlist" tradingDay="Each symbol uses its own quote" basis="Cached prices stay labeled in details · no shared observation time" />}
            <CollapsibleSection title="List actions">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={runScanAll} className="inline-flex min-h-10 items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">Open Scanner</button>
                <button type="button" onClick={runConfluenceCheck} className="inline-flex min-h-10 items-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300">Refresh Prices</button>
                <button type="button" onClick={exportWatchlist} disabled={!canExportCSV(tier)} title={canExportCSV(tier) ? undefined : 'Pro plan required for CSV export'} className="inline-flex min-h-10 items-center rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-sm font-semibold text-purple-300 disabled:cursor-not-allowed disabled:opacity-50">Export Watchlist</button>
                <button type="button" onClick={() => launchTool('alert', filteredIdeas[0]?.item.symbol || '')} disabled={filteredIdeas.length === 0 || riskLocked} className="inline-flex min-h-10 items-center rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50">Set Alert (First Visible)</button>
              </div>
              {riskLocked && <div className="mt-2 text-sm text-rose-300">Setting alerts is disabled while Tracking lock is on.</div>}
            </CollapsibleSection>
          </div>
        ) : null}
      </div>

      {/* Create Watchlist Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-watchlist-title"
            className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700"
          >
            <h3 id="create-watchlist-title" className="text-lg font-semibold text-white mb-4">Create Watchlist</h3>
            
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
                      type="button"
                      aria-label={`Select ${c.name} color`}
                      aria-pressed={newColor === c.name}
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
                      type="button"
                      aria-label={`Select ${key} icon`}
                      aria-pressed={newIcon === key}
                      onClick={() => setNewIcon(key)}
                      className={`w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center 
                        text-xl transition-all
                        ${newIcon === key ? 'ring-2 ring-emerald-500 scale-110' : 'hover:bg-slate-600'}`}
                    >
                      <span aria-hidden="true">{icon}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-symbol-title"
            className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700"
          >
            <h3 id="add-symbol-title" className="text-lg font-semibold text-white mb-4">Add Symbol</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Symbol *</label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  placeholder="AAPL, BTC"
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
                  <option value="commodity">Commodity</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => { setShowAddSymbol(false); setNewSymbol(''); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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

      <ConfirmDialog
        open={!!pendingDeleteId}
        title="Delete Watchlist"
        message="Delete this watchlist and all its items?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDeleteWatchlist}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
