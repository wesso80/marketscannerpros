import GECollapsible from '@/src/features/goldenEgg/components/shared/GECollapsible';
import GEKeyValueRow from '@/src/features/goldenEgg/components/shared/GEKeyValueRow';
import GETag from '@/src/features/goldenEgg/components/shared/GETag';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEEvidenceStructureProps = {
  structure: GoldenEggPayload['layer3']['structure'];
};

function verdictTone(v: GoldenEggPayload['layer3']['structure']['verdict']) {
  return v === 'agree' ? 'green' : v === 'disagree' ? 'red' : v === 'neutral' ? 'amber' : 'slate';
}

export default function GEEvidenceStructure({ structure }: GEEvidenceStructureProps) {
  return (
    <GECollapsible
      defaultOpen
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Structure</span>
            <GETag tone={verdictTone(structure.verdict)} text={`Verdict: ${structure.verdict}`} />
          </div>
          <div className="text-xs text-slate-400">Vol: {structure.volatility.regime}</div>
        </div>
      }
    >
      <GEKeyValueRow label="HTF / MTF / LTF" value={`${structure.trend.htf} / ${structure.trend.mtf} / ${structure.trend.ltf}`} />
      <GEKeyValueRow label="Volatility" value={`${structure.volatility.regime}${typeof structure.volatility.atr === 'number' ? ` · ATR ${structure.volatility.atr}` : ''}`} />
      <GEKeyValueRow label="Liquidity" value={`${structure.liquidity.overhead || '—'} | ${structure.liquidity.below || '—'}`} />
      {structure.liquidity.note && <div className="text-sm text-slate-300">{structure.liquidity.note}</div>}
    </GECollapsible>
  );
}
