import LayerSection from '@/components/msp/layout/LayerSection';
import QuadGrid from '@/components/msp/layout/QuadGrid';
import StructureAlignmentCard from '@/components/msp/options/blocks/StructureAlignmentCard';
import ExpectedMoveCard from '@/components/msp/options/blocks/ExpectedMoveCard';
import StrikeMatrixTable from '@/components/msp/options/blocks/StrikeMatrixTable';
import ConfluenceRadarCard from '@/components/msp/options/blocks/ConfluenceRadarCard';

type SetupLayerProps = { payload: any };

export default function SetupLayer({ payload }: SetupLayerProps) {
  const score = payload?.scores?.setup ?? 81;

  return (
    <LayerSection tone="setup" title="Setup" subtitle="Is there asymmetric edge?" score={score}>
      <QuadGrid>
        <div className="col-span-12 lg:col-span-6"><StructureAlignmentCard payload={payload} /></div>
        <div className="col-span-12 lg:col-span-6"><ExpectedMoveCard payload={payload} /></div>
        <div className="col-span-12 lg:col-span-6"><StrikeMatrixTable payload={payload} /></div>
        <div className="col-span-12 lg:col-span-6"><ConfluenceRadarCard payload={payload} /></div>
      </QuadGrid>
    </LayerSection>
  );
}
