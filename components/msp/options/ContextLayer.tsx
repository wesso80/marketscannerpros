import Card from '@/components/msp/core/Card';
import LayerSection from '@/components/msp/layout/LayerSection';
import TwoColGrid from '@/components/msp/layout/TwoColGrid';
import MarketRegimeCard from '@/components/msp/options/blocks/MarketRegimeCard';
import VolRegimeCard from '@/components/msp/options/blocks/VolRegimeCard';
import LiquidityHealthCard from '@/components/msp/options/blocks/LiquidityHealthCard';
import MacroFlowCard from '@/components/msp/options/blocks/MacroFlowCard';

type ContextLayerProps = { payload: any };

export default function ContextLayer({ payload }: ContextLayerProps) {
  const score = payload?.scores?.context ?? 72;

  return (
    <LayerSection tone="context" title="Context" subtitle="Should we trade this symbol right now?" score={score}>
      <TwoColGrid
        left={
          <Card className="space-y-3">
            <MarketRegimeCard payload={payload} />
            <VolRegimeCard payload={payload} />
            <LiquidityHealthCard payload={payload} />
          </Card>
        }
        right={<MacroFlowCard payload={payload} />}
      />
    </LayerSection>
  );
}
