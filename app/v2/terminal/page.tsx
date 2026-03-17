'use client';

/* ---------------------------------------------------------------------------
   SURFACE 7: TERMINAL — Charts + Close Calendar + Options Chain + Flow
   Real APIs: /api/confluence-scan (POST), /api/flow, TradingView embed
   --------------------------------------------------------------------------- */

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useV2 } from '../_lib/V2Context';
import { useUserTier } from '@/lib/useUserTier';
import { useCachedTopSymbols } from '@/hooks/useCachedTopSymbols';

const OptionsTerminalView = dynamic(() => import('@/components/options-terminal/OptionsTerminalView'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500">Loading Options Terminal…</div> });
const CryptoTerminalView = dynamic(() => import('@/components/crypto-terminal/CryptoTerminalView'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500">Loading Crypto Terminal…</div> });
import {
  useCloseCalendar,
  useFlow,
  type CloseCalendarAnchor,
  type ForwardCloseScheduleRow,
  type ForwardCloseCluster,
  type ForwardCloseCalendar,
} from '../_lib/api';
import { Card, SectionHeader, Badge, UpgradeGate } from '../_components/ui';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

const TABS = ['Close Calendar', 'Options Terminal', 'Crypto', 'Flow'] as const;
const ANCHOR_OPTIONS: { value: CloseCalendarAnchor; label: string }[] = [
  { value: 'NOW', label: 'Now' },
  { value: 'TODAY', label: 'Today' },
  { value: 'PRIOR_DAY', label: 'Prior Day' },
  { value: 'EOW', label: 'End of Week' },
  { value: 'EOM', label: 'End of Month' },
];
const HORIZON_OPTIONS = [1, 3, 7, 14, 30] as const;

/* --- Close Calendar helpers --------------------------------------- */

function detectAssetClass(sym: string): 'crypto' | 'equity' {
  const s = sym.toUpperCase();
  if (s.endsWith('USD') && !['AUDUSD', 'EURUSD', 'NZDUSD', 'GBPUSD'].includes(s)) return 'crypto';
  if (['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK'].includes(s)) return 'crypto';
  return 'equity';
}

function formatCalDate(iso: string, asset: 'crypto' | 'equity'): string {
  const d = new Date(iso);
  const tz = asset === 'crypto' ? 'UTC' : 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const v = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const tzLabel = asset === 'crypto' ? 'UTC' : new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'ET';
  return `${v('weekday')} ${v('month')} ${v('day')} ${v('hour')}:${v('minute')} ${tzLabel}`;
}

function fmtMins(m: number | null): string {
  if (m === null) return '—';
  if (m <= 0) return 'NOW';
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) { const h = Math.floor(m/60); const r = Math.round(m%60); return r > 0 ? `${h}h ${r}m` : `${h}h`; }
  const d = Math.floor(m/1440); const h = Math.round((m%1440)/60);
  if (d >= 30) return `${Math.round(d/30)}mo`;
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function catColor(c: string) {
  switch(c){ case 'intraday': return 'text-slate-500'; case 'daily': return 'text-cyan-400'; case 'weekly': return 'text-emerald-400'; case 'monthly': return 'text-amber-400'; case 'yearly': return 'text-rose-400'; default: return 'text-slate-400'; }
}
function catBg(c: string) {
  switch(c){ case 'intraday': return 'bg-slate-800'; case 'daily': return 'bg-cyan-500/10'; case 'weekly': return 'bg-emerald-500/10'; case 'monthly': return 'bg-amber-500/10'; case 'yearly': return 'bg-rose-500/10'; default: return ''; }
}
function clusterColors(s: number) {
  if (s >= 70) return 'border-emerald-500/40 bg-emerald-500/10';
  if (s >= 40) return 'border-amber-500/40 bg-amber-500/10';
  return 'border-slate-700 bg-slate-900/30';
}

export default function TerminalPage() {
  const { tier } = useUserTier();
  const { selectedSymbol, selectSymbol, navigateTo } = useV2();
  const [tab, setTab] = useState<typeof TABS[number]>('Close Calendar');
  const [symInput, setSymInput] = useState(selectedSymbol || 'BTCUSD');

  /* Symbol management */
  const sym = selectedSymbol || symInput || 'BTCUSD';
  const asset = detectAssetClass(sym);

  /* Auto-switch away from Options Terminal for crypto symbols */
  useEffect(() => {
    if (asset === 'crypto' && tab === 'Options Terminal') setTab('Crypto');
  }, [asset, tab]);

  const handleSymSubmit = () => {
    const s = symInput.trim().toUpperCase();
    if (s) { selectSymbol(s); }
  };

  /* Quick symbols from worker cache */
  const cached = useCachedTopSymbols(5);
  const FALLBACK_QS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'];
  const quickSymbols = useMemo(() => {
    const cr = cached.crypto.map(c => c.symbol);
    const eq = cached.equity.map(c => c.symbol);
    const syms = [...cr, ...eq];
    return syms.length > 0 ? syms.slice(0, 10) : FALLBACK_QS;
  }, [cached.crypto, cached.equity]);

  /* Close Calendar state */
  const [anchor, setAnchor] = useState<CloseCalendarAnchor>('TODAY');
  const [horizon, setHorizon] = useState(1);
  const [calFilter, setCalFilter] = useState<'all'|'daily'|'weekly'|'monthly'|'yearly'>('all');
  const [showAnchorDay, setShowAnchorDay] = useState(true);
  const calendar = useCloseCalendar(sym, anchor, horizon);
  const calData = calendar.data as ForwardCloseCalendar | null;

  const isPriorDay = anchor === 'PRIOR_DAY';
  const isEquity = asset === 'equity';

  const stripIntraday = (rows: ForwardCloseScheduleRow[]) => isEquity ? rows.filter(r => r.category !== 'intraday') : rows;
  const filteredSchedule = stripIntraday(calData?.schedule.filter(r => calFilter === 'all' || r.category === calFilter) ?? []);
  const anchorDayRows = stripIntraday(calData?.closesOnAnchorDay ?? []);

  useEffect(() => { if (anchor === 'PRIOR_DAY') setShowAnchorDay(true); }, [anchor]);

  /* Flow */
  const flow = useFlow(sym, asset);

  return (
    <div className="space-y-6">
      <SectionHeader title="Terminal" subtitle={asset === 'crypto' ? 'Close Calendar — Crypto — Flow' : 'Close Calendar — Options Terminal — Crypto — Flow'} />

      {/* Symbol Bar */}
      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={symInput}
            onChange={e => setSymInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSymSubmit()}
            placeholder="Symbol..."
            className="w-28 bg-[#0A101C] border border-[var(--msp-border)] rounded-lg text-xs px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 font-mono"
          />
          <button onClick={handleSymSubmit} className="px-3 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors">
            Load
          </button>
          <span className="text-xs text-slate-400 ml-1">{sym}</span>
          <Badge label={asset.toUpperCase()} color={asset === 'crypto' ? '#F59E0B' : '#6366F1'} small />

          <div className="flex gap-1 ml-auto flex-wrap">
            {quickSymbols.map(s => (
              <button key={s} onClick={() => { selectSymbol(s); setSymInput(s); }} className={`px-2 py-1 text-[10px] rounded border transition-colors ${sym === s ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.filter(t => !(t === 'Options Terminal' && asset === 'crypto')).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${tab === t ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* -- CLOSE CALENDAR ------------------------------------------- */}
      {tab === 'Close Calendar' && (
        <div className="space-y-4">
          {/* Controls */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {isPriorDay ? 'Close Calendar — Prior Day Closes' : 'Close Calendar — Forward Schedule'}
                </div>
                <div className="text-xs text-slate-400">
                  {isPriorDay
                    ? `Which timeframes closed on the most recent ${isEquity ? 'trading' : 'calendar'} day?`
                    : 'Which timeframes close on your target day? Where do closes stack?'}
                </div>
              </div>
              <button onClick={() => calendar.refetch()} disabled={calendar.loading} className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-xs font-semibold text-slate-100 disabled:opacity-40">
                {calendar.loading ? 'Loading…' : '? Refresh'}
              </button>
            </div>

            {/* Anchor selector */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Anchor</label>
                <div className="flex gap-1 overflow-x-auto">
                  {ANCHOR_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setAnchor(o.value)} className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${anchor === o.value ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)] border border-[var(--msp-border)] hover:text-slate-200'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {!isPriorDay && (
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Horizon</label>
                  <div className="flex gap-1">
                    {HORIZON_OPTIONS.map(d => (
                      <button key={d} onClick={() => setHorizon(d)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${horizon === d ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-slate-950/40 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {calendar.error && <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{calendar.error}</div>}

          {calendar.loading && !calData && (
            <Card><div className="py-8 text-center text-xs text-slate-500">Computing forward close schedule…</div></Card>
          )}

          {calData && (
            <>
              {/* Anchor info strip */}
              <Card>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="text-slate-400">{isPriorDay ? 'Prior Day' : 'Anchor'}: <span className="font-semibold text-slate-200">{formatCalDate(calData.anchorTimeISO, asset)}</span></span>
                  {!isPriorDay && <span className="text-slate-400">Horizon: <span className="font-semibold text-slate-200">{calData.horizonDays}d ? {formatCalDate(calData.horizonEndISO, asset)}</span></span>}
                  <span className="text-slate-400">Daily+ closes: <span className="font-semibold text-emerald-400">{calData.totalCloseEventsInHorizon}</span></span>
                </div>
              </Card>

              {/* Close Cluster Timeline */}
              {calData.forwardClusters.length > 0 && (
                <Card>
                  <div className="mb-2 text-xs font-semibold text-slate-300">Close Cluster Timeline</div>
                  <div className="flex flex-wrap gap-2">
                    {calData.forwardClusters.slice(0, 8).map((cluster, i) => (
                      <div key={i} className={`rounded-xl border px-3 py-2 cursor-pointer hover:ring-1 hover:ring-slate-500/40 transition-all ${clusterColors(cluster.clusterScore)}`}>
                        <div className="text-[11px] font-semibold text-slate-100">{cluster.label}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {cluster.tfs.map(tf => (<span key={tf} className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200">{tf}</span>))}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">Wt {Math.round(cluster.weight)} — Score {cluster.clusterScore}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Toggle anchor day vs full schedule */}
              <div className="flex items-center gap-2 px-1">
                <button onClick={() => setShowAnchorDay(true)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${showAnchorDay ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                  {isPriorDay ? 'Prior Day Closes' : 'Closes on Anchor Day'} ({anchorDayRows.length})
                </button>
                {!isPriorDay && (
                  <button onClick={() => setShowAnchorDay(false)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${!showAnchorDay ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}>
                    Full Schedule ({filteredSchedule.length})
                  </button>
                )}
                {!showAnchorDay && (
                  <div className="ml-auto flex gap-1">
                    {(['all','daily','weekly','monthly','yearly'] as const).map(f => (
                      <button key={f} onClick={() => setCalFilter(f)} className={`rounded px-2 py-1 text-[10px] font-medium uppercase ${calFilter === f ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Schedule table */}
              <Card>
                {showAnchorDay ? (
                  <AnchorDayTable rows={anchorDayRows} asset={asset} />
                ) : (
                  <FullScheduleTable rows={filteredSchedule} asset={asset} />
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* -- OPTIONS TERMINAL ----------------------------------------------- */}
      {tab === 'Options Terminal' && (
        <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Options Terminal">
          <Suspense fallback={<div className="py-12 text-center text-xs text-slate-500">Loading Options Terminal…</div>}>
            <OptionsTerminalView />
          </Suspense>
        </UpgradeGate>
      )}

      {/* -- CRYPTO TERMINAL ------------------------------------------------ */}
      {tab === 'Crypto' && (
        <Suspense fallback={<div className="py-12 text-center text-xs text-slate-500">Loading Crypto Terminal…</div>}>
          <CryptoTerminalView />
        </Suspense>
      )}
      {/* -- FLOW ----------------------------------------------------- */}
      {tab === 'Flow' && (() => {
        const fd = flow.data?.data;
        const brain = fd?.brain_decision_v1;
        const rg = fd?.institutional_risk_governor;
        const pm = fd?.probability_matrix;
        const perm = fd?.flow_trade_permission;
        const fs = fd?.flow_state;
        const session = fd?.session_overlay;
        const biasColor = fd?.bias === 'bullish' ? 'text-emerald-400' : fd?.bias === 'bearish' ? 'text-red-400' : 'text-slate-300';
        const modeColor = fd?.market_mode === 'launch' ? 'text-emerald-400' : fd?.market_mode === 'pin' ? 'text-amber-400' : 'text-slate-400';
        const gammaColor = fd?.gamma_state === 'Positive' ? 'text-emerald-400' : fd?.gamma_state === 'Negative' ? 'text-red-400' : 'text-amber-400';

        return (
        <div className="space-y-4">
          {flow.loading ? (
            <Card><div className="space-y-3 py-8">{[1,2,3].map(i => <Skel key={i} h="h-10" />)}</div></Card>
          ) : flow.error ? (
            <Card><div className="text-xs text-red-400/60 py-4 text-center">Flow data unavailable: {flow.error}</div></Card>
          ) : fd ? (
            <>
              {/* Header Strip */}
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-white">Capital Flow — {sym}</h3>
                  <div className="flex items-center gap-2">
                    {fd.asof && <span className="text-[10px] text-slate-500">as of {new Date(fd.asof).toLocaleTimeString()}</span>}
                    <button onClick={() => flow.refetch()} className="px-2 py-1 text-[10px] rounded border border-slate-700 text-slate-300 hover:bg-slate-800">
                      ?
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase">Bias</div>
                    <div className={`text-lg font-bold capitalize ${biasColor}`}>{fd.bias || '—'}</div>
                  </div>
                  <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase">Mode</div>
                    <div className={`text-lg font-bold capitalize ${modeColor}`}>{fd.market_mode || '—'}</div>
                  </div>
                  <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase">Gamma</div>
                    <div className={`text-lg font-bold ${gammaColor}`}>{fd.gamma_state || '—'}</div>
                  </div>
                  <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase">Conviction</div>
                    <div className="text-lg font-bold text-white">{fd.conviction?.toFixed(0) ?? '—'}%</div>
                  </div>
                  <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase">Spot</div>
                    <div className="text-lg font-bold text-white">${fd.spot?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</div>
                  </div>
                </div>
              </Card>

              {/* Probability Matrix */}
              {pm && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3">Probability Matrix</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Continuation</div>
                      <div className="text-base font-bold text-white">{pm.continuation.toFixed(0)}%</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Pin / Reversion</div>
                      <div className="text-base font-bold text-white">{pm.pinReversion.toFixed(0)}%</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Expansion</div>
                      <div className="text-base font-bold text-white">{pm.expansion.toFixed(0)}%</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Regime</div>
                      <div className="text-base font-bold text-emerald-400">{pm.regime}</div>
                    </div>
                  </div>
                  {pm.decision && <div className="text-xs text-slate-400 bg-[var(--msp-panel-2)]/80 rounded-lg px-3 py-2">{pm.decision.replace(/_/g, ' ')}</div>}
                </Card>
              )}

              {/* Brain Decision */}
              {brain && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3">Brain Decision</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Brain Score</div>
                      <div className="text-base font-bold text-white">{brain.brain_score?.score?.toFixed(0) ?? fd.brain_decision?.score?.toFixed(0) ?? '—'}</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Permission</div>
                      <div className={`text-base font-bold ${brain.brain_score?.permission === 'ALLOW' || fd.brain_decision?.permission === 'ALLOW' ? 'text-emerald-400' : brain.brain_score?.permission === 'BLOCK' || fd.brain_decision?.permission === 'BLOCK' ? 'text-red-400' : 'text-amber-400'}`}>
                        {brain.brain_score?.permission ?? fd.brain_decision?.permission ?? '—'}
                      </div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Risk Mode</div>
                      <div className="text-base font-bold text-white">{brain.brain_score?.mode ?? fd.brain_decision?.mode ?? '—'}</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Regime</div>
                      <div className="text-base font-bold text-white">{brain.market_regime?.regime?.replace(/_/g, ' ') ?? '—'}</div>
                    </div>
                  </div>
                  {(brain.brain_score?.state_summary ?? fd.brain_decision?.stateSummary) && (
                    <div className="text-xs text-slate-400 bg-[var(--msp-panel-2)]/80 rounded-lg px-3 py-2">
                      {brain.brain_score?.state_summary ?? fd.brain_decision?.stateSummary}
                    </div>
                  )}
                </Card>
              )}

              {/* Execution Plan */}
              {(brain?.execution_plan || fd.brain_decision?.plan) && (() => {
                const plan = brain?.execution_plan || fd.brain_decision?.plan;
                return (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3">Execution Plan</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Entry Type</div>
                      <div className="text-sm font-bold text-white capitalize">{plan.entry_type ?? plan.entryType ?? '—'}</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Size</div>
                      <div className="text-sm font-bold text-white">{typeof plan.size === 'number' ? `${(plan.size * 100).toFixed(0)}%` : '—'}</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Stop Rule</div>
                      <div className="text-xs text-slate-300">{plan.stop_rule ?? plan.stopRule ?? '—'}</div>
                    </div>
                  </div>
                  {(plan.triggers || plan.targets) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {plan.triggers?.length > 0 && (
                        <div className="bg-[var(--msp-panel-2)]/80 rounded-lg px-3 py-2">
                          <div className="text-[10px] text-slate-500 uppercase mb-1">Triggers</div>
                          {plan.triggers.map((t: string, i: number) => <div key={i} className="text-xs text-slate-300">• {t}</div>)}
                        </div>
                      )}
                      {plan.targets?.length > 0 && (
                        <div className="bg-[var(--msp-panel-2)]/80 rounded-lg px-3 py-2">
                          <div className="text-[10px] text-slate-500 uppercase mb-1">Targets</div>
                          {plan.targets.map((t: string, i: number) => <div key={i} className="text-xs text-slate-300">• {t}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
                );
              })()}

              {/* Trade Permission & Risk Governor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {perm && (
                  <Card>
                    <h3 className="text-sm font-semibold text-white mb-3">Trade Permission</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">TPS</span>
                        <span className="text-white font-mono">{perm.tps?.toFixed(0) ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Risk Mode</span>
                        <span className="text-white">{perm.riskMode ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Size Multiplier</span>
                        <span className="text-white font-mono">{perm.sizeMultiplier?.toFixed(2) ?? '—'}x</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Stop Style</span>
                        <span className="text-white">{perm.stopStyle?.replace(/_/g, ' ') ?? '—'}</span>
                      </div>
                      {perm.blocked && <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">? Trading blocked: {perm.noTradeMode?.reason || 'risk limit'}</div>}
                      {perm.allowed?.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] text-slate-500 uppercase mb-1">Allowed</div>
                          <div className="flex flex-wrap gap-1">
                            {perm.allowed.map((a: string, i: number) => <span key={i} className="text-[10px] bg-emerald-500/10 text-emerald-400 rounded px-1.5 py-0.5">{a}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {rg && (
                  <Card>
                    <h3 className="text-sm font-semibold text-white mb-3">Risk Governor</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">IRS Score</span>
                        <span className="text-white font-mono">{rg.irs?.toFixed(0) ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Risk Mode</span>
                        <span className={`font-semibold ${rg.riskMode === 'FULL_OFFENSE' ? 'text-emerald-400' : rg.riskMode === 'LOCKDOWN' ? 'text-red-400' : rg.riskMode === 'DEFENSIVE' ? 'text-amber-400' : 'text-white'}`}>{rg.riskMode ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Execution</span>
                        <span className={rg.executionAllowed ? 'text-emerald-400' : 'text-red-400'}>{rg.executionAllowed ? 'Allowed' : 'Blocked'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Vol Regime</span>
                        <span className="text-white">{rg.volatility?.regime ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Final Size</span>
                        <span className="text-white font-mono">{typeof rg.sizing?.finalSize === 'number' ? `${(rg.sizing.finalSize * 100).toFixed(0)}%` : '—'}</span>
                      </div>
                      {rg.hardBlocked && rg.hardBlockReasons?.length > 0 && (
                        <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                          ? {rg.hardBlockReasons.join('; ')}
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </div>

              {/* Liquidity Levels */}
              {fd.liquidity_levels?.length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3">Liquidity Levels</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--msp-border)]">
                          <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Level</th>
                          <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Label</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Probability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fd.liquidity_levels.map((lv: any, i: number) => (
                          <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                            <td className="py-2 px-2 font-mono text-white">${lv.level?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="py-2 px-2">
                              <Badge label={lv.label?.replace(/_/g, ' ')} color={
                                lv.label?.includes('HIGH') || lv.label === 'ONH' || lv.label === 'PDH' || lv.label === 'EQH' ? '#EF4444'
                                : lv.label?.includes('LOW') || lv.label === 'ONL' || lv.label === 'PDL' || lv.label === 'EQL' ? '#10B981'
                                : '#94A3B8'
                              } small />
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-300">{typeof lv.prob === 'number' ? `${(lv.prob * 100).toFixed(0)}%` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Key Strikes & Flip Zones */}
              {(fd.key_strikes?.length > 0 || fd.flip_zones?.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fd.key_strikes?.length > 0 && (
                    <Card>
                      <h3 className="text-sm font-semibold text-white mb-3">Key Strikes</h3>
                      <div className="space-y-1">
                        {fd.key_strikes.map((ks: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-800/30">
                            <span className="font-mono text-white">${ks.strike?.toLocaleString()}</span>
                            <span className="text-slate-400">Gravity: {ks.gravity?.toFixed(1)}</span>
                            <Badge label={ks.type?.replace(/-/g, ' ')} color={ks.type === 'call-heavy' ? '#10B981' : ks.type === 'put-heavy' ? '#EF4444' : '#94A3B8'} small />
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  {fd.flip_zones?.length > 0 && (
                    <Card>
                      <h3 className="text-sm font-semibold text-white mb-3">Flip Zones</h3>
                      <div className="space-y-1">
                        {fd.flip_zones.map((fz: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-800/30">
                            <span className="font-mono text-white">${fz.level?.toLocaleString()}</span>
                            <Badge label={fz.direction?.replace(/_/g, ' ')} color={fz.direction?.includes('bullish') ? '#10B981' : '#EF4444'} small />
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {/* Session Overlay */}
              {session && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3">Session Context</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Phase</div>
                      <div className="text-sm font-bold text-white capitalize">{session.phase?.replace(/_/g, ' ') ?? '—'}</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Size Cap</div>
                      <div className="text-sm font-bold text-white">{typeof session.size_cap_multiplier === 'number' ? `${(session.size_cap_multiplier * 100).toFixed(0)}%` : '—'}</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Tradable</div>
                      <div className={`text-sm font-bold ${session.tradable ? 'text-emerald-400' : 'text-red-400'}`}>{session.tradable ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Scalp OK</div>
                      <div className={`text-sm font-bold ${session.scalp_ok ? 'text-emerald-400' : 'text-slate-500'}`}>{session.scalp_ok ? 'Yes' : 'No'}</div>
                    </div>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card><div className="text-xs text-slate-500 py-8 text-center">Enter a symbol above and load to see capital flow data</div></Card>
          )}
        </div>
        );
      })()}
    </div>
  );
}

/* ??????????????????????????????????????????????????????????????????? */
/*  Sub-components                                                      */
/* ??????????????????????????????????????????????????????????????????? */

function AnchorDayTable({ rows, asset }: { rows: ForwardCloseScheduleRow[]; asset: 'crypto' | 'equity' }) {
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-slate-500">No daily+ timeframes close on the anchor day.</div>;

  const groups = new Map<string, ForwardCloseScheduleRow[]>();
  for (const r of rows) { if (!groups.has(r.category)) groups.set(r.category, []); groups.get(r.category)!.push(r); }
  const catOrder = ['intraday', 'daily', 'weekly', 'monthly', 'yearly'];

  return (
    <div className="space-y-3">
      {catOrder.map(cat => {
        const catRows = groups.get(cat);
        if (!catRows?.length) return null;
        return (
          <div key={cat}>
            <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${catColor(cat)}`}>{cat}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-1.5 pr-3 font-medium">TF</th>
                  <th className="pb-1.5 pr-3 font-medium">Close Time</th>
                  <th className="pb-1.5 pr-3 font-medium">In</th>
                  <th className="pb-1.5 font-medium">Weight</th>
                </tr></thead>
                <tbody>{catRows.map(row => (
                  <tr key={row.tf} className={`border-b border-slate-800/50 ${catBg(cat)}`}>
                    <td className={`py-1.5 pr-3 font-semibold ${catColor(cat)}`}>{row.tf}</td>
                    <td className="py-1.5 pr-3 font-mono text-slate-300">{row.firstCloseAtISO ? formatCalDate(row.firstCloseAtISO, asset) : '—'}</td>
                    <td className="py-1.5 pr-3 font-mono text-slate-400">{fmtMins(row.minsToFirstClose)}</td>
                    <td className="py-1.5 text-slate-500">{row.weight}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FullScheduleTable({ rows, asset }: { rows: ForwardCloseScheduleRow[]; asset: 'crypto' | 'equity' }) {
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-slate-500">No closes in selected range.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs" style={{ minWidth: 600 }}>
        <thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
          <th className="pb-1.5 pr-3 font-medium">TF</th>
          <th className="pb-1.5 pr-3 font-medium">Category</th>
          <th className="pb-1.5 pr-3 font-medium">Next Close</th>
          <th className="pb-1.5 pr-3 font-medium">In</th>
          <th className="pb-1.5 pr-3 font-medium">Closes</th>
          <th className="pb-1.5 pr-3 font-medium">Anchor Day</th>
          <th className="pb-1.5 font-medium">Weight</th>
        </tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.tf} className={`border-b border-slate-800/50 ${row.closesOnAnchorDay ? catBg(row.category) : ''}`}>
            <td className={`py-1.5 pr-3 font-semibold ${catColor(row.category)}`}>{row.tf}</td>
            <td className="py-1.5 pr-3"><span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${catBg(row.category)} ${catColor(row.category)}`}>{row.category}</span></td>
            <td className="py-1.5 pr-3 font-mono text-slate-300">{row.firstCloseAtISO ? formatCalDate(row.firstCloseAtISO, asset) : '—'}</td>
            <td className="py-1.5 pr-3 font-mono text-slate-400">{fmtMins(row.minsToFirstClose)}</td>
            <td className="py-1.5 pr-3 text-center font-semibold text-slate-200">{row.closesInHorizon}</td>
            <td className="py-1.5 pr-3 text-center">{row.closesOnAnchorDay ? <span className="inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">YES</span> : <span className="text-slate-600">—</span>}</td>
            <td className="py-1.5 text-slate-500">{row.weight}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
