import { ReviewModuleModel } from '@/types/journal';

function percent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function rValue(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

function sampleBadgeClass(status: string): string {
  if (status === 'minimum_met') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'developing') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
}

function sampleLabel(status: string): string {
  if (status === 'minimum_met') return 'Minimum sample met';
  if (status === 'developing') return 'Developing sample';
  return 'Thin sample';
}

export default function ReviewModule({ data }: { data: ReviewModuleModel }) {
  const playbooks = data.playbookExpectancy || [];

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Review Queue</div>
        {data.queue.length === 0 ? (
          <div className="text-sm text-slate-400">No trades requiring review (|R| &ge; 3).</div>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
            {data.queue.map((item) => <li key={item.tradeId}>{item.summary}</li>)}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-white/5 bg-slate-950/35 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Playbook Expectancy</div>
            <div className="text-xs text-slate-400">Historical R expectancy with 95% confidence intervals and minimum-sample badges.</div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">Min 30 closed R trades</span>
        </div>

        {playbooks.length === 0 ? (
          <div className="text-sm text-slate-400">Close and R-label trades to build playbook expectancy.</div>
        ) : (
          <div className="space-y-2">
            {playbooks.map((item) => (
              <div key={item.playbook} className="rounded-lg border border-white/5 bg-slate-900/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{item.playbook}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.warning}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${sampleBadgeClass(item.sampleStatus)}`}>
                    {sampleLabel(item.sampleStatus)} - {item.sampleSize}/{item.minSampleSize}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-300 md:grid-cols-3">
                  <div className="rounded-md bg-slate-950/50 p-2">
                    <div className="text-slate-500">Expectancy</div>
                    <div className="font-semibold text-slate-100">{rValue(item.expectancyR)}</div>
                    <div className="text-slate-500">95% CI {rValue(item.expectancyCiLow)} to {rValue(item.expectancyCiHigh)}</div>
                  </div>
                  <div className="rounded-md bg-slate-950/50 p-2">
                    <div className="text-slate-500">Win Rate</div>
                    <div className="font-semibold text-slate-100">{percent(item.winRate)}</div>
                    <div className="text-slate-500">95% CI {percent(item.winRateCiLow)} to {percent(item.winRateCiHigh)}</div>
                  </div>
                  <div className="rounded-md bg-slate-950/50 p-2">
                    <div className="text-slate-500">Total R</div>
                    <div className="font-semibold text-slate-100">{rValue(item.totalR)}</div>
                    <div className="text-slate-500">Historical journal records only</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
