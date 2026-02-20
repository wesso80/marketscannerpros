import TrendingCoinsWidget from '@/components/TrendingCoinsWidget';
import TopMoversWidget from '@/components/TopMoversWidget';
import CategoryHeatmapWidget from '@/components/CategoryHeatmapWidget';

export default function DerivativesContextSection() {
  return (
    <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
      <summary className="cursor-pointer list-none px-3 py-3 md:px-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Context (Discovery)</div>
            <div className="text-xs text-white/50">Trending / Gainers / Sectors — non-core derivatives context</div>
          </div>
          <div className="text-xs font-semibold text-white/70">Toggle</div>
        </div>
      </summary>
      <div className="border-t border-white/10 p-3 md:p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <TrendingCoinsWidget />
          <TopMoversWidget />
          <CategoryHeatmapWidget />
        </div>
      </div>
    </details>
  );
}
