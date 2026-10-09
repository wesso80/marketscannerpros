import CollapsibleSection from "@/components/visual/CollapsibleSection";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology & Glossary",
  description:
    "How MarketScannerPros builds a reading: independent factor groups, evidence quality, lifecycle stage, extension state, data freshness, and market regime. The page describes the method and the data. Educational market analysis, not financial advice.",
  alternates: { canonical: "/methodology" },
  robots: { index: true, follow: true },
};

function Term({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--msp-panel-2)] p-2">
      <h3 className="mt-0 text-sm font-semibold text-slate-100">{title}</h3>
      <div className="text-xs leading-5 text-slate-300">{children}</div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] px-4 py-5 text-slate-200">
      <div className="mx-auto max-w-[880px]">
        <div className="rounded-3xl border border-emerald-500/20 bg-[var(--msp-card)] p-4 shadow-2xl md:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-400/80">Methodology &amp; Glossary</p>
          <h1 className="mt-2 text-2xl font-black text-slate-100">How the readings are built</h1>
          <p data-learn-verdict className="mt-2 text-sm text-slate-300">Readings summarise the indicators, dates, and data quality on the page. They do not predict outcomes.</p>

          <div className="mt-4 space-y-3">
<section>
<h2 className="text-base font-semibold text-emerald-400">Independent factor groups</h2>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["Trend", "EMA structure, MACD, ADX/DI, Aroon"],
                  ["Momentum", "RSI, Stochastic, CCI"],
                  ["Participation / Volume", "OBV, MFI, VWAP, relative volume"],
                  ["Volatility", "BBWP, ATR, DVE phase"],
                  ["Relative strength", "vs a benchmark (SPY for equities, BTC for crypto)"],
                  ["Market structure", "levels, breakout proximity, EMA stack"],
                  ["Positioning", "funding, open interest (crypto)"],
                  ["Regime", "trend / range / risk-on / risk-off context"],
                  ["Macro / cross-asset", "DXY, rates, VIX regime"],
                  ["Catalyst", "earnings and scheduled events"],
                ].map(([g, d]) => (
                  <div key={g} className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2 text-xs">
                    <span className="font-bold text-slate-200">{g}</span>
                    <span className="text-slate-500"> — {d}</span>
                  </div>
                ))}
              </div>
            </section>
<section>
<h2 className="text-base font-semibold text-emerald-400">Setup stage</h2>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Term title="Dormant">Quiet; nothing developing.</Term>
                <Term title="Building">Participation rising while price is still contained — an early observation.</Term>
                <Term title="Confirming">Independent factors agree and price is beginning to validate the move.</Term>
                <Term title="Expanding">Participation and price expanding together with rising volatility.</Term>
                <Term title="Extended">A significant move has already occurred; the early window has passed.</Term>
                <Term title="Fading">Participation or momentum deteriorating after a move.</Term>
              </div>
            </section>
<CollapsibleSection title="How to interpret the evidence">
<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            MarketScannerPros is an educational market-analysis platform. A reading is a
            <strong className="text-slate-200"> composite summary of the indicators and dates on the page</strong> — not a statistical probability,
            not a forecast, and never a personalised instruction to buy, sell, or hold. This page explains the method and the data
            behind each badge and state so you can judge the evidence for yourself.
          </p>
<p className="text-xs leading-5 text-slate-300">
                Many indicators measure the same thing. EMA position, MACD, ADX, and Aroon are all expressions of
                <em> trend</em>. If four of them agree, that is <strong className="text-slate-200">one</strong> piece of
                trend evidence — not four. To avoid overstating agreement, we collapse correlated indicators into a
                small set of independent factor groups and count agreement across the groups:
              </p>
