'use client';

export default function HowItWorks() {
  const steps = [
    {
      num: "1",
      title: "Pick your symbols",
      desc: "Choose crypto or stocks you want to scan — build watchlists for any market you trade."
    },
    {
      num: "2",
      title: "Run the scanner",
      desc: "Multi-timeframe analysis with EMA stack + squeeze detection runs in seconds."
    },
    {
      num: "3",
      title: "Act on signals",
      desc: "See confluence scores, export CSVs, set alerts, and execute with confidence."
    }
  ];

  return (
    <section style={{
      width: '100%',
      background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      borderBottom: '1px solid #1f2933'
    }}>
      <div style={{ maxWidth: 1120, padding: '60px 20px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
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
            marginBottom: 14
          }}>
            <span style={{ color: '#bbf7d0' }}>Simple workflow</span>
            <span>3 steps to clarity</span>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>How It Works</h2>
          <p style={{ fontSize: 15, color: '#9ca3af', maxWidth: 450, margin: '0 auto' }}>
            From charts to actionable insights in under 60 seconds.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20
        }}>
          {steps.map((step, i) => (
            <article key={i} style={{
              background: 'linear-gradient(145deg, #020617, #0f172a)',
              borderRadius: 12,
              border: '1px solid #1f2933',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              padding: '28px 24px',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 100,
                height: 100,
                background: 'radial-gradient(circle, rgba(20,184,166,0.15), transparent 60%)',
                filter: 'blur(1px)'
              }} aria-hidden="true"></div>
              
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
                color: '#0b1120',
                margin: '0 auto 16px',
                boxShadow: '0 4px 15px rgba(20,184,166,0.4)'
              }}>{step.num}</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{step.title}</h3>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{step.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
