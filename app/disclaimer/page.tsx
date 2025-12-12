export const metadata = {
  title: "Disclaimer — MarketScanner Pros",
  alternates: { canonical: "/disclaimer" }
};

const effective = "26 September 2025";

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

      <h2 id="accuracy">Data, Signals & Accuracy</h2>
      <p>
        Scores, indicators, and signals may be incomplete, delayed, or inaccurate. Availability
        can be affected by third-party providers. No accuracy or uptime guarantees are made.
      </p>

      <h2 id="backtests">Backtests & Illustrations</h2>
      <p>
        Any backtested or hypothetical results are for illustration only and do not guarantee
        future performance.
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
