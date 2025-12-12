import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MarketScanner Pros",
  description:
    "How MarketScanner Pros collects, uses, and protects your data, including secure access code authentication and Stripe billing.",
  alternates: { canonical: "https://marketscannerpros.app/privacy" },
};

export default function PrivacyPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111827 50%, #0a0a0a 100%)',
      color: '#E5E7EB',
      padding: '4rem 1rem',
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
      }}>
        <div style={{
          background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.8) 0%, rgba(31, 41, 55, 0.6) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '1.5rem',
          padding: '3rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #10B981, #34D399)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Privacy Policy</h1>
          <p style={{ color: '#9CA3AF', marginBottom: '2rem' }}><strong style={{ color: '#E5E7EB' }}>Effective date:</strong> 7 October 2025</p>

          <Section title="Overview">
            <p style={pStyle}>
              MarketScanner Pros ("we", "us") provides a trading dashboard and related services.
              This policy explains what we collect, why, and your choices.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul style={ulStyle}>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Email Address:</strong> Collected during checkout to verify trial eligibility and send receipts. Required for all paid subscriptions.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Account:</strong> Workspace ID (device identifier) for authentication and subscription tracking.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Billing:</strong> Processed by Stripe (web/Android) or Apple (iOS); we store minimal subscription status and payment metadata.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Trial Usage Tracking:</strong> Email address, plan type, workspace ID, and Stripe customer ID stored to prevent trial abuse (one trial per email per plan).</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Usage & Logs:</strong> Diagnostics, error tracking (via Sentry), and server logs for reliability and abuse prevention.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Cookies/Storage:</strong> Session cookies for authentication, workspace ID tracking, and user preferences.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Device Information:</strong> Browser type, IP address, and device fingerprints for fraud prevention and rate limiting.</li>
            </ul>
          </Section>

          <Section title="How we use information">
            <ul style={ulStyle}>
              <li style={liStyle}>Authenticate accounts and secure access to the dashboard via workspace IDs.</li>
              <li style={liStyle}>Verify trial eligibility and prevent trial abuse (one trial per email address).</li>
              <li style={liStyle}>Process subscriptions and let you manage billing in Stripe's Customer Portal or Apple's App Store.</li>
              <li style={liStyle}>Send transactional emails (receipts, subscription confirmations, trial reminders).</li>
              <li style={liStyle}>Detect and prevent fraud, abuse, and unauthorized access.</li>
              <li style={liStyle}>Monitor performance, track errors, and improve service reliability.</li>
              <li style={liStyle}>Operate, maintain, and improve the service; comply with legal obligations.</li>
            </ul>
          </Section>

          <Section title="Sharing & processors">
            <ul style={ulStyle}>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Stripe</strong> (payments & portal).</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>NextAuth</strong> (JWT session management).</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Hosting</strong>: Vercel (app) and Cloudflare Pages (marketing).</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Backend</strong>: Our FastAPI service for data features.</li>
            </ul>
          </Section>

          <Section title="International transfers">
            <p style={pStyle}>Data may be processed outside your country; we use appropriate safeguards where required.</p>
          </Section>

          <Section title="Retention">
            <ul style={ulStyle}>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Email & Trial Records:</strong> Retained indefinitely to prevent trial abuse. Required for fraud prevention.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Subscription Data:</strong> Retained while subscription is active, plus 7 years for tax/legal compliance.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Workspace IDs:</strong> Retained for account continuity; deleted upon account deletion request.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Logs & Analytics:</strong> Retained for 90 days, then automatically deleted.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Other Personal Data:</strong> Kept only as long as necessary for stated purposes or as required by law.</li>
            </ul>
          </Section>

          <Section title="Your rights">
            <p style={pStyle}>You may request access, correction, deletion, or object to processing. Contact us to exercise rights.</p>
          </Section>

          <Section title="Children">
            <p style={pStyle}>Not directed to individuals under 16. We do not knowingly collect children's data.</p>
          </Section>

          <Section title="Security">
            <p style={pStyle}>We use reasonable technical and organizational measures; no method is 100% secure.</p>
          </Section>

          <Section title="Changes">
            <p style={pStyle}>We may update this policy and change the effective date. Material changes may include additional notice.</p>
          </Section>

          <Section title="Contact">
            <p style={pStyle}>Email: <a href="mailto:support@marketscannerpros.app" style={linkStyle}>support@marketscannerpros.app</a></p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{
        fontSize: '1.5rem',
        fontWeight: 600,
        color: '#E5E7EB',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
      }}>{title}</h2>
      {children}
    </div>
  );
}

const pStyle: React.CSSProperties = {
  color: '#9CA3AF',
  lineHeight: 1.7,
  marginBottom: '1rem',
};

const ulStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const liStyle: React.CSSProperties = {
  color: '#9CA3AF',
  lineHeight: 1.7,
  marginBottom: '0.75rem',
  paddingLeft: '1.5rem',
  position: 'relative',
};

const linkStyle: React.CSSProperties = {
  color: '#10B981',
  textDecoration: 'none',
};
