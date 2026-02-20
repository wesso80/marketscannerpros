'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import SectorHeatmap from '@/components/SectorHeatmap';
import WatchlistWidget from '@/components/WatchlistWidget';
import AlertsWidget from '@/components/AlertsWidget';

type RegionTab = 'americas' | 'emea' | 'apac';
type LogTab = 'alerts' | 'regime' | 'scanner' | 'notrade' | 'data';

const todayTiles = [
  { symbol: 'SPY', value: '+0.6%', spark: '▃▄▅▆▇', tone: 'bull' },
  { symbol: 'QQQ', value: '+0.8%', spark: '▃▄▆▇▇', tone: 'bull' },
  { symbol: 'IWM', value: '-0.2%', spark: '▅▄▃▂▁', tone: 'bear' },
  { symbol: 'VIX', value: '13.8', spark: '▃▂▃▂▁', tone: 'neutral' },
  { symbol: '10Y', value: '4.21', spark: '▃▄▅▅▄', tone: 'warn' },
  { symbol: 'DXY', value: '103.2', spark: '▅▄▃▂▁', tone: 'neutral' },
];

const globalRows: Record<RegionTab, Array<{ name: string; last: string; chg: string; d1: string; w1: string; m1: string; spark: string }>> = {
  americas: [
    { name: 'SPX', last: '5,212', chg: '+0.42%', d1: '+0.42%', w1: '+1.24%', m1: '+2.98%', spark: '▃▄▅▆▇' },
    { name: 'NDX', last: '18,011', chg: '+0.58%', d1: '+0.58%', w1: '+1.61%', m1: '+3.42%', spark: '▃▄▅▇▇' },
    { name: 'RUT', last: '2,054', chg: '-0.12%', d1: '-0.12%', w1: '+0.24%', m1: '+1.04%', spark: '▅▄▃▃▂' },
  ],
  emea: [
    { name: 'STOXX50', last: '4,821', chg: '+0.22%', d1: '+0.22%', w1: '+0.80%', m1: '+1.52%', spark: '▃▄▅▅▆' },
    { name: 'DAX', last: '18,391', chg: '+0.34%', d1: '+0.34%', w1: '+1.10%', m1: '+2.20%', spark: '▃▄▅▆▆' },
    { name: 'FTSE', last: '8,011', chg: '+0.06%', d1: '+0.06%', w1: '+0.14%', m1: '+0.63%', spark: '▃▃▄▄▅' },
  ],
  apac: [
    { name: 'NIKKEI', last: '39,101', chg: '+0.49%', d1: '+0.49%', w1: '+1.02%', m1: '+2.41%', spark: '▃▄▅▆▆' },
    { name: 'HSI', last: '17,032', chg: '-0.21%', d1: '-0.21%', w1: '+0.34%', m1: '+0.92%', spark: '▅▄▃▃▂' },
    { name: 'ASX200', last: '7,842', chg: '+0.11%', d1: '+0.11%', w1: '+0.27%', m1: '+0.74%', spark: '▃▄▄▅▅' },
  ],
};

const logs: Record<LogTab, Array<{ t: string; event: string; detail: string; tone?: 'bull' | 'bear' | 'warn' }>> = {
  alerts: [
    { t: '09:31', event: 'SPY volatility gate', detail: 'Alert fired on spread expansion near open.', tone: 'warn' },
    { t: '10:12', event: 'QQQ continuation', detail: 'Momentum confirmation with improving breadth.', tone: 'bull' },
  ],
  regime: [
    { t: '08:55', event: 'Regime unchanged', detail: 'Neutral trend with selective risk-on internals.' },
    { t: '09:40', event: 'Risk pulse upgrade', detail: 'Breadth > 55/45 while VIX remained contained.', tone: 'bull' },
  ],
  scanner: [
    { t: '09:47', event: 'Scanner hit: NVDA', detail: 'Trend continuation candidate, score 78.' },
    { t: '10:03', event: 'Scanner hit: TSLA', detail: 'Rejected due to elevated event risk.', tone: 'warn' },
  ],
  notrade: [
    { t: '10:05', event: 'No trade: IWM breakdown', detail: 'Failed confirmation stack, weak participation.', tone: 'bear' },
    { t: '10:18', event: 'No trade: BTC impulse', detail: 'Spread + slippage exceeded plan threshold.', tone: 'warn' },
  ],
  data: [
    { t: '09:29', event: 'Data health check', detail: 'All primary feeds green; backup feed synced.' },
    { t: '10:08', event: 'Quote delay recovered', detail: 'Transient delay resolved in 12 seconds.', tone: 'warn' },
  ],
};

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
  const rows = useMemo(() => globalRows[regionTab], [regionTab]);

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] px-2 py-3 text-slate-100 md:px-3">
      <div className="mx-auto grid w-full max-w-[1500px] gap-2">
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

        <section className="sticky top-2 z-20 flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-1.5">
          {[
            ['Regime', 'Neutral Trend'],
            ['Risk', 'Moderate'],
            ['Breadth', '56/44'],
            ['VIX', '13.8'],
            ['10Y', '4.21'],
            ['DXY', '103.2'],
            ['Data', 'Live'],
            ['Last Refresh', '09:42:11'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-full border border-[var(--msp-border)] px-2 py-0.5 text-[10px] text-[var(--msp-text-muted)]">
              <span className="font-semibold text-[var(--msp-text)]">{k}</span> · {v}
            </div>
          ))}
          <div className="ml-auto">
            <MarketStatusBadge compact showGlobal />
          </div>
        </section>

        <section className="grid gap-2 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-2">
            <div className="mb-1 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Zone 2 • Action</p>
                <h2 className="text-xs font-bold text-[var(--msp-text)]">Today&apos;s Plays / Watchlist / Scans</h2>
              </div>
              <Link href="/tools/scanner" className="text-[11px] font-semibold text-[var(--msp-accent)]">Open Scanner</Link>
            </div>

            <div className="h-[560px] overflow-y-auto rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-1.5">
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
