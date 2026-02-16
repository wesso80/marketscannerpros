import Link from 'next/link';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import LiveDeskFeedPanel from '@/components/LiveDeskFeedPanel';

const actionLayer = [
  { title: 'Scanner', href: '/tools/scanner', desc: 'Signal discovery and qualification' },
  { title: 'Options Confluence', href: '/tools/options-confluence', desc: 'Strike, expiry, and flow context' },
  { title: 'Deep Analysis', href: '/tools/deep-analysis', desc: 'Regime and multi-factor diagnostics' },
  { title: 'Portfolio', href: '/tools/portfolio', desc: 'Risk posture and performance state' },
];

const trustMetrics = [
  { label: 'Monitored Universe', value: '500+', note: 'Cross-asset symbols' },
  { label: 'Terminal Modules', value: '20+', note: 'Decision and execution tooling' },
  { label: 'Market Refresh', value: '60s', note: 'Live surface cadence' },
  { label: 'Workflow Layers', value: '3', note: 'Home → Workspace → Terminal' },
  { label: 'AI Context', value: 'Multi-TF', note: 'Structure-aware interpretation' },
  { label: 'Desk State', value: 'Always-On', note: 'Institutional mission control' },
];

const ecosystem = ['Observe', 'Contextualize', 'Scanner', 'Options', 'Deep Analysis', 'Portfolio', 'Journal', 'Learn'];

