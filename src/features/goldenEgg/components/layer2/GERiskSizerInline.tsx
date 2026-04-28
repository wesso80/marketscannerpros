import GEKeyValueRow from '@/src/features/goldenEgg/components/shared/GEKeyValueRow';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GERiskSizerInlineProps = {
  rr: GoldenEggPayload['layer2']['scenario']['hypotheticalRr'];
  hypotheticalRisk?: GoldenEggPayload['layer2']['scenario']['hypotheticalRisk'];
};

export default function GERiskSizerInline({ rr, hypotheticalRisk }: GERiskSizerInlineProps) {
  return (
    <div className="space-y-2">
      <GEKeyValueRow label="Scenario R" value={(rr.expectedR ?? 0).toFixed(2)} />
      <GEKeyValueRow label="Minimum Scenario R" value={(rr.minR ?? 0).toFixed(2)} />
      {hypotheticalRisk && (
        <GEKeyValueRow
          label="Hypothetical Risk Example"
          value={`${hypotheticalRisk.riskPct}% model risk${hypotheticalRisk.riskUsd ? ` · $${hypotheticalRisk.riskUsd}` : ''}${hypotheticalRisk.sizeUnits ? ` · ${hypotheticalRisk.sizeUnits} units` : ''}`}
        />
      )}
    </div>
  );
}
