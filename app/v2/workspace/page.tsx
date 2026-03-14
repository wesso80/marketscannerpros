'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 6: WORKSPACE — Watchlists, Journal, Portfolio, Settings
   Real APIs: /api/watchlists, /api/journal, links to v1 portfolio & settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useCallback, useEffect } from 'react';
import { useV2 } from '../_lib/V2Context';
import { useWatchlists, useJournal, fetchWatchlistItems, type JournalEntry } from '../_lib/api';
import { Card, SectionHeader, Badge } from '../_components/ui';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

const TABS = ['Watchlists', 'Journal', 'Portfolio', 'Settings'] as const;

/* ─── Watchlist CRUD helpers ─────────────────────────────────────── */
async function addToWatchlist(listId: string, symbol: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/watchlists/${listId}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    return r.ok;
  } catch { return false; }
}

async function removeFromWatchlist(listId: string, itemId: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/watchlists/${listId}/items/${itemId}`, { method: 'DELETE' });
    return r.ok;
  } catch { return false; }
}

async function createWatchlist(name: string): Promise<boolean> {
  try {
    const r = await fetch('/api/watchlists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return r.ok;
  } catch { return false; }
}

async function deleteWatchlist(listId: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/watchlists/${listId}`, { method: 'DELETE' });
    return r.ok;
  } catch { return false; }
}

