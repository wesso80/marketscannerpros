"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CloseCalendar from '@/components/time/CloseCalendar';
import TimeScannerShell from '@/components/time/TimeScannerShell';
import { boundedJsonFetch } from '@/lib/boundedFetch';
import { formatPrice } from '@/lib/formatPrice';
import TimeGravityMapWidget from '@/components/TimeGravityMapWidget';
import MarketPressureWidget from '@/components/MarketPressureWidget';
import { detectAssetClass } from '@/lib/detectAssetClass';
import { useUserTier, canAccessTimeScanner } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import TimeConfluenceWidget from '@/components/TimeConfluenceWidget';
import type { PublicTimeConfluence } from '@/lib/research/publicTimeConfluence';

/*
 * Time Confluence (Terminal tab). Shows the public Time Confluence contract only: when each timeframe's candle
 * closes, which closes coincide, and each timeframe's prior-candle midpoint with its distance from price. No
 * direction, confidence, score, target, entry window or trade level is requested or shown.
 */

type ScanModeType = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';

const SCAN_MODE_LABELS: Record<ScanModeType, string> = {
  scalping: 'Scalp 15m',
  intraday_30m: '30min',
  intraday_1h: '1H',
  intraday_4h: '4H',
  swing_1d: 'Daily',
  swing_3d: '3-Day',
  swing_1w: 'Weekly',
  macro_monthly: 'Monthly',
  macro_yearly: 'Yearly',
};

