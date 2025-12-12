'use client';

import Link from 'next/link';

const features = [
  {
    icon: "📊",
    title: "Confluence Shading",
    desc: "Counts active windows from selected TFs (30m→8h) plus optional pre-close anticipation. Tiers at 5/6/7/8/≥9 stacks with configurable colors."
  },
  {
    icon: "📋",
    title: "Panel with Details",
    desc: "TF list (tinted to match line colors), Next Close countdown for each TF, and Prev 50% = exact midpoint of the previous bar."
  },
  {
    icon: "📈",
    title: "50% Lines on Chart",
    desc: "Optional lines for intraday TFs plus optional D/W/M. Labels can show price. Close markers (triangles) show when a TF just closed."
  },
  {
    icon: "🔍",
    title: "Smart Scan Header",
    desc: "Auto-adds higher TFs only if their next close is within X hours (default 22h), keeping the panel focused on relevant windows."
  },
  {
    icon: "🔔",
    title: "Alerts",
    desc: "One alert condition when the stack reaches your threshold - never miss a confluence opportunity."
  },
  {
    icon: "⚡",
    title: "Exact & Efficient",
    desc: "50% computed with one request per TF using hl2[1]. Keeps table and lines in perfect sync and reduces request usage."
  }
];

const steps = [
  "Add the indicator and pick your tracked TFs",
  "Choose your basis (Regular vs Extended / Heikin-Ashi)",
  "Set scan hours (e.g., 22h) to show higher-TF rows/lines only when relevant",
  "Optionally enable lines & labels for the TFs you actively trade",
  "(Optional) Create an alert: Time Confluence Stack ≥ Threshold"
];

const faqs = [
  {
    q: "Lines don't match the table?",
    a: "Make sure Auto Fit to screen is on (or zoom so lines are within view), and confirm you're using the same basis (RTH/Extended, Heikin-Ashi) as the panel."
  },
  {
    q: "Hitting request limits?",
    a: "Disable unused TFs, turn off D/W/M lines, or increase \"Scan ≤ hours\" selectivity. This build already halves midpoint requests via hl2[1]."
  },
  {
    q: "No-repaint note",
    a: "50% levels use previous bar data on each TF with lookahead_off, so the plotted midpoints do not repaint. Shading/countdowns update in real time."
  }
];

