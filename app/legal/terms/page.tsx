import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — MarketScanner Pros",
  description: "Terms of Service for MarketScanner Pros.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true }
};

const effective = "7 October 2025";

export default function TermsPage() {
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
          }}>Terms of Service</h1>
          <p style={{ color: '#9CA3AF', marginBottom: '2rem' }}><strong style={{ color: '#E5E7EB' }}>Effective Date:</strong> {effective}</p>

          <p style={pStyle}>
            Welcome to MarketScanner Pros ("the App", "we", "our", "us"). By accessing or using the
            App, you agree to these Terms of Service. Please read them carefully.
          </p>

          <nav style={{
            margin: '1.5rem 0',
            padding: '1rem 1.5rem',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '0.75rem',
          }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: '#10B981' }}>On this page</strong>
            <div style={{ color: '#9CA3AF', lineHeight: 1.8 }}>
              <a href="#eligibility" style={navLinkStyle}>Eligibility</a> · <a href="#use" style={navLinkStyle}>Use</a> · <a href="#billing" style={navLinkStyle}>Subscriptions</a> · <a href="#ip" style={navLinkStyle}>IP</a> · <a href="#warranty" style={navLinkStyle}>Warranties</a> · <a href="#liability" style={navLinkStyle}>Liability</a> · <a href="#privacy" style={navLinkStyle}>Privacy & Cookies</a> · <a href="#termination" style={navLinkStyle}>Termination</a> · <a href="#changes" style={navLinkStyle}>Changes</a> · <a href="#contact" style={navLinkStyle}>Contact</a>
            </div>
          </nav>

          <Section id="eligibility" title="1. Eligibility">
            <p style={pStyle}>You must be at least 16 years old to use the App. By using it, you confirm that you meet this requirement.</p>
          </Section>

          <Section id="use" title="2. Use of the App">
            <ul style={ulStyle}>
              <li style={liStyle}>The App is provided for educational purposes only.</li>
              <li style={liStyle}><strong style={{ color: '#F59E0B' }}>We do not provide financial, investment, or trading advice.</strong></li>
              <li style={liStyle}>You are solely responsible for your trading and investment decisions.</li>
            </ul>
          </Section>

          <Section id="billing" title="3. Subscriptions & Billing">
            <ul style={ulStyle}>
              <li style={liStyle}>The App offers Free, Pro ($4.99/mo), and Pro Trader ($9.99/mo) plans.</li>
              <li style={liStyle}>Payments are processed securely via Stripe (web/Android) or Apple In-App Purchase (iOS).</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Free Trials:</strong> Pro includes a 7-day free trial; Pro Trader includes a 5-day free trial.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Email Required:</strong> You must provide a valid email address to verify trial eligibility.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>One Trial Per Email:</strong> Each email address is eligible for one free trial per plan. Using multiple emails or accounts to access repeated trials is prohibited and may result in account termination.</li>
              <li style={liStyle}>After your trial period ends, you will be automatically charged the monthly subscription fee unless you cancel before the trial expires.</li>
              <li style={liStyle}>Subscriptions renew automatically until cancelled through your account, Stripe Customer Portal, or app store settings.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Refunds:</strong> We do not provide pro-rated refunds for unused time after cancellation. See our <a href="/refund-policy" style={linkStyle}>Refund Policy</a> for details.</li>
              <li style={liStyle}><strong style={{ color: '#10B981' }}>Trial Abuse Prevention:</strong> We track trial usage by email address and device to prevent abuse. Attempting to circumvent trial limitations may result in immediate subscription termination without refund.</li>
            </ul>
          </Section>

          <Section id="ip" title="4. Intellectual Property">
            <p style={pStyle}>
              All content, features, and code within the App are owned by MarketScanner Pros. You may not
              copy, modify, distribute, or resell without prior written permission.
            </p>
          </Section>

          <Section id="warranty" title="5. Disclaimer of Warranties">
            <p style={pStyle}>
              The App is provided "as is" without warranties of any kind. We do not guarantee accuracy,
              completeness, or uninterrupted access.
            </p>
          </Section>

          <Section id="liability" title="6. Limitation of Liability">
            <p style={pStyle}>
              To the maximum extent permitted by law, MarketScanner Pros shall not be liable for any losses
              or damages arising from use of the App, including but not limited to trading losses.
            </p>
          </Section>

          <Section id="privacy" title="7. Privacy & Cookies">
            <p style={pStyle}>Our use of your data is governed by our <a href="/privacy" style={linkStyle}>Privacy Policy</a>.</p>
            <p style={pStyle}>Our use of cookies and tracking technologies is explained in our <a href="/cookie-policy" style={linkStyle}>Cookie Policy</a>.</p>
          </Section>

          <Section id="termination" title="8. Termination">
            <p style={pStyle}>We may suspend or terminate your access if you violate these Terms. You may stop using the App at any time.</p>
          </Section>

          <Section id="changes" title="9. Changes">
            <p style={pStyle}>We may update these Terms occasionally. Changes will be posted on this page with a revised effective date.</p>
          </Section>

          <Section id="contact" title="10. Contact">
            <p style={pStyle}>
              For questions, please email us at:
              <br />
              <span style={{ marginTop: '0.5rem', display: 'inline-block' }}>📧 <a href="mailto:support@marketscannerpros.app" style={linkStyle}>support@marketscannerpros.app</a></span>
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: '2rem' }}>
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

const navLinkStyle: React.CSSProperties = {
  color: '#10B981',
  textDecoration: 'none',
};
