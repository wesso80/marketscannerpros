'use client';
import React,{useEffect,useState} from 'react';
import PriceStamp from '@/components/market/PriceStamp';
import TrustBadge from '@/components/market/TrustBadge';
import {formatMarketTime} from '@/lib/market/priceStamp';
import {readerLabel} from '@/lib/presentation/symbolDisplay';
import type {Metric,Section} from '@/lib/crypto/breakdown/types';
import { compactAmount } from '@/lib/presentation/compactAmount';
import {COPY} from './copy';
function display(m:Metric){
 if(m.value==null)return COPY.unavailable;
 if(typeof m.value==='boolean')return m.value?COPY.yes:COPY.no;
 if(typeof m.value==='string')return m.value;
 const v=m.value.toLocaleString('en-US',{maximumFractionDigits:4});return m.unit==='percent'?`${v}%`:m.unit==='ratio'?`${v}x`:m.unit==='usd'?compactAmount(m.value,true):Math.abs(m.value)>=1e6?compactAmount(m.value):v;
}
export function MetricRow({metric:m,zone}:{metric:Metric;zone:string}){
 const t=formatMarketTime(m.asOf,zone),warn=m.status==='Unknown'||m.status==='Stale'||m.status==='Degraded';
 return <div className="rounded border border-white/10 p-3" data-metric="true">
  <dt className="text-xs text-slate-400">{readerLabel(m.label)}</dt>
  <dd className="mt-1 text-sm">{m.unit==='price'?<PriceStamp assetType="crypto" price={typeof m.value==='number'?m.value:null} priceBasis={/OHLC|daily|UTC day/i.test(m.basis)?'daily_bar_close':'spot'} priceBasisLabel={m.basis} observedAt={m.asOf} source={m.source} stale={m.status==='Stale'}/>:display(m)}</dd>
  <p className={`mt-1 text-xs ${warn||!t?'text-amber-300':'text-slate-400'}`}>{m.source} · {t??COPY.unknown} · {m.basis}{m.reason?` · ${m.reason}`:''}</p>
 </div>;
}
export default function SectionShell({id,title,data,children,collapsible=true,open=false}:{id:string;title:string;data:Section;children?:React.ReactNode;collapsible?:boolean;open?:boolean}){
 const [zone,setZone]=useState('UTC');useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');},[]);
 const [expanded,setExpanded]=useState(open);
 const header=<><span className="text-lg font-semibold">{title}</span><TrustBadge status={data.status} reason={data.reason}/></>;
 const body=<div className="space-y-3 pt-3">
  <p className={`text-xs ${!data.asOf?'text-amber-300':'text-slate-400'}`}>{data.source} · {formatMarketTime(data.asOf,zone)??COPY.unknown} · {data.basis}</p>
  {data.value?.stage&&<p className="font-semibold">{data.value.stage}</p>}
  {data.value?<><dl className="grid gap-2 sm:grid-cols-2">{data.value.metrics.filter(m=>m.value!=null).map((m,i)=><MetricRow key={`${m.label}-${i}`} metric={m} zone={zone}/>)}</dl>{data.value.metrics.some(m=>m.value==null)&&<p className="text-xs text-slate-400">Not available yet: {data.value.metrics.filter(m=>m.value==null).map(m=>m.label).join(', ')}</p>}{data.value.notes.map((n,i)=><p key={i} className="text-sm text-slate-300">{n}</p>)}</>:<p className="text-amber-300">{data.reason||COPY.empty}</p>}
  {children}
 </div>;
 return <section id={`crypto-${id}`} data-crypto-section={id} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
  {collapsible?<><div className="flex items-center justify-between gap-3"><button type="button" aria-expanded={expanded} aria-controls={`crypto-${id}-body`} onClick={()=>setExpanded(v=>!v)} className="min-h-10 min-w-0 flex-1 break-words text-left text-lg font-semibold">{title} <span aria-hidden="true">{expanded?'−':'+'}</span></button><TrustBadge status={data.status} reason={data.reason}/></div><div id={`crypto-${id}-body`} hidden={!expanded}>{body}</div></>:<><div className="flex flex-wrap items-center justify-between gap-3">{header}</div>{body}</>}
 </section>;
}
