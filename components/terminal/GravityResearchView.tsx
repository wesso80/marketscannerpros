'use client';

import type { TimeGravityMap, CoverageDiagnostics } from '@/lib/time/timeGravityMap';
import type { ForwardCloseCalendar } from '@/lib/confluence-learning-agent';
import { ResearchFold, ResearchMetric, researchNumber, researchPrice, researchTime, researchReason } from './researchPresentation';

export default function GravityResearchView({symbol,tgm,coverage,calendar,receivedAt,empty,localDemo,error,onRefresh,loading}: {symbol:string;tgm:TimeGravityMap;coverage:CoverageDiagnostics|null;calendar:ForwardCloseCalendar|null;receivedAt:Date;empty:boolean;localDemo:boolean;error:string|null;onRefresh:()=>void;loading:boolean}) {
  const labels = {ACTIVE:'Unreached midpoint levels remain',TARGET_HIT:'Observed midpoints have been reached',OVERSHOT:'Price has passed the midpoint levels',EXPANSION:'Momentum has reduced midpoint influence',RECOMPUTING:'Midpoint levels are being recalculated',NO_TARGET:'No active midpoint level'};
  const verdict = localDemo ? 'Demonstration data · no live observation' : error ? 'Refresh failed · previous observation retained' : empty ? `No midpoint evidence for ${symbol}` : labels[tgm.targetStatus] || 'Midpoint status not supplied';
  return <section data-gravity-view className="space-y-3 text-slate-200">
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4"><div className="flex flex-wrap justify-between gap-3"><p data-research-verdict className="text-lg font-semibold">{verdict}</p><button disabled={loading} type="button" onClick={onRefresh} className="rounded border border-slate-600 px-3 py-1.5 text-xs disabled:opacity-50">Refresh</button></div>
    {error && <p role="alert" className="mt-2 text-sm text-amber-300">{researchReason(error)}</p>}
    {!empty && !localDemo && <><p className="mt-2 text-xs text-slate-400">Historical candle midpoints describe reference levels; they do not predict price movement.</p><dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><ResearchMetric label="Spot" value={researchPrice(tgm.currentPrice)} /><ResearchMetric label="Reference midpoint" value={researchPrice(tgm.targetPrice)} /><ResearchMetric label="Alignment" value={`${researchNumber(tgm.confidence)}%`} /><ResearchMetric label="Measured points" value={researchNumber(tgm.allPoints.length)} /></dl></>}
    </div>
    {!empty && !localDemo && <>
      <div className="rounded-lg border border-slate-700 p-3"><h3 className="text-sm font-semibold">Ranked midpoint zones</h3><ul className="mt-2 space-y-2">{tgm.zones.slice(0,3).map((z,i)=><li key={i} className="flex flex-wrap justify-between gap-2 text-sm"><span>{researchPrice(z.minPrice)}–{researchPrice(z.maxPrice)}</span><span className="text-xs text-slate-400">{z.dominantTimeframes.slice(0,3).join(' · ')} · {researchNumber(z.confidence)}% alignment</span></li>)}</ul>{!tgm.zones.length && <p className="text-sm text-slate-400">No ranked zones measured.</p>}</div>
      <ResearchFold title="Midpoint evidence"><ul className="space-y-2">{tgm.allPoints.map((p,i)=><li key={i} className="flex flex-wrap justify-between gap-2"><span>{p.timeframe} · {researchPrice(p.midpoint)}</span><span>{researchNumber(p.distance,1)}% from spot</span></li>)}</ul></ResearchFold>
      <ResearchFold title="Timing and coverage"><p>{tgm.taggingStats.taggedThisCycle} midpoint levels reached in this cycle; {tgm.taggingStats.remainingUntagged} remain.</p>{coverage ? <p>{researchNumber(coverage.percent)}% timeframe coverage. Measured: {coverage.available.join(' · ') || 'none'}. Missing: {coverage.missing.join(' · ') || 'none'}.</p> : <p>Coverage diagnostics not supplied.</p>}{calendar ? <p>A close calendar is available in the Close Calendar tab.</p> : <p>Close calendar not supplied.</p>}{tgm.closeConfluence && <p>Closing timeframes: {tgm.closeConfluence.totalStackedTfs}; active windows: {tgm.closeConfluence.activeWindowCount}.</p>}</ResearchFold>
    </>}
    <p data-research-source className="break-words text-xs text-slate-500">Source: Time Gravity midpoint analysis · received {researchTime(receivedAt)}. Receipt time is not a market observation timestamp.</p>
  </section>;
}
