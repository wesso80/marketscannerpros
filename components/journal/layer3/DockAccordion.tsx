import DockModuleCard from '@/components/journal/layer3/DockModuleCard';
import EvidenceModule from '@/components/journal/layer3/modules/EvidenceModule';
import LabelingModule from '@/components/journal/layer3/modules/LabelingModule';
import ReviewModule from '@/components/journal/layer3/modules/ReviewModule';
import RiskModule from '@/components/journal/layer3/modules/RiskModule';
import { JournalDockKey, JournalDockModulesModel } from '@/types/journal';

type DockAccordionProps = {
  modules: JournalDockModulesModel;
  open: Record<JournalDockKey, boolean>;
  onToggle: (k: JournalDockKey) => void;
};

export default function DockAccordion({ modules, open, onToggle }: DockAccordionProps) {
  return (
    <div className="space-y-3">
      <DockModuleCard title="Risk" open={open.risk} onToggle={() => onToggle('risk')}>
        <RiskModule data={modules.risk} />
      </DockModuleCard>
      <DockModuleCard title="Review" open={open.review} onToggle={() => onToggle('review')}>
        <ReviewModule data={modules.review} />
      </DockModuleCard>
      <DockModuleCard title="Labeling" open={open.labeling} onToggle={() => onToggle('labeling')}>
        <LabelingModule data={modules.labeling} />
      </DockModuleCard>
      <DockModuleCard title="Evidence" open={open.evidence} onToggle={() => onToggle('evidence')}>
        <EvidenceModule data={modules.evidence} />
      </DockModuleCard>
    </div>
  );
}
