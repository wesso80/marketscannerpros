import GECollapsible from '@/src/features/goldenEgg/components/shared/GECollapsible';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';
import GETag from '@/src/features/goldenEgg/components/shared/GETag';
import { GoldenEggPayload, Verdict } from '@/src/features/goldenEgg/types';

type GEEvidenceFlowOptionsProps = {
  options?: GoldenEggPayload['layer3']['options'];
};

function verdictTone(v: Verdict) {
  return v === 'agree' ? 'green' : v === 'disagree' ? 'red' : v === 'neutral' ? 'amber' : 'slate';
}

export default function GEEvidenceFlowOptions({ options }: GEEvidenceFlowOptionsProps) {
  if (!options) return null;

  return (
    <GECollapsible
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Options / Flow</span>
            <GETag tone={verdictTone(options.verdict)} text={`Flow: ${options.verdict}`} />
          </div>
          <div className="text-xs text-slate-400">{options.highlights[0]?.label || 'Options'}</div>
        </div>
      }
    >
      {!options.enabled ? (
        <GEEmptyState title="Options feed unavailable" body="Connect options data / enable premium feed to unlock this module." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {options.highlights.map((item) => (
              <div key={item.label} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-slate-400">{item.label}</div>
                <div className="text-sm font-semibold text-slate-100">{item.value}</div>
              </div>
            ))}
          </div>
          {!!options.notes?.length && (
            <ul className="space-y-1 text-sm text-slate-300">
              {options.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </GECollapsible>
  );
}
