'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 6: WORKSPACE — Watchlists, Journal, Portfolio, Settings
   Real APIs: /api/watchlists, /api/journal, links to v1 portfolio & settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useV2 } from '../_lib/V2Context';
import { useJournal, type JournalEntry } from '../_lib/api';
import { Card, SectionHeader, Badge } from '../_components/ui';
import { RiskPermissionProvider } from '@/components/risk/RiskPermissionContext';

const WatchlistWidget = dynamic(() => import('@/components/WatchlistWidget'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

const TABS = ['Watchlists', 'Journal', 'Portfolio', 'Settings'] as const;



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

  const journal = useJournal();

  const [busy, setBusy] = useState(false);

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
      {tab === 'Watchlists' && <RiskPermissionProvider><WatchlistWidget /></RiskPermissionProvider>}

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
