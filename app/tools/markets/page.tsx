'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import SectorHeatmap from '@/components/SectorHeatmap';
import WatchlistWidget from '@/components/WatchlistWidget';
import AlertsWidget from '@/components/AlertsWidget';

type RegionTab = 'americas' | 'emea' | 'apac';
type LogTab = 'alerts' | 'regime' | 'scanner' | 'notrade' | 'data';

interface TodayTile {
  symbol: string;
  value: string;
  spark: string;
  tone: 'bull' | 'bear' | 'neutral' | 'warn';
}

interface GlobalRow {
  name: string;
  last: string;
  chg: string;
  d1: string;
  w1: string;
  m1: string;
  spark: string;
}

interface LogEntry {
  t: string;
  event: string;
  detail: string;
  tone?: 'bull' | 'bear' | 'warn';
}

// Helper: derive tone from change
function deriveTone(chg: number): 'bull' | 'bear' | 'neutral' {
  if (chg > 0.1) return 'bull';
  if (chg < -0.1) return 'bear';
  return 'neutral';
}

// Helper: generate mini spark from change direction
function deriveSpark(chg: number): string {
  if (chg > 0.5) return '▃▄▅▆▇';
  if (chg > 0) return '▃▄▅▅▆';
  if (chg > -0.5) return '▅▄▃▃▂';
  return '▅▄▃▂▁';
}

function formatPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

function toneClass(tone?: 'bull' | 'bear' | 'warn') {
  if (tone === 'bull') return 'text-emerald-300';
  if (tone === 'bear') return 'text-rose-300';
  if (tone === 'warn') return 'text-amber-300';
  return 'text-slate-300';
}

function tileToneClass(tone: string) {
  if (tone === 'bull') return 'text-emerald-300';
  if (tone === 'bear') return 'text-rose-300';
  if (tone === 'warn') return 'text-amber-300';
  return 'text-cyan-300';
}

