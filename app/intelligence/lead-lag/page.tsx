import IntelligenceUnderConstruction from '@/components/intelligence/IntelligenceUnderConstruction';

export const dynamic = 'force-static';

export default function LeadLagPage() {
  return (
    <IntelligenceUnderConstruction
      moduleName="Cross-Asset Lead/Lag"
      summary="Predictive cross-asset lead/lag map with true-lead / synchronous-confirmation split, over the NQ target."
      detail="Native engine ported and validated for formula parity. Live NQ target data and full 5-minute provider parity are being finalised."
    />
  );
}
