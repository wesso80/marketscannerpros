import DockAccordion from '@/components/journal/layer3/DockAccordion';
import DockHeader from '@/components/journal/layer3/DockHeader';
import { JournalDockKey, JournalDockModulesModel, JournalDockSummaryModel } from '@/types/journal';

type Layer3JournalIntelligenceDockProps = {
  summary?: JournalDockSummaryModel;
  modules?: JournalDockModulesModel;
  open: Record<JournalDockKey, boolean>;
  onToggle: (k: JournalDockKey) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export default function Layer3JournalIntelligenceDock({ summary, modules, open, onToggle, onExpandAll, onCollapseAll }: Layer3JournalIntelligenceDockProps) {
  if (!summary || !modules) return null;

  return (
    <section className="space-y-3">
      <DockHeader summary={summary} onExpandAll={onExpandAll} onCollapseAll={onCollapseAll} />
      <DockAccordion modules={modules} open={open} onToggle={onToggle} />
    </section>
  );
}
