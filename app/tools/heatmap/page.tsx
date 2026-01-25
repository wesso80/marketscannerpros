'use client';

import SectorHeatmap from '@/components/SectorHeatmap';
import DataComingSoon from '@/components/DataComingSoon';
import { useUserTier } from '@/lib/useUserTier';

export default function HeatmapPage() {
  const { isAdmin } = useUserTier();
  
  // Data licensing gate - only admins can access for now
  if (!isAdmin) {
    return <DataComingSoon toolName="📊 Sector Heat Map" description="Visualize S&P 500 sector performance at a glance" />;
  }
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            📊 Sector Heat Map
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Visualize S&P 500 sector performance at a glance. Green indicates gains, 
            red indicates losses. Larger boxes represent sectors with more market weight.
          </p>
        </div>

        {/* Main Heatmap */}
        <SectorHeatmap />

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span>🎯</span> How to Read
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• <span className="text-emerald-400">Green</span> = sector is up</li>
              <li>• <span className="text-red-400">Red</span> = sector is down</li>
              <li>• Larger box = higher S&P 500 weight</li>
              <li>• Hover for detailed stats</li>
            </ul>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span>📈</span> Pro Tips
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• Sector rotation signals market shifts</li>
              <li>• Defensive sectors up = risk-off sentiment</li>
              <li>• Tech & discretionary up = risk-on</li>
              <li>• Compare multiple timeframes</li>
            </ul>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span>🔄</span> Sector ETFs
            </h3>
            <div className="text-sm text-slate-400 space-y-1">
              <p>Each sector is tracked via SPDR ETFs:</p>
              <p className="text-slate-500 text-xs mt-2">
                XLK (Tech) • XLF (Financials) • XLV (Healthcare) • XLE (Energy) • 
                XLY (Cons. Disc.) • XLP (Cons. Staples) • XLI (Industrials) • 
                XLB (Materials) • XLU (Utilities) • XLRE (Real Estate) • XLC (Comm.)
              </p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <p className="text-xs text-slate-500 text-center">
            <strong className="text-slate-400">Disclaimer:</strong> Sector performance data is for informational purposes only 
            and should not be considered investment advice. Data may be delayed. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </main>
  );
}
