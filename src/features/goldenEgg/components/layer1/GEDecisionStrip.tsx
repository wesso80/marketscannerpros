import GEFlipConditions from '@/src/features/goldenEgg/components/layer1/GEFlipConditions';
import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GETag from '@/src/features/goldenEgg/components/shared/GETag';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEDecisionStripProps = {
  layer1: GoldenEggPayload['layer1'];
};

function summaryLabel(key: string, value: number): string {
  if (key === 'Structure') return value >= 65 ? 'Bullish Bias' : value >= 45 ? 'Mid Range' : 'Bearish Bias';
  if (key === 'Flow') return value >= 65 ? 'Bullish Flow' : value >= 45 ? 'Neutral' : 'Bearish Flow';
  if (key === 'Momentum') return value >= 65 ? 'Strong' : value >= 45 ? 'Moderate' : 'Weak/Ranging';
  if (key === 'Risk') return value >= 65 ? 'Low Risk' : value >= 45 ? 'Moderate' : 'Elevated';
  return `${value}/100`;
}

function scoreTone(value: number): string {
  if (value >= 65) return 'border-emerald-500/20 bg-emerald-500/5';
  if (value >= 45) return 'border-amber-500/20 bg-amber-500/5';
  return 'border-rose-500/20 bg-rose-500/5';
}

function scoreTextTone(value: number): string {
  if (value >= 65) return 'text-emerald-400';
  if (value >= 45) return 'text-amber-400';
  return 'text-rose-400';
}

function barColor(value: number): string {
  if (value >= 65) return 'bg-emerald-500';
  if (value >= 45) return 'bg-amber-500';
  return 'bg-rose-500';
}

export default function GEDecisionStrip({ layer1 }: GEDecisionStripProps) {
  const verdictLabel = layer1.permission === 'TRADE'
    ? `${layer1.direction === 'LONG' ? 'LONG' : layer1.direction === 'SHORT' ? 'SHORT' : 'HOLD'} (${layer1.confidence}% confluence)`
    : layer1.permission === 'NO_TRADE'
    ? `NOT ALIGNED (${layer1.confidence}% confluence)`
    : `HOLD (${layer1.confidence}% confluence)`;

  const verdictBg = layer1.permission === 'TRADE'
    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
    : layer1.permission === 'NO_TRADE'
    ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
    : 'bg-amber-500/15 border-amber-500/30 text-amber-200';

  const verdictIcon = layer1.permission === 'TRADE' ? '✅' : layer1.permission === 'NO_TRADE' ? '🚫' : '👀';

  return (
    <div className="space-y-5">
      {/* Quick Summary Strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {layer1.scoreBreakdown.map((row) => (
          <div key={row.key} className={`rounded-xl border p-4 ${scoreTone(row.value)}`}>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{row.key}</div>
            <div className={`mt-1 text-lg font-bold ${scoreTextTone(row.value)}`}>{summaryLabel(row.key, row.value)}</div>
          </div>
        ))}
      </div>

      {/* Signal Breakdown */}
      <GECard title="Signal Breakdown">
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Trade Confidence</span>
            <span className="text-sm font-bold text-white">{layer1.confidence}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-700/50">
            <div
              className={`h-full rounded-full ${barColor(layer1.confidence)}`}
              style={{ width: `${layer1.confidence}%` }}
            />
          </div>
        </div>
        <div className="space-y-3">
          {layer1.scoreBreakdown.map((row) => (
            <div key={row.key} className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-sm text-slate-300">{row.key}</div>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-slate-700/50">
                  <div className={`h-full rounded-full ${barColor(row.value)}`} style={{ width: `${row.value}%` }} />
                </div>
              </div>
              <div className="w-10 shrink-0 text-right text-sm font-semibold text-slate-100">{row.value}%</div>
              <div className="w-16 shrink-0">
                <GETag tone={row.value >= 65 ? 'green' : row.value >= 45 ? 'amber' : 'red'} text={row.value >= 65 ? 'Bullish' : row.value >= 45 ? 'Neutral' : 'Bearish'} />
              </div>
            </div>
          ))}
        </div>
      </GECard>

      {/* Verdict Banner */}
      <div className={`rounded-xl border p-4 text-center ${verdictBg}`}>
        <span className="text-lg">{verdictIcon}</span>
        <span className="ml-2 text-lg font-bold">{verdictLabel}</span>
      </div>

      {/* Additional Signals */}
      <div className="space-y-2 rounded-xl border border-white/5 bg-slate-900/40 p-4 text-sm">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-emerald-400">●</span>
          <span className="text-slate-200">{layer1.primaryDriver}</span>
        </div>
        {layer1.primaryBlocker && (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-400">●</span>
            <span className="text-slate-200">{layer1.primaryBlocker}</span>
          </div>
        )}
      </div>

      {/* Flip Conditions */}
      {layer1.flipConditions.length > 0 && layer1.permission !== 'TRADE' && (
        <GECard title="What Needs to Flip">
          <GEFlipConditions items={layer1.flipConditions} />
        </GECard>
      )}
    </div>
  );
}
