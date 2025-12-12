'use client';

const testimonials = [
  {
    quote: "I spotted XRP's squeeze 3 hours early thanks to MarketScanner Pro. Game changer for my trading.",
    author: "Beta user",
    handle: "@crypto_trader"
  },
  {
    quote: "Cut my chart-watching from 4 hours a day to 15 minutes. More time, better trades.",
    author: "Pro Trader",
    handle: "@swingking"
  },
  {
    quote: "Finally a scanner that shows multi-timeframe confluence clearly. No more tab chaos.",
    author: "Early adopter",
    handle: "@market_mike"
  }
];

export default function Testimonials() {
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
            <span style={{ color: '#fde047' }}>Real feedback</span>
            <span>From real traders</span>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>What Traders Are Saying</h2>
          <p style={{ fontSize: 15, color: '#9ca3af', maxWidth: 450, margin: '0 auto' }}>
            Join traders who found clarity in the noise.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20
        }}>
          {testimonials.map((t, i) => (
            <blockquote key={i} style={{
              background: 'linear-gradient(145deg, #020617, #0f172a)',
              borderRadius: 12,
              border: '1px solid #1f2933',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              padding: '24px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              margin: 0,
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: 16,
                right: 20,
                fontSize: 40,
                color: 'rgba(20,184,166,0.15)',
                fontFamily: 'Georgia, serif',
                lineHeight: 1
              }}>"</div>
              <p style={{
                fontSize: 15,
                color: '#e5e7eb',
                lineHeight: 1.6,
                margin: 0,
                position: 'relative',
                zIndex: 1
              }}>
                "{t.quote}"
              </p>
              <footer style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 'auto'
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#0b1120'
                }}>{t.author.charAt(0)}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#f9fafb' }}>{t.author}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{t.handle}</div>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
