import GECollapsible from '@/src/features/goldenEgg/components/shared/GECollapsible';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';

export default function GEEvidenceNews() {
  return (
    <GECollapsible
      header={
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-100">News / Event Risk</span>
          <div className="text-xs text-slate-400">Optional module</div>
        </div>
      }
    >
      <GEEmptyState title="No material event loaded" body="Wire this module to your event calendar source when ready." />
    </GECollapsible>
  );
}