export default function MarketsPage() {
  const [regionTab, setRegionTab] = useState<RegionTab>('americas');
  const [logTab, setLogTab] = useState<LogTab>('alerts');
  const [todayTiles, setTodayTiles] = useState<TodayTile[]>([]);
  const [globalRows, setGlobalRows] = useState<Record<RegionTab, GlobalRow[]>>({ americas: [], emea: [], apac: [] });
  const [statusBar, setStatusBar] = useState<Array<[string, string]>>([]);
  const [logs, setLogs] = useState<Record<LogTab, LogEntry[]>>({
    alerts: [], regime: [], scanner: [], notrade: [], data: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('--:--:--');

  const fetchMarketData = useCallback(async () => {
    try {
      // Fetch key market quotes in parallel
      const symbols = [
        { sym: 'SPY', type: 'stock' }, { sym: 'QQQ', type: 'stock' }, { sym: 'IWM', type: 'stock' },
      ];
      const quotePromises = symbols.map(({ sym, type }) =>
        fetch(`/api/quote?symbol=${sym}&type=${type}`).then(r => r.json()).catch(() => null)
      );
      // Fetch sector heatmap for regime derivation
      const sectorPromise = fetch('/api/sectors/heatmap').then(r => r.json()).catch(() => null);
      // Fetch recent alerts
      const alertsPromise = fetch('/api/alerts/history?limit=4').then(r => r.json()).catch(() => null);

      const [spyQ, qqqQ, iwmQ, sectorData, alertsData] = await Promise.all([
        ...quotePromises, sectorPromise, alertsPromise,
      ]);

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
      setLastRefresh(timeStr);

      // Build today tiles from real quotes
      const tiles: TodayTile[] = [];
      if (spyQ?.ok) {
        const chg = ((spyQ.price - (spyQ.previousClose || spyQ.price)) / (spyQ.previousClose || spyQ.price)) * 100;
        tiles.push({ symbol: 'SPY', value: spyQ.price ? `$${formatPrice(spyQ.price)}` : '--', spark: deriveSpark(chg), tone: deriveTone(chg) });
      }
      if (qqqQ?.ok) {
        const chg = ((qqqQ.price - (qqqQ.previousClose || qqqQ.price)) / (qqqQ.previousClose || qqqQ.price)) * 100;
        tiles.push({ symbol: 'QQQ', value: qqqQ.price ? `$${formatPrice(qqqQ.price)}` : '--', spark: deriveSpark(chg), tone: deriveTone(chg) });
      }
      if (iwmQ?.ok) {
        const chg = ((iwmQ.price - (iwmQ.previousClose || iwmQ.price)) / (iwmQ.previousClose || iwmQ.price)) * 100;
        tiles.push({ symbol: 'IWM', value: iwmQ.price ? `$${formatPrice(iwmQ.price)}` : '--', spark: deriveSpark(chg), tone: deriveTone(chg) });
      }
      if (tiles.length === 0) {
        tiles.push({ symbol: 'SPY', value: '--', spark: '▃▃▃▃▃', tone: 'neutral' });
      }
      setTodayTiles(tiles);

      // Derive regime from sector data
      let regimeLabel = 'Loading...';
      let riskLabel = 'Loading...';
      if (sectorData?.sectors && Array.isArray(sectorData.sectors)) {
        const defensive = sectorData.sectors.filter((s: any) => ['XLU', 'XLP', 'XLV', 'XLRE'].includes(s.symbol));
        const offensive = sectorData.sectors.filter((s: any) => ['XLK', 'XLY', 'XLF', 'XLI', 'XLB'].includes(s.symbol));
        const defAvg = defensive.reduce((a: number, s: any) => a + (s.changePercent || 0), 0) / (defensive.length || 1);
        const offAvg = offensive.reduce((a: number, s: any) => a + (s.changePercent || 0), 0) / (offensive.length || 1);
        regimeLabel = offAvg > defAvg + 0.3 ? 'Risk-On' : offAvg < defAvg - 0.3 ? 'Risk-Off' : 'Neutral';
        riskLabel = Math.abs(offAvg - defAvg) > 1 ? 'Elevated' : 'Moderate';
      }

      setStatusBar([
        ['Regime', regimeLabel],
        ['Risk', riskLabel],
        ['Data', 'Live'],
        ['Refresh', timeStr],
      ]);

      // Build live logs from alert history
      const logEntries: Record<LogTab, LogEntry[]> = {
        alerts: [],
        regime: [{ t: timeStr, event: `Regime: ${regimeLabel}`, detail: `Risk level: ${riskLabel}. Derived from sector rotation data.` }],
        scanner: [],
        notrade: [],
        data: [{ t: timeStr, event: 'Data refresh', detail: 'Market quotes and sector data updated successfully.' }],
      };

      if (alertsData?.alerts && Array.isArray(alertsData.alerts)) {
        logEntries.alerts = alertsData.alerts.slice(0, 4).map((a: any) => ({
          t: new Date(a.triggered_at || a.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          event: a.symbol ? `${a.symbol} alert` : 'Alert',
          detail: a.name || a.condition || 'Triggered',
          tone: 'warn' as const,
        }));
      }
      if (logEntries.alerts.length === 0) {
        logEntries.alerts.push({ t: timeStr, event: 'No recent alerts', detail: 'No alerts have triggered recently.' });
      }
      setLogs(logEntries);

      setLoading(false);
    } catch (err) {
      console.error('Markets data fetch error:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 60_000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  const rows = useMemo(() => globalRows[regionTab], [regionTab, globalRows]);

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] px-2 py-3 text-slate-100 md:px-3">
      <div className="mx-auto grid w-full max-w-none gap-2">
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] px-3 py-2 text-[11px] font-semibold">
          {[
            ['Tools', '/tools'],
            ['Markets', '/tools/markets'],
            ['Calendar', '/tools/economic-calendar'],
            ['News', '/tools/news'],
            ['Watchlist', '/tools/watchlists'],
            ['Account', '/account'],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className={label === 'Markets' ? 'text-[var(--msp-accent)]' : 'text-[var(--msp-text-muted)] hover:text-[var(--msp-text)]'}
            >
              {label}
            </Link>
          ))}
        </nav>

        <section className="z-20 flex flex-wrap items-center gap-1 rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-1 md:sticky md:top-2 md:gap-1.5 md:p-1.5">
          {(statusBar.length > 0 ? statusBar : [['Regime', 'Loading...'], ['Risk', '--'], ['Data', '--'], ['Refresh', '--']]).map(([k, v]) => (
            <div key={k} className="rounded-full border border-[var(--msp-border)] px-1.5 py-0.5 text-[10px] leading-tight text-[var(--msp-text-muted)] md:px-2 md:text-[11px]">
              <span className="font-semibold text-[var(--msp-text)]">{k}</span> · {v}
            </div>
          ))}
          <div className="ml-auto">
            <MarketStatusBadge compact showGlobal />
          </div>
        </section>

        <section className="grid gap-2 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Zone 2 • Action</p>
                <h2 className="text-xs font-bold text-[var(--msp-text)]">Today&apos;s Plays / Watchlist / Scans</h2>
              </div>
              <Link href="/tools/scanner" className="text-[11px] font-semibold text-[var(--msp-accent)]">Open Scanner</Link>
            </div>

            <div className="h-auto overflow-visible rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-1.5 md:h-[560px] md:overflow-y-auto">
              <div className="grid gap-2">
                <section className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--msp-text-muted)]">Today In Markets</h3>
                    <span className="text-[10px] text-[var(--msp-text-faint)]">Priority queue</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                    {todayTiles.map((tile) => (
                      <div key={tile.symbol} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[var(--msp-text)]">{tile.symbol}</span>
                          <span className={`font-bold ${tileToneClass(tile.tone)}`}>{tile.value}</span>
                        </div>
                        <div className={`mt-0.5 text-[11px] tracking-[0.12em] ${tileToneClass(tile.tone)}`}>{tile.spark}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--msp-text-muted)]">Watchlist</h3>
                    <Link href="/tools/watchlists" className="text-[10px] font-semibold text-[var(--msp-accent)]">Manage</Link>
                  </div>
                  <WatchlistWidget />
                </section>

                <section className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--msp-text-muted)]">Alerts & Permissions</h3>
                    <Link href="/tools/alerts" className="text-[10px] font-semibold text-[var(--msp-accent)]">Console</Link>
                  </div>
                  <AlertsWidget compact />
                </section>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-2">
            <div className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Zone 2 • Context</p>
              <h2 className="text-xs font-bold text-[var(--msp-text)]">Rotation / Heatmap / Flow Snapshot</h2>
            </div>

            <div className="grid gap-2">
              <section className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--msp-text-muted)]">Sector Rotation</h3>
                  <span className="text-[10px] text-[var(--msp-accent)]">Balanced risk</span>
                </div>
                <div className="min-h-[285px]">
                  <SectorHeatmap />
                </div>
              </section>

              <section className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--msp-text-muted)]">Global Index Context</h3>
                  <div className="flex gap-1">
                    {(['americas', 'emea', 'apac'] as RegionTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setRegionTab(tab)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                          regionTab === tab
                            ? 'border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]'
                            : 'border-[var(--msp-border)] text-[var(--msp-text-muted)]'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {rows.length > 0 ? (
                  <table className="min-w-[620px] w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="text-left uppercase tracking-wide text-[10px] text-[var(--msp-text-faint)]">
                        {['Name', 'Last', 'Chg', '1D', '1W', '1M', 'Spark'].map((h) => (
                          <th key={h} className="border-b border-[var(--msp-border)] px-1 py-1">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.name} className="border-b border-[var(--msp-divider)]">
                          <td className="px-1 py-1.5 font-semibold text-[var(--msp-text)]">{row.name}</td>
                          <td className="px-1 py-1.5 text-[var(--msp-text-muted)]">{row.last}</td>
                          <td className={`px-1 py-1.5 ${row.chg.startsWith('-') ? 'text-rose-300' : 'text-emerald-300'}`}>{row.chg}</td>
                          <td className="px-1 py-1.5 text-[var(--msp-text-muted)]">{row.d1}</td>
                          <td className="px-1 py-1.5 text-[var(--msp-text-muted)]">{row.w1}</td>
                          <td className="px-1 py-1.5 text-[var(--msp-text-muted)]">{row.m1}</td>
                          <td className="px-1 py-1.5 text-[var(--msp-accent)]">{row.spark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  ) : (
                    <div className="py-6 text-center text-xs text-[var(--msp-text-faint)]">
                      Global index data requires Alpha Vantage premium. Showing sector rotation above as primary context.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>

        <details className="group rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-2" open>
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-[var(--msp-text)]">
            <span>Zone 3 • Audit / Log</span>
            <span className="text-[10px] text-[var(--msp-text-faint)] group-open:hidden">Expand</span>
            <span className="hidden text-[10px] text-[var(--msp-text-faint)] group-open:inline">Collapse</span>
          </summary>

          <div className="mt-2 grid gap-2">
            <div className="flex flex-wrap gap-1">
              {([
                ['alerts', 'Triggered Alerts'],
                ['regime', 'Regime Flips'],
                ['scanner', 'Scanner Hits'],
                ['notrade', 'No-Trade Reasons'],
                ['data', 'Data Gaps'],
              ] as Array<[LogTab, string]>).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setLogTab(key)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    logTab === key
                      ? 'border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]'
                      : 'border-[var(--msp-border)] text-[var(--msp-text-muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[220px] overflow-y-auto rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-1.5">
              <div className="grid gap-1.5">
                {logs[logTab].map((log, idx) => (
                  <div key={`${log.t}-${idx}`} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-1.5">
                    <div className="flex items-center justify-between text-[10px] text-[var(--msp-text-faint)]">
                      <span>{log.t}</span>
                      <span className={toneClass(log.tone)}>{log.event}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--msp-text-muted)]">{log.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="group rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-[var(--msp-text)]">
            <span>Zone 4 • Capabilities / Plan / Help</span>
            <span className="text-[10px] text-[var(--msp-text-faint)] group-open:hidden">Expand</span>
            <span className="hidden text-[10px] text-[var(--msp-text-faint)] group-open:inline">Collapse</span>
          </summary>

          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2 text-[11px] text-[var(--msp-text-muted)]">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--msp-text-faint)]">Capabilities</p>
              Regime map, breadth/risk strip, rotation context, watchlist sync, and alert routing are active.
            </div>
            <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2 text-[11px] text-[var(--msp-text-muted)]">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--msp-text-faint)]">Plan Limits</p>
              Higher-frequency refresh and expanded market breadth sets are tier-gated by your active plan.
            </div>
            <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2 text-[11px] text-[var(--msp-text-muted)]">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--msp-text-faint)]">Help</p>
              Breadth = advancing vs declining participation. VIX = implied volatility. DXY = USD strength backdrop.
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
