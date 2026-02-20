import EvidenceAccordion from '@/components/options/layer3/EvidenceAccordion';
import EvidenceDockHeader from '@/components/options/layer3/EvidenceDockHeader';
import { EvidenceModuleKey, EvidenceModulesModel, EvidenceSummaryModel } from '@/types/optionsScanner';

type Layer3EvidenceDockProps = {
  summary: EvidenceSummaryModel;
  modules: EvidenceModulesModel;
  open: Record<EvidenceModuleKey, boolean>;
  onToggle: (key: EvidenceModuleKey) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export default function Layer3EvidenceDock({ summary, modules, open, onToggle, onExpandAll, onCollapseAll }: Layer3EvidenceDockProps) {
  return (
    <section className="space-y-3">
      <EvidenceDockHeader
        confirmations={summary.confirmations}
        conflicts={summary.conflicts}
        signals={summary.signals}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
      />
      <EvidenceAccordion modules={modules} open={open} onToggle={onToggle} />
    </section>
  );
}
