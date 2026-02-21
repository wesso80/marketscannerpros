import GECommandStrip from '@/src/features/goldenEgg/components/GECommandStrip';
import GEHeaderBar from '@/src/features/goldenEgg/components/GEHeaderBar';
import GEDecisionStrip from '@/src/features/goldenEgg/components/layer1/GEDecisionStrip';
import GEPlanGrid from '@/src/features/goldenEgg/components/layer2/GEPlanGrid';
import GEExecutionCard from '@/src/features/goldenEgg/components/layer2/GEExecutionCard';
import GESetupCard from '@/src/features/goldenEgg/components/layer2/GESetupCard';
import GEEvidenceStack from '@/src/features/goldenEgg/components/layer3/GEEvidenceStack';
import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';
import GESectionHeader from '@/src/features/goldenEgg/components/shared/GESectionHeader';
import { getGoldenEggMockPayload } from '@/src/features/goldenEgg/adapters';
import { isNoTrade } from '@/src/features/goldenEgg/selectors';

export default function GoldenEggPage() {
  const payload = getGoldenEggMockPayload();
  const noTrade = isNoTrade(payload);

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-slate-100">
      <GEHeaderBar />
      {/* DEMO DATA BANNER — all data on this page is illustrative only */}
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-2">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg">⚠️</span>
            <span className="text-sm font-bold uppercase tracking-wider text-amber-300">Demo / Illustrative Data Only</span>
            <span className="text-lg">⚠️</span>
          </div>
          <p className="mt-1 text-xs text-amber-200/70">
            This page displays sample data to demonstrate the Golden Egg decision framework. 
            All prices, levels, and signals shown are static examples — not live market data. 
            Do not use this information for trading decisions.
          </p>
        </div>
      </div>
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24">
        <GECommandStrip meta={payload.meta} layer1={payload.layer1} />

        <section id="layer-1" className="mt-4">
          <GEDecisionStrip layer1={payload.layer1} meta={payload.meta} />
        </section>

        <section id="layer-2" className="mt-4">
          {noTrade ? (
            <GECard title="Plan" variant="warning">
              <GESectionHeader title="Waiting For" />
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {payload.layer1.flipConditions.map((condition) => (
                  <li key={condition.id} className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    {condition.text}
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <GEEmptyState
                  title="Do not execute"
                  body="Permission is NO_TRADE. Set alerts on flip conditions and wait for structure confirmation."
                />
              </div>
            </GECard>
          ) : (
            <GEPlanGrid>
              <GESetupCard setup={payload.layer2.setup} />
              <GEExecutionCard execution={payload.layer2.execution} permission={payload.layer1.permission} />
            </GEPlanGrid>
          )}
        </section>

        <section id="layer-3" className="mt-4">
          <GEEvidenceStack layer3={payload.layer3} />
        </section>
      </main>
    </div>
  );
}
