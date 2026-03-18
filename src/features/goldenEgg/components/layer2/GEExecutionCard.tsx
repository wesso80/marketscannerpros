import GERiskSizerInline from '@/src/features/goldenEgg/components/layer2/GERiskSizerInline';
import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';
import GEKeyValueRow from '@/src/features/goldenEgg/components/shared/GEKeyValueRow';
import GELevelTable from '@/src/features/goldenEgg/components/shared/GELevelTable';
import GESectionHeader from '@/src/features/goldenEgg/components/shared/GESectionHeader';
import GETriggerList from '@/src/features/goldenEgg/components/shared/GETriggerList';
import { GoldenEggPayload, Permission } from '@/src/features/goldenEgg/types';

type GEExecutionCardProps = {
  execution: GoldenEggPayload['layer2']['execution'];
  permission: Permission;
};

export default function GEExecutionCard({ execution, permission }: GEExecutionCardProps) {
  return (
    <div className="lg:col-span-6">
      <GECard title="Structure Map">
        {permission === 'NO_TRADE' ? (
          <GEEmptyState title="Conditions not aligned" body="Set alerts on flip conditions and monitor for changes." />
        ) : (
          <div className="space-y-3">
            <GETriggerList title="Reference Trigger" items={[execution.entryTrigger]} />
            <GEKeyValueRow
              label="Reference Level"
              value={execution.entry.type === 'market' ? 'Market' : `${execution.entry.type.toUpperCase()} ${execution.entry.price?.toFixed(2) || ''}`}
            />
            <GEKeyValueRow label="Risk Level" value={`${(execution.stop.price ?? 0).toFixed(2)} · ${execution.stop.logic}`} />
            <div>
              <GESectionHeader title="Key Levels" />
              <div className="mt-2">
                <GELevelTable rows={execution.targets.map((target, index) => ({ label: `T${index + 1}`, price: target.price, note: target.note, rMultiple: target.rMultiple }))} />
              </div>
            </div>
            <GERiskSizerInline rr={execution.rr} sizingHint={execution.sizingHint} />
          </div>
        )}
      </GECard>
    </div>
  );
}
