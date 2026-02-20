import ExecutionPlanCard from '@/components/options/layer2/ExecutionPlanCard';
import SetupCard from '@/components/options/layer2/SetupCard';
import { ExecutionPlanModel, PermissionState, SetupModel } from '@/types/optionsScanner';

type Layer2ExecutionPlanProps = {
  setup: SetupModel;
  plan: ExecutionPlanModel;
  permission: PermissionState;
  viewMode: 'normal' | 'compact';
  onCopyPlan: () => void;
  onSendToJournal: () => void;
};

export default function Layer2ExecutionPlan(props: Layer2ExecutionPlanProps) {
  return (
    <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] lg:gap-6">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Confluence Engine</div>
              <div className="text-xs text-slate-400">Signal alignment → trade quality</div>
            </div>
          </div>
          <SetupCard setup={props.setup} compact={props.viewMode === 'compact'} />
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Execution</div>
              <div className="text-xs text-slate-400">Only what you need to place a trade</div>
            </div>
          </div>
          <ExecutionPlanCard
            plan={props.plan}
            permission={props.permission}
            compact={props.viewMode === 'compact'}
            onCopyPlan={props.onCopyPlan}
            onSendToJournal={props.onSendToJournal}
          />
        </div>
      </div>
    </section>
  );
}
