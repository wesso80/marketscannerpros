'use client';

const sections = [
  {
    icon: "🧭",
    title: "1. Navigation & Mode Controls",
    subtitle: "Left Sidebar",
    description: "Your app's control hub. Switch between modes and manage lists or subscriptions.",
    items: [
      { label: "Mode Selector", desc: "Web / Mobile - Indicates which version is active" },
      { label: "Watchlists", desc: "Manual Entry / New / Manage - Enter ticker symbols or manage saved lists" },
      { label: "Subscription", desc: "Manage or cancel your subscription" }
    ]
  },
  {
    icon: "⚡",
    title: "2. Hero Section / Overview",
    subtitle: "Quick Start",
    description: "The landing view that sets the context and lets you jump into action.",
    items: [
      { label: "Start Scanning Now", desc: "Launch a scan using your chosen list and settings" },
      { label: "View Results", desc: "Opens the latest completed scan report" }
    ]
  },
  {
    icon: "📊",
    title: "3. Scanner Controls",
    subtitle: "Core Functionality",
    description: "Run scans, refresh data, and select your preferred timeframes.",
    items: [
      { label: "Run Scanner", desc: "Initiate real-time scan across selected markets" },
      { label: "Refresh Data", desc: "Pull latest candle/indicator data" },
      { label: "Time Selector", desc: "Choose timeframe (1h, 4h, 1d) for next scan" }
    ]
  },
  {
    icon: "🏦",
    title: "4. Equity Markets Panel",
    subtitle: "Stock Results",
    description: "Displays results for traditional stock / equity scans with matching setups.",
    items: []
  },
  {
    icon: "💰",
    title: "5. Crypto Markets Panel",
    subtitle: "Crypto Results",
    description: "Live or cached scanner hits with timeframe labels and strength scores.",
    items: []
  },
  {
    icon: "📈",
    title: "6. Scoring Methodology",
    subtitle: "Transparency",
    description: "Understand how MarketScanner calculates signal scores.",
    items: [
      { label: "Show Details", desc: "Expand to see formula logic (EMA alignment + RSI + volume = score)" }
    ]
  },
  {
    icon: "🔔",
    title: "7. Price Alerts",
    subtitle: "Automation",
    description: "Automate watchlist monitoring with custom alerts.",
    items: [
      { label: "Auto Check", desc: "Enable background alert scanning" },
      { label: "Check Now", desc: "Manually run all alert conditions" },
      { label: "New Alert", desc: "Create rule (symbol + condition + target)" }
    ]
  },
  {
    icon: "🧠",
    title: "8. Technical Analysis Charts",
    subtitle: "Advanced Charting",
    description: "Multi-indicator chart views for selected assets.",
    items: [
      { label: "Instrument", desc: "Select the asset to analyze" },
      { label: "Timeframe", desc: "Choose chart period" },
      { label: "Indicators", desc: "MACD, RSI, Volume, and more" }
    ]
  },
  {
    icon: "💼",
    title: "9. Portfolio Tracking",
    subtitle: "Performance",
    description: "Track total account performance and distribution.",
    items: [
      { label: "Portfolio Value", desc: "Live snapshot of holdings" },
      { label: "Pie Chart", desc: "Shows diversification by market value" },
      { label: "Performance Chart", desc: "Historical growth curve" }
    ]
  },
  {
    icon: "🧾",
    title: "10. Trade Journal",
    subtitle: "Record Keeping",
    description: "A trading log for performance analysis.",
    items: [
      { label: "Log Trade", desc: "Record symbol, direction, entry, exit, quantity" },
      { label: "Trade History", desc: "View all past trades" },
      { label: "Performance Stats", desc: "Total P&L and win rate" }
    ]
  },
  {
    icon: "🧮",
    title: "11. Strategy Backtesting",
    subtitle: "Test Before Trading",
    description: "Test strategy effectiveness before live trading.",
    items: [
      { label: "Date Range", desc: "Select backtest period" },
      { label: "Strategy Preset", desc: "RSI/MA Cross or custom patterns" },
      { label: "Run Backtest", desc: "Execute and see historical results" }
    ]
  },
  {
    icon: "📉",
    title: "12. Scan Statistics",
    subtitle: "Activity Summary",
    description: "Summarizes app activity and data health.",
    items: [
      { label: "Stocks Scanned", desc: "Total equity symbols processed" },
      { label: "Crypto Scanned", desc: "Total crypto assets processed" },
      { label: "Alerts Triggered", desc: "Number of alerts fired" }
    ]
  }
];

export default function UserGuide() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
    }}>
      <div style={{ maxWidth: 900, padding: '48px 20px 60px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
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
            marginBottom: 16
          }}>
            <span style={{ color: '#bbf7d0' }}>Complete guide</span>
            <span>Everything you need to know</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>MarketScanner Pro — User Guide</h1>
          <p style={{ fontSize: 16, color: '#9ca3af', maxWidth: 550, margin: '0 auto' }}>
            Everything you need to scan markets, track performance, and optimize your trading strategy.
          </p>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sections.map((section, i) => (
            <article key={i} style={{
              background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
              borderRadius: 16,
              border: '1px solid #1f2933',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              padding: '24px 28px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                right: -30,
                top: -30,
                width: 120,
                height: 120,
                background: 'radial-gradient(circle, rgba(20,184,166,0.1), transparent 60%)',
                filter: 'blur(1px)'
              }} aria-hidden="true"></div>
              
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  flexShrink: 0
                }}>{section.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 650, margin: 0 }}>{section.title}</h2>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(15,23,42,0.96)',
                      border: '1px solid rgba(55,65,81,0.8)',
                      color: '#9ca3af'
                    }}>{section.subtitle}</span>
                  </div>
                  <p style={{ fontSize: 14, color: '#9ca3af', margin: '8px 0 0', lineHeight: 1.5 }}>{section.description}</p>
                  
                  {section.items.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
                      {section.items.map((item, j) => (
                        <li key={j} style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '8px 0',
                          borderBottom: j < section.items.length - 1 ? '1px solid rgba(15,23,42,0.85)' : 'none',
                          fontSize: 13
                        }}>
                          <span style={{ color: '#22c55e', fontSize: 14, marginTop: 1 }}>→</span>
                          <span>
                            <strong style={{ color: '#e5e7eb' }}>{item.label}:</strong>{' '}
                            <span style={{ color: '#9ca3af' }}>{item.desc}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
