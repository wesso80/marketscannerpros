import CollapsibleSection from "@/components/visual/CollapsibleSection";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about MarketScannerPros — an advanced market scanning and trading intelligence platform for retail and professional traders.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] px-4 py-5 text-slate-200">
      <div className="mx-auto max-w-[800px]">
        <div className="rounded-3xl border border-emerald-500/20 bg-[var(--msp-card)] p-4 shadow-2xl md:p-6">
          <div className="prose prose-invert prose-emerald max-w-none prose-headings:text-slate-100 prose-a:text-emerald-400 prose-strong:text-slate-200">
            <h1 className="text-2xl font-bold text-emerald-400">About</h1>
            <p data-learn-verdict className="text-sm">Market research and simulation tools.</p>
            <div className="space-y-3">
            <CollapsibleSection title="About MarketScannerPros">

            <p>
              MarketScannerPros is an advanced market scanning and trading
              intelligence platform built for retail and professional traders. We
              combine real-time technical analysis, AI-powered insights, and
              professional-level tools in a single web-based dashboard.
            </p>

            </CollapsibleSection>
            <CollapsibleSection title="What we offer">
            <ul>
              <li>
                <strong>Market Scanner</strong> — screen thousands of equities
                and crypto assets using customisable technical filters including
                RSI, MACD, Bollinger Bands, and volume analysis.
              </li>
              <li>
                <strong>MSP AI</strong> — an AI chatbot that answers
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
                <strong>Close timing</strong> — proprietary timing
                analysis that identifies technically aligned trade windows using
                multi-timeframe data.
              </li>
            </ul>

            </CollapsibleSection>
            <CollapsibleSection title="Our mission">
            <p>
              We believe every trader deserves access to the same calibre of
              tools used by institutional desks. MarketScannerPros levels the
              playing field by delivering powerful analysis at an accessible
              price — no expensive terminals, no lock-in contracts.
            </p>

            </CollapsibleSection>
            <CollapsibleSection title="Jurisdiction">
            <p>
              MarketScannerPros operates under the laws of New South Wales,
              Australia. For full legal details, see our{" "}
              <a href="/terms">Terms of Service</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>

            </CollapsibleSection>
            <CollapsibleSection title="Contact">
            <p>
              Questions or feedback? Reach us at{" "}
              <a href="mailto:support@marketscannerpros.app">
                support@marketscannerpros.app
              </a>
              .
            </p>
            </CollapsibleSection>
            </div>
            <p data-source-line className="text-xs text-slate-400">Source · MarketScannerPros documentation</p>
          </div>
        </div>
      </div>
    </main>
  );
}
