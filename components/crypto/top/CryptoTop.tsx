'use client';
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
export default function CryptoTop({data}:{data:Breakdown}){
 const [zone,setZone]=useState('UTC');useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');},[]);
 const t=data.top,spot=t?.spot,change=t?.change24h,status=spot?.status??'Unknown';
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
