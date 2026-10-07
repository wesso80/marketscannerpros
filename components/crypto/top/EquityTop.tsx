'use client';
import {useEffect,useState} from 'react';
import type {PublicSymbolPacket} from '@/lib/research/publicSymbolPacket';
import {SymbolSummary} from './CryptoTop';
import type {DisplayChart} from './BaseChart';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import DescriptiveStates from '@/components/research/DescriptiveStates';
import {describeStates} from '@/lib/research/descriptiveStates';
import type {DisplayStat} from './StatCards';
import {symbolText,symbolNumber,symbolDate} from '@/lib/presentation/symbolDisplay';


/** Presentation only: no stock stage/base is inferred from crypto rules. */
export default function EquityTop({data,pick}:{data:PublicSymbolPacket;pick?:{grade?:string|null;scan_date?:string}|null}){
 const [bars,setBars]=useState<DisplayChart['bars']>([]),[error,setError]=useState(false);
 useEffect(()=>{const abort=new AbortController();setBars([]);setError(false);
  fetch(`/api/bars?symbol=${encodeURIComponent(data.meta.symbol)}&timeframe=daily&limit=140`,{signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const body=await r.json();if(!body.ok||!Array.isArray(body.candles))throw Error();if(!abort.signal.aborted)setBars(body.candles.filter((c:any)=>Number.isFinite(c.c)&&Number.isFinite(Date.parse(c.t))).map((c:any)=>({t:c.t,close:c.c,high:c.h,low:c.l})));}).catch(()=>{if(!abort.signal.aborted)setError(true);});
  return ()=>abort.abort();
 },[data.meta.symbol]);
 const c=data.canonical;
 const levels=(data.layer2.setup.keyLevels??[]).filter(l=>Number.isFinite(l.price)&&l.price>0);
 const tiles:DisplayStat[]=levels.slice(0,2).map(l=>({label:symbolText(l.label),value:symbolNumber(l.price,'price'),detail:data.meta.price?`${((l.price/data.meta.price-1)*100).toFixed(1)}% away`:undefined}));
 if(c?.options?.expectedMovePct!=null)tiles.push({label:'Options-implied move',value:`±${c.options.expectedMovePct.toFixed(2)}%`,detail:symbolDate(c.options.expiry,true)});

 // Phase 4: no verdict pill, permission wording or pass/fail factor scores. The top states what was measured, with
 // each state's definition beside it (lib/research/descriptiveStates).
 const pe=data.priceEvidence??null;
 const verdict=pe?.summary.length?pe.summary.join(' '):'Measured daily evidence is not available for this timeframe.';
 return <div className="space-y-3">{error&&<p role="status" className="text-xs text-amber-300">Daily chart feed failed. Other observations retain their own dates.</p>}
 <SymbolSummary stage={null} verdict={verdict} chart={{bars,levels:levels.map(l=>({name:symbolText(l.label),value:l.price})),basis:'Alpha Vantage daily bars'}} tiles={tiles}/>
 <CollapsibleSection title="Measured states" summary={describeStates(pe).map(x=>`${x.label}: ${x.state}`).slice(0,2).join(' · ')}><DescriptiveStates states={describeStates(pe)}/></CollapsibleSection>
 </div>;
}
