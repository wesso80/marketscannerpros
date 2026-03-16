import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — MarketScanner Pros",
  description:
    "Learn about MarketScanner Pros — an advanced market scanning and trading intelligence platform for retail and professional traders.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] px-4 py-16 text-slate-200">
      <div className="mx-auto max-w-[800px]">
        <div className="rounded-3xl border border-emerald-500/20 bg-[var(--msp-card)] p-8 shadow-2xl md:p-12">
          <div className="prose prose-invert prose-emerald max-w-none prose-headings:text-slate-100 prose-a:text-emerald-400 prose-strong:text-slate-200">
            <h1 className="text-emerald-400">About MarketScanner Pros</h1>

            <p>
              MarketScanner Pros is an advanced market scanning and trading
              intelligence platform built for retail and professional traders. We
              combine real-time technical analysis, AI-powered insights, and
              institutional-grade tools in a single web-based dashboard.
            </p>

            <h2>What we offer</h2>
            <ul>
              <li>
                <strong>Market Scanner</strong> — screen thousands of equities
                and crypto assets using customisable technical filters including
                RSI, MACD, Bollinger Bands, and volume analysis.
              </li>
              <li>
                <strong>ARCA AI Analyst</strong> — an AI chatbot that answers
                market questions, analyses tickers, and provides educational
                context powered by large language models.
              </li>
              <li>
                <strong>Strategy Backtester</strong> — test trading strategies
                against historical data to evaluate performance before risking
                real capital.
              </li>
              <li>
                <strong>Portfolio Tracker</strong> — monitor open positions,
                track P&amp;L, and sync across devices.
              </li>
              <li>
                <strong>Trade Journal</strong> — log trades, attach notes, and
                review analytics to improve decision-making over time.
              </li>
              <li>
                <strong>Time Confluence Engine</strong> — proprietary timing
                analysis that identifies high-probability trade windows using
                multi-timeframe data.
              </li>
            </ul>

            <h2>Our mission</h2>
            <p>
              We believe every trader deserves access to the same calibre of
              tools used by institutional desks. MarketScanner Pros levels the
              playing field by delivering powerful analysis at an accessible
              price — no expensive terminals, no lock-in contracts.
            </p>

            <h2>Jurisdiction</h2>
            <p>
              MarketScanner Pros operates under the laws of New South Wales,
              Australia. For full legal details, see our{" "}
              <a href="/terms">Terms of Service</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>

            <h2>Contact</h2>
            <p>
              Questions or feedback? Reach us at{" "}
              <a href="mailto:support@marketscannerpros.app">
                support@marketscannerpros.app
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
