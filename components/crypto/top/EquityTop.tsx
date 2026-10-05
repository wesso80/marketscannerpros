'use client';
import {useEffect,useState} from 'react';
import type {GoldenEggPayload} from '@/src/features/goldenEgg/types';
import {SymbolSummary} from './CryptoTop';
import type {DisplayChart} from './BaseChart';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import RuleChips from './RuleChips';
import type {DisplayStat} from './StatCards';
import {symbolText,symbolNumber,symbolDate} from '@/lib/presentation/symbolDisplay';


/** Presentation only: no stock stage/base is inferred from crypto rules. */
export default function EquityTop({data,pick}:{data:GoldenEggPayload;pick?:{grade?:string|null;scan_date?:string}|null}){
 const [bars,setBars]=useState<DisplayChart['bars']>([]),[error,setError]=useState(false);
 useEffect(()=>{const abort=new AbortController();setBars([]);setError(false);
  fetch(`/api/bars?symbol=${encodeURIComponent(data.meta.symbol)}&timeframe=daily&limit=140`,{signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const body=await r.json();if(!body.ok||!Array.isArray(body.candles))throw Error();if(!abort.signal.aborted)setBars(body.candles.filter((c:any)=>Number.isFinite(c.c)&&Number.isFinite(Date.parse(c.t))).map((c:any)=>({t:c.t,close:c.c,high:c.h,low:c.l})));}).catch(()=>{if(!abort.signal.aborted)setError(true);});
  return ()=>abort.abort();
 },[data.meta.symbol]);
 const c=data.canonical,engine=data.canonicalVerdict;
 const levels=(data.layer2.setup.keyLevels??[]).filter(l=>Number.isFinite(l.price)&&l.price>0);
 const tiles:DisplayStat[]=levels.slice(0,2).map(l=>({label:symbolText(l.label),value:symbolNumber(l.price,'price'),detail:data.meta.price?`${((l.price/data.meta.price-1)*100).toFixed(1)}% away`:undefined}));
 if(c?.options?.expectedMovePct!=null)tiles.push({label:'Expected move',value:`±${c.options.expectedMovePct.toFixed(2)}%`,detail:symbolDate(c.options.expiry,true)});

 const labels:Record<string,string>={trendQuality:'Trend strength',entryLocation:'Price location',volatilityRegime:'Volatility',volume:'Volume',momentum:'Momentum',structureRoom:'Room to next level',pullbackLocation:'Pullback depth',momentumReset:'Momentum reset',volumeDryUp:'Volume contraction',compression:'Range compression',directionalBias:'Direction checks',catalystPending:'Upcoming event',quietVolume:'Quiet volume',stretch:'Price stretch',rsiRollover:'Momentum cooling',climax:'Volume peak',atOpposingLevel:'Nearby opposing level',trendNotAccelerating:'Trend acceleration'};
 const rules=(engine?.factors??[]).filter(f=>f.value!=null&&Number.isFinite(f.value)).map(f=>({name:labels[f.name]??f.name.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' '),value:`${Math.round(f.value!*100)}%`,limit:'',pass:f.pass}));
 const passed=rules.filter(r=>r.pass===true).length;
 const blocked=engine?.permission==='BLOCK';
 const blockReason=(engine?.blockReasons??[]).map(reason=>symbolText(typeof reason==='string'?reason:reason.message||reason.code)).join(' · ') || 'The recorded eligibility checks did not pass.';
 const verdict=blocked?blockReason:rules.length?`${passed} of ${rules.length} measured checks meet their recorded thresholds.`:'No measured checks were returned in this packet.';
 return <div className="space-y-3">{error&&<p role="status" className="text-xs text-amber-300">Daily chart feed failed. Other observations retain their own dates.</p>}
 <SymbolSummary stage={<span data-equity-verdict className="rounded-full border border-amber-300 px-3 py-1 text-sm text-amber-300">{engine?.setupType==='NONE'?'No setup':blocked?'Blocked':symbolText(engine?.setupType??'Research snapshot')}</span>} verdict={verdict} rules={rules.slice(0,4)} chart={{bars,levels:levels.map(l=>({name:symbolText(l.label),value:l.price})),basis:'Alpha Vantage daily bars'}} tiles={tiles}/>
 {rules.length>4&&<CollapsibleSection deferMount title="Additional checks" summary={`${rules.length-4} more measured ${rules.length===5?'check':'checks'}`}><RuleChips items={rules.slice(4)} showSource={false}/></CollapsibleSection>}
 </div>;
}