<p className="text-xs leading-5 text-slate-300">
                A description of observable behaviour — where a move appears to be in its lifecycle. It is context for
                research, not a trade instruction.
              </p>
            <CollapsibleSection title="A composite reading is a weighted summary, not a probability">
              <p className="text-xs leading-5 text-slate-300">
                When several indicators point the same way, that agreement is the measurement. It is a <em>heuristic</em> — the
                weights are rules chosen for transparency, not calibrated against historical outcomes. Counting how many
                indicators agree describes that agreement. It is not an odds figure. Where a tooltip
                says the count is how many indicators agree, that is the literal meaning.
              </p>
            </CollapsibleSection>



            <CollapsibleSection title="Evidence quality">
              <p className="text-xs leading-5 text-slate-300">
                Evidence quality checks the <em>inputs</em> behind a conclusion — how many independent factors are
                available, how fresh the data is, and whether factors conflict. It{" "}
                <strong className="text-slate-200">caps the composite</strong>: poor or stale evidence cannot produce a
                high headline number.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Term title="HIGH">Broad coverage, current data, no major conflicts.</Term>
                <Term title="MEDIUM">Adequate coverage; some data delayed or a factor missing.</Term>
                <Term title="LOW">Sparse coverage, stale data, or conflicting factors.</Term>
                <Term title="INSUFFICIENT">Too few independent factors, or data missing/simulated — treat as exploratory only.</Term>
              </div>
            </CollapsibleSection>



            <CollapsibleSection title="Extension state">
              <p className="text-xs leading-5 text-slate-300">
                How far a move has already run, from distance-from-average, range, and volatility percentile.
                <strong className="text-slate-200"> Early / Normal / Elevated / Extreme.</strong> An Extreme reading
                means the obvious part of the move may already be behind it. That is context for the reading.
              </p>
            </CollapsibleSection>

            <CollapsibleSection title="Data freshness &amp; provenance">
              <p className="text-xs leading-5 text-slate-300">
                Every data source carries a freshness badge: <strong className="text-slate-200">Live</strong> (current
                within the expected provider cadence), <strong className="text-slate-200">Delayed</strong>,{" "}
                <strong className="text-slate-200">Stale</strong>, or <strong className="text-slate-200">Missing</strong>.
                Panel-level badges reflect the <em>weakest</em> underlying row — a panel will not show
                &ldquo;Live&rdquo; over degraded or cached data. Delayed data is never presented as real-time.
              </p>
            </CollapsibleSection>

            <CollapsibleSection title="Derived vs observed data">
              <p className="text-xs leading-5 text-slate-300">
                Some readings are <em>estimated</em>, not directly observed, and are labelled as such. Where a reading
                comes from a single venue it says so: for example, &ldquo;Long/Short (OKX accounts)&rdquo; is OKX&rsquo;s
                reported count of accounts net long versus net short, not position size and not the whole market. We label derived, delayed, estimated, and
                simulated data so you can weight it accordingly.
              </p>
            </CollapsibleSection>

            <CollapsibleSection title="Market regime">
              <p className="text-xs leading-5 text-slate-300">
                Regime is the broad environment — trending, range, risk-on, risk-off, expansion, compression. The same
                indicator can mean different things in different regimes, so regime is shown as persistent context. When
                evidence is thin, the platform is comfortable saying <strong className="text-slate-200">Mixed /
                Conflicting</strong> or <strong className="text-slate-200">Not collected</strong> rather than forcing a call.
              </p>
            </CollapsibleSection>

            <CollapsibleSection title="What we deliberately do not do">
              <ul className="text-sm leading-7 text-slate-300">
                <li>We do not present composite readings as statistical probabilities.</li>
                <li>We do not issue buy / sell / hold instructions or personalised financial advice.</li>
                <li>We do not connect to brokers or route orders — portfolio and backtest features are simulation only.</li>
                <li>We do not publish fake testimonials, invented usage statistics, or promised returns.</li>
                <li>We do not present delayed, estimated, or simulated data as live, observed data.</li>
              </ul>
            </CollapsibleSection>


</CollapsibleSection>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-2 text-xs leading-5 text-slate-300">
              MarketScannerPros provides market data, analytical tools and educational research. It does not provide
              personalised financial advice. Trading involves substantial risk. See our{" "}
              <Link href="/disclaimer" className="text-emerald-400 no-underline hover:underline">disclaimer</Link>{" "}
              and{" "}
              <Link href="/compliance-hub" className="text-emerald-400 no-underline hover:underline">compliance hub</Link>.
            </div>
            <p data-source-line className="text-xs text-slate-400">Source · MarketScannerPros methodology</p>
          </div>
        </div>
      </div>
    </main>
  );
}
