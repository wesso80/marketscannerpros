'use client';

const logos = [
  { name: "Reddit", color: "#FF4500" },
  { name: "IndieHackers", color: "#0E6EB8" },
  { name: "Product Hunt", color: "#DA552F" },
  { name: "App Store", color: "#0D96F6" },
  { name: "Google Play", color: "#34A853" },
];

export default function SocialProof() {
  return (
    <section style={{
      width: '100%',
      background: '#020617',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      borderBottom: '1px solid #1f2933'
    }}>
      <div style={{ maxWidth: 1120, padding: '32px 20px', margin: '0 auto' }}>
        <p style={{
          marginBottom: 20,
          textAlign: 'center',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: '#6b7280'
        }}>
          As seen on
        </p>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16
        }}>
          {logos.map((l) => (
            <div
              key={l.name}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid #1f2933',
                fontSize: 13,
                fontWeight: 500,
                color: '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: l.color,
                boxShadow: `0 0 8px ${l.color}40`
              }}></span>
              {l.name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
