import GECollapsible from '@/src/features/goldenEgg/components/shared/GECollapsible';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEEvidenceNarrativeProps = {
  narrative?: GoldenEggPayload['layer3']['narrative'];
};

export default function GEEvidenceNarrative({ narrative }: GEEvidenceNarrativeProps) {
  if (!narrative || !narrative.enabled) return null;

  return (
    <GECollapsible
      defaultOpen={false}
      header={
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-100">Narrative (AI Brief)</span>
          <div className="text-xs text-slate-400">Collapsed by default</div>
        </div>
      }
    >
      <p className="text-sm text-slate-200">{narrative.summary}</p>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">Bullets</div>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {narrative.bullets.map((bullet) => (
            <li key={bullet}>• {bullet}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">Risks</div>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {narrative.risks.map((risk) => (
            <li key={risk}>• {risk}</li>
          ))}
        </ul>
      </div>
    </GECollapsible>
  );
}
