'use client';
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
export default function CryptoBreakdown({symbol,timeframe:_,coinId}:{symbol:string;timeframe:string;coinId?:string}){
 const base=normalizeCryptoSymbol(symbol),[data,setData]=useState<Breakdown|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setData(null);setError(null);
  const params=new URLSearchParams({symbol:base});if(coinId)params.set('id',coinId);
  fetch(`/api/crypto/breakdown?${params}`,{signal:abort.signal}).then(async r=>{if(!r.ok)throw Error(COPY.error);const body=await r.json();if(!body.sections||!body.budget)throw Error(COPY.error);if(!abort.signal.aborted)setData(body);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[base,coinId,refresh]);
 return <div className="my-6 space-y-4" aria-label="Crypto breakdown">
  <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-300">{COPY.intro}</p><button type="button" onClick={()=>setRefresh(v=>v+1)} disabled={loading} className="rounded border border-white/20 px-3 py-2 disabled:opacity-50">{COPY.refresh}</button></div>
  <p className="text-xs text-slate-400">{COPY.daily}</p>
  {loading&&<p role="status">{COPY.loading}</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {data&&<><CryptoTop data={data}/><p className="text-sm text-slate-400">{COPY.top.detailRows}</p><PriceSection data={data}/><RuleCheckSection data={data.sections.ruleCheck}/><EarlyContextSection data={data.sections.earlyContext}/><MarketContextSection data={data.sections.marketContext}/><DerivativesSection data={data.sections.derivatives}/><LiquiditySection data={data.sections.liquidity}/><SupplySection data={data.sections.supply}/><LevelsSection data={data.sections.levels}/><RisksSection data={data.sections.risks}/><SourcesBadge data={data.sections.sourcesCheck}/><HandoffSection data={data}/></>}
  <p className="text-xs text-slate-400">{COPY.footer}</p>
 </div>;
}
