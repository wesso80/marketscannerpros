import GERiskSizerInline from '@/src/features/goldenEgg/components/layer2/GERiskSizerInline';
import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';
import GEKeyValueRow from '@/src/features/goldenEgg/components/shared/GEKeyValueRow';
import GELevelTable from '@/src/features/goldenEgg/components/shared/GELevelTable';
import GESectionHeader from '@/src/features/goldenEgg/components/shared/GESectionHeader';
import GETriggerList from '@/src/features/goldenEgg/components/shared/GETriggerList';
import { GoldenEggPayload, PublicAssessment } from '@/src/features/goldenEgg/types';

type GEExecutionCardProps = {
  scenario: GoldenEggPayload['layer2']['scenario'];
  assessment: PublicAssessment;
};

export default function GEExecutionCard({ scenario, assessment }: GEExecutionCardProps) {
  return (
    <div className="lg:col-span-6">
      <GECard title="Structure Map">
        {assessment === 'NOT_ALIGNED' ? (
          <GEEmptyState title="Conditions not aligned" body="Set alerts on flip conditions and monitor for changes." />
        ) : (
          <div className="space-y-3">
            <GETriggerList title="Reference Condition" items={[scenario.referenceTrigger]} />
            <GEKeyValueRow
              label="Reference Level"
              value={`${scenario.referenceLevel.type.toUpperCase()} ${scenario.referenceLevel.price?.toFixed(2) || ''}`}
            />
            <GEKeyValueRow label="Invalidation Level" value={`${(scenario.invalidationLevel.price ?? 0).toFixed(2)} · ${scenario.invalidationLevel.logic}`} />
            <div>
              <GESectionHeader title="Key Levels" />
              <div className="mt-2">
                <GELevelTable rows={scenario.reactionZones.map((target, index) => ({ label: `RZ${index + 1}`, price: target.price, note: target.note, rMultiple: target.rMultiple }))} />
              </div>
            </div>
            <GERiskSizerInline rr={scenario.hypotheticalRr} hypotheticalRisk={scenario.hypotheticalRisk} />
          </div>
        )}
      </GECard>
    </div>
  );
}
