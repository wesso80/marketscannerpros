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
    title: 'Flow Concentration',
    subtitle: 'Flow concentration and unusual contracts',
    href: '/tools/options-confluence',
  },
  {
    title: 'Premium State',
    subtitle: 'Premium context and compression/expansion',
    href: '/tools/options-confluence',
  },
  {
    title: 'Put/Call Skew Bias',
    subtitle: 'Sentiment imbalance and defensive demand',
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
  const edgeState: 'BUILDING' | 'ACTIVE' | 'DEFENSIVE' = 'BUILDING';
  const edgeStateColor = {
    BUILDING: 'var(--msp-warn)',
    ACTIVE: 'var(--msp-bull)',
    DEFENSIVE: 'var(--msp-bear)',
  }[edgeState];

  return (
    <div style={{ background: 'var(--msp-bg)', minHeight: '100vh', padding: '1rem' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'grid', gap: '0.7rem' }}>
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
            padding: '0.42rem 0.62rem',
            display: 'flex',
            gap: '0.42rem',
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
            <div key={k} style={{ border: '1px solid var(--msp-border)', borderRadius: 999, padding: '0.16rem 0.48rem', color: 'var(--msp-text-muted)', fontSize: '0.72rem' }}>
              <strong style={{ color: 'var(--msp-text)' }}>{k}</strong> • {v}
            </div>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <MarketStatusBadge compact showGlobal />
          </div>
        </div>

        <section
          style={{
            background: 'var(--msp-panel)',
            border: '1px solid var(--msp-border-strong)',
            borderRadius: 14,
            padding: '0.72rem',
            display: 'grid',
            gap: '0.7rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '0.06rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 800 }}>Decision Plane</div>
              <div style={{ fontSize: '0.95rem', color: 'var(--msp-text)', fontWeight: 800 }}>Market Brain</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--msp-accent)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Current Regime: Neutral
              </div>
            </div>
            <div style={{ border: '1px solid var(--msp-border)', borderRadius: 999, padding: '0.2rem 0.6rem', color: edgeStateColor, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Edge State: {edgeState}
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-3">
            <Card title="Today In Markets">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {todayTiles.map((tile) => (
                  <div key={tile.symbol} style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.45rem 0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{tile.symbol}</div>
                      <div style={{ color: toneColor(tile.tone), fontWeight: 800 }}>{tile.value}</div>
                    </div>
                    <div style={{ marginTop: '0.25rem', color: toneColor(tile.tone), letterSpacing: '0.08em' }}>{tile.spark}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Sector Heatmap"
              right={<span style={{ fontSize: '0.7rem', color: 'var(--msp-accent)', fontWeight: 700 }}>Risk Regime • Balanced</span>}
            >
              <div style={{ minHeight: 336 }}>
                <SectorHeatmap />
              </div>
            </Card>
          </div>

          <div className="grid xl:grid-cols-2 gap-3">
            <Card title="Compare To Benchmarks" right={<Link href="/tools/market-movers" style={{ color: 'var(--msp-accent)', fontSize: '0.74rem', textDecoration: 'none' }}>Open Full</Link>}>
              <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.65rem' }}>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {[
                    ['SPY', '▃▄▅▆▇', '+0.6%'],
                    ['QQQ', '▃▄▆▇▇', '+0.8%'],
                    ['IWM', '▅▄▃▂▁', '-0.2%'],
                  ].map(([s, spark, chg]) => (
                    <div key={s} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{ color: 'var(--msp-text)', fontWeight: 700 }}>{s}</span>
                      <span style={{ color: 'var(--msp-accent)', letterSpacing: '0.08em' }}>{spark}</span>
                      <span style={{ color: (chg as string).startsWith('-') ? 'var(--msp-bear)' : 'var(--msp-bull)', fontWeight: 700 }}>{chg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Global Index Tables">
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                {(['americas', 'emea', 'apac'] as RegionTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRegionTab(tab)}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${regionTab === tab ? 'var(--msp-accent)' : 'var(--msp-border)'}`,
                      background: regionTab === tab ? 'var(--msp-accent-glow)' : 'var(--msp-panel-2)',
                      color: regionTab === tab ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
                      padding: '0.18rem 0.6rem',
                      fontSize: '0.72rem',
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
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr style={{ color: 'var(--msp-text-faint)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {['Name', 'Last', 'Chg', '1D', '1W', '1M', 'Spark'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '0.34rem 0.25rem', borderBottom: '1px solid var(--msp-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.name} style={{ borderBottom: '1px solid var(--msp-divider)' }}>
                        <td style={{ padding: '0.42rem 0.25rem', color: 'var(--msp-text)', fontWeight: 700 }}>{row.name}</td>
                        <td style={{ padding: '0.42rem 0.25rem', color: 'var(--msp-text-muted)' }}>{row.last}</td>
                        <td style={{ padding: '0.42rem 0.25rem', color: row.chg.startsWith('-') ? 'var(--msp-bear)' : 'var(--msp-bull)' }}>{row.chg}</td>
                        <td style={{ padding: '0.42rem 0.25rem', color: 'var(--msp-text-muted)' }}>{row.d1}</td>
                        <td style={{ padding: '0.42rem 0.25rem', color: 'var(--msp-text-muted)' }}>{row.w1}</td>
                        <td style={{ padding: '0.42rem 0.25rem', color: 'var(--msp-text-muted)' }}>{row.m1}</td>
                        <td style={{ padding: '0.42rem 0.25rem', color: 'var(--msp-accent)' }}>{row.spark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </section>

        <Card title="Flow Intelligence" right={<Link href="/tools/options-confluence" style={{ color: 'var(--msp-accent)', fontSize: '0.74rem', textDecoration: 'none' }}>Open Cockpit</Link>}>
          <Link
            href="/tools/options-confluence"
            style={{
              textDecoration: 'none',
              display: 'grid',
              background: 'var(--msp-panel)',
              border: '1px solid var(--msp-border-strong)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <div className="grid md:grid-cols-3" style={{ borderBottom: '1px solid var(--msp-border)' }}>
              {optionsPulse.map((item, index) => (
                <div
                  key={item.title}
                  style={{
                    padding: '0.7rem 0.75rem',
                    borderRight: index < optionsPulse.length - 1 ? '1px solid var(--msp-divider)' : 'none',
                    display: 'grid',
                    gap: '0.18rem',
                  }}
                >
                  <div style={{ color: 'var(--msp-text)', fontWeight: 800, fontSize: '0.82rem' }}>{item.title}</div>
                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.78rem' }}>{item.subtitle}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '0.45rem 0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--msp-text-faint)', fontWeight: 700 }}>Mini Cockpit</span>
              <span style={{ color: 'var(--msp-bull)', fontSize: '0.74rem', fontWeight: 700 }}>Edge Summary: Flow constructive</span>
              <span style={{ color: 'var(--msp-warn)', fontSize: '0.74rem', fontWeight: 700 }}>Volatility: Elevated watch</span>
              <span style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem' }}>Skew: Mild defensive put demand</span>
            </div>
          </Link>
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
