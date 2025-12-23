'use client';

import CryptoHeatmap from '@/components/CryptoHeatmap';

export default function CryptoHeatmapPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            🪙 Crypto Heat Map
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Visualize cryptocurrency market performance at a glance. Green indicates 24h gains, 
            red indicates losses. Larger boxes represent coins with higher market cap.
          </p>
        </div>

        {/* Main Heatmap */}
        <CryptoHeatmap />

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span>📊</span> Market Dominance
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• <span className="text-orange-400">Bitcoin</span> ~55% dominance</li>
              <li>• <span className="text-blue-400">Ethereum</span> ~17% dominance</li>
              <li>• Altcoins share the rest</li>
              <li>• Box size = relative market cap</li>
            </ul>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span>💡</span> Trading Insights
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• All green = bullish market</li>
              <li>• All red = bearish / risk-off</li>
              <li>• BTC green, alts red = rotation to safety</li>
              <li>• Alts outperforming = alt season signals</li>
            </ul>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span>⚡</span> Quick Stats
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• Updates every 60 seconds</li>
              <li>• Shows 24-hour price change</li>
              <li>• Hover for detailed info</li>
              <li>• Sort by market cap or % change</li>
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <p className="text-xs text-slate-500 text-center">
            <strong className="text-slate-400">Disclaimer:</strong> Cryptocurrency prices are highly volatile. 
            Data is for informational purposes only and should not be considered investment advice. 
            Always do your own research before trading.
          </p>
        </div>
      </div>
    </main>
  );
}
