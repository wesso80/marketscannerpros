export const metadata = {
  title: "Disclaimer — MarketScanner Pros",
  alternates: { canonical: "/disclaimer" }
};

const effective = "13 December 2025";

export default function DisclaimerPage() {
  return (
    <main>
      <h1>Disclaimer</h1>
      <p><strong>Effective Date:</strong> {effective}</p>
      <nav aria-label="On this page" style={{margin:"1rem 0",padding:".75rem 1rem",border:"1px solid #27272a",borderRadius:".75rem"}}>
        <strong style={{display:"block",marginBottom:".25rem"}}>On this page</strong>
        <a href="#edu">Educational use</a> · <a href="#risk">Market risk</a> · <a href="#accuracy">Data & accuracy</a> · <a href="#backtests">Backtests</a> · <a href="#jurisdiction">Jurisdiction</a> · <a href="#liability">Liability</a> · <a href="#contact">Contact</a>
      </nav>

      <h2 id="edu">Educational Use Only</h2>
      <p>
        MarketScanner Pros (“the App”) is provided for educational and informational purposes.
        We are not a broker, dealer, or investment adviser, and nothing here is financial,
        investment, or trading advice.
      </p>
      <h2 id="risk">Market Risk</h2>
      <p>
        Trading and investing involve substantial risk. You may lose part or all of your capital.
        You are solely responsible for your decisions.
      </p>

      <h2 id="accuracy">Data, Signals, AI & Accuracy</h2>
      <p>
        Scores, indicators, signals, and AI-generated insights (MSP Analyst powered by GPT-4) may be incomplete, 
        delayed, or inaccurate. Market data is sourced from Alpha Vantage Premium API. Availability can be 
        affected by third-party providers. AI responses are for educational purposes only and should not be 
        construed as financial advice. No accuracy or uptime guarantees are made.
      </p>

      <h2 id="backtests">Backtests & Historical Data</h2>
      <p>
        Backtesting features use real historical data from Alpha Vantage Premium. However, backtested results 
        are for illustration only and do not guarantee future performance. Past results do not predict future 
        outcomes. Market conditions change and historical patterns may not repeat.
      </p>
      <h2 id="jurisdiction">Jurisdiction & Compliance</h2>
      <p>
        You are responsible for complying with the laws and regulations of your jurisdiction.
        The App does not solicit or target any specific country’s investors.
      </p>

      <h2 id="liability">Liability</h2>
      <p>
        Use the App at your own risk. See our <a href="/terms">Terms of Service</a> for limitations
        of liability and other important terms.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions? Email <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a>.
      </p>
    </main>
  );
}
