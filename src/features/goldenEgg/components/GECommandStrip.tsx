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
      <GEKpiPill label="Permission" value={layer1.permission} />
      <GEKpiPill label="Direction" value={layer1.direction} />
      <GEKpiPill label="Confidence" value={`${layer1.confidence}% (${layer1.grade})`} />
      <GEKpiPill label="Price" value={meta.price.toFixed(2)} />
    </div>
  );
}
