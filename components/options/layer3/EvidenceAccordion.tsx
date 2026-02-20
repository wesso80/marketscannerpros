import AINarrativeEvidence from '@/components/options/evidence/AINarrativeEvidence';
import FlowEvidence from '@/components/options/evidence/FlowEvidence';
import GreeksIVEvidence from '@/components/options/evidence/GreeksIVEvidence';
import LiquidityEvidence from '@/components/options/evidence/LiquidityEvidence';
import RiskComplianceEvidence from '@/components/options/evidence/RiskComplianceEvidence';
import StructureEvidence from '@/components/options/evidence/StructureEvidence';
import EvidenceModuleCard from '@/components/options/layer3/EvidenceModuleCard';
import { EvidenceModuleKey, EvidenceModulesModel } from '@/types/optionsScanner';

type EvidenceAccordionProps = {
  modules: EvidenceModulesModel;
  open: Record<EvidenceModuleKey, boolean>;
  onToggle: (key: EvidenceModuleKey) => void;
};

export default function EvidenceAccordion({ modules, open, onToggle }: EvidenceAccordionProps) {
  return (
    <div className="space-y-3">
      <EvidenceModuleCard k="structure" title="Market Structure" open={open.structure} onToggle={() => onToggle('structure')}>
        <StructureEvidence data={modules.structure} />
      </EvidenceModuleCard>
      <EvidenceModuleCard k="optionsFlow" title="Options Flow" open={open.optionsFlow} onToggle={() => onToggle('optionsFlow')}>
        <FlowEvidence data={modules.optionsFlow} />
      </EvidenceModuleCard>
      <EvidenceModuleCard k="greeksIv" title="Greeks + IV" open={open.greeksIv} onToggle={() => onToggle('greeksIv')}>
        <GreeksIVEvidence data={modules.greeksIv} />
      </EvidenceModuleCard>
      <EvidenceModuleCard k="liquidityTape" title="Liquidity + Tape" open={open.liquidityTape} onToggle={() => onToggle('liquidityTape')}>
        <LiquidityEvidence data={modules.liquidityTape} />
      </EvidenceModuleCard>
      <EvidenceModuleCard k="aiNarrative" title="AI Narrative + Signals" open={open.aiNarrative} onToggle={() => onToggle('aiNarrative')}>
        <AINarrativeEvidence data={modules.aiNarrative} />
      </EvidenceModuleCard>
      <EvidenceModuleCard k="riskCompliance" title="Risk & Compliance" open={open.riskCompliance} onToggle={() => onToggle('riskCompliance')}>
        <RiskComplianceEvidence data={modules.riskCompliance} />
      </EvidenceModuleCard>
    </div>
  );
}