const pricingCards = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    href: '/tools/scanner',
    cta: 'Start Command Mode',
    bullets: ['Core scanner access', 'Baseline AI context', 'Watchlist + journal access'],
  },
  {
    name: 'Pro',
    price: '$39.99',
    period: '/ month',
    href: '/pricing',
    cta: 'Upgrade to Pro',
    bullets: ['Unlimited scanning', 'Expanded AI analyst usage', 'Advanced market surfaces'],
  },
  {
    name: 'Pro Trader',
    price: '$89.99',
    period: '/ month',
    href: '/pricing',
    cta: 'Unlock Full Terminal',
    bullets: ['Options + deep analysis stack', 'Backtesting and execution workflow', 'Institutional-grade toolkit'],
  },
];

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--msp-bg)', color: 'var(--msp-text)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0.8rem 1rem 2rem', display: 'grid', gap: '0.95rem' }}>
        <div
          style={{
            position: 'sticky',
            top: 10,
            zIndex: 30,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.42rem',
            alignItems: 'center',
            padding: '0.42rem 0.6rem',
            borderRadius: 12,
            background: 'var(--msp-panel)',
            border: '1px solid var(--msp-border-strong)',
          }}
        >
          {[
            ['Regime', 'Trend'],
            ['Risk', 'Moderate'],
            ['VIX', '13.8'],
            ['DXY', '103.2'],
            ['Data', 'Live'],
          ].map(([k, v]) => (
            <div key={k} style={{ border: '1px solid var(--msp-border)', borderRadius: 999, padding: '0.18rem 0.5rem', fontSize: '0.72rem', color: 'var(--msp-text-muted)' }}>
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
            padding: '1rem',
          }}
        >
          <div className="grid lg:grid-cols-2 gap-4">
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.73rem', color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 800 }}>
                Command Authority
              </div>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 3.6vw, 2.35rem)', lineHeight: 1.12, fontWeight: 850 }}>
                Home Command Screen. Institutional context before workspace.
              </h1>
              <p style={{ margin: 0, color: 'var(--msp-text-muted)', maxWidth: 700, lineHeight: 1.55 }}>
                MSP opens like a trading floor: market state first, then branching decisions into terminal-grade tools. Personal dashboard remains a secondary workspace.
              </p>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
                {actionLayer.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    style={{
                      textDecoration: 'none',
                      border: '1px solid var(--msp-border)',
                      borderRadius: 10,
                      background: 'var(--msp-card)',
                      padding: '0.65rem',
                      display: 'grid',
                      gap: '0.25rem',
                    }}
                  >
                    <div style={{ color: 'var(--msp-accent)', fontWeight: 800, fontSize: '0.84rem' }}>▶ {item.title}</div>
                    <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', lineHeight: 1.4 }}>{item.desc}</div>
                  </Link>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <Link href="/tools/markets" style={{ textDecoration: 'none', padding: '0.58rem 0.86rem', borderRadius: 10, background: 'var(--msp-accent)', color: '#051017', fontWeight: 800, fontSize: '0.84rem' }}>
                  Enter Markets Hub
                </Link>
                <Link href="/dashboard" style={{ textDecoration: 'none', padding: '0.58rem 0.86rem', borderRadius: 10, border: '1px solid var(--msp-border)', color: 'var(--msp-text)', fontWeight: 700, fontSize: '0.84rem', background: 'var(--msp-card)' }}>
                  My Workspace
                </Link>
              </div>
            </div>

            <aside
              style={{
                border: '1px solid var(--msp-border)',
                borderRadius: 12,
                background: 'var(--msp-card)',
                padding: '0.8rem',
                display: 'grid',
                gap: '0.52rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: 'var(--msp-text-faint)' }}>
                Live System Status
              </div>
              {[
                ['System State', 'ONLINE'],
                ['Ingestion', 'ACTIVE'],
                ['Signal Health', 'STABLE'],
                ['Latency Band', '< 1200ms'],
                ['Terminal Readiness', 'GREEN'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--msp-divider)', paddingBottom: '0.32rem', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--msp-text-muted)' }}>{k}</span>
                  <strong style={{ color: 'var(--msp-accent)' }}>{v}</strong>
                </div>
              ))}
            </aside>
          </div>
        </section>

        <section
          style={{
            background: 'var(--msp-card)',
            border: '1px solid var(--msp-border)',
            borderRadius: 14,
            padding: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.75rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 800 }}>
            System Architecture
          </div>
          <div className="grid md:grid-cols-5 gap-2">
            {['Observe', 'Contextualize', 'Decide', 'Execute', 'Learn'].map((stage, index) => (
              <div key={stage} style={{ border: '1px solid var(--msp-border)', borderRadius: 10, background: index === 2 ? 'var(--msp-panel)' : 'var(--msp-panel-2)', padding: '0.65rem 0.7rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--msp-text-faint)', marginBottom: '0.2rem' }}>0{index + 1}</div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{stage}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            background: 'var(--msp-card)',
            border: '1px solid var(--msp-border)',
            borderRadius: 14,
            padding: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.68rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 800 }}>
            Live Intelligence Snapshot
          </div>
          <LiveDeskFeedPanel />
        </section>

        <section
          style={{
            background: 'var(--msp-card)',
            border: '1px solid var(--msp-border)',
            borderRadius: 14,
            padding: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.7rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 800 }}>
            Performance Metrics
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trustMetrics.map((metric) => (
              <div key={metric.label} style={{ border: '1px solid var(--msp-border)', borderRadius: 10, background: 'var(--msp-panel)', padding: '0.65rem 0.7rem' }}>
                <div style={{ color: 'var(--msp-text-faint)', fontSize: '0.69rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{metric.label}</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 850, color: 'var(--msp-accent)', marginBottom: '0.1rem' }}>{metric.value}</div>
                <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem' }}>{metric.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            background: 'var(--msp-card)',
            border: '1px solid var(--msp-border)',
            borderRadius: 14,
            padding: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.7rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 800 }}>
            Strategy Ecosystem
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {ecosystem.map((item) => (
              <span key={item} style={{ border: '1px solid var(--msp-border)', borderRadius: 999, padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--msp-text-muted)', background: 'var(--msp-panel)' }}>
                {item}
              </span>
            ))}
          </div>
        </section>

        <section
          style={{
            background: 'var(--msp-panel)',
            border: '1px solid var(--msp-border-strong)',
            borderRadius: 14,
            padding: '1rem',
          }}
        >
          <div style={{ marginBottom: '0.85rem' }}>
            <div style={{ fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 800 }}>
              Pricing
            </div>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--msp-text-muted)', fontSize: '0.86rem' }}>
              Flat institutional cards. Start with command visibility, scale into terminal execution.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {pricingCards.map((card) => (
              <div key={card.name} style={{ border: '1px solid var(--msp-border)', borderRadius: 12, background: 'var(--msp-card)', padding: '0.8rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.35rem' }}>{card.name}</div>
                <div style={{ marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 850, color: 'var(--msp-accent)' }}>{card.price}</span>
                  <span style={{ color: 'var(--msp-text-muted)', marginLeft: 6, fontSize: '0.8rem' }}>{card.period}</span>
                </div>
                <div style={{ display: 'grid', gap: '0.28rem', marginBottom: '0.8rem' }}>
                  {card.bullets.map((bullet) => (
                    <div key={bullet} style={{ color: 'var(--msp-text-muted)', fontSize: '0.78rem' }}>• {bullet}</div>
                  ))}
                </div>
                <Link href={card.href} style={{ display: 'inline-block', textDecoration: 'none', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--msp-border)', background: 'var(--msp-panel)', color: 'var(--msp-text)', fontWeight: 700, fontSize: '0.78rem' }}>
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
