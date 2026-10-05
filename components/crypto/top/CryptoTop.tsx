'use client';
import {symbolText,symbolNumber} from '@/lib/presentation/symbolDisplay';
import type {ReactNode} from 'react';
import type {DisplayChart} from './BaseChart';
import type {DisplayRule} from './RuleChips';
import type {DisplayStat} from './StatCards';
import {useEffect,useState} from 'react';
import PriceStamp from '@/components/market/PriceStamp';
import {trustBadgeState} from '@/components/market/TrustBadge';
import type {Breakdown} from '@/lib/crypto/breakdown/types';
import {COPY} from '../copy';
import StageBadge from './StageBadge';
import RuleChips from './RuleChips';
import BaseChart from './BaseChart';
import StatCards from './StatCards';
import {verdictLine} from '@/lib/crypto/breakdown/top';
import SourceLine from './SourceLine';
export function SymbolSummary({stage,verdict,rules,chart,top,tiles}:{stage:ReactNode;verdict:string;rules?:DisplayRule[];chart?:DisplayChart;top?:Breakdown['top'];tiles:DisplayStat[]}){
 return <section data-symbol-summary className="min-w-0 space-y-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 sm:p-4">
 <div className="flex flex-wrap items-start gap-3">{stage}<p className="min-w-0 flex-1 text-sm leading-relaxed">{verdict}</p></div>
 <RuleChips top={top} items={rules} showSource={false}/>
 <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><BaseChart top={top} model={chart} showSource={false}/><StatCards tiles={tiles} showSource={false}/></div>
 </section>;
}
export default function CryptoTop({data,showSource=true}:{data:Breakdown;showSource?:boolean}){
 const [zone,setZone]=useState('UTC');useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');},[]);
 const t=data.top,spot=t?.spot,change=t?.change24h,status=spot?.status??'Unknown';
 if(!showSource){
 const price=typeof spot?.value==='number'?spot.value:null;
 const tiles:DisplayStat[]=[{label:'Base high',value:t?.chart.baseHigh??null},{label:'Base low',value:t?.chart.baseLow??null},{label:'Rule stop',value:t?.chart.ruleStop??null}].map(v=>({...v,value:v.value==null?null:symbolNumber(v.value,'price'),detail:v.value!=null&&price?`${((v.value/price-1)*100).toFixed(1)}% away`:undefined}));
 tiles.push({label:'Market-cap rank',value:typeof t?.rank?.value==='number'?`#${t.rank.value}`:null});
 return <div data-crypto-top className="space-y-3">{data.budget.capped&&<p role="status" className="text-sm text-amber-300">{data.budget.reason?'Daily feed accounting failed; cached observations only.':COPY.capped}</p>}{data.identityMatches!=null&&data.identityMatches>1&&<p className="text-sm text-amber-300">{data.identityMatches} {COPY.matches}</p>}<SymbolSummary stage={t?<StageBadge stage={t.stage}/>:null} verdict={t?symbolText(verdictLine(t.rule).replace(/^(?:No base|Extended|Fell back|Not enough data):\s*/i,'')):'Daily rule feed has no result.'} top={t} tiles={tiles}/></div>;
 }
 return <section data-crypto-top className="min-w-0 max-w-full space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-4" aria-label={COPY.top.title}>
  <div className="grid min-w-0 grid-cols-2 items-start gap-3 md:grid-cols-4">
   <h2 className="col-span-2 min-w-0 break-words text-xl font-semibold md:col-span-1">{`${t?.name??data.name??data.symbol} · ${data.symbol}`}</h2>
   <div data-top-number className="min-w-0 break-words"><p className="text-3xl font-semibold tabular-nums">{typeof spot?.value==='number'?COPY.top.price(spot.value):COPY.top.priceUnavailable}</p>
    <PriceStamp compact assetType="crypto" price={typeof spot?.value==='number'?spot.value:null} priceBasis="spot" observedAt={spot?.asOf??null} source={spot?.source??COPY.top.sourceUnavailable} stale={status==='Stale'} timeZone={zone}/><SourceLine stamp={spot??null} zone={zone}/></div>
   <div data-top-number className="min-w-0 break-words"><p className="text-xs text-slate-400">{COPY.top.change24h}</p><p className="text-xl text-slate-300">{typeof change?.value==='number'?COPY.top.signedPercent(change.value):COPY.top.unavailable}</p><SourceLine stamp={change??null} zone={zone}/></div>
   <div data-top-number className="col-span-2 min-w-0 md:col-span-1"><div className="flex flex-wrap items-center gap-2">{t&&<StageBadge stage={t.stage}/>}<span className="text-xs" style={{color:trustBadgeState({status}).color}}><span aria-hidden="true">● </span>{status}</span></div>{t&&<SourceLine stamp={t.daily} zone={zone}/>}</div>
  </div>
  {data.identityMatches!=null&&data.identityMatches>1?<div data-top-number className="text-amber-300"><p>{data.identityMatches} {COPY.matches}</p><SourceLine stamp={null} zone={zone}/></div>:data.identityMatches==null?<p className="text-xs text-slate-400">{COPY.identityUnchecked}</p>:null}
  {data.budget.capped&&<p role="status" className="text-amber-300">{data.budget.reason?COPY.budgetUnavailable:COPY.capped}</p>}
  {t&&<><div data-top-number><p className="text-sm leading-relaxed">{verdictLine(t.rule)}</p><SourceLine stamp={t.daily} zone={zone}/></div><RuleChips top={t} zone={zone}/></>}
  <BaseChart top={t} zone={zone}/>
  <StatCards top={t} zone={zone}/>
 </section>;
}
