'use client';
import {useEffect,useState} from 'react';
import PriceStamp from '@/components/market/PriceStamp';
import {trustBadgeState} from '@/components/market/TrustBadge';
import type {Breakdown} from '@/lib/crypto/breakdown/types';
import {COPY} from '../copy';
import StageBadge from './StageBadge';
import SourceLine from './SourceLine';
export default function CryptoTop({data}:{data:Breakdown}){
 const [zone,setZone]=useState('UTC');useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');},[]);
 const t=data.top,spot=t?.spot,change=t?.change24h,status=spot?.status??'Unknown';
 return <section data-crypto-top className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-4" aria-label={COPY.top.title}>
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0 flex-1 break-words"><h2 className="text-xl font-semibold">{`${t?.name??data.name??data.symbol} · ${data.symbol}`}</h2>
    <div data-top-number className="mt-2"><p className="text-3xl font-semibold tabular-nums">{typeof spot?.value==='number'?COPY.top.price(spot.value):COPY.top.priceUnavailable}</p>
     <PriceStamp compact assetType="crypto" price={typeof spot?.value==='number'?spot.value:null} priceBasis="spot" observedAt={spot?.asOf??null} source={spot?.source??COPY.top.sourceUnavailable} stale={status==='Stale'} timeZone={zone}/><SourceLine stamp={spot??null} zone={zone}/></div>
   </div>
   <div data-top-number><div className="flex flex-wrap items-center gap-2">{t&&<StageBadge stage={t.stage}/>}<span className="text-xs" style={{color:trustBadgeState({status}).color}}><span aria-hidden="true">● </span>{status}</span></div>{t&&<SourceLine stamp={t.daily} zone={zone}/>}</div>
  </div>
  <div data-top-number><p className="text-sm text-slate-300">{COPY.top.change24h}: {typeof change?.value==='number'?COPY.top.signedPercent(change.value):COPY.top.unavailable}</p><SourceLine stamp={change??null} zone={zone}/></div>
  {data.identityMatches!=null&&data.identityMatches>1?<div data-top-number className="text-amber-300"><p>{data.identityMatches} {COPY.matches}</p><SourceLine stamp={null} zone={zone}/></div>:data.identityMatches==null?<p className="text-xs text-slate-400">{COPY.identityUnchecked}</p>:null}
  {data.budget.capped&&<p role="status" className="text-amber-300">{data.budget.reason?COPY.budgetUnavailable:COPY.capped}</p>}
 </section>;
}
