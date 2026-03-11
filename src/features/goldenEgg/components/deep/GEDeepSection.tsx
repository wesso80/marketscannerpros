import type { DeepAnalysisData } from '@/src/features/goldenEgg/types';
import GECompanyOverview from './GECompanyOverview';
import GETechnicalGrid from './GETechnicalGrid';
import GEOptionsDetail from './GEOptionsDetail';
import GEAIAnalysis from './GEAIAnalysis';
import GENewsFeed from './GENewsFeed';

type Props = {
  deep: DeepAnalysisData | null;
  loading: boolean;
  error: string;
};

export default function GEDeepSection({ deep, loading, error }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
        <p className="text-sm text-white/40">Loading deep analysis — company, indicators, options, AI &amp; news…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-center text-sm text-amber-300">
        {error}
      </div>
    );
  }

  if (!deep) return null;

  const price = deep.price?.price ?? null;

  return (
    <div className="space-y-4">
      {/* Company Overview (equities only) */}
      {deep.company && <GECompanyOverview company={deep.company} price={price} />}

      {/* Technical Indicators */}
      {deep.indicators && <GETechnicalGrid indicators={deep.indicators} price={price} />}

      {/* Options Detail (equities only) */}
      {deep.optionsData && <GEOptionsDetail options={deep.optionsData} />}

      {/* AI Deep Analysis */}
      {deep.aiAnalysis && <GEAIAnalysis analysis={deep.aiAnalysis} />}

      {/* News Feed */}
      {deep.news && deep.news.length > 0 && <GENewsFeed news={deep.news} />}
    </div>
  );
}
