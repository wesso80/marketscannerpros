export const metadata = {
  title: "MarketScanner Pro — User Guide",
  alternates: { canonical: "/guide" }
};

export default function UserGuide() {
  return (
    <main>
      <h1>MarketScanner Pro — User Guide</h1>
      <p>Everything you need to run scans, interpret scores, and manage alerts.</p>
      <h2>1) Quick Start</h2>
      <ol>
        <li>Pick a watchlist (Manual Entry or import CSV).</li>
        <li>Click <em>Run Scanner</em> for Equities or Crypto.</li>
        <li>Open a symbol to inspect multi-TF confluence, signals, and indicators.</li>
        <li>(Optional) Set price alerts or export CSV for journaling.</li>
      </ol>
      <h2>2) Scoring Model & Weights</h2>
      <p>Final score is a weighted sum across core signals. Partial credit applies when alignment is close but not perfect.</p>
      <ul>
        <li><strong>EMA Stack (30%)</strong> — EMA9 &gt; 13 &gt; 21 &gt; 50 bullish; reverse bearish.</li>
        <li><strong>SMA5 + EMA9/13 Trigger (10%)</strong> — Cross-up adds, cross-down subtracts; ATR filter reduces noise.</li>
        <li><strong>RSI Regime (20%)</strong> — Bull ≥ 55, Neutral 45–55; Bear ≤ 45 (asset-adaptive).</li>
        <li><strong>MACD Momentum (20%)</strong> — Signal line cross + histogram slope; penalize fading momentum.</li>
        <li><strong>ATR Risk/Extension (10%)</strong> — Normalizes moves; penalizes over-extension.</li>
        <li><strong>Volume Context (7%)</strong> — Bonus when volume &gt; 20-day average; filters illiquid names.</li>
        <li><strong>Squeeze / Expansion (3%)</strong> — BB bandwidth + ATR compression; expansion bonus.</li>
      </ul>
      <h2>3) Timeframes & Confluence</h2>
      <p>We aggregate confluence across: 30m, 1h, 2h, 3h, 4h, 6h, 8h, 1D, Weekly.</p>
      <ul>
        <li><strong>Stack tiers:</strong> ×2 Watch → ×3 Setup → ×4 High-conviction → ×≥5 Extreme.</li>
        <li><strong>Countdown:</strong> badge shows time remaining in each active candle.</li>
        <li><strong>Weekly:</strong> adds macro context but doesn’t block intraday triggers.</li>
      </ul>
      <h2>4) Entries, Targets, Stops, Risk</h2>
      <ul>
        <li><strong>Entry:</strong> Prefer SMA cross in direction of EMA stack; avoid entries when price is &gt; 1× ATR from mean.</li>
        <li><strong>Stops:</strong> Trend = ×1.2× ATR(14); Counter-trend = ×0.8× ATR.</li>
        <li><strong>Targets:</strong> ×0.7× / ×1.5× / 2× ATR% grid; take partial at 1×; trail remainder by EMA21 or ATR stop.</li>
        <li>Use the prior-bar 50% retrace as a visual pullback level.</li>
      </ul>

      <h2>5) Price Alerts</h2>
      <ul>
        <li><strong>Auto Check</strong> cadence for scanning.</li>
        <li><strong>Triggers:</strong> target hits (TP/SL grid), custom price levels.</li>
        <li><strong>Signal events:</strong> SMA5↔EMA9/13 cross, EMA stack flip, RSI regime change, squeeze expansion.</li>
        <li><strong>Delivery:</strong> in-app notifications (100% reliable); optional email alerts for mobile coverage.</li>
      </ul>

      <h2>6) Advanced Charts</h2>
      <p>Indicators: EMAs, RSI, MACD, BB/ATR context, volume. If you see mismatches vs your broker:</p>
      <ul>
        <li>Align timezone &amp; session settings.</li>
        <li>Match candle granularity (1D vs 4h vs 1h etc.).</li>
        <li>Illiquid names may show spiky prints; confirm with a second source.</li>
      </ul>

      <h2>7) Exports & Workflow</h2>
      <ul>
        <li>CSV copy for journaling; email notifications for scan results and alerts.</li>
        <li>Export snapshots from charts for trade logs.</li>
      </ul>
    </main>
  );
}
