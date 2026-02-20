import JournalCommandBar from '@/components/journal/layer1/JournalCommandBar';
import JournalKpiRow from '@/components/journal/layer1/JournalKpiRow';
import { JournalHeaderActions, JournalHeaderModel, JournalKpisModel } from '@/types/journal';

type Layer1JournalCommandProps = {
  header?: JournalHeaderModel;
  kpis?: JournalKpisModel;
  actions: JournalHeaderActions;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
};

export default function Layer1JournalCommand({ header, kpis, actions, viewMode, onToggleViewMode }: Layer1JournalCommandProps) {
  return (
    <section className="space-y-3">
      <JournalCommandBar header={header} actions={actions} viewMode={viewMode} onToggleViewMode={onToggleViewMode} />
      <JournalKpiRow kpis={kpis} />
    </section>
  );
}