/* ─── Journal CRUD helpers ───────────────────────────────────────── */
async function createJournalEntry(entry: Partial<JournalEntry>): Promise<boolean> {
  try {
    const r = await fetch('/api/journal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return r.ok;
  } catch { return false; }
}

async function deleteJournalEntry(entryId: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/journal/${entryId}`, { method: 'DELETE' });
    return r.ok;
  } catch { return false; }
}

export default function WorkspacePage() {
  const { navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState<typeof TABS[number]>('Watchlists');

  const watchlists = useWatchlists();
  const journal = useJournal();

  /* ─── Watchlist state ───────────────────────────── */
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [addSymbol, setAddSymbol] = useState('');
  const [busy, setBusy] = useState(false);

  const lists = watchlists.data?.watchlists || [];
  const currentList = lists.find((l: any) => l.id === selectedList) || lists[0];

  /* Fetch items for the current list */
  const [listItems, setListItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const refreshItems = useCallback(async () => {
    if (!currentList?.id) { setListItems([]); return; }
    setItemsLoading(true);
    try {
      const res = await fetchWatchlistItems(currentList.id);
      setListItems(res?.items || []);
    } catch { setListItems([]); }
    setItemsLoading(false);
  }, [currentList?.id]);

  useEffect(() => { refreshItems(); }, [refreshItems]);

  const handleCreateList = useCallback(async () => {
    if (!newListName.trim()) return;
    setBusy(true);
    const ok = await createWatchlist(newListName.trim());
    setBusy(false);
    if (ok) { setNewListName(''); watchlists.refetch(); }
  }, [newListName, watchlists]);

  const handleAddSymbol = useCallback(async () => {
    if (!currentList || !addSymbol.trim()) return;
    setBusy(true);
    const ok = await addToWatchlist(currentList.id, addSymbol.trim().toUpperCase());
    setBusy(false);
    if (ok) { setAddSymbol(''); watchlists.refetch(); refreshItems(); }
  }, [addSymbol, currentList, watchlists, refreshItems]);

  const handleRemoveItem = useCallback(async (itemId: string) => {
    if (!currentList) return;
    setBusy(true);
    await removeFromWatchlist(currentList.id, itemId);
    setBusy(false);
    watchlists.refetch();
    refreshItems();
  }, [currentList, watchlists, refreshItems]);

  const handleDeleteList = useCallback(async (listId: string) => {
    setBusy(true);
    await deleteWatchlist(listId);
    setBusy(false);
    setSelectedList(null);
    watchlists.refetch();
  }, [watchlists]);

  /* ─── Journal state ─────────────────────────────── */
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [jSymbol, setJSymbol] = useState('');
  const [jDirection, setJDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [jEntry, setJEntry] = useState('');
  const [jStop, setJStop] = useState('');
  const [jTarget, setJTarget] = useState('');
  const [jNotes, setJNotes] = useState('');

  const journalEntries = journal.data?.entries || [];

  const handleCreateJournalEntry = useCallback(async () => {
    if (!jSymbol.trim()) return;
    setBusy(true);
    const ok = await createJournalEntry({
      symbol: jSymbol.trim().toUpperCase(),
      side: jDirection,
      entryPrice: jEntry ? parseFloat(jEntry) : 0,
      exitPrice: 0,
      quantity: 0,
      pl: 0,
      plPercent: 0,
      strategy: '',
      setup: '',
      notes: jNotes,
      outcome: 'open',
      isOpen: true,
      tags: [],
      date: new Date().toISOString(),
    } as any);
    setBusy(false);
    if (ok) {
      setJSymbol(''); setJEntry(''); setJStop(''); setJTarget(''); setJNotes('');
      setShowJournalForm(false);
      journal.refetch();
    }
  }, [jSymbol, jDirection, jEntry, jStop, jTarget, jNotes, journal]);

  const handleDeleteJournal = useCallback(async (entryId: string) => {
    setBusy(true);
    await deleteJournalEntry(entryId);
    setBusy(false);
    journal.refetch();
  }, [journal]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Workspace" subtitle="Your personal trading workspace" />

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${tab === t ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── WATCHLISTS ─────────────────────────────────────────────── */}
      {tab === 'Watchlists' && (
        <div className="space-y-4">
          {watchlists.loading ? (
            <Card><div className="space-y-3">{[1,2,3].map(i => <Skel key={i} h="h-8" />)}</div></Card>
          ) : (
            <>
              {/* List selector + create */}
              <Card>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {lists.map((l: any) => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedList(l.id)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${(currentList?.id === l.id) ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-slate-700/30'}`}
                    >
                      {l.name} ({l.item_count || 0})
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    placeholder="New watchlist name..."
                    className="flex-1 bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40"
                    onKeyDown={e => e.key === 'Enter' && handleCreateList()}
                  />
                  <button onClick={handleCreateList} disabled={busy || !newListName.trim()} className="px-3 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors">
                    + Create
                  </button>
                </div>
              </Card>

              {/* Current watchlist items */}
              {currentList && (
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">{currentList.name}</h3>
                    <button onClick={() => handleDeleteList(currentList.id)} className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors">
                      Delete List
                    </button>
                  </div>

                  {/* Add symbol */}
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      value={addSymbol}
                      onChange={e => setAddSymbol(e.target.value)}
                      placeholder="Add symbol (e.g. AAPL, BTC)..."
                      className="flex-1 bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40"
                      onKeyDown={e => e.key === 'Enter' && handleAddSymbol()}
                    />
                    <button onClick={handleAddSymbol} disabled={busy || !addSymbol.trim()} className="px-3 py-2 text-xs rounded-lg bg-slate-800/60 text-slate-300 border border-slate-700/30 hover:bg-slate-700/40 disabled:opacity-40 transition-colors">
                      + Add
                    </button>
                  </div>

                  {/* Items */}
                  {listItems.length > 0 ? (
                    <div className="space-y-1">
                      {listItems.map((item: any) => (
                        <div key={item.id || item.symbol} className="flex items-center justify-between text-xs py-2 px-2 rounded-lg hover:bg-slate-800/40 group">
                          <button onClick={() => { selectSymbol(item.symbol); navigateTo('golden-egg', item.symbol); }} className="text-left flex-1">
                            <span className="font-semibold text-white">{item.symbol}</span>
                            {item.price && <span className="text-slate-400 ml-3 font-mono">${item.price}</span>}
                            {item.change_percent != null && <span className={`ml-2 ${item.change_percent > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.change_percent > 0 ? '+' : ''}{item.change_percent.toFixed(2)}%</span>}
                          </button>
                          <button onClick={() => handleRemoveItem(item.id)} className="text-red-400/40 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-all ml-2">
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-4 text-center">No symbols in this watchlist</div>
                  )}
                </Card>
              )}

              {lists.length === 0 && (
                <Card>
                  <div className="text-xs text-slate-500 py-8 text-center">
                    No watchlists yet. Create one above to get started.
                  </div>
                </Card>
              )}
            </>
          )}
          {watchlists.error && <div className="text-[10px] text-red-400/60">Error: {watchlists.error}</div>}
        </div>
      )}

      {/* ── JOURNAL ────────────────────────────────────────────────── */}
      {tab === 'Journal' && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Trade Journal</h3>
              <button onClick={() => setShowJournalForm(!showJournalForm)} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors">
                {showJournalForm ? 'Cancel' : '+ New Entry'}
              </button>
            </div>

            {showJournalForm && (
              <div className="bg-[#0A101C]/50 rounded-lg p-3 mb-3 space-y-2 border border-slate-700/30">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <input value={jSymbol} onChange={e => setJSymbol(e.target.value)} placeholder="Symbol*" className="bg-[#0A101C] border border-slate-700/40 rounded text-xs px-2 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40" />
                  <select value={jDirection} onChange={e => setJDirection(e.target.value as any)} className="bg-[#0A101C] border border-slate-700/40 rounded text-xs px-2 py-1.5 text-white focus:outline-none focus:border-emerald-600/40">
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                  <input value={jEntry} onChange={e => setJEntry(e.target.value)} placeholder="Entry price" type="number" className="bg-[#0A101C] border border-slate-700/40 rounded text-xs px-2 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40" />
                  <input value={jStop} onChange={e => setJStop(e.target.value)} placeholder="Stop loss" type="number" className="bg-[#0A101C] border border-slate-700/40 rounded text-xs px-2 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={jTarget} onChange={e => setJTarget(e.target.value)} placeholder="Target price" type="number" className="bg-[#0A101C] border border-slate-700/40 rounded text-xs px-2 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40" />
                  <input value={jNotes} onChange={e => setJNotes(e.target.value)} placeholder="Notes..." className="bg-[#0A101C] border border-slate-700/40 rounded text-xs px-2 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40" />
                </div>
                <button onClick={handleCreateJournalEntry} disabled={busy || !jSymbol.trim()} className="w-full py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors">
                  Save Entry
                </button>
              </div>
            )}
          </Card>

          {journal.loading ? (
            <Card><div className="space-y-3">{[1,2,3].map(i => <Skel key={i} h="h-10" />)}</div></Card>
          ) : journalEntries.length === 0 ? (
            <Card><div className="text-xs text-slate-500 py-8 text-center">No journal entries yet. Start logging your trades!</div></Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Date</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Symbol</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Side</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Entry</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Exit</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">P/L</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Notes</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalEntries.map((e: JournalEntry) => (
                      <tr key={e.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 group">
                        <td className="py-2 px-2 text-slate-400">{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                        <td className="py-2 px-2 text-white font-semibold cursor-pointer hover:text-emerald-400" onClick={() => { selectSymbol(e.symbol); navigateTo('golden-egg', e.symbol); }}>{e.symbol}</td>
                        <td className="py-2 px-2"><Badge label={e.side} color={e.side === 'LONG' || e.side === 'long' ? '#10B981' : '#EF4444'} small /></td>
                        <td className="py-2 px-2 text-right font-mono text-slate-300">{e.entryPrice ? `$${e.entryPrice}` : '—'}</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-400">{e.exitPrice ? `$${e.exitPrice}` : '—'}</td>
                        <td className={`py-2 px-2 text-right font-mono ${e.pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{e.pl != null ? `$${e.pl.toFixed(2)}` : '—'}</td>
                        <td className="py-2 px-2 text-slate-400 max-w-[120px] truncate">{e.notes || '—'}</td>
                        <td className="py-2 px-2 text-right">
                          <button onClick={() => handleDeleteJournal(String(e.id))} className="text-red-400/30 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-all">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {journal.error && <div className="text-[10px] text-red-400/60">Error: {journal.error}</div>}
        </div>
      )}

      {/* ── PORTFOLIO ──────────────────────────────────────────────── */}
      {tab === 'Portfolio' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Portfolio Tracker</h3>
          <div className="text-center py-12">
            <div className="text-slate-500 text-xs mb-4">
              Portfolio management is available in the full platform.
            </div>
            <a
              href="/tools/portfolio"
              target="_blank"
              className="px-4 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors inline-block"
            >
              Open Portfolio Tracker →
            </a>
          </div>
        </Card>
      )}

      {/* ── SETTINGS ───────────────────────────────────────────────── */}
      {tab === 'Settings' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Workspace Settings</h3>
          <div className="text-center py-12">
            <div className="text-slate-500 text-xs mb-4">
              Account settings and preferences are managed in the main dashboard.
            </div>
            <a
              href="/account"
              target="_blank"
              className="px-4 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors inline-block"
            >
              Open Account Settings →
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
