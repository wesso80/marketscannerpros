import Link from "next/link";

export const metadata = {
  title: "Contact — MarketScanner Pros",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--msp-bg)',
      color: '#E5E7EB',
      padding: '4rem 1rem',
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
      }}>
        <div style={{
          background: 'var(--msp-card)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '1.5rem',
          padding: '3rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            background: 'var(--msp-accent)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Contact Us</h1>
          <p style={{ color: '#9CA3AF', marginBottom: '2rem', fontSize: '1.1rem' }}>
            Questions, feedback, or privacy requests? We'd love to hear from you.
          </p>

          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}>
            <ul style={{ lineHeight: 2, margin: 0, paddingLeft: '1.2rem', color: '#E5E7EB' }}>
              <li>
                <strong style={{ color: '#10B981' }}>Email:</strong>{' '}
                <a href="mailto:support@marketscannerpros.app" style={{ color: '#34D399' }}>
                  support@marketscannerpros.app
                </a>
              </li>
              <li>
                <strong style={{ color: '#10B981' }}>Privacy requests:</strong>{' '}
                <Link href="/privacy" style={{ color: '#34D399' }}>Privacy Policy</Link>
              </li>
              <li>
                <strong style={{ color: '#10B981' }}>Status/updates:</strong>{' '}
                <Link href="/guide" style={{ color: '#34D399' }}>User Guide</Link>
              </li>
            </ul>
          </div>

          <a 
            href="mailto:support@marketscannerpros.app?subject=Support%20Request"
            style={{
              display: 'inline-block',
              padding: '0.875rem 1.5rem',
              background: 'var(--msp-accent)',
              color: '#fff',
              fontWeight: 600,
              borderRadius: '0.75rem',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            }}
          >
            ✉️ Email Support
          </a>
        </div>
      </div>
    </main>
  );
}
