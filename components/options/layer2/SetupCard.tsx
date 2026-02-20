import { SetupModel } from '@/types/optionsScanner';

type SetupCardProps = {
  setup: SetupModel;
  compact?: boolean;
};

export default function SetupCard({ setup, compact = false }: SetupCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
      <div className="text-sm font-semibold text-slate-100">Setup</div>
      <div className={`mt-3 grid grid-cols-1 gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Type: {setup.setupType}</div>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">TF Align: {setup.timeframeAlignment}</div>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Vol: {setup.volRegime}</div>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Options: {setup.optionsRegime}</div>
      </div>
      <div className="mt-3 text-sm text-slate-300">Do not trade if: {setup.invalidation}</div>
    </div>
  );
}
