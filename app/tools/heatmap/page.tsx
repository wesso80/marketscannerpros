'use client';

import SectorHeatmap from '@/components/SectorHeatmap';
import { ToolsPageHeader } from '@/components/ToolsPageHeader';
import RegimeBanner from '@/components/RegimeBanner';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function HeatmapPage() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessPortfolioInsights(tier)) return <UpgradeGate requiredTier="pro" feature="Sector Heat Map" />;

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      <ToolsPageHeader
        title="Sector Heat Map"
        subtitle="Spot risk-on vs risk-off in seconds. Green sectors show leadership, red sectors show weakness."
        badge="Sectors"
        icon="HM"
      />
      <div className="max-w-none mx-auto px-4 py-8">

        {/* Regime Context */}
        <div className="mb-4">
          <RegimeBanner />
        </div>

        {/* Main Heatmap */}
        <SectorHeatmap />

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <div className="msp-card rounded-xl p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] font-black text-emerald-300">READ</span> How to Read
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• <span className="text-emerald-400">Green</span> = sector is up</li>
              <li>• <span className="text-red-400">Red</span> = sector is down</li>
              <li>• Larger box = higher S&P 500 weight</li>
              <li>• Hover for detailed stats</li>
            </ul>
          </div>

          <div className="msp-card rounded-xl p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] font-black text-emerald-300">TIP</span> Pro Tips
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• Sector rotation signals market shifts</li>
              <li>• Defensive sectors up = risk-off sentiment</li>
              <li>• Tech & discretionary up = risk-on</li>
              <li>• Confirm directional bets with sector leadership</li>
            </ul>
          </div>

          <div className="msp-card rounded-xl p-5">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] font-black text-emerald-300">ETF</span> Sector ETFs
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
        <div className="mt-8 p-4 msp-surface rounded-lg">
          <p className="text-xs text-slate-500 text-center">
            <strong className="text-slate-400">Disclaimer:</strong> Sector performance data is for informational purposes only 
            and should not be considered investment advice. Data may be delayed. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </main>
  );
}
