import { redirect } from 'next/navigation';
import IntelligenceUnderConstruction from '@/components/intelligence/IntelligenceUnderConstruction';

export const dynamic = 'force-static';

export default function MasterCommandCentre() {
  redirect('/intelligence');
  return (
    <IntelligenceUnderConstruction
      moduleName="Intelligence Overview"
      summary="Cross-engine fusion of the five Intelligence pillars into one composite view."
      detail="Native fusion engine + native Fragility + native Liquidity are wired internally. Public composite is paused while Lead/Lag, Pressure and Auction remain non-native — the mixed native/mock aggregate is not shown to avoid presenting incomplete data as live."
    />
  );
}
