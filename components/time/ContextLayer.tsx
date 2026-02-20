import LayerSection from '@/components/time/LayerSection';
import { MetricCard, MiniScore } from '@/components/time/atoms';
import { pct } from '@/components/time/scoring';
import { TimeConfluenceV2Output, TimeContextInputs } from '@/components/time/types';

export default function ContextLayer({ context, out }: { context: TimeContextInputs; out: TimeConfluenceV2Output }) {
  return (
    <LayerSection title="Layer 1 — Context (Environment)" tone="context" right={<MiniScore label="Context" value={out.contextScore} />}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Macro Bias" value={context.macroBias} />
        <MetricCard label="HTF Bias" value={context.htfBias} />
        <MetricCard label="Regime" value={context.regime} />
        <MetricCard label="Vol State" value={context.volState} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Trend Strength" value={`${pct(context.trendStrength)}%`} />
        <MetricCard label="Data Provider" value={context.dataIntegrity.provider} />
        <MetricCard label="Freshness (sec)" value={`${context.dataIntegrity.freshnessSec}`} />
        <MetricCard label="Coverage" value={`${pct(context.dataIntegrity.coveragePct)}%`} />
      </div>

      {!!context.extremeConditions.length && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div className="font-semibold">Extreme Conditions</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {context.extremeConditions.map((flag) => (
              <span key={flag} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs ring-1 ring-rose-500/25">
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}
    </LayerSection>
  );
}
