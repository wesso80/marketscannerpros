'use client';

import Link from 'next/link';

const scripts = [
  {
    name: "MSP — Multi-TF Dashboard v3",
    description: "Reads 4 timeframes at once and scores trend, momentum and bias. Gives you instant clarity on whether the market is aligned long, short or stuck in chop.",
    image: "/images/msp-dashboard.png",
    status: "Live · Invite-only",
    focus: "Context & bias",
    type: "TV: Indicator"
  },
  {
    name: "MSP Auto Fib Tool – Locked & Alerts",
    description: "Automatically anchors swings, plots key retracement/extension levels and lets you lock zones for precise, repeatable execution with alerts.",
    image: "/images/auto-fib.png",
    status: "Beta · Invite-only",
    focus: "Levels & structure",
    type: "TV: Indicator"
  },
  {
    name: "MarketScannerPros — Confluence Strategy",
    description: "Multi-signal strategy that combines trend, momentum, structure and time-based filters. Used internally to stress-test ideas before indicators ship.",
    image: "/images/confluence-strategy.png",
    status: "Private testing",
    focus: "System testing",
    type: "TV: Strategy"
  },
  {
    name: "Time Confluence Windows v6.7 - Hot Zones",
    description: "Tracks multiple timeframe closes (30m to 8h) with countdown timers, 50% levels, distance percentage, and cluster detection. Hot Zone alerts when 3+ TFs close within 5 minutes.",
    image: "/images/time-confluence.png",
    status: "Live · Invite-only",
    focus: "Timing zones",
    type: "TV: Indicator",
    isNew: true
  },
  {
    name: "Short & Long Squeeze Backtest v6",
    description: "A volatility-squeeze strategy that auto-backtests both breakout expansions and reversal snaps. Comes with built-in optimization logic.",
    image: "/images/squeeze-strategy.png",
    status: "Live · Invite-only",
    focus: "Volatility breakouts",
    type: "TV: Strategy"
  },
  {
    name: "A+ Setup Scanner - Bullish/Bearish",
    description: "Combines EMA alignment, RSI momentum, MACD, volume and breakout detection into a single score. Mobile-optimized table shows bias from Strong Bullish to Strong Bearish at a glance.",
    image: "/images/aplus-scanner.png",
    status: "Live · Invite-only",
    focus: "Setup scoring",
    type: "TV: Indicator"
  }
];

const steps = [
  { step: "1", text: "Subscribe to Pro Trader ($9.99/mo or $99.99/yr)" },
  { step: "2", text: "Email us with your TradingView username" },
  { step: "3", text: "We'll add you to all invite-only scripts" },
  { step: "4", text: "Access granted within 24 hours" }
];

const faqs = [
  {
    q: "How do I get access to the scripts?",
    a: "All TradingView scripts and indicators are included with your Pro Trader subscription. Simply email us your TradingView username after subscribing and we'll grant you access within 24 hours."
  },
  {
    q: "What do I need to get started?",
    a: "A Pro Trader subscription and a valid TradingView username. Access is granted manually via TradingView's invite-only system."
  },
  {
    q: "Do I get access to all scripts?",
    a: "Yes! Pro Trader subscribers get full access to ALL scripts and indicators – including the Multi-TF Dashboard, Auto Fib Tool, Confluence Strategy, and any new scripts we release."
  }
];

