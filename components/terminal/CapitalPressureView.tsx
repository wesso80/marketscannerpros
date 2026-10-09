'use client';

import { describeGammaInput } from '@/lib/options/dealerGammaInput';
import { capitalLevelLabel } from '@/lib/presentation/capitalLevelLabel';
import { ResearchFold, ResearchMetric, researchLabel, researchNumber, researchPrice, researchTime, researchReason } from './researchPresentation';

export default function CapitalPressureView({ symbol, data, loading, error, onRefresh }: {symbol:string; data:any; loading:boolean; error:string|null; onRefresh:()=>void}) {
  const fd = data?.data;
  const perm = fd?.flow_trade_permission;
  const pm = fd?.probability_matrix;
  const rg = fd?.institutional_risk_governor;
  const verdict = loading ? `Loading pressure evidence for ${symbol}` : error ? 'Capital pressure feed failed' : !fd ? `No pressure observation for ${symbol}` : rg?.hardBlocked ? 'A risk limit blocks this observation' : !perm ? 'Alignment evidence is incomplete' : perm.blocked ? 'Pressure conditions are not aligned' : 'Pressure conditions are aligned';
  return <section data-capital-view className="space-y-3 text-slate-200">
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><p data-research-verdict className="text-lg font-semibold">{verdict}</p><button type="button" disabled={loading} onClick={onRefresh} className="rounded border border-slate-600 px-3 py-1.5 text-xs disabled:opacity-50">Refresh</button></div>
      {error && <p role="alert" className="mt-2 break-words text-sm text-amber-300">{researchReason(error)}</p>}
      {fd && !loading && !error && <><p className="mt-2 text-xs text-slate-400">What to check: price direction, gamma, risk mode, and session phase. Scenario weights are heuristic mixes, not outcome probabilities.</p><dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ResearchMetric label="Market mode" value={researchLabel(fd.market_mode)} /><ResearchMetric label="Spot" value={researchPrice(fd.spot)} />
      </dl></>}
    </div>
    {fd && !loading && !error && <>
      {pm && <div className="rounded-lg border border-slate-700 p-3"><h3 className="text-sm font-semibold">Scenario weights · heuristic</h3><div data-capital-chart className="mt-2 space-y-2" aria-label="Scenario weight chart">{[['Continuation',pm.continuation],['Pin / reversion',pm.pinReversion],['Expansion',pm.expansion]].map(([label,value]) => <div key={label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-xs"><span>{label}</span><span className="h-2 rounded bg-slate-800" aria-hidden="true"><span className="block h-2 rounded bg-slate-400" style={{width:`${typeof value === 'number' ? Math.max(0,Math.min(100,value)) : 0}%`}} /></span><span className="text-right">{researchNumber(value)}</span></div>)}</div><p className="mt-2 text-xs text-slate-400">Each weight is out of 100. {researchLabel(pm.regime)}.</p></div>}
      <ResearchFold title="Pressure and risk evidence"><dl className="grid grid-cols-2 gap-2">
        <ResearchMetric label="Price direction" value={fd.bias === 'bullish' ? 'Upward' : fd.bias === 'bearish' ? 'Downward' : researchLabel(fd.bias)} /><ResearchMetric label="Gamma" value={researchLabel(fd.gamma_state)} /><ResearchMetric label="Risk mode" value={researchLabel(rg?.riskMode)} /><ResearchMetric label="Session phase" value={researchLabel(fd.session_overlay?.phase)} />
      </dl>{fd.gamma_input && <p className="text-xs">{describeGammaInput(fd.gamma_input)}</p>}
      {perm?.blocked && <p className="text-amber-300">{researchReason(perm.noTradeMode?.reason)}</p>}
      {rg?.hardBlocked && <div className="text-amber-300"><p>A risk limit blocks this observation.</p>{rg.hardBlockReasons?.length > 0 && <ul className="mt-1 space-y-1">{rg.hardBlockReasons.map((reason:string,i:number)=><li key={i}>{researchReason(reason)}</li>)}</ul>}</div>}
      </ResearchFold>
      <ResearchFold title="Reference levels"><ul className="space-y-2">{fd.liquidity_levels?.map((lv:any,i:number)=><li key={i} className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words">{capitalLevelLabel(lv.label)}</span><span>{researchPrice(lv.level)} · {typeof lv.prob === 'number' ? researchNumber(lv.prob * 100) : 'Not measured'}/100 weight</span></li>)}</ul>{!fd.liquidity_levels?.length && <p>No measured liquidity levels.</p>}<div className="flex flex-wrap gap-2">{fd.key_strikes?.map((s:any,i:number)=><span key={i}>Strike {researchPrice(s.strike)}</span>)}</div><div className="flex flex-wrap gap-2">{fd.flip_zones?.map((s:any,i:number)=><span key={i}>Gamma flip {researchPrice(s.level)}</span>)}</div></ResearchFold>
      <p data-research-source className="break-words text-xs text-slate-500">Source: Capital flow analysis · {researchTime(fd.asof)}</p>
    </>}
  </section>;
}
