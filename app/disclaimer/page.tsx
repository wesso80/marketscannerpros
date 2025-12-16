export const metadata = {
  title: "Disclaimer — MarketScanner Pros",
  alternates: { canonical: "/disclaimer" }
};

const effective = "13 December 2025";

export default function DisclaimerPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      padding: '48px 20px 60px'
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16, color: '#f9fafb' }}>Disclaimer</h1>
        <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 24 }}><strong style={{ color: '#cbd5e1' }}>Effective Date:</strong> {effective}</p>
        
        <nav style={{
          margin: '24px 0',
          padding: '16px 20px',
          border: '1px solid #1f2933',
          borderRadius: 12,
          background: 'rgba(15, 23, 42, 0.5)'
        }}>
          <strong style={{ display: 'block', marginBottom: 8, color: '#f9fafb', fontSize: 14 }}>On this page</strong>
          <div style={{ fontSize: 13, color: '#9ca3af', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <a href="#edu" style={{ color: '#22c55e', textDecoration: 'none' }}>Educational use</a>
            <span>·</span>
            <a href="#risk" style={{ color: '#22c55e', textDecoration: 'none' }}>Market risk</a>
            <span>·</span>
            <a href="#accuracy" style={{ color: '#22c55e', textDecoration: 'none' }}>Data & accuracy</a>
            <span>·</span>
            <a href="#backtests" style={{ color: '#22c55e', textDecoration: 'none' }}>Backtests</a>
            <span>·</span>
            <a href="#jurisdiction" style={{ color: '#22c55e', textDecoration: 'none' }}>Jurisdiction</a>
            <span>·</span>
            <a href="#liability" style={{ color: '#22c55e', textDecoration: 'none' }}>Liability</a>
            <span>·</span>
            <a href="#contact" style={{ color: '#22c55e', textDecoration: 'none' }}>Contact</a>
          </div>
        </nav>

        <section style={{ marginTop: 32 }}>
          <h2 id="edu" style={{ fontSize: 22, fontWeight: 650, marginBottom: 12, marginTop: 24, color: '#f9fafb' }}>Educational Use Only</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
            MarketScanner Pros ("the App") is provided for educational and informational purposes.
            We are not a broker, dealer, or investment adviser, and nothing here is financial,
            investment, or trading advice.
          </p>
        </section>

        <section>
          <h2 id="risk" style={{ fontSize: 22, fontWeight: 650, marginBottom: 12, marginTop: 24, color: '#f9fafb' }}>Market Risk</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
            Trading and investing involve substantial risk. You may lose part or all of your capital.
            You are solely responsible for your decisions.
          </p>
        </section>

        <section>
          <h2 id="accuracy" style={{ fontSize: 22, fontWeight: 650, marginBottom: 12, marginTop: 24, color: '#f9fafb' }}>Data, Signals, AI & Accuracy</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
            Scores, indicators, signals, and AI-generated insights (MSP Analyst powered by GPT-4) may be incomplete, 
            delayed, or inaccurate. Market data is sourced from Alpha Vantage Premium API. Availability can be 
            affected by third-party providers. AI responses are for educational purposes only and should not be 
            construed as financial advice. No accuracy or uptime guarantees are made.
          </p>
        </section>

        <section>
          <h2 id="backtests" style={{ fontSize: 22, fontWeight: 650, marginBottom: 12, marginTop: 24, color: '#f9fafb' }}>Backtests & Historical Data</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
            Backtesting features use real historical data from Alpha Vantage Premium. However, backtested results 
            are for illustration only and do not guarantee future performance. Past results do not predict future 
            outcomes. Market conditions change and historical patterns may not repeat.
          </p>
        </section>

        <section>
          <h2 id="jurisdiction" style={{ fontSize: 22, fontWeight: 650, marginBottom: 12, marginTop: 24, color: '#f9fafb' }}>Jurisdiction & Compliance</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
            You are responsible for complying with the laws and regulations of your jurisdiction.
            The App does not solicit or target any specific country's investors.
          </p>
        </section>

        <section>
          <h2 id="liability" style={{ fontSize: 22, fontWeight: 650, marginBottom: 12, marginTop: 24, color: '#f9fafb' }}>Liability</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
            Use the App at your own risk. See our <a href="/terms" style={{ color: '#22c55e', textDecoration: 'none' }}>Terms of Service</a> for limitations
            of liability and other important terms.
          </p>
        </section>

        <section>
          <h2 id="contact" style={{ fontSize: 22, fontWeight: 650, marginBottom: 12, marginTop: 24, color: '#f9fafb' }}>Contact</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
            Questions? Email <a href="mailto:support@marketscannerpros.app" style={{ color: '#22c55e', textDecoration: 'none' }}>support@marketscannerpros.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}