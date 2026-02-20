import GECollapsible from '@/src/features/goldenEgg/components/shared/GECollapsible';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';
import GETag from '@/src/features/goldenEgg/components/shared/GETag';
import { GoldenEggPayload, Verdict } from '@/src/features/goldenEgg/types';

type GEEvidenceInternalsProps = {
  internals?: GoldenEggPayload['layer3']['internals'];
};

function verdictTone(v: Verdict) {
  return v === 'agree' ? 'green' : v === 'disagree' ? 'red' : v === 'neutral' ? 'amber' : 'slate';
}

export default function GEEvidenceInternals({ internals }: GEEvidenceInternalsProps) {
  if (!internals) return null;

  return (
    <GECollapsible
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Internals</span>
            <GETag tone={verdictTone(internals.verdict)} text={`Verdict: ${internals.verdict}`} />
          </div>
          <div className="text-xs text-slate-400">Breadth / relative strength</div>
        </div>
      }
    >
      {!internals.enabled ? (
        <GEEmptyState title="Internals unavailable" body="Enable internals feed to render this module." />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {internals.items.map((item) => (
            <div key={item.name} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">{item.name}</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </GECollapsible>
  );
}
