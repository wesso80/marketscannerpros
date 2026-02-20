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
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SetupCard setup={props.setup} compact={props.viewMode === 'compact'} />
      <ExecutionPlanCard
        plan={props.plan}
        permission={props.permission}
        compact={props.viewMode === 'compact'}
        onCopyPlan={props.onCopyPlan}
        onSendToJournal={props.onSendToJournal}
      />
    </section>
  );
}
