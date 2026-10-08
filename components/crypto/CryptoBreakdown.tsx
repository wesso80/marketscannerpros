'use client';
import { useCopilotSection } from '@/lib/ai/useCopilotSection';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import ChipRow from '@/components/visual/ChipRow';
import type {StampLineProps} from '@/components/visual/StampLine';
import PageSourceLine from '@/components/visual/SourceLine';
import {readerLabel,readerSourceLabel,symbolText,symbolMetric} from '@/lib/presentation/symbolDisplay';
import {useEffect,useState} from 'react';
import {normalizeCryptoSymbol} from '@/lib/crypto/breakdown/symbol';
import type {Breakdown} from '@/lib/crypto/breakdown/types';
import {COPY} from './copy';
import CryptoTop from './top/CryptoTop';
import PriceSection from './sections/PriceSection';
import RuleCheckSection from './sections/RuleCheckSection';
import EarlyContextSection from './sections/EarlyContextSection';
import MarketContextSection from './sections/MarketContextSection';
import DerivativesSection from './sections/DerivativesSection';
import LiquiditySection from './sections/LiquiditySection';
import SupplySection from './sections/SupplySection';
import LevelsSection from './sections/LevelsSection';
import RisksSection from './sections/RisksSection';
import SourcesBadge from './sections/SourcesBadge';
import HandoffSection from './sections/HandoffSection';
export default function CryptoBreakdown({symbol,timeframe:_,coinId,compact=false,showSource=true,onStamp}:{symbol:string;timeframe:string;coinId?:string;compact?:boolean;showSource?:boolean;onStamp?:(stamp:StampLineProps|null)=>void}){
 const publishEvidence=useCopilotSection('crypto',symbol);
 const base=normalizeCryptoSymbol(symbol),[data,setData]=useState<Breakdown|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setData(null);setError(null);onStamp?.(null);publishEvidence(null);
  const params=new URLSearchParams({symbol:base});if(coinId)params.set('id',coinId);
  fetch(`/api/crypto/breakdown?${params}`,{signal:abort.signal}).then(async r=>{if(!r.ok)throw Error(COPY.error);const body=await r.json();if(!body.sections||!body.budget)throw Error(COPY.error);if(!abort.signal.aborted){setData(body);publishEvidence(body.copilotEvidenceToken);onStamp?.({source:[...new Set([body.top?.daily.source,body.top?.derivatives.source].filter(Boolean))].join(' · '),asOf:body.top?.daily.asOf,basis:body.top?.daily.basis});}}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[base,coinId,refresh,onStamp,publishEvidence]);
 if(compact){
  const metrics=(section:Breakdown['sections'][keyof Breakdown['sections']])=>(section.value?.metrics??[]).filter(m=>m.value!=null&&(typeof m.value!=='number'||Number.isFinite(m.value)));
  const detail=(key:keyof Breakdown['sections'])=>data&&<div className="space-y-2">{metrics(data.sections[key]).length===0&&<p className="text-xs text-amber-300">No observations returned for this section.</p>}<dl className="grid grid-cols-2 gap-3">{metrics(data.sections[key]).map((m,i)=><div key={i}><dt className="text-xs text-[var(--msp-text-muted)]">{symbolText(readerLabel(m.label))}</dt><dd className="break-words text-sm">{symbolMetric(m.value,m.unit)}</dd></div>)}</dl>{data.sections[key].value?.notes.map((n,i)=><p key={i} className="text-xs">{symbolText(readerLabel(n.replace(/Locked rule sha256 prefix [a-f0-9]+\.\s*/i,'')))}</p>)}</div>;
  const groups=[['Scenario map','levels'],['Derivatives','derivatives'],['Volatility and range','earlyContext'],['Market and supply','marketContext']] as const;
  return <div aria-label="Crypto breakdown" className="space-y-3">
   {loading&&<p role="status">Loading daily observations…</p>}{error&&<p role="alert" className="text-sm text-amber-300">Crypto data feed failed. <button className="min-h-10 underline" onClick={()=>setRefresh(v=>v+1)}>Retry</button></p>}
   {data&&<><CryptoTop data={data} showSource={false}/>
    {groups.filter(([,key])=>metrics(data.sections[key]).length>0||(data.sections[key].value?.notes.length??0)>0).map(([title,key])=><CollapsibleSection deferMount key={key} title={title} summary={`${metrics(data.sections[key]).length} recorded ${metrics(data.sections[key]).length===1?'value':'values'}`}>
     {detail(key)}{key==='derivatives'&&<a className="inline-flex min-h-10 items-center underline" href={`/tools/crypto-dashboard?symbol=${encodeURIComponent(base)}`}>Open Crypto Derivatives</a>}
    </CollapsibleSection>)}
    <ChipRow items={[{id:'evidence',label:`${Object.values(data.sections).some(s=>['Unknown','Degraded'].includes(s.status))?'Some data checks failed':'Evidence and data checks'} · ${Object.keys(data.sections).length} sections`,warning:Object.values(data.sections).some(s=>['Unknown','Degraded'].includes(s.status)),detail:<div className="space-y-3">{(['price','ruleCheck','liquidity','supply','risks','sourcesCheck'] as const).map(key=><div key={key}><h3 className="font-semibold">{COPY.titles[key]}</h3>{detail(key)}</div>)}</div>}]}/>
    {showSource&&<PageSourceLine source={readerSourceLabel([...new Set([data.top?.daily.source,data.top?.derivatives.source].filter(Boolean))].join(' · '))} asOf={data.top?.daily.asOf} basis={data.top?.daily.basis}/>}
   </>}
   <p className="text-xs text-[var(--msp-text-muted)]">{COPY.footer}</p>
  </div>;
 }
 return <div className="my-6 space-y-4" aria-label="Crypto breakdown">
  <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-300">{COPY.intro}</p><button type="button" onClick={()=>setRefresh(v=>v+1)} disabled={loading} className="rounded border border-white/20 px-3 py-2 disabled:opacity-50">{COPY.refresh}</button></div>
  <p className="text-xs text-slate-400">{COPY.daily}</p>
  {loading&&<p role="status">{COPY.loading}</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {data&&<><CryptoTop data={data}/><p className="text-sm text-slate-400">{COPY.top.detailRows}</p><PriceSection data={data}/><RuleCheckSection data={data.sections.ruleCheck}/><EarlyContextSection data={data.sections.earlyContext}/><MarketContextSection data={data.sections.marketContext}/><DerivativesSection data={data.sections.derivatives}/><LiquiditySection data={data.sections.liquidity}/><SupplySection data={data.sections.supply}/><LevelsSection data={data.sections.levels}/><RisksSection data={data.sections.risks}/><SourcesBadge data={data.sections.sourcesCheck}/><HandoffSection data={data}/></>}
  <p className="text-xs text-slate-400">{COPY.footer}</p>
 </div>;
}
