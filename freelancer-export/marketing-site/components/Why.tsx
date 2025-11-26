'use client';

export default function Why() {
  const features = [
    {
      icon: "🎯",
      title: "Never miss a squeeze again",
      desc: "Get alerted before the crowd. Our scanner detects volatility compression across all your watchlists in real-time."
    },
    {
      icon: "⚡",
      title: "Hours to minutes",
      desc: "Cut chart-watching time from hours to minutes. Multi-timeframe analysis runs instantly across 100+ symbols."
    },
    {
      icon: "📊",
      title: "High-probability setups only",
      desc: "Focus on trades with multi-timeframe confluence. Filter out noise and see only what matters."
    }
  ];

  return (
    <section style={{
      width: '100%',
      background: 'radial-gradient(circle at bottom, #111827 0, #020617 55%, #000 100%)',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      borderBottom: '1px solid #1f2933'
    }}>
      <div style={{ maxWidth: 1120, padding: '60px 20px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>Built for Serious Traders</h2>
          <p style={{ fontSize: 15, color: '#9ca3af', maxWidth: 500, margin: '0 auto' }}>
            Stop guessing. Start trading with data-driven confidence and clarity.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20
        }}>
          {features.map((f, i) => (
            <article key={i} style={{
              background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
              borderRadius: 12,
              border: '1px solid #1f2933',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              padding: '24px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
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
                fontSize: 20
              }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
