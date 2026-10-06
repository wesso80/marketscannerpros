'use client';

import type { ReactNode } from 'react';
import type { OptionsSetup } from '@/components/options-terminal/OptionsConfluenceScanner';
import { ResearchFold, ResearchMetric, researchLabel, researchNumber, researchPrice, researchTime, researchReason, researchDate, selectedExpirySummary } from './researchPresentation';

export default function OptionsResearchView({symbol,result,blocked,loading,error,onScan,controls,alignment,selectedExpiry}: {symbol:string;result:OptionsSetup|null;blocked:boolean;loading:boolean;error:string|null;onScan:()=>void;controls:ReactNode;alignment?:string;selectedExpiry?:string|null}) {
  const verdict = loading ? `Loading options evidence for ${symbol}` : error ? 'Options analysis failed' : !result ? `Options analysis has not run for ${symbol}` : blocked ? 'Options analysis is on hold' : result.directionStatus === 'unknown' ? 'Directional evidence is incomplete' : alignment === 'BLOCK' ? 'Options conditions are not aligned' : alignment === 'ALLOW' ? 'Options conditions are aligned' : 'Options evidence needs confirmation';
  return <section data-options-research className="space-y-3 text-slate-200">
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4"><p data-research-verdict className="text-lg font-semibold">{verdict}</p>
      <p className="mt-2 text-xs text-slate-400">Options estimates can fail during news, liquidity gaps or stale observations. Educational scenario context only.</p>
      {error && <p role="alert" className="mt-2 break-words text-sm text-amber-300">{researchReason(error)}</p>}
      {result && <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><ResearchMetric label="Underlying reference" value={researchPrice(result.currentPrice)} /><ResearchMetric label="Chain status" value={researchLabel(result.dataQuality?.freshness)} /><ResearchMetric label="Selected expiry" value={selectedExpirySummary({ selectedExpiry, analyzedExpiry: result.openInterestAnalysis?.expirationDate || result.dataQuality?.chainExpiryUsed || result.primaryExpiration?.expirationDate })} /><ResearchMetric label="Confluence timeframes" value={researchNumber(result.confluenceStack)} /></dl>}
    </div>
    <div className="flex flex-wrap items-end gap-3">{controls}<button type="button" disabled={loading || !symbol.trim()} onClick={onScan} className="rounded border border-slate-600 px-3 py-2 text-sm disabled:opacity-50">{loading ? 'Running…' : result ? 'Run again' : 'Run analysis'}</button></div>
    {result && <>
      {blocked && <p className="rounded-lg border border-amber-700/40 p-3 text-sm text-amber-200">Required options checks have not all passed. Contract selection and projected levels are withheld.</p>}
      <ResearchFold title="Contract and open-interest evidence"><dl className="grid grid-cols-2 gap-2"><ResearchMetric label="Call open interest" value={researchNumber(result.openInterestAnalysis?.totalCallOI)} /><ResearchMetric label="Put open interest" value={researchNumber(result.openInterestAnalysis?.totalPutOI)} /><ResearchMetric label="Put / call ratio" value={researchNumber(result.openInterestAnalysis?.pcRatio,2)} /><ResearchMetric label="OI expiry" value={researchDate(result.openInterestAnalysis?.expirationDate)} /></dl>
      {!blocked && result.primaryStrike && <p>Selected {result.primaryStrike.type}: {researchPrice(result.primaryStrike.strike)} · {researchLabel(result.primaryStrike.moneyness)}.</p>}
      <ul className="space-y-2">{result.openInterestAnalysis?.highOIStrikes.map((s,i)=><li key={i} className="flex flex-wrap justify-between gap-2"><span>{researchPrice(s.strike)} {s.type}</span><span>{researchNumber(s.openInterest)} open interest</span></li>)}</ul>
      </ResearchFold>
      <ResearchFold title="Measured context">{blocked && <div className="space-y-2 text-amber-200"><p>{researchReason(result.entryTiming?.reason)}</p>{result.dataConfidenceCaps?.length ? <ul className="space-y-1">{result.dataConfidenceCaps.map((reason,i)=><li key={i}>{researchReason(reason)}</li>)}</ul> : null}</div>}<dl className="grid grid-cols-2 gap-2"><ResearchMetric label="Current implied volatility" value={result.ivAnalysis ? `${researchNumber(result.ivAnalysis.currentIV * 100,1)}%` : 'Not measured'} /><ResearchMetric label="Timeframe coverage" value={result.unmeasuredTFs?.length ? `${result.unmeasuredTFs.join(', ')} not measured` : 'No missing timeframes reported'} /></dl>
      {!blocked && <dl className="grid grid-cols-2 gap-2"><ResearchMetric label="Options quality score" value={researchNumber(result.optionsQualityScore)} /><ResearchMetric label="Expected move" value={result.expectedMove ? `${researchNumber(result.expectedMove.selectedExpiryPercent,1)}%` : 'Not measured'} /></dl>}
      <p className="text-xs text-slate-400">Scores describe indicator alignment and are not calibrated probabilities. Dealer inventory is not supplied.</p></ResearchFold>
      <p data-research-source className="break-words text-xs text-slate-500">Source: {researchLabel(result.dataQuality?.optionsChainSource)} · {researchTime(result.dataQuality?.lastUpdated)}</p>
    </>}
  </section>;
}
