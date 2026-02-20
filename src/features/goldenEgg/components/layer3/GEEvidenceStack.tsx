import GEEvidenceFlowOptions from '@/src/features/goldenEgg/components/layer3/evidence/GEEvidenceFlowOptions';
import GEEvidenceInternals from '@/src/features/goldenEgg/components/layer3/evidence/GEEvidenceInternals';
import GEEvidenceMomentum from '@/src/features/goldenEgg/components/layer3/evidence/GEEvidenceMomentum';
import GEEvidenceNarrative from '@/src/features/goldenEgg/components/layer3/evidence/GEEvidenceNarrative';
import GEEvidenceNews from '@/src/features/goldenEgg/components/layer3/evidence/GEEvidenceNews';
import GEEvidenceStructure from '@/src/features/goldenEgg/components/layer3/evidence/GEEvidenceStructure';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEEvidenceStackProps = {
  layer3: GoldenEggPayload['layer3'];
};

export default function GEEvidenceStack({ layer3 }: GEEvidenceStackProps) {
  return (
    <div className="space-y-3">
      <GEEvidenceStructure structure={layer3.structure} />
      <GEEvidenceFlowOptions options={layer3.options} />
      <GEEvidenceMomentum momentum={layer3.momentum} />
      <GEEvidenceInternals internals={layer3.internals} />
      <GEEvidenceNews />
      <GEEvidenceNarrative narrative={layer3.narrative} />
    </div>
  );
}
