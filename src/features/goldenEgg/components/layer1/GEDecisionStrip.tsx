import GEFlipConditions from '@/src/features/goldenEgg/components/layer1/GEFlipConditions';
import GEScoreBreakdownMini from '@/src/features/goldenEgg/components/layer1/GEScoreBreakdownMini';
import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GEConfidenceBadge from '@/src/features/goldenEgg/components/shared/GEConfidenceBadge';
import GEKeyValueRow from '@/src/features/goldenEgg/components/shared/GEKeyValueRow';
import GEKpiPill from '@/src/features/goldenEgg/components/shared/GEKpiPill';
import GESectionHeader from '@/src/features/goldenEgg/components/shared/GESectionHeader';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEDecisionStripProps = {
  layer1: GoldenEggPayload['layer1'];
  meta: GoldenEggPayload['meta'];
};

function ctaLabel(action: GoldenEggPayload['layer1']['cta']['primary'] | GoldenEggPayload['layer1']['cta']['secondary']) {
  if (!action) return 'Open';
  if (action === 'OPEN_SCANNER') return 'Open Scanner';
  if (action === 'SET_ALERT') return 'Set Alert';
  if (action === 'ADD_WATCHLIST') return 'Add Watchlist';
  if (action === 'OPEN_OPTIONS') return 'Open Options';
  return 'Open Time';
}

export default function GEDecisionStrip({ layer1, meta }: GEDecisionStripProps) {
  return (
    <GECard>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-3">
          <GEConfidenceBadge confidence={layer1.confidence} grade={layer1.grade} permission={layer1.permission} />
          <div className="grid grid-cols-3 gap-2">
            <GEKpiPill label="Permission" value={layer1.permission} />
            <GEKpiPill label="Direction" value={layer1.direction} />
            <GEKpiPill label="TF" value={meta.timeframe} />
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2">
          <GESectionHeader title="Why" />
          <GEKeyValueRow label="Driver" value={layer1.primaryDriver} />
          <GEKeyValueRow label="Blocker" value={layer1.primaryBlocker || '—'} />
          <GEScoreBreakdownMini rows={layer1.scoreBreakdown} />
        </div>

        <div className="lg:col-span-3">
          <GESectionHeader title="What flips it" />
          <GEFlipConditions items={layer1.flipConditions} />
          <div className="mt-3 flex gap-2">
            <button className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/30">
              {ctaLabel(layer1.cta.primary)}
            </button>
            {layer1.cta.secondary && (
              <button className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 ring-1 ring-white/10">
                {ctaLabel(layer1.cta.secondary)}
              </button>
            )}
          </div>
        </div>
      </div>
    </GECard>
  );
}
