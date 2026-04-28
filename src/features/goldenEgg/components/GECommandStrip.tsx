import GEKpiPill from '@/src/features/goldenEgg/components/shared/GEKpiPill';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GECommandStripProps = {
  meta: GoldenEggPayload['meta'];
  layer1: GoldenEggPayload['layer1'];
};

export default function GECommandStrip({ meta, layer1 }: GECommandStripProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <GEKpiPill label="Symbol" value={`${meta.symbol} · ${meta.timeframe}`} />
      <GEKpiPill label="Assessment" value={layer1.assessment} />
      <GEKpiPill label="Direction" value={layer1.direction} />
      <GEKpiPill label="Confluence" value={`${layer1.confidence}% (${layer1.grade})`} />
      <GEKpiPill label="Price" value={(meta.price ?? 0).toFixed(2)} />
    </div>
  );
}