export default function TradingViewScriptsPage() {
  const emailLink = "mailto:support@marketscannerpros.app?subject=Free%20Trial%20Request%20-%20MarketScannerPros&body=Hi%2C%0A%0AI%27d%20like%20to%20request%20a%20free%20trial%20of%20your%20TradingView%20indicators.%0A%0ATradingView%20username%3A%20%0AScripts%20I%27m%20most%20interested%20in%3A%20%0A%0AThanks%2C%0A";

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #020617 50%, #000 100%)' }}>
      <div style={{ paddingTop: 32, paddingBottom: 60 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px' }}>
          
          {/* Hero Section */}
          <section style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
            borderRadius: 20,
            border: '1px solid rgba(16, 185, 129, 0.2)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            padding: '40px 32px',
            marginBottom: 40,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Decorative glow */}
            <div style={{
              position: 'absolute',
              right: -80,
              top: -80,
              width: 300,
              height: 300,
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15), transparent 60%)',
              pointerEvents: 'none'
            }} />
            
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#34d399',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid rgba(16, 185, 129, 0.3)',
                marginBottom: 16
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                Included with Pro Trader subscription
              </div>

              <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f1f5f9', marginBottom: 12, lineHeight: 1.2 }}>
                TradingView Scripts & Indicators
              </h1>
              <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 600, marginBottom: 16, lineHeight: 1.7 }}>
                Professional multi-timeframe dashboards, auto-Fib tools, and confluence strategies built for traders who want structure and clarity.
              </p>
              
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))',
                border: '1px solid rgba(139,92,246,0.3)',
                marginBottom: 24
              }}>
                <span style={{ fontSize: 20 }}>👑</span>
                <span style={{ color: '#a78bfa', fontSize: 14, fontWeight: 600 }}>
                  Pro Trader subscribers get full access to ALL scripts & indicators
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
                {[
                  { icon: '📊', text: 'Multi-TF dashboards for bias & alignment' },
                  { icon: '📐', text: 'Auto-Fib tools with smart levels & alerts' },
                  { icon: '⏰', text: 'Time confluence windows for key zones' },
                  { icon: '🔓', text: 'Full access with Pro Trader tier' }
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 14 }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Link href="/pricing" style={{
                  padding: '14px 28px',
                  background: 'linear-gradient(135deg, #10b981, #22c55e)',
                  borderRadius: 12,
                  color: '#0b1120',
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 8px 25px rgba(16, 185, 129, 0.35)'
                }}>
                  👑 Get Pro Trader
                </Link>
                <a href="https://www.tradingview.com/u/Marketscannerpros/" target="_blank" rel="noreferrer" style={{
                  padding: '14px 28px',
                  background: 'transparent',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  borderRadius: 12,
                  color: '#94a3b8',
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  View on TradingView →
                </a>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.9), rgba(30,41,59,0.4))',
            borderRadius: 16,
            border: '1px solid rgba(148, 163, 184, 0.1)',
            padding: '28px',
            marginBottom: 40
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>🚀</span> How to Get Access
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {steps.map((s, i) => (
                <div key={i} style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: 12,
                  padding: '20px',
                  border: '1px solid rgba(148, 163, 184, 0.1)'
                }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 12
                  }}>{s.step}</div>
                  <p style={{ color: '#cbd5e1', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{s.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Scripts Grid */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
              📈 Available Scripts (Beta)
            </h2>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
              All scripts are currently offered on a free-trial basis via TradingView invite-only access.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              {scripts.map((script, i) => (
                <article key={i} style={{
                  background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.1)',
                  overflow: 'hidden',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                  position: 'relative'
                }}>
                  {script.isNew && (
                    <div style={{
                      position: 'absolute',
                      right: 12,
                      top: 12,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(234, 179, 8, 0.15)',
                      border: '1px solid rgba(234, 179, 8, 0.5)',
                      color: '#fde047',
                      fontSize: 11,
                      fontWeight: 700,
                      zIndex: 2
                    }}>NEW</div>
                  )}
                  <div style={{ height: 160, background: '#0f172a', overflow: 'hidden', position: 'relative' }}>
                    <img 
                      src={script.image} 
                      alt={script.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} 
                    />
                    <div style={{
                      position: 'absolute',
                      left: 12,
                      top: 12,
                      padding: '5px 10px',
                      borderRadius: 999,
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      color: '#94a3b8',
                      fontSize: 11
                    }}>{script.status}</div>
                  </div>
                  <div style={{ padding: '16px 18px' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{script.name}</h3>
                    <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 12 }}>{script.description}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748b' }}>
                      <span>Focus: <span style={{ color: '#10b981' }}>{script.focus}</span></span>
                      <span>{script.type}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* FAQs */}
          <section style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.9), rgba(30,41,59,0.4))',
            borderRadius: 16,
            border: '1px solid rgba(148, 163, 184, 0.1)',
            padding: '28px',
            marginBottom: 40
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>❓</span> Frequently Asked Questions
            </h2>
            <div style={{ display: 'grid', gap: 16 }}>
              {faqs.map((faq, i) => (
                <div key={i} style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: 12,
                  padding: '20px 24px',
                  border: '1px solid rgba(148, 163, 184, 0.1)'
                }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#10b981', marginBottom: 8 }}>{faq.q}</h3>
                  <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.7 }}>{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA Section */}
          <section style={{
            textAlign: 'center',
            padding: '48px 24px',
            background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.08), rgba(15,23,42,0.9))',
            borderRadius: 20,
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', marginBottom: 12 }}>
              Ready to enhance your trading?
            </h2>
            <p style={{ fontSize: 16, color: '#94a3b8', marginBottom: 28, maxWidth: 500, margin: '0 auto 28px' }}>
              Pro Trader subscribers get full access to ALL TradingView scripts and indicators included in their subscription.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <Link href="/pricing" style={{
                padding: '16px 32px',
                background: 'linear-gradient(135deg, #10b981, #22c55e)',
                borderRadius: 12,
                color: '#0b1120',
                fontWeight: 700,
                fontSize: 16,
                textDecoration: 'none',
                boxShadow: '0 8px 25px rgba(16, 185, 129, 0.35)'
              }}>
                Get Pro Trader →
              </Link>
              <Link href="/tools" style={{
                padding: '16px 32px',
                background: 'transparent',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: 12,
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 16,
                textDecoration: 'none'
              }}>
                Explore All Tools
              </Link>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 24 }}>
              <strong>Disclaimer:</strong> This is an educational tool, not financial advice. Always confirm signals within your own plan and manage risk.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
