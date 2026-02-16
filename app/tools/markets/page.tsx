'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import SectorHeatmap from '@/components/SectorHeatmap';
import WatchlistWidget from '@/components/WatchlistWidget';
import AlertsWidget from '@/components/AlertsWidget';

type RegionTab = 'americas' | 'emea' | 'apac';

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

const optionsPulse = [
  {
    title: 'Unusual Volume Leaders',
    subtitle: 'Flow concentration and unusual contracts',
    href: '/tools/options-confluence',
  },
  {
    title: 'IV Rank / IV Crush',
    subtitle: 'Premium context and compression/expansion',
    href: '/tools/options-confluence',
  },
  {
    title: 'Put/Call Extremes + Skew',
    subtitle: 'Sentiment imbalance and tail-risk pricing',
    href: '/tools/options-confluence',
  },
];

function toneColor(tone: string) {
  if (tone === 'bull') return 'var(--msp-bull)';
  if (tone === 'bear') return 'var(--msp-bear)';
  if (tone === 'warn') return 'var(--msp-warn)';
  return 'var(--msp-neutral)';
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--msp-card)',
        border: '1px solid var(--msp-border)',
        borderRadius: 14,
        padding: '0.9rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '0.86rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 800 }}>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function MarketsPage() {
  const [regionTab, setRegionTab] = useState<RegionTab>('americas');
  const rows = useMemo(() => globalRows[regionTab], [regionTab]);

  return (
    <div style={{ background: 'var(--msp-bg)', minHeight: '100vh', padding: '1rem' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'grid', gap: '0.9rem' }}>
        <nav
          style={{
            background: 'var(--msp-card)',
            border: '1px solid var(--msp-border)',
            borderRadius: 12,
            padding: '0.65rem 0.8rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.65rem 0.95rem',
            alignItems: 'center',
          }}
        >
          {[
            ['Tools', '/tools'],
            ['Markets', '/tools/markets'],
            ['Calendar', '/tools/economic-calendar'],
            ['News', '/tools/news'],
            ['Watchlist', '/tools/watchlists'],
            ['Account', '/account'],
          ].map(([label, href]) => (
            <Link key={label} href={href} style={{ color: label === 'Markets' ? 'var(--msp-accent)' : 'var(--msp-text-muted)', textDecoration: 'none', fontSize: '0.86rem', fontWeight: 700 }}>
              {label}
            </Link>
          ))}
        </nav>

        <div
          style={{
            position: 'sticky',
            top: 10,
            zIndex: 20,
            background: 'var(--msp-panel)',
            border: '1px solid var(--msp-border-strong)',
            borderRadius: 12,
            padding: '0.5rem 0.7rem',
            display: 'flex',
            gap: '0.55rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {[
            ['Regime', 'Trend'],
            ['Risk', 'Moderate'],
            ['Breadth', '56/44'],
            ['VIX', '13.8'],
            ['10Y', '4.21'],
            ['DXY', '103.2'],
            ['Data', 'Live'],
          ].map(([k, v]) => (
            <div key={k} style={{ border: '1px solid var(--msp-border)', borderRadius: 999, padding: '0.2rem 0.55rem', color: 'var(--msp-text-muted)', fontSize: '0.74rem' }}>
              <strong style={{ color: 'var(--msp-text)' }}>{k}</strong> • {v}
            </div>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <MarketStatusBadge compact showGlobal />
          </div>
        </div>

        <div className="grid xl:grid-cols-2 gap-4">
          <Card title="Today In Markets">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {todayTiles.map((tile) => (
                <div key={tile.symbol} style={{ background: 'var(--msp-panel)', border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.55rem 0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{tile.symbol}</div>
                    <div style={{ color: toneColor(tile.tone), fontWeight: 800 }}>{tile.value}</div>
                  </div>
                  <div style={{ marginTop: '0.35rem', color: toneColor(tile.tone), letterSpacing: '0.08em' }}>{tile.spark}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Sector Heatmap"
            right={<span style={{ fontSize: '0.72rem', color: 'var(--msp-accent)', fontWeight: 700 }}>Risk Regime • Balanced</span>}
          >
            <div style={{ minHeight: 360 }}>
              <SectorHeatmap />
            </div>
          </Card>
        </div>

        <div className="grid xl:grid-cols-2 gap-4">
          <Card title="Compare To Benchmarks" right={<Link href="/tools/market-movers" style={{ color: 'var(--msp-accent)', fontSize: '0.76rem', textDecoration: 'none' }}>Open Full</Link>}>
            <div style={{ background: 'var(--msp-panel)', border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.8rem' }}>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {[
                  ['SPY', '▃▄▅▆▇', '+0.6%'],
                  ['QQQ', '▃▄▆▇▇', '+0.8%'],
                  ['IWM', '▅▄▃▂▁', '-0.2%'],
                ].map(([s, spark, chg]) => (
                  <div key={s} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--msp-text)', fontWeight: 700 }}>{s}</span>
                    <span style={{ color: 'var(--msp-accent)', letterSpacing: '0.08em' }}>{spark}</span>
                    <span style={{ color: (chg as string).startsWith('-') ? 'var(--msp-bear)' : 'var(--msp-bull)', fontWeight: 700 }}>{chg}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Global Index Tables">
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
              {(['americas', 'emea', 'apac'] as RegionTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRegionTab(tab)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${regionTab === tab ? 'var(--msp-accent)' : 'var(--msp-border)'}`,
                    background: regionTab === tab ? 'var(--msp-accent-glow)' : 'var(--msp-panel)',
                    color: regionTab === tab ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
                    padding: '0.2rem 0.65rem',
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ color: 'var(--msp-text-faint)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {['Name', 'Last', 'Chg', '1D', '1W', '1M', 'Spark'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.3rem', borderBottom: '1px solid var(--msp-border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.name} style={{ borderBottom: '1px solid var(--msp-divider)' }}>
                      <td style={{ padding: '0.5rem 0.3rem', color: 'var(--msp-text)', fontWeight: 700 }}>{row.name}</td>
                      <td style={{ padding: '0.5rem 0.3rem', color: 'var(--msp-text-muted)' }}>{row.last}</td>
                      <td style={{ padding: '0.5rem 0.3rem', color: row.chg.startsWith('-') ? 'var(--msp-bear)' : 'var(--msp-bull)' }}>{row.chg}</td>
                      <td style={{ padding: '0.5rem 0.3rem', color: 'var(--msp-text-muted)' }}>{row.d1}</td>
                      <td style={{ padding: '0.5rem 0.3rem', color: 'var(--msp-text-muted)' }}>{row.w1}</td>
                      <td style={{ padding: '0.5rem 0.3rem', color: 'var(--msp-text-muted)' }}>{row.m1}</td>
                      <td style={{ padding: '0.5rem 0.3rem', color: 'var(--msp-accent)' }}>{row.spark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card title="Options Pulse" right={<Link href="/tools/options-confluence" style={{ color: 'var(--msp-accent)', fontSize: '0.76rem', textDecoration: 'none' }}>Open Cockpit</Link>}>
          <div className="grid md:grid-cols-3 gap-3">
            {optionsPulse.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                style={{
                  textDecoration: 'none',
                  background: 'var(--msp-panel)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: 10,
                  padding: '0.75rem',
                  minHeight: 110,
                  display: 'grid',
                  alignContent: 'space-between',
                }}
              >
                <div style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{item.title}</div>
                <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.82rem' }}>{item.subtitle}</div>
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid xl:grid-cols-2 gap-4">
          <Card title="Watchlist" right={<Link href="/tools/watchlists" style={{ color: 'var(--msp-accent)', fontSize: '0.76rem', textDecoration: 'none' }}>Manage</Link>}>
            <WatchlistWidget />
          </Card>

          <Card title="News">
            <div className="grid gap-2.5">
              {[
                ['Earnings', 'Earnings calendar and company-specific events', '/tools/earnings'],
                ['Macro', 'Market-moving macro headlines and context', '/tools/macro'],
                ['Sentiment', 'Headline and sentiment scanner', '/tools/news'],
              ].map(([tag, desc, href]) => (
                <Link
                  key={tag}
                  href={href}
                  style={{
                    textDecoration: 'none',
                    background: 'var(--msp-panel)',
                    border: '1px solid var(--msp-border)',
                    borderRadius: 10,
                    padding: '0.7rem 0.75rem',
                    display: 'grid',
                    gap: '0.2rem',
                  }}
                >
                  <div style={{ color: 'var(--msp-accent)', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase' }}>{tag}</div>
                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.84rem' }}>{desc}</div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid xl:grid-cols-2 gap-4">
          <Card title="Calendar" right={<Link href="/tools/economic-calendar" style={{ color: 'var(--msp-accent)', fontSize: '0.76rem', textDecoration: 'none' }}>Open</Link>}>
            <div style={{ background: 'var(--msp-panel)', border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.75rem', color: 'var(--msp-text-muted)', fontSize: '0.86rem' }}>
              <div style={{ marginBottom: '0.35rem' }}><strong style={{ color: 'var(--msp-text)' }}>Earnings + Macro</strong> unified timing view for execution windows.</div>
              <div>Use calendar events to align scanner triggers and avoid low-quality entries around major releases.</div>
            </div>
          </Card>

          <Card title="Alerts & Plays" right={<Link href="/tools/scanner" style={{ color: 'var(--msp-accent)', fontSize: '0.76rem', textDecoration: 'none' }}>Scanner</Link>}>
            <AlertsWidget compact />
          </Card>
        </div>
      </div>
    </div>
  );
}
