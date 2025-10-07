export const metadata = {
  title: "MarketScanner Pro — User Guide",
  alternates: { canonical: "/guide" }
};

export default function UserGuide() {
  return (
    <main>
      <h1>MarketScanner Pro — User Guide</h1>
      <p>Everything you need to scan markets, track performance, and optimize your trading strategy.</p>

      <h2>🧭 1. Navigation & Mode Controls (Left Sidebar)</h2>
      <p><strong>What it does:</strong> This is your app's control hub. It lets users switch between modes and manage lists or subscriptions.</p>
      <p><strong>How to use it:</strong></p>
      <ul>
        <li><strong>Mode Selector (Web / Mobile)</strong> → Indicates which version is active.</li>
        <li><strong>Watchlists</strong> → Manual Entry / New / Manage → Users can manually enter ticker symbols or manage pre-saved lists for scanning.</li>
        <li><strong>Subscription Buttons</strong> ("Manage Subscription", "Cancel Subscription") → Handles plan upgrades or cancellations.</li>
      </ul>

      <h2>⚡ 2. Hero Section / Overview Panel</h2>
      <p><strong>Text:</strong> "Scan crypto & stocks across timeframes — fast."<br/>
      This is the landing view that sets the context.</p>
      <p><strong>How to use it:</strong></p>
      <ul>
        <li><strong>Start Scanning Now</strong> → Launches a scan using the user's chosen list and settings.</li>
        <li><strong>View Results</strong> → Opens the latest completed scan report.</li>
      </ul>
      <p>This section essentially acts as the entry point to begin any analysis session.</p>

      <h2>📊 3. Scanner Controls</h2>
      <p><strong>Tabs:</strong> Scan Rate, Macro Crypto, etc.</p>
      <p><strong>Buttons:</strong></p>
      <ul>
        <li><strong>Run Scanner</strong> → Initiates a real-time scan across the selected markets.</li>
        <li><strong>Refresh Data</strong> → Pulls the latest candle/indicator data from your backend.</li>
        <li><strong>Time Selector</strong> → Lets the user choose timeframe (e.g., 1 h, 4 h, 1 d) for the next scan.</li>
      </ul>
      <p><strong>Usage:</strong> Select your desired market scope and timeframe, then click Run Scanner to populate results in the next sections.</p>

      <h2>🏦 4. Equity Markets Panel</h2>
      <p><strong>Purpose:</strong> Displays results for traditional stock / equity scans.<br/>
      If there are no stocks meeting the filter, it shows "No results — run the scanner first."</p>
      <p><strong>Usage:</strong> After a scan, this area lists tickers with matching setups, sorted by score or confluence.</p>

      <h2>💰 5. Crypto Markets Panel</h2>
      <p><strong>Purpose:</strong> Same as the equity section but for crypto assets.<br/>
      Displays live or cached scanner hits with timeframe labels, strength score, etc.</p>

      <h2>📈 6. Scoring Methodology</h2>
      <p><strong>Purpose:</strong> Explains how MarketScanner Pros calculates signal scores.</p>
      <p><strong>Usage:</strong> Click Show Details → expands to show formula logic (e.g., EMA alignment + RSI levels + volume confirmation = score).<br/>
      Useful for users who want transparency behind your algorithmic ratings.</p>

      <h2>🔔 7. Price Alerts</h2>
      <p><strong>Purpose:</strong> Automates watchlist monitoring.</p>
      <p><strong>Controls:</strong></p>
      <ul>
        <li><strong>Auto Check toggle</strong> → Enables background alert scanning.</li>
        <li><strong>Check Now</strong> → Manually runs all alert conditions.</li>
        <li><strong>New Alert</strong> → Create a new rule (symbol + condition + target price).</li>
        <li><strong>Active / Triggered tabs</strong> → Filter current vs fired alerts.</li>
      </ul>

      <h2>🧠 8. Advanced Technical Analysis Charts</h2>
      <p><strong>Purpose:</strong> Displays multi-indicator chart views for a selected asset.</p>
      <p><strong>Controls:</strong></p>
      <ul>
        <li>Dropdowns for Instrument, Timeframe, and Indicator sets (MACD, RSI, Volume, etc.).</li>
        <li>Interactive chart area below once a symbol is chosen.</li>
      </ul>
      <p><strong>Usage:</strong> Pick a symbol + timeframe + indicators, then visualize the current confluence directly.</p>

      <h2>💼 9. Portfolio Tracking</h2>
      <p><strong>Purpose:</strong> Track total account performance and distribution.</p>
      <p><strong>Widgets:</strong></p>
      <ul>
        <li><strong>Portfolio Value / P&L Summary</strong> → Live snapshot of holdings.</li>
        <li><strong>Pie Chart (Allocation by Market Value)</strong> → Shows diversification.</li>
        <li><strong>Performance Chart</strong> → Historical growth curve vs time.</li>
      </ul>
      <p><strong>Usage:</strong> Add trades to your portfolio; this updates performance metrics automatically.</p>

      <h2>📊 10. Portfolio Metrics</h2>
      <p><strong>Purpose:</strong> Tabular stats for deeper insight.</p>
      <p><strong>Columns include:</strong></p>
      <ul>
        <li>Total Market Value</li>
        <li>Total Cost Basis</li>
        <li>Unrealized Gain / Loss</li>
        <li>Win Rate, ROI, Average Return per Trade</li>
      </ul>

      <h2>🧾 11. Trade Journal</h2>
      <p><strong>Purpose:</strong> A trading log for performance analysis.</p>
      <p><strong>Controls:</strong></p>
      <ul>
        <li>Log Trade / Trade History / Performance Stats tabs</li>
        <li>Inputs for symbol, direction, entry, exit, quantity, notes, etc.</li>
      </ul>
      <p><strong>Usage:</strong> Record every trade; system computes metrics like total P&L and win rate automatically.</p>

      <h2>🧮 12. Strategy Backtesting</h2>
      <p><strong>Purpose:</strong> Test a strategy's effectiveness before live trading.</p>
      <p><strong>Controls:</strong></p>
      <ul>
        <li>Backtest Range (Start / End Date)</li>
        <li>Timeframe Selector</li>
        <li>Strategy Preset ("Backtest Signal Pattern or RSI/MA Cross")</li>
        <li><strong>Run Backtest</strong> → Executes and shows historical results (win rate, drawdown).</li>
        <li><strong>Log CSV</strong> → Exports results.</li>
      </ul>
      <p><strong>Usage:</strong> Select a strategy + symbols + period → Run Backtest to evaluate past performance.</p>

      <h2>📉 13. Scan Statistics</h2>
      <p><strong>Purpose:</strong> Summarizes app activity.</p>
      <p><strong>Displays counters:</strong></p>
      <ul>
        <li>Stocks Scanned</li>
        <li>Crypto Scanned</li>
        <li>Errors / Alerts Triggered</li>
      </ul>
      <p>Helps users verify that scans are running and data feeds are healthy.</p>
    </main>
  );
}
