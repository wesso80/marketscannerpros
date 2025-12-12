'use client';

export default function ReferralBanner() {
  return (
    <section style={{
      width: '100%',
      background: 'linear-gradient(135deg, rgba(20,184,166,0.1), rgba(34,197,94,0.08))',
      borderBottom: '1px solid #1f2933',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
    }}>
      <div style={{ maxWidth: 1120, padding: '36px 20px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 24px',
          borderRadius: 999,
          background: 'rgba(15,23,42,0.8)',
          border: '1px solid rgba(34,197,94,0.3)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
          <span style={{ fontSize: 20 }}>🎁</span>
          <span style={{
            fontSize: 15,
            fontWeight: 500,
            color: '#bbf7d0'
          }}>
            Invite a friend → both get <strong style={{ color: '#22c55e' }}>7 days Pro free</strong>
          </span>
        </div>
      </div>
    </section>
  );
}
