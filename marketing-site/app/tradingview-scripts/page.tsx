'use client';

import Link from 'next/link';

export default function TradingViewScripts() {
  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Hero Section */}
      <section className="border-b border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Professional TradingView Scripts
            </h1>
            <p className="text-xl md:text-2xl text-neutral-400 max-w-3xl mx-auto">
              Advanced indicators and tools to enhance your trading analysis
            </p>
          </div>
        </div>
      </section>

      {/* Time Confluence Windows Script */}
      <section className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Left: Description */}
            <div>
              <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1 text-sm text-emerald-400 mb-4">
                Most Popular
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Time Confluence Windows — 50% Levels + Next-Close Scanner
              </h2>
              <p className="text-lg text-neutral-300 mb-6">
                Find stacked time windows and the exact prior-bar 50% levels across multiple timeframes — in one panel and on your chart.
              </p>
              <p className="text-neutral-400 mb-6">
                This tool highlights when several timeframes are simultaneously "in play" (post-close & pre-close windows), 
                and plots the previous bar midpoint (50%) for each TF so you can judge mean-revert vs. continuation risk at a glance.
              </p>

              <div className="flex flex-wrap gap-3 mb-8">
                <a
                  href="https://www.tradingview.com/script/YOUR_SCRIPT_ID/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-900 font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h12V4H6zm2 2h8v2H8V6zm0 4h8v2H8v-2zm0 4h5v2H8v-2z"/>
                  </svg>
                  View on TradingView
                </a>
                <button className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-semibold px-6 py-3 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Source Code
                </button>
              </div>
            </div>

            {/* Right: Screenshot */}
            <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900 shadow-2xl">
              <img 
                src="/marketing/tradingview-confluence.png" 
                alt="Time Confluence Windows TradingView Script"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <h3 className="text-2xl md:text-3xl font-bold mb-8 text-center">What it shows</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h4 className="font-bold text-lg mb-2">Confluence Shading</h4>
              <p className="text-neutral-400 text-sm">
                Counts active windows from selected TFs (30m→8h) plus optional pre-close anticipation for 3h/4h/6h/8h. 
                Tiers at 5/6/7/8/≥9 stacks with configurable colors.
              </p>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="font-bold text-lg mb-2">Panel with Details</h4>
              <p className="text-neutral-400 text-sm">
                TF list (tinted to match line colors), Next Close countdown for each TF, 
                and Prev 50% = exact midpoint of the previous bar (▲ if price above, ▼ if below).
              </p>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <h4 className="font-bold text-lg mb-2">50% Lines on Chart</h4>
              <p className="text-neutral-400 text-sm">
                Optional lines for intraday TFs plus optional D/W/M. Labels can show price. 
                Close markers (triangles) show when a TF just closed.
              </p>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h4 className="font-bold text-lg mb-2">Smart Scan Header</h4>
              <p className="text-neutral-400 text-sm">
                Auto-adds higher TFs (multi-day/week/month bars) only if their next close is within X hours (default 22h), 
                keeping the panel focused on relevant windows.
              </p>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h4 className="font-bold text-lg mb-2">Alerts</h4>
              <p className="text-neutral-400 text-sm">
                One alert condition when the stack reaches your threshold - never miss a confluence opportunity.
              </p>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h4 className="font-bold text-lg mb-2">Exact & Efficient</h4>
              <p className="text-neutral-400 text-sm">
                50% computed with one request per TF using hl2[1] on the requested basis. 
                Keeps table and lines in perfect sync and reduces request usage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Key Inputs Section */}
      <section className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <h3 className="text-2xl md:text-3xl font-bold mb-8 text-center">Key Inputs</h3>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <h4 className="font-bold text-lg mb-4 text-emerald-400">Timeframe Settings</h4>
              <ul className="space-y-2 text-neutral-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>Tracked TFs: 30m, 1h, 2h, 3h, 4h, 6h, 8h (toggle each)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>Basis: Heikin-Ashi on/off, RTH vs. Extended sessions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>Post-close & Pre-close window lengths per TF</span>
                </li>
              </ul>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <h4 className="font-bold text-lg mb-4 text-emerald-400">Display Options</h4>
              <ul className="space-y-2 text-neutral-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>Line options: width, style, span, label side, show price</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>TF-follow: hide intraday lines when chart TF is higher</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>Alert: threshold for confluence stack</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How to Use Section */}
      <section className="border-b border-neutral-800 bg-neutral-900/20">
        <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
          <h3 className="text-2xl md:text-3xl font-bold mb-8 text-center">How to Use</h3>
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-neutral-900 rounded-full flex items-center justify-center font-bold">1</div>
              <p className="text-neutral-300 pt-1">Add the indicator and pick your tracked TFs</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-neutral-900 rounded-full flex items-center justify-center font-bold">2</div>
              <p className="text-neutral-300 pt-1">Choose your basis (Regular vs Extended / Heikin-Ashi)</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-neutral-900 rounded-full flex items-center justify-center font-bold">3</div>
              <p className="text-neutral-300 pt-1">Set scan hours (e.g., 22h) to show higher-TF rows/lines only when relevant</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-neutral-900 rounded-full flex items-center justify-center font-bold">4</div>
              <p className="text-neutral-300 pt-1">Optionally enable lines & labels for the TFs you actively trade</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-neutral-900 rounded-full flex items-center justify-center font-bold">5</div>
              <p className="text-neutral-300 pt-1">(Optional) Create an alert: Time Confluence Stack ≥ Threshold</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tips & FAQ */}
      <section className="border-b border-neutral-800">
        <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
          <h3 className="text-2xl md:text-3xl font-bold mb-8 text-center">Tips & FAQ</h3>
          
          <div className="space-y-6">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <h4 className="font-bold text-lg mb-2 text-emerald-400">Lines don't match the table?</h4>
              <p className="text-neutral-300">
                Make sure Auto Fit to screen is on (or zoom so lines are within view), and confirm you're using the same basis 
                (RTH/Extended, Heikin-Ashi) as the panel. This version uses the same midpoint source for both, so values match exactly.
              </p>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <h4 className="font-bold text-lg mb-2 text-emerald-400">Hitting request limits?</h4>
              <p className="text-neutral-300">
                Disable unused TFs, turn off D/W/M lines, or increase "Scan ≤ hours" selectivity. 
                This build already halves midpoint requests via hl2[1].
              </p>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6">
              <h4 className="font-bold text-lg mb-2 text-emerald-400">No-repaint note</h4>
              <p className="text-neutral-300">
                50% levels use previous bar data on each TF with lookahead_off, so the plotted midpoints do not repaint. 
                Shading/countdowns update in real time as windows open/close.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-b from-neutral-950 to-neutral-900">
        <div className="mx-auto max-w-4xl px-4 py-12 md:py-16 text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-4">Ready to enhance your trading?</h3>
          <p className="text-neutral-400 mb-8 text-lg">
            Get instant access to all our professional TradingView scripts
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://www.tradingview.com/u/YOUR_USERNAME/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-900 font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
            >
              View All Scripts
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
            >
              View Pricing
            </Link>
          </div>

          <p className="text-neutral-500 text-sm mt-8">
            <strong>Disclaimer:</strong> This is an educational tool, not financial advice. Always confirm signals within your own plan and manage risk.
          </p>
        </div>
      </section>
    </div>
  );
}