export default function TradingViewScripts() {
  const emailLink = "mailto:support@marketscannerpros.app?subject=Free%20Trial%20Request%20-%20TradingView%20Scripts&body=Hi%2C%0A%0AI%27d%20like%20to%20request%20access%20to%20your%20TradingView%20scripts.%0A%0ATradingView%20username%3A%20%0A%0AThanks%2C%0A";

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
    }}>
      {/* Hero Section */}
      <section style={{ borderBottom: '1px solid #1f2933' }}>
        <div style={{ maxWidth: 1120, padding: '60px 20px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#9ca3af',
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(148,163,184,0.25)',
              marginBottom: 20
            }}>
              <span style={{ color: '#bbf7d0' }}>TradingView Scripts</span>
              <span>Professional indicators</span>
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 700, marginBottom: 16, lineHeight: 1.2 }}>
              Professional TradingView Scripts
            </h1>
            <p style={{ fontSize: 18, color: '#9ca3af', marginBottom: 28 }}>
              Advanced indicators and tools to enhance your trading analysis
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <a href={emailLink} style={{
                borderRadius: 999,
                border: 'none',
                fontSize: 15,
                padding: '14px 28px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                color: '#0b1120',
                boxShadow: '0 4px 15px rgba(20,184,166,0.4)',
                textDecoration: 'none'
              }}>
                Request Free Trial
              </a>
              <a href="https://www.tradingview.com/u/Marketscannerpros/" target="_blank" rel="noreferrer" style={{
                borderRadius: 999,
                fontSize: 15,
                padding: '14px 28px',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                color: '#9ca3af',
                border: '1px solid #1f2933',
                textDecoration: 'none'
              }}>
                View on TradingView
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Script */}
      <section style={{ borderBottom: '1px solid #1f2933' }}>
        <div style={{ maxWidth: 1120, padding: '60px 20px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: 32,
            alignItems: 'start'
          }}>
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'rgba(34,197,94,0.12)',
                color: '#bbf7d0',
                border: '1px solid rgba(34,197,94,0.3)',
                marginBottom: 16
              }}>Most Popular</div>
              <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 14 }}>
                Time Confluence Windows — 50% Levels + Next-Close Scanner
              </h2>
              <p style={{ fontSize: 16, color: '#e5e7eb', marginBottom: 16, lineHeight: 1.6 }}>
                Find stacked time windows and the exact prior-bar 50% levels across multiple timeframes — in one panel and on your chart.
              </p>
              <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 24, lineHeight: 1.6 }}>
                This tool highlights when several timeframes are simultaneously "in play" (post-close & pre-close windows), 
                and plots the previous bar midpoint (50%) for each TF so you can judge mean-revert vs. continuation risk at a glance.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <a href="https://www.tradingview.com/script/XXXXXXXX/" target="_blank" rel="noreferrer" style={{
                  borderRadius: 999,
                  fontSize: 14,
                  padding: '12px 20px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                  color: '#0b1120',
                  boxShadow: '0 4px 15px rgba(20,184,166,0.4)',
                  textDecoration: 'none'
                }}>
                  View on TradingView
                </a>
              </div>
            </div>
            <div style={{
              background: 'linear-gradient(145deg, #020617, #0f172a)',
              borderRadius: 16,
              border: '1px solid #1f2933',
              boxShadow: '0 18px 45px rgba(0,0,0,0.75)',
              overflow: 'hidden',
              aspectRatio: '16/10'
            }}>
              <img 
                src="/marketing/tradingview-confluence.png" 
                alt="Time Confluence Windows TradingView Script"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ borderBottom: '1px solid #1f2933' }}>
        <div style={{ maxWidth: 1120, padding: '60px 20px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>What it shows</h2>
            <p style={{ fontSize: 15, color: '#9ca3af' }}>Comprehensive confluence analysis at a glance</p>
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 20
          }}>
            {features.map((f, i) => (
              <article key={i} style={{
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 12,
                border: '1px solid #1f2933',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                padding: '24px 22px'
              }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  marginBottom: 14
                }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Key Inputs */}
      <section style={{ borderBottom: '1px solid #1f2933' }}>
        <div style={{ maxWidth: 900, padding: '60px 20px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>Key Inputs</h2>
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: 20
          }}>
            <div style={{
              background: 'linear-gradient(145deg, #020617, #0f172a)',
              borderRadius: 12,
              border: '1px solid #1f2933',
              padding: '24px'
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: '#14b8a6' }}>Timeframe Settings</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', color: '#e5e7eb' }}>
                  <span style={{ color: '#22c55e' }}>•</span>
                  <span>Tracked TFs: 30m, 1h, 2h, 3h, 4h, 6h, 8h (toggle each)</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', color: '#e5e7eb' }}>
                  <span style={{ color: '#22c55e' }}>•</span>
                  <span>Basis: Heikin-Ashi on/off, RTH vs. Extended sessions</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', color: '#e5e7eb' }}>
                  <span style={{ color: '#22c55e' }}>•</span>
                  <span>Post-close & Pre-close window lengths per TF</span>
                </li>
              </ul>
            </div>
            <div style={{
              background: 'linear-gradient(145deg, #020617, #0f172a)',
              borderRadius: 12,
              border: '1px solid #1f2933',
              padding: '24px'
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: '#14b8a6' }}>Display Options</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', color: '#e5e7eb' }}>
                  <span style={{ color: '#22c55e' }}>•</span>
                  <span>Line options: width, style, span, label side, show price</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', color: '#e5e7eb' }}>
                  <span style={{ color: '#22c55e' }}>•</span>
                  <span>TF-follow: hide intraday lines when chart TF is higher</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', color: '#e5e7eb' }}>
                  <span style={{ color: '#22c55e' }}>•</span>
                  <span>Alert: threshold for confluence stack</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How to Use */}
      <section style={{ borderBottom: '1px solid #1f2933', background: 'rgba(15,23,42,0.3)' }}>
        <div style={{ maxWidth: 700, padding: '60px 20px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>How to Use</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#0b1120',
                  flexShrink: 0
                }}>{i + 1}</div>
                <p style={{ fontSize: 15, color: '#e5e7eb', margin: 0, paddingTop: 6 }}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ borderBottom: '1px solid #1f2933' }}>
        <div style={{ maxWidth: 700, padding: '60px 20px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>Tips & FAQ</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{
                background: 'linear-gradient(145deg, #020617, #0f172a)',
                borderRadius: 12,
                border: '1px solid #1f2933',
                padding: '20px 24px'
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#14b8a6' }}>{faq.q}</h3>
                <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section>
        <div style={{ maxWidth: 700, padding: '60px 20px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 12 }}>Ready to enhance your trading?</h2>
          <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 28 }}>
            Get instant access to all our professional TradingView scripts
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <a href="https://www.tradingview.com/u/Marketscannerpros/" target="_blank" rel="noreferrer" style={{
              borderRadius: 999,
              fontSize: 15,
              padding: '14px 28px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
              color: '#0b1120',
              boxShadow: '0 4px 15px rgba(20,184,166,0.4)',
              textDecoration: 'none'
            }}>
              View All Scripts →
            </a>
            <Link href="/pricing" style={{
              borderRadius: 999,
              fontSize: 15,
              padding: '14px 28px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(15,23,42,0.8)',
              color: '#e5e7eb',
              border: '1px solid #1f2933',
              textDecoration: 'none'
            }}>
              View Pricing
            </Link>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 28 }}>
            <strong>Disclaimer:</strong> This is an educational tool, not financial advice. Always confirm signals within your own plan and manage risk.
          </p>
        </div>
      </section>
    </div>
  );
}
