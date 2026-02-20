import DecisionCommandBar from '@/components/options/layer1/DecisionCommandBar';
import { DecisionActions, DecisionModel, DeskHeaderModel } from '@/types/optionsScanner';

type Layer1DeskContextProps = {
  header: DeskHeaderModel;
  decision: DecisionModel;
  actions: DecisionActions;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
};

export default function Layer1DeskContext({ decision, actions, viewMode, onToggleViewMode }: Layer1DeskContextProps) {
  return (
    <section>
      <DecisionCommandBar
        decision={decision}
        actions={actions}
        viewMode={viewMode}
        onToggleViewMode={onToggleViewMode}
      />
    </section>
  );
}
