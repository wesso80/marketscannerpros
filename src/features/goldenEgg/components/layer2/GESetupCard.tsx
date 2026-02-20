import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GEKeyValueRow from '@/src/features/goldenEgg/components/shared/GEKeyValueRow';
import GELevelTable from '@/src/features/goldenEgg/components/shared/GELevelTable';
import GESectionHeader from '@/src/features/goldenEgg/components/shared/GESectionHeader';
import GETag from '@/src/features/goldenEgg/components/shared/GETag';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GESetupCardProps = {
  setup: GoldenEggPayload['layer2']['setup'];
};

export default function GESetupCard({ setup }: GESetupCardProps) {
  return (
    <div className="lg:col-span-6">
      <GECard title="Setup">
        <GETag tone="slate" text={`Setup: ${setup.setupType}`} />
        <p className="mt-2 text-sm text-slate-200">{setup.thesis}</p>

        <div className="mt-3">
          <GEKeyValueRow label="TF Alignment" value={`${setup.timeframeAlignment.score}/${setup.timeframeAlignment.max}`} />
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {setup.timeframeAlignment.details.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div className="mt-3 space-y-2">
          <GESectionHeader title="Key Levels" />
          <GELevelTable rows={setup.keyLevels.map((level) => ({ label: level.label, price: level.price, kind: level.kind }))} />
        </div>

        <div className="mt-3 space-y-2">
          <GESectionHeader title="Invalidation" />
          <p className="text-sm text-slate-200">{setup.invalidation}</p>
        </div>
      </GECard>
    </div>
  );
}