const TIMEFRAME_OPTIONS: ScanModeType[] = [
  'scalping', 'intraday_30m', 'intraday_1h', 'intraday_4h',
  'swing_1d', 'swing_3d', 'swing_1w', 'macro_monthly', 'macro_yearly',
];

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function minutesLabel(mins: number) {
  if (mins < 60) return `${Math.max(0, Math.round(mins))}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

function closeSummary(d: PublicTimeConfluence) {
  const c = d.closes;
  const parts = [
    `${c.closingNow.count} timeframe${c.closingNow.count === 1 ? '' : 's'} close within 5 minutes`,
    `${c.closingSoon.count} more within 4 hours`,
  ];
  if (c.densestWindow) parts.push(`most closes together: ${c.densestWindow.count} between ${minutesLabel(c.densestWindow.startMins)} and ${minutesLabel(c.densestWindow.endMins)} from now`);
  return parts.join(' · ');
}

function calendarEvents(d: PublicTimeConfluence) {
  const e = d.closes.calendarEvents;
  return [e.yearEnd && 'Year end', e.quarterEnd && 'Quarter end', e.monthEnd && 'Month end', e.weekEnd && 'Week end', e.sessionClose !== 'none' && `${e.sessionClose === 'ny' ? 'New York' : e.sessionClose === 'london' ? 'London' : 'Asia'} session close`].filter(Boolean) as string[];
}

export default function TimeScannerPage({ embeddedInTerminal = false, symbol: propSymbol, assetType, timeframe }: { embeddedInTerminal?: boolean; symbol?: string; assetType?: 'equity' | 'crypto'; timeframe?: string } = {}) {
  const { tier, isLoading: tierLoading } = useUserTier();
  const searchParams = useSearchParams();
  const requestedSymbol = propSymbol || searchParams.get('symbol') || 'BTCUSD';
  const requestedAsset = assetType || (searchParams.get('type') === 'crypto' ? 'crypto' : searchParams.get('type') === 'equity' ? 'equity' : undefined);
  const [symbol, setSymbol] = useState(requestedSymbol);
  const [scanMode, setScanMode] = useState<ScanModeType>('intraday_1h');
  const [sessionMode, setSessionMode] = useState<'regular' | 'extended' | 'full'>('extended');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [selectedClusterTFs, setSelectedClusterTFs] = useState<string[] | null>(null);
  const [activeClusterLabel, setActiveClusterLabel] = useState<string | null>(null);
  const [selectedMid50TF, setSelectedMid50TF] = useState<string>('all');
  const [scanData, setScanData] = useState<PublicTimeConfluence | null>(null);

  const runScan = async (overrides?: { symbol?: string; scanMode?: ScanModeType }) => {
    // Strip leading slash from CME-style futures tickers (e.g. /ES → ES, /NQ → NQ)
    const effectiveSymbol = (overrides?.symbol ?? symbol).trim().toUpperCase().replace(/^\//, '');
    const effectiveMode = overrides?.scanMode ?? scanMode;
    if (!effectiveSymbol) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setScanData(null);
    setSelectedClusterTFs(null);
    setActiveClusterLabel(null);
    setSelectedMid50TF('all');
    try {
      const { response, body: json } = await boundedJsonFetch<any>('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: effectiveSymbol,
          mode: 'hierarchical',
          scanMode: effectiveMode,
          sessionMode,
          assetType: requestedAsset,
        }),
        signal: controller.signal,
      }, 60_000);
      if (controller.signal.aborted) return;
      if (!response.ok || !json?.success || json?.data?.contract !== 'public-time-confluence-v1') {
        setError(json?.error || 'Time scan failed');
        return;
      }
      setScanData(json.data as PublicTimeConfluence);
      // Research scans do not create paper trades; saving belongs to an explicit user action.
    } catch (scanError) {
      if (!controller.signal.aborted) setError(scanError instanceof Error ? scanError.message : 'Network error');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const requestedTf = timeframe || searchParams.get('timeframe') || searchParams.get('tf') || '';
  useEffect(() => {
    const modes: Record<string, ScanModeType> = { '15m': 'scalping', '30m': 'intraday_30m', '1h': 'intraday_1h', daily: 'swing_1d', '1d': 'swing_1d', weekly: 'swing_1w' };
    setSymbol(requestedSymbol.trim().toUpperCase());
    setScanMode(modes[requestedTf] || (TIMEFRAME_OPTIONS.includes(requestedTf as ScanModeType) ? requestedTf as ScanModeType : 'intraday_1h'));
  }, [requestedSymbol, requestedTf]);

  useEffect(() => {
    requestRef.current?.abort();
    setLoading(false);
    setError(null);
    setScanData(null);
    return () => requestRef.current?.abort();
  }, [symbol, scanMode, sessionMode, requestedAsset]);

  const isCrypto = (requestedAsset || detectAssetClass(symbol)) === 'crypto';
  const displaySymbol = useMemo(() => scanData?.symbol || symbol, [scanData?.symbol, symbol]);

  // Tier gate: require Pro
  if (tierLoading) {
    return (
      <TimeScannerShell embedded={embeddedInTerminal}>
        <div className={`flex ${embeddedInTerminal ? 'min-h-[12rem]' : 'min-h-[60vh]'} items-center justify-center text-slate-500`}>Loading…</div>
      </TimeScannerShell>
    );
  }
  if (!canAccessTimeScanner(tier)) {
    return (
      <TimeScannerShell embedded={embeddedInTerminal}>
        <UpgradeGate requiredTier="pro" feature="Time Scanner" />
      </TimeScannerShell>
    );
  }

  // Before a run, do not show Unavailable tiles, Window UNKNOWN, or a 0 score together.
  if (embeddedInTerminal && !scanData) {
    return (
      <TimeScannerShell embedded>
        <section aria-label="Time Confluence" className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6">
          {error && <p className="mb-3 text-sm text-rose-200">{error}</p>}
          <h2 className="text-base font-semibold text-slate-100">Run Time Confluence for {symbol}</h2>
          <button
            type="button"
            onClick={() => { void runScan(); }}
            disabled={loading}
            className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-40"
          >
            {loading ? 'Running…' : 'Run Time Confluence'}
          </button>
        </section>
      </TimeScannerShell>
    );
  }

  return (
    <TimeScannerShell embedded={embeddedInTerminal}>
      <main className={`mx-auto w-full max-w-none space-y-5 ${embeddedInTerminal ? 'px-0 py-0' : 'px-4 py-4 lg:px-6 lg:py-6'}`}>

        {error && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="w-full rounded-2xl border border-slate-700 bg-slate-900/40 px-4 lg:px-6">
          <div className="grid min-h-[88px] grid-cols-1 items-center gap-3 py-3 lg:grid-cols-[1.3fr_0.9fr_1.2fr] lg:py-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {embeddedInTerminal ? <span className="text-sm font-semibold">{symbol}</span> : <input
                  value={symbol}
                  readOnly={embeddedInTerminal}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  placeholder="SYMBOL"
                  className="w-24 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-sm font-semibold text-slate-100"
                />}
                <select
                  value={scanMode}
                  onChange={(event) => {
                    setScanMode(event.target.value as ScanModeType);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200"
                >
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <option key={option} value={option}>{SCAN_MODE_LABELS[option]}</option>
                  ))}
                </select>
                {/* Session Mode selector — only visible for equities */}
                {!isCrypto && (
                  <select
                    value={sessionMode}
                    onChange={(event) => {
                      setSessionMode(event.target.value as 'regular' | 'extended' | 'full');
                      }}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200"
                    title="Session hours — affects intraday candle close anchors"
                  >
                    <option value="regular">RTH (9:30–16:00 ET)</option>
                    <option value="extended">Extended (4:00–20:00 ET)</option>
                    <option value="full">Full (00:00–24:00 ET)</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void runScan();
                  }}
                  disabled={loading}
                  className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-xs font-semibold text-slate-100 disabled:opacity-40"
                >
                  {loading ? 'Scanning…' : 'Run'}
                </button>
              </div>
              <div className="mt-1.5 truncate text-xs text-slate-400">
                {SCAN_MODE_LABELS[scanMode]} • {displaySymbol}{!isCrypto ? ` • ${sessionMode === 'regular' ? 'RTH' : sessionMode === 'extended' ? 'Extended' : 'Full'}` : ''}
              </div>
            </div>

            <div className="flex justify-start lg:justify-center">
              <div className="rounded-xl border border-slate-700 bg-slate-950/45 px-3 py-2">
                <div data-time-verdict className="text-sm font-semibold tracking-wide text-slate-100">
                  {scanData ? `${scanData.closes.closingNow.count + scanData.closes.closingSoon.count} timeframe closes in the next 4 hours` : 'Run scan to load timing'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 lg:justify-end">
              <div className="grid w-full grid-cols-2 gap-2">
                <MetricPill label="Price" value={scanData?.price.value != null ? formatPrice(scanData.price.value) : 'Not collected'} />
                <MetricPill label="Midpoints measured" value={scanData ? `${scanData.midpoints.levels.length} of ${scanData.includedTFs.length}` : 'Not collected'} />
              </div>
            </div>
          </div>
        </section>

        <CollapsibleSection title="Timing evidence">
        {scanData && (
          <section data-time-evidence className="w-full rounded-2xl border border-slate-700 bg-slate-900/50 p-4 lg:p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Candle closes</div>
                  <div className="text-xs leading-relaxed text-slate-300">{closeSummary(scanData)}.</div>
                  {scanData.closes.closingNow.timeframes.length > 0 && <div className="mt-1 text-xs text-slate-400">Closing now: {scanData.closes.closingNow.timeframes.join(', ')}</div>}
                  {scanData.closes.densestWindow && <div className="mt-1 text-xs text-slate-400">Together: {scanData.closes.densestWindow.timeframes.join(', ')}</div>}
                  {calendarEvents(scanData).length > 0 && <div className="mt-1 text-xs text-slate-400">Calendar: {calendarEvents(scanData).join(' · ')}</div>}
                  {!scanData.closes.marketOpen && <div className="mt-1 text-xs text-amber-300">Market closed: the next intraday closes are in the next session.</div>}
                  <div className="mt-2 text-[10px] text-slate-500">{scanData.closes.basis}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Price</div>
                    <div className="text-base font-bold text-slate-100">{scanData.price.value != null ? formatPrice(scanData.price.value) : 'Not collected'}</div>
                    <div className="text-[10px] text-slate-500">{scanData.price.source} · {scanData.price.basis}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Latest bar</div>
                    <div className="text-xs font-semibold text-slate-200">{scanData.latestBarAt ? new Date(scanData.latestBarAt).toLocaleString() : 'Not recorded'}</div>
                  </div>
                </div>

                {scanData.midpoints.groups.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Midpoints close together</div>
                    <ul className="space-y-0.5 text-xs text-slate-300">
                      {scanData.midpoints.groups.map((g) => (
                        <li key={g.tfs.join('-')} className="flex justify-between gap-3"><span className="text-slate-400">{g.tfs.join(', ')}</span><span className="font-mono">{formatPrice(g.averageLevel)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {(() => {
                  const allLevels = scanData.midpoints.levels;
                  if (allLevels.length === 0) {
                    return <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2.5 text-xs text-slate-400">No timeframe midpoint could be measured from the bars collected.</div>;
                  }

                  // Filter by selected cluster TFs (if any)
                  const clusterFiltered = selectedClusterTFs
                    ? allLevels.filter((m) => selectedClusterTFs.includes(m.tf))
                    : allLevels;

                  // Then filter by individual TF dropdown
                  const validLevels = selectedMid50TF === 'all'
                    ? clusterFiltered
                    : clusterFiltered.filter((m) => m.tf === selectedMid50TF);

                  // Build dropdown options from the cluster-filtered set
                  const dropdownTFs = clusterFiltered.map((m) => m.tf);

                  return (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prior-candle midpoints (50% levels)</div>
                        <div className="flex items-center gap-1.5">
                          {selectedClusterTFs && (
                            <button
                              type="button"
                              onClick={() => { setSelectedClusterTFs(null); setActiveClusterLabel(null); setSelectedMid50TF('all'); }}
                              className="rounded px-1.5 py-0.5 text-[9px] font-medium text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                              title="Show all TF levels"
                            >
                              ✕ Clear
                            </button>
                          )}
                          <select
                            value={selectedMid50TF}
                            onChange={(e) => setSelectedMid50TF(e.target.value)}
                            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300"
                          >
                            <option value="all">All TFs ({clusterFiltered.length})</option>
                            {dropdownTFs.map((tf) => (
                              <option key={tf} value={tf}>{tf}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {validLevels.length > 0 ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                          {validLevels.map((m) => (
                            <div key={m.tf} className="flex items-center justify-between">
                              <span className="font-medium text-slate-400">{m.tf}</span>
                              <span className="font-mono text-slate-300">{formatPrice(m.level)}
                                <span className="ml-1 text-[10px] text-slate-500">price {m.distancePct > 0 ? '+' : ''}{m.distancePct.toFixed(1)}%</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500">No measured midpoint for this selection.</div>
                      )}
                      {scanData.unmeasuredTFs.length > 0 && <div className="mt-1.5 text-[10px] text-slate-500">Not measured (too few bars): {scanData.unmeasuredTFs.join(', ')}</div>}
                      <div className="mt-1.5 text-[10px] text-slate-500">{scanData.midpoints.basis}</div>
                    </div>
                  );
                })()}

                <details className="rounded-xl border border-slate-800 bg-slate-950/25">
                  <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Next close by timeframe ({scanData.closes.schedule.length})</summary>
                  <div className="overflow-x-auto px-3 pb-2">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="pb-1 pr-3 font-medium">TF</th>
                          <th className="pb-1 pr-3 font-medium">Next close</th>
                          <th className="pb-1 font-medium">In</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        {scanData.closes.schedule.map((r) => (
                          <tr key={r.tf} className="border-b border-slate-800/40">
                            <td className="py-1 pr-3 font-medium">{r.tf}</td>
                            <td className="py-1 pr-3 font-mono">{r.nextCloseAt ? new Date(r.nextCloseAt).toLocaleString() : 'Not calculated'}</td>
                            <td className="py-1">{minutesLabel(r.minsToClose)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">{scanData.note}</p>
          </section>
        )}

        {/* ═══ MARKET PRESSURE ENGINE ═══ */}
        {scanData && (
          <details className="w-full rounded-2xl border border-slate-800 bg-slate-900/30">
            <summary className="cursor-pointer list-none px-3 py-3 lg:px-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-100">Market inputs</span>
                  <span className="ml-2 text-xs text-slate-400">Measured volatility, derivatives and options-chain inputs, each with source and time</span>
                </div>
                <div className="text-xs text-slate-500">▾ expand</div>
              </div>
            </summary>
            <div className="border-t border-slate-800 p-3 lg:p-5">
              <MarketPressureWidget
                symbol={symbol}
                scanMode={scanMode}
                sessionMode={sessionMode}
              />
            </div>
          </details>
        )}

        {/* ═══ ROW 2: STATIC INTRADAY SCHEDULE (equities only) + CLOSE CALENDAR ═══ */}
        {!isCrypto && (
          <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-100">Intraday Equity Close Schedule</div>
              <div className="text-xs text-slate-400">
                Fixed candle closes every trading day ({sessionMode === 'regular' ? 'RTH 9:30–16:00 ET' : sessionMode === 'extended' ? 'Extended 4:00–20:00 ET' : 'Full 00:00–24:00 ET'}) — these never change
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="pb-1.5 pr-4 font-medium">Time (ET)</th>
                    <th className="pb-1.5 pr-4 font-medium">Event</th>
                    <th className="pb-1.5 font-medium">Candle Closes</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {sessionMode === 'regular' ? (
                    <>
                      {/* ── Regular (RTH): anchor 9:30 ET, closes on the :30 ── */}
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">09:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Open</td>
                        <td className="py-1.5 text-slate-400">Session anchor — all intraday bars begin here</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:00</td>
                        <td className="py-1.5 pr-4">Opening Range</td>
                        <td className="py-1.5 text-slate-400">30M (9:30–10:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:30</td>
                        <td className="py-1.5 pr-4">First Hourly Close</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (9:30–10:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">11:30</td>
                        <td className="py-1.5 pr-4">European Close</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (10:30–11:30) · 2H (9:30–11:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">12:30</td>
                        <td className="py-1.5 pr-4">Midday</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (11:30–12:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-amber-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400">13:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300">Key Confluence</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H · 2H (11:30–13:30) · 4H (9:30–13:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">14:30</td>
                        <td className="py-1.5 pr-4">Afternoon</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (13:30–14:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">15:30</td>
                        <td className="py-1.5 pr-4">Final Half-Hour</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (14:30–15:30) · 2H (13:30–15:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">16:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Close</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-amber-400/80">1H (30m†) · 2H (30m†) · 4H (150m†)</span> · Daily</td>
                      </tr>
                    </>
                  ) : sessionMode === 'extended' ? (
                    <>
                      {/* ── Extended: anchor 4:00 ET, closes on the hour ── */}
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-400">04:00</td>
                        <td className="py-1.5 pr-4 text-slate-500">Session Open</td>
                        <td className="py-1.5 text-slate-500">New bars begin anchoring</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-amber-400/80">08:00</td>
                        <td className="py-1.5 pr-4">Early Pre-Market</td>
                        <td className="py-1.5 text-slate-400">1H (7:00–8:00) · 2H (6:00–8:00) · 4H (4:00–8:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">09:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Open</td>
                        <td className="py-1.5 text-slate-400">30M (9:00–9:30) — RTH volume surge</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:00</td>
                        <td className="py-1.5 pr-4">Opening Range Close</td>
                        <td className="py-1.5 text-slate-400">30M · 1H (9:00–10:00) · 2H (8:00–10:00) · 3H (7:00–10:00) · 6H (4:00–10:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-amber-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400">12:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300">Midday</td>
                        <td className="py-1.5 text-slate-400">1H (11:00–12:00) · 2H (10:00–12:00) · 4H (8:00–12:00) · 8H (4:00–12:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">14:00</td>
                        <td className="py-1.5 pr-4">Mid-Afternoon</td>
                        <td className="py-1.5 text-slate-400">30M (13:30–14:00) · 1H (13:00–14:00) · 2H (12:00–14:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">16:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Close</td>
                        <td className="py-1.5 text-slate-400">30M (15:30–16:00) · 1H (15:00–16:00) · 2H (14:00–16:00) · 4H (12:00–16:00) · Daily (9:30–16:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-slate-800/20">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400/80">20:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300/80">After-Hours Close</td>
                        <td className="py-1.5 text-slate-400">1H (19:00–20:00) · 2H (18:00–20:00) · 4H (16:00–20:00)</td>
                      </tr>
                    </>
                  ) : (
                    <>
                      {/* ── Full: anchor 0:00 ET, closes on the hour ── */}
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-400">00:00</td>
                        <td className="py-1.5 pr-4 text-slate-500">Session Open</td>
                        <td className="py-1.5 text-slate-500">New bars begin anchoring</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-amber-400/80">08:00</td>
                        <td className="py-1.5 pr-4">Early Pre-Market</td>
                        <td className="py-1.5 text-slate-400">8H (0:00–8:00) · 4H (4:00–8:00) · 2H (6:00–8:00) · 1H (7:00–8:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">09:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Open</td>
                        <td className="py-1.5 text-slate-400">30M (9:00–9:30) — RTH volume surge</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:00</td>
                        <td className="py-1.5 pr-4">Opening Range Close</td>
                        <td className="py-1.5 text-slate-400">30M · 1H (9:00–10:00) · 2H (8:00–10:00) · 3H (7:00–10:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-amber-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400">12:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300">Midday</td>
                        <td className="py-1.5 text-slate-400">1H · 2H · 4H (8:00–12:00) · 6H (6:00–12:00) · 12H (0:00–12:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">14:00</td>
                        <td className="py-1.5 pr-4">Mid-Afternoon</td>
                        <td className="py-1.5 text-slate-400">1H (13:00–14:00) · 2H (12:00–14:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">16:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Close</td>
                        <td className="py-1.5 text-slate-400">1H · 2H · 4H (12:00–16:00) · 8H (8:00–16:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-slate-800/20">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400/80">20:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300/80">After-Hours End</td>
                        <td className="py-1.5 text-slate-400">4H (16:00–20:00) · 2H (18:00–20:00) · 1H (19:00–20:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-slate-800/20">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-slate-400">00:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-slate-400">Full Session Close</td>
                        <td className="py-1.5 text-slate-400">8H (16:00–00:00) · 12H (12:00–00:00) · Daily — full 24h candle</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10px] text-slate-600">
              {sessionMode === 'regular'
                ? '† Partial bar — session is 6.5 hours (390 min), so the final 1H is only 30 min (15:30→16:00). Repeats Mon–Fri, excluding NYSE holidays.'
                : 'Repeats identically every trading day (Mon–Fri, excluding NYSE holidays). Only daily+ timeframes have variable close dates.'}
            </div>
          </section>
        )}

        <CloseCalendar
          symbol={symbol}
          activeClusterLabel={activeClusterLabel ?? undefined}
          onClusterClick={(tfs, label) => {
            // Toggle: clicking the same cluster again deselects it
            if (activeClusterLabel === label) {
              setSelectedClusterTFs(null);
              setActiveClusterLabel(null);
              setSelectedMid50TF('all');
            } else {
              setSelectedClusterTFs(tfs);
              setActiveClusterLabel(label);
              setSelectedMid50TF('all');
            }
          }}
        />

        {/* ═══ ROW 4: TIME GRAVITY MAP (collapsible) ═══ */}
        <details className="w-full rounded-2xl border border-slate-800 bg-slate-900/30">
          <summary className="cursor-pointer list-none px-3 py-3 lg:px-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-100">Time Gravity Map</span>
                <span className="ml-2 text-xs text-slate-400">Midpoint debt, decompression windows & gravity fields</span>
              </div>
              <div className="text-xs text-slate-500">▾ expand</div>
            </div>
          </summary>
          <div className="border-t border-slate-800 p-3 lg:p-5">
            <TimeGravityMapWidget
              symbol={symbol}
              currentPrice={scanData?.price.value ?? undefined}
              assetType={isCrypto ? 'crypto' : 'stock'}
            />
          </div>
        </details>

        </CollapsibleSection>
        {/* ── Intel accordion sections removed — core purpose is cluster + direction output ── */}
        {embeddedInTerminal && scanData && (
          <CollapsibleSection title="Scheduled timing context"><TimeConfluenceWidget showMacro showMicro showCalendar assetClass={isCrypto ? 'crypto' : 'equity'} symbol={displaySymbol} /></CollapsibleSection>
        )}
        {scanData && <SourceLine source={`Time Confluence scan · ${scanData.price.source}`} asOf={scanData.observedAt} tradingDay="Observation time not supplied" basis="Calculated candle schedules and measured prior-candle midpoints" />}
      </main>
    </TimeScannerShell>
  );
}
