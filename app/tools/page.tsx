'use client';

import Link from 'next/link';

const proTraderTools = [
  {
    href: '/tools/confluence-scanner',
    icon: '🔮',
    title: 'Time Confluence Scanner',
    description: 'Detect multi-timeframe decompression events and 50% magnet windows.',
    badge: 'Pro Trader',
  },
  {
    href: '/tools/options-confluence',
    icon: '🎯',
    title: 'Options Confluence Scanner',
    description: 'Strike and expiry recommendations with flow, structure, and Greeks context.',
    badge: 'Pro Trader',
  },
];

const platformTools = [
  { href: '/operator', icon: '🧭', title: 'Operator Dashboard', description: 'Unified execution surface for signal flow, risk command, and learning loop.' },
  { href: '/tools/scanner', icon: '📊', title: 'Multi-Market Scanner', description: 'Scan equities, crypto, and forex with structured filters.' },
  { href: '/tools/gainers-losers', icon: '🚀', title: 'Top Gainers & Losers', description: 'Track strongest movers, laggards, and active symbols.' },
  { href: '/tools/company-overview', icon: '🏢', title: 'Company Overview', description: 'Fundamentals, valuation, growth, and analyst context.' },
  { href: '/tools/news', icon: '📰', title: 'News & Sentiment', description: 'Headline flow and sentiment intelligence by symbol.' },
  { href: '/tools/heatmap', icon: '🗺️', title: 'Sector Heatmap', description: 'S&P sector rotation view across key time horizons.' },
  { href: '/tools/crypto-heatmap', icon: '🪙', title: 'Crypto Heatmap', description: 'Visual leadership map for major crypto assets.' },
  { href: '/tools/crypto-dashboard', icon: '₿', title: 'Crypto Derivatives', description: 'Funding, OI, and derivatives pressure diagnostics.' },
  { href: '/tools/commodities', icon: '🛢️', title: 'Commodities', description: 'Energy, metals, and agriculture price dashboard.' },
  { href: '/tools/market-movers', icon: '📈', title: 'Market Movers', description: 'Institutional watchlist of high-impact daily movers.' },
  { href: '/tools/macro', icon: '🏛️', title: 'Macro Dashboard', description: 'Rates, inflation, employment, and macro regime data.' },
  { href: '/tools/news?tab=earnings', icon: '📅', title: 'Earnings Calendar', description: 'Event-risk map for upcoming earnings windows.' },
  { href: '/tools/intraday-charts', icon: '⏱️', title: 'Intraday Charts', description: 'Fast intraday charting and session-level views.' },
  { href: '/tools/portfolio', icon: '💼', title: 'Portfolio', description: 'Track risk posture, return streams, and exposure.' },
  { href: '/tools/journal', icon: '📓', title: 'Trade Journal', description: 'Record execution quality and review discipline.' },
  { href: '/tools/ai-analyst', icon: '🧠', title: 'AI Analyst', description: 'Structured AI decision support for active workflows.' },
  { href: '/tools/backtest', icon: '📈', title: 'Backtest', description: 'Validate strategy logic against historical data.' },
];

function Card({ href, icon, title, description, badge }: { href: string; icon: string; title: string; description: string; badge?: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article
        style={{
          background: 'var(--msp-card)',
          border: '1px solid var(--msp-border)',
          borderRadius: 12,
          padding: '0.8rem',
          display: 'grid',
          gap: '0.4rem',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '1.35rem' }}>{icon}</span>
          {badge && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid rgba(168,85,247,0.6)',
                color: '#c4b5fd',
                background: 'rgba(168,85,247,0.12)',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 650 }}>{title}</div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--msp-text-muted)' }}>{description}</p>
      </article>
    </Link>
  );
}

export default function ToolsPage() {
  const year = new Date().getFullYear();

  return (
    <main style={{ minHeight: '100vh', background: 'var(--msp-bg)', color: 'var(--msp-text)' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '1.2rem 1rem 2.5rem', display: 'grid', gap: '1rem' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.8rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-faint)', fontWeight: 800 }}>
              Tools
            </div>
            <h1 style={{ margin: '0.25rem 0 0', fontSize: 26, fontWeight: 750 }}>MSP Tooling Command Hub</h1>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--msp-text-muted)', fontSize: 13 }}>
              Institutional workflow surfaces for observe → decide → execute.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link
              href="/tools/markets"
              style={{
                textDecoration: 'none',
                borderRadius: 999,
                background: 'var(--msp-accent)',
                color: '#041016',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Open Markets Dashboard
            </Link>
            <Link
              href="/dashboard"
              style={{
                textDecoration: 'none',
                borderRadius: 999,
                border: '1px solid var(--msp-border)',
                color: 'var(--msp-text)',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                background: 'var(--msp-panel)',
              }}
            >
              Workspace
            </Link>
          </div>
        </header>

        <section
          style={{
            background: 'var(--msp-panel)',
            border: '1px solid var(--msp-border-strong)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <Link href="/tools/markets" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, background: 'var(--msp-panel-2)' }}>🧭</div>
            <div style={{ padding: '0.9rem' }}>
              <div style={{ fontSize: 11, color: 'var(--msp-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Primary Workspace</div>
              <h2 style={{ margin: '0.3rem 0 0.35rem', fontSize: 22, fontWeight: 700 }}>Markets Dashboard</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--msp-text-muted)' }}>
                Sticky regime strip, benchmark intelligence, options pulse, watchlist, news, calendar, and alerts in one command surface.
              </p>
            </div>
          </Link>
        </section>

        <section>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: 16, fontWeight: 650 }}>Pro Trader Scanners</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {proTraderTools.map((tool) => (
              <Card key={tool.href} {...tool} />
            ))}
          </div>
        </section>

        <section>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: 16, fontWeight: 650 }}>Platform Tools</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {platformTools.map((tool) => (
              <Card key={tool.href} {...tool} />
            ))}
          </div>
        </section>

        <footer
          style={{
            marginTop: 6,
            borderTop: '1px solid rgba(15,23,42,0.9)',
            paddingTop: 12,
            fontSize: 11,
            color: 'var(--msp-text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>© {year} MarketScannerPros</span>
          <span>Educational market tooling — not financial advice.</span>
        </footer>
      </div>
    </main>
  );
}
