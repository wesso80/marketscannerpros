import GEKeyValueRow from '@/src/features/goldenEgg/components/shared/GEKeyValueRow';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GERiskSizerInlineProps = {
  rr: GoldenEggPayload['layer2']['execution']['rr'];
  sizingHint?: GoldenEggPayload['layer2']['execution']['sizingHint'];
};

export default function GERiskSizerInline({ rr, sizingHint }: GERiskSizerInlineProps) {
  return (
    <div className="space-y-2">
      <GEKeyValueRow label="Expected R" value={(rr.expectedR ?? 0).toFixed(2)} />
      <GEKeyValueRow label="Min R" value={(rr.minR ?? 0).toFixed(2)} />
      {sizingHint && (
        <GEKeyValueRow
          label="Sizing Hint"
          value={`${sizingHint.riskPct}% risk${sizingHint.riskUsd ? ` · $${sizingHint.riskUsd}` : ''}${sizingHint.sizeUnits ? ` · ${sizingHint.sizeUnits} units` : ''}`}
        />
      )}
    </div>
  );
}
