import GECollapsible from '@/src/features/goldenEgg/components/shared/GECollapsible';
import GETag from '@/src/features/goldenEgg/components/shared/GETag';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEEvidenceMomentumProps = {
  momentum: GoldenEggPayload['layer3']['momentum'];
};

function tone(state: 'bull' | 'bear' | 'neutral') {
  return state === 'bull' ? 'green' : state === 'bear' ? 'red' : 'amber';
}

function verdictTone(v: GoldenEggPayload['layer3']['momentum']['verdict']) {
  return v === 'agree' ? 'green' : v === 'disagree' ? 'red' : v === 'neutral' ? 'amber' : 'slate';
}

export default function GEEvidenceMomentum({ momentum }: GEEvidenceMomentumProps) {
  return (
    <GECollapsible
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Momentum</span>
            <GETag tone={verdictTone(momentum.verdict)} text={`Verdict: ${momentum.verdict}`} />
          </div>
          <div className="text-xs text-slate-400">{momentum.indicators.length} indicators</div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {momentum.indicators.map((indicator) => (
          <div key={indicator.name} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">{indicator.name}</span>
              <GETag tone={tone(indicator.state)} text={indicator.state.toUpperCase()} />
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{indicator.value}</div>
          </div>
        ))}
      </div>
    </GECollapsible>
  );
}
