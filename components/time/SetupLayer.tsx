import ClusterStrengthCard from '@/components/time/ClusterStrengthCard';
import DecompositionMatrix from '@/components/time/DecompositionMatrix';
import LayerSection from '@/components/time/LayerSection';
import WindowTimeline from '@/components/time/WindowTimeline';
import { MiniScore, SectionCard } from '@/components/time/atoms';
import { TimeConfluenceV2Output, TimeSetupInputs } from '@/components/time/types';

function WarningsCard({ warnings }: { warnings: TimeSetupInputs['warnings'] }) {
  return (
    <SectionCard>
      <div className="text-sm font-semibold text-slate-200">Setup Warnings</div>
      {warnings.length === 0 ? (
        <div className="mt-2 text-sm text-slate-400">No warnings.</div>
      ) : (
        <ul className="mt-2 space-y-2 text-sm text-slate-200">
          {warnings.map((warning) => (
            <li key={warning} className="rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/15">
              {warning}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function SetupSummary({ setup }: { setup: TimeSetupInputs }) {
  return (
    <SectionCard>
      <div className="text-sm font-semibold text-slate-200">Setup Summary</div>
      <div className="mt-3 space-y-2 text-sm text-slate-300">
        <div>
          Primary Direction: <span className="font-semibold text-slate-100">{setup.primaryDirection}</span>
        </div>
        <div>
          Window Status: <span className="font-semibold text-slate-100">{setup.window.status}</span>
        </div>
        <div>
          Alignment: <span className="font-semibold text-slate-100">{setup.window.alignmentCount}/{setup.window.tfCount}</span>
        </div>
      </div>
    </SectionCard>
  );
}

export default function SetupLayer({ setup, out }: { setup: TimeSetupInputs; out: TimeConfluenceV2Output }) {
  return (
    <LayerSection
      title="Layer 2 — Time Structure (Decomposition + Window)"
      tone="setup"
      right={<MiniScore label="Setup" value={out.setupScore} />}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DecompositionMatrix rows={setup.decomposition} primaryDirection={setup.primaryDirection} />
        <WindowTimeline window={setup.window} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ClusterStrengthCard window={setup.window} />
        <WarningsCard warnings={setup.warnings} />
        <SetupSummary setup={setup} />
      </div>
    </LayerSection>
  );
}
