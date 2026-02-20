import LayerSection from '@/components/msp/layout/LayerSection';
import QuadGrid from '@/components/msp/layout/QuadGrid';
import StrategyBuilderCard from '@/components/msp/options/blocks/StrategyBuilderCard';
import RiskGeometryCard from '@/components/msp/options/blocks/RiskGeometryCard';
import LiquidityFillCard from '@/components/msp/options/blocks/LiquidityFillCard';
import TimeWindowCard from '@/components/msp/options/blocks/TimeWindowCard';

type ExecutionLayerProps = { payload: any };

export default function ExecutionLayer({ payload }: ExecutionLayerProps) {
  const score = payload?.scores?.execution ?? 64;

  return (
    <LayerSection tone="execution" title="Execution" subtitle="Can we deploy efficiently?" score={score}>
      <QuadGrid>
        <div className="col-span-12 lg:col-span-6"><StrategyBuilderCard payload={payload} /></div>
        <div className="col-span-12 lg:col-span-6"><RiskGeometryCard payload={payload} /></div>
        <div className="col-span-12 lg:col-span-6"><LiquidityFillCard payload={payload} /></div>
        <div className="col-span-12 lg:col-span-6"><TimeWindowCard payload={payload} /></div>
      </QuadGrid>
    </LayerSection>
  );
}
