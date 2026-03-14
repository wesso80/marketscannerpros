'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 7: TERMINAL — Charts + Close Calendar + Options Chain + Flow
   Real APIs: /api/confluence-scan (POST), /api/options-scan (POST),
              /api/flow, TradingView embed
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useV2 } from '../_lib/V2Context';
import {
  useCloseCalendar,
  useOptionsScan,
  useDVE,
  useScannerResults,
  type CloseCalendarAnchor,
  type ForwardCloseScheduleRow,
  type ForwardCloseCluster,
  type ForwardCloseCalendar,
} from '../_lib/api';
import { Card, SectionHeader, Badge } from '../_components/ui';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

const TABS = ['Chart', 'Close Calendar', 'Options', 'Flow'] as const;
const ANCHOR_OPTIONS: { value: CloseCalendarAnchor; label: string }[] = [
  { value: 'NOW', label: 'Now' },
  { value: 'TODAY', label: 'Today' },
  { value: 'PRIOR_DAY', label: 'Prior Day' },
  { value: 'EOW', label: 'End of Week' },
  { value: 'EOM', label: 'End of Month' },
];
const HORIZON_OPTIONS = [1, 3, 7, 14, 30] as const;

/* ─── Close Calendar helpers ─────────────────────────────────────── */

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
  const { selectedSymbol, selectSymbol, navigateTo } = useV2();
  const [tab, setTab] = useState<typeof TABS[number]>('Close Calendar');
  const [symInput, setSymInput] = useState(selectedSymbol || 'BTCUSD');

  /* Symbol management */
  const sym = selectedSymbol || symInput || 'BTCUSD';
  const asset = detectAssetClass(sym);

  const handleSymSubmit = () => {
    const s = symInput.trim().toUpperCase();
    if (s) { selectSymbol(s); }
  };

  /* Quick symbols from scanner */
  const equityScanner = useScannerResults('equity');
  const cryptoScanner = useScannerResults('crypto');
  const quickSymbols = useMemo(() => {
    const eq = (equityScanner.data?.results || []).slice(0, 5).map(r => r.symbol);
    const cr = (cryptoScanner.data?.results || []).slice(0, 5).map(r => r.symbol);
    return [...cr, ...eq];
  }, [equityScanner.data, cryptoScanner.data]);

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

  /* Options */
  const optionsScan = useOptionsScan(sym);
  const dve = useDVE(sym);

  return (
    <div className="space-y-4">
      <SectionHeader title="Terminal" subtitle="Chart · Close Calendar · Options · Flow" />

      {/* Symbol Bar */}
      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={symInput}
            onChange={e => setSymInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSymSubmit()}
            placeholder="Symbol..."
            className="w-28 bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 font-mono"
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
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${tab === t ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── CHART (TradingView embed) ──────────────────────────────── */}
      {tab === 'Chart' && (
        <Card>
          <TVChart symbol={sym} asset={asset} />
        </Card>
      )}

      {/* ── CLOSE CALENDAR ─────────────────────────────────────────── */}
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
                {calendar.loading ? 'Loading…' : '↻ Refresh'}
              </button>
            </div>

            {/* Anchor selector */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Anchor</label>
                <div className="flex gap-1 overflow-x-auto">
                  {ANCHOR_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setAnchor(o.value)} className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${anchor === o.value ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-950/40 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
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
                  {!isPriorDay && <span className="text-slate-400">Horizon: <span className="font-semibold text-slate-200">{calData.horizonDays}d → {formatCalDate(calData.horizonEndISO, asset)}</span></span>}
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
                        <div className="mt-1 text-[10px] text-slate-400">Wt {Math.round(cluster.weight)} · Score {cluster.clusterScore}</div>
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

      {/* ── OPTIONS ────────────────────────────────────────────────── */}
      {tab === 'Options' && (
        <div className="space-y-4">
          {optionsScan.loading ? (
            <Card><div className="space-y-3">{[1,2,3,4].map(i => <Skel key={i} h="h-10" />)}</div></Card>
          ) : optionsScan.error ? (
            <Card><div className="text-xs text-red-400/60 py-4 text-center">Options data unavailable: {optionsScan.error}</div></Card>
          ) : optionsScan.data ? (
            <>
              {/* Summary */}
              <Card>
                <h3 className="text-sm font-semibold text-white mb-3">Options Confluence — {sym}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {optionsScan.data.pcRatio != null && (
                    <div className="bg-[#0A101C]/50 rounded-lg p-3">
                      <div className="text-[9px] text-slate-500 uppercase">P/C Ratio</div>
                      <div className="text-lg font-bold text-white">{optionsScan.data.pcRatio.toFixed(2)}</div>
                      <div className={`text-[10px] ${optionsScan.data.pcRatio > 1 ? 'text-red-400' : 'text-emerald-400'}`}>{optionsScan.data.pcRatio > 1 ? 'Bearish Bias' : 'Bullish Bias'}</div>
                    </div>
                  )}
                  {optionsScan.data.ivRank != null && (
                    <div className="bg-[#0A101C]/50 rounded-lg p-3">
                      <div className="text-[9px] text-slate-500 uppercase">IV Rank</div>
                      <div className="text-lg font-bold text-white">{optionsScan.data.ivRank.toFixed(1)}%</div>
                    </div>
                  )}
                  {optionsScan.data.maxPain != null && (
                    <div className="bg-[#0A101C]/50 rounded-lg p-3">
                      <div className="text-[9px] text-slate-500 uppercase">Max Pain</div>
                      <div className="text-lg font-bold text-white">${optionsScan.data.maxPain}</div>
                    </div>
                  )}
                  {optionsScan.data.spotPrice != null && (
                    <div className="bg-[#0A101C]/50 rounded-lg p-3">
                      <div className="text-[9px] text-slate-500 uppercase">Spot Price</div>
                      <div className="text-lg font-bold text-white">${optionsScan.data.spotPrice}</div>
                    </div>
                  )}
                </div>
              </Card>

              {/* GEX / Key Levels */}
              {optionsScan.data.keyLevels && optionsScan.data.keyLevels.length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3">Key Option Levels</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Strike</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Call OI</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Put OI</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Total OI</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">GEX</th>
                          <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optionsScan.data.keyLevels.map((lv: any, i: number) => (
                          <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                            <td className="py-2 px-2 font-mono text-white">${lv.strike}</td>
                            <td className="py-2 px-2 text-right font-mono text-emerald-400">{(lv.callOI || 0).toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-mono text-red-400">{(lv.putOI || 0).toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-mono text-slate-300">{(lv.totalOI || 0).toLocaleString()}</td>
                            <td className={`py-2 px-2 text-right font-mono ${(lv.gex || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(lv.gex || 0).toLocaleString()}</td>
                            <td className="py-2 px-2">{lv.type && <Badge label={lv.type} color={lv.type === 'support' ? '#10B981' : lv.type === 'resistance' ? '#EF4444' : '#94A3B8'} small />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Highlights / Notes */}
              {optionsScan.data.highlights && optionsScan.data.highlights.length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-2">Analysis Highlights</h3>
                  <ul className="space-y-1">
                    {optionsScan.data.highlights.map((h: string, i: number) => (
                      <li key={i} className="text-xs text-slate-300 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-emerald-500">{h}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : (
            <Card><div className="text-xs text-slate-500 py-8 text-center">Enter a symbol above and load to see options data</div></Card>
          )}

          {/* DVE context below options */}
          {dve.data && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-2">DVE Context</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0A101C]/50 rounded-lg p-3 text-center">
                  <div className="text-[9px] text-slate-500 uppercase">Regime</div>
                  <div className="text-sm font-bold text-white">{dve.data.regime}</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3 text-center">
                  <div className="text-[9px] text-slate-500 uppercase">BBWP</div>
                  <div className="text-sm font-bold text-white">{dve.data.bbwp?.toFixed(1)}</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3 text-center">
                  <div className="text-[9px] text-slate-500 uppercase">Direction</div>
                  <div className={`text-sm font-bold ${dve.data.direction === 'EXPANDING' ? 'text-red-400' : 'text-emerald-400'}`}>{dve.data.direction}</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── FLOW ───────────────────────────────────────────────────── */}
      {tab === 'Flow' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Capital Flow — {sym}</h3>
          <div className="text-center py-12">
            <div className="text-slate-500 text-xs mb-4">
              Real-time flow analysis requires the Capital Flow Engine.
            </div>
            <a
              href={`/tools/flow?symbol=${sym}`}
              target="_blank"
              className="px-4 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors inline-block"
            >
              Open Flow Analysis →
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Sub-components                                                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TVChart({ symbol, asset }: { symbol: string; asset: 'crypto' | 'equity' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSymbol = asset === 'crypto' ? `BINANCE:${symbol.replace('USD', 'USDT')}` : symbol;

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: '60',
      timezone: asset === 'crypto' ? 'Etc/UTC' : 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(10, 16, 28, 1)',
      gridColor: 'rgba(30, 41, 59, 0.3)',
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies', 'BB@tv-basicstudies'],
      support_host: 'https://www.tradingview.com',
    });
    containerRef.current.appendChild(script);
  }, [tvSymbol, asset]);

  return (
    <div className="tradingview-widget-container" ref={containerRef} style={{ height: 500, width: '100%' }}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
    </div>
  );
}

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
