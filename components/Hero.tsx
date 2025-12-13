'use client';

import Link from "next/link";

export default function Hero() {
  const emailLink = "mailto:support@marketscannerpros.app?subject=Free%20Trial%20Request%20-%20MarketScannerPros&body=Hi%2C%0A%0AI%27d%20like%20to%20request%20a%20free%20trial%20of%20MarketScannerPros.%0A%0AThanks%2C%0A";

  return (
    <>
      <style jsx global>{`
        :root {
          --bg: #05070b;
          --bg-alt: #0c1018;
          --card: #111624;
          --accent: #14b8a6;
          --accent-soft: rgba(20, 184, 166, 0.12);
          --text-main: #f9fafb;
          --text-muted: #9ca3af;
          --border-subtle: #1f2933;
          --radius-lg: 18px;
          --radius-md: 12px;
          --shadow-soft: 0 18px 45px rgba(0,0,0,0.75);
          --shadow-small: 0 10px 25px rgba(0,0,0,0.5);
        }
      `}</style>

      <section style={{
        width: '100%',
        background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
        color: 'var(--text-main)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{ maxWidth: 1120, padding: '48px 20px 60px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2.1fr) minmax(0, 1.6fr)',
            gap: 26,
            marginBottom: 40
          }}>
            {/* Hero section */}
            <div style={{
              background: 'radial-gradient(circle at top, #111827, #020617 60%)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
              padding: '28px 26px 26px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                right: -40,
                top: -40,
                width: 280,
                height: 280,
                background: 'radial-gradient(circle, rgba(34,197,94,0.25), transparent 60%)',
                filter: 'blur(1px)',
                opacity: 0.8
              }} aria-hidden="true"></div>
              
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--text-muted)',
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.9)',
                border: '1px solid rgba(148,163,184,0.25)',
                marginBottom: 12
              }}>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: 'rgba(34,197,94,0.12)',
                  color: '#bbf7d0',
                  fontSize: 11
                }}>100% Free</span>
                <span>No credit card required</span>
              </div>

              {/* Logo */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16, 
                marginBottom: 16 
              }}>
                <img 
                  src="/logos/msp-logo.png" 
                  alt="MarketScanner Pro Logo" 
                  style={{ 
                    width: 80, 
                    height: 80, 
                    objectFit: 'contain' 
                  }} 
                />
                <div>
                  <div style={{ 
                    fontSize: 24, 
                    fontWeight: 700, 
                    color: '#f9fafb',
                    marginBottom: 4
                  }}>
                    MarketScanner Pro
                  </div>
                  <div style={{ 
                    fontSize: 13, 
                    color: '#14b8a6',
                    fontWeight: 500
                  }}>
                    Phase-Based Market Intelligence
                  </div>
                </div>
              </div>

              <h1 style={{ fontSize: 32, lineHeight: 1.2, marginBottom: 12, fontWeight: 700 }}>
                Stop Guessing the Market.
                <br />
                <span style={{ color: '#22c55e' }}>Start Understanding It.</span>
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-muted)', maxWidth: 520, lineHeight: 1.6, marginBottom: 12 }}>
                MarketScanner Pros is a phase-based market intelligence platform that scans markets, explains signals with AI, and teaches traders how to interpret structure using institutional logic.
              </p>
              <p style={{ fontSize: 15, color: '#e5e7eb', maxWidth: 520, lineHeight: 1.5, marginBottom: 12, fontWeight: 500 }}>
                Reduce noise, understand market context, and make decisions with structure — not emotion.
              </p>
              <p style={{ fontSize: 14, color: '#9ca3af', maxWidth: 520, lineHeight: 1.5 }}>
                No hype. No black boxes. Just clarity across multiple timeframes.
              </p>

              <div style={{
                margin: '22px 0 24px',
                fontSize: 13,
                color: 'var(--text-muted)'
              }}>
                <div style={{ marginBottom: 12, fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Used daily by active traders analysing:
                </div>
                <div style={{ marginBottom: 16, color: '#e5e7eb' }}>
                  Crypto • Stocks • Indices • FX
                </div>
                <div style={{ marginBottom: 8, fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Powered by:
                </div>
                <div style={{ color: '#e5e7eb' }}>
                  Multi-Timeframe Analysis • Phase Logic • AI Signal Interpretation
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14, zIndex: 2, position: 'relative' }}>
                <Link href="/launch" style={{
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 15,
                  padding: '12px 24px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  background: 'linear-gradient(135deg, var(--accent), #22c55e)',
                  color: '#0b1120',
                  boxShadow: 'var(--shadow-small)',
                  textDecoration: 'none'
                }}>
                  <span>Get Started Free</span>
                </Link>
                <Link href="/pricing" style={{
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 15,
                  padding: '12px 24px',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                  textDecoration: 'none'
                }}>
                  See How the AI Analyst Works
                </Link>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Trusted by 1,000+ traders · Educational use only
              </p>
            </div>

            {/* Side card */}
            <aside style={{
              background: 'linear-gradient(145deg, #020617, #020617 40%, #020617 60%, #0f172a 100%)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
              padding: '20px 20px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}>
              <div>
                <h3 style={{ fontSize: 16, margin: '0 0 6px', fontWeight: 600 }}>What you get for free</h3>
                <p style={{ fontSize: 13, margin: 0, color: 'var(--text-muted)' }}>
                  Everything you need to start scanning markets and finding high-probability setups.
                </p>
              </div>
              <ul style={{ fontSize: 13, marginTop: 4, listStyle: 'none', paddingLeft: 0 }}>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(15,23,42,0.85)' }}>
                  <span>Multi-Asset Scanners</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(34,197,94,0.7)', color: '#bbf7d0' }}>Unlimited</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(15,23,42,0.85)' }}>
                  <span>AI Signal Explanations</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(34,197,94,0.7)', color: '#bbf7d0' }}>Included</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(15,23,42,0.85)' }}>
                  <span>Multi-Timeframe Analysis</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(34,197,94,0.7)', color: '#bbf7d0' }}>Included</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(15,23,42,0.85)' }}>
                  <span>Portfolio Tracker</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(34,197,94,0.7)', color: '#bbf7d0' }}>Included</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                  <span>Trade Journal</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(34,197,94,0.7)', color: '#bbf7d0' }}>Included</span>
                </li>
              </ul>
              <p style={{ fontSize: 13, margin: '0 0 12px', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-main)' }}>Pro features available</strong> — backtesting, advanced structure tools, and TradingView integration when you're ready to upgrade.
              </p>
              <p style={{ fontSize: 12, margin: 0, color: '#9ca3af', fontStyle: 'italic' }}>
                Upgrade only when you need advanced structure tools and backtesting.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
