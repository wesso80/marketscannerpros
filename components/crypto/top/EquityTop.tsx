'use client';
import {useEffect,useState} from 'react';
import type {GoldenEggPayload} from '@/src/features/goldenEgg/types';
import {SymbolSummary} from './CryptoTop';
import type {DisplayChart} from './BaseChart';
import type {DisplayStat} from './StatCards';


/** Presentation only: no stock stage/base is inferred from crypto rules. */
export default function EquityTop({data,assessment,pick}:{data:GoldenEggPayload;assessment:string;pick?:{grade?:string|null;scan_date?:string}|null}){
 const [bars,setBars]=useState<DisplayChart['bars']>([]),[error,setError]=useState(false);
 useEffect(()=>{const abort=new AbortController();setBars([]);setError(false);
  fetch(`/api/bars?symbol=${encodeURIComponent(data.meta.symbol)}&timeframe=daily&limit=140`,{signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const body=await r.json();if(!body.ok||!Array.isArray(body.candles))throw Error();if(!abort.signal.aborted)setBars(body.candles.filter((c:any)=>Number.isFinite(c.c)&&Number.isFinite(Date.parse(c.t))).map((c:any)=>({t:c.t,close:c.c,high:c.h,low:c.l})));}).catch(()=>{if(!abort.signal.aborted)setError(true);});
  return ()=>abort.abort();
 },[data.meta.symbol]);
 const c=data.canonical,engine=data.canonicalVerdict;
 const levels=(data.layer2.setup.keyLevels??[]).filter(l=>Number.isFinite(l.price)&&l.price>0);
 const tiles:DisplayStat[]=levels.slice(0,2).map(l=>({label:l.label,value:l.price.toLocaleString(undefined,{maximumFractionDigits:2}),detail:data.meta.price?`${((l.price/data.meta.price-1)*100).toFixed(1)}% away`:undefined}));
 if(c?.options?.expectedMovePct!=null)tiles.push({label:'Expected move',value:`±${c.options.expectedMovePct.toFixed(2)}%`,detail:c.options.expiry});
 if(pick?.grade)tiles.push({label:"Daily pick grade",value:pick.grade,detail:pick.scan_date?.slice(0,10)});
 const rules=engine?.factors?.slice(0,5).map(f=>({name:f.name,value:f.value==null?'Not measured':`${Math.round(f.value*100)}%`,limit:'',pass:f.pass}));
 return <div className="space-y-3">{error&&<p role="status" className="text-xs text-amber-300">Daily chart feed failed. Other observations retain their own dates.</p>}
 <SymbolSummary stage={<span data-stage-badge className="rounded border border-current px-3 py-1 text-sm text-amber-300">{assessment}</span>} verdict={`Daily close ${bars.at(-1)?.close.toLocaleString(undefined,{maximumFractionDigits:2})??data.meta.price.toLocaleString(undefined,{maximumFractionDigits:2})} · ${levels.length} recorded key levels.`} rules={rules??[]} chart={{bars,levels:levels.map(l=>({name:l.label,value:l.price})),basis:'Alpha Vantage daily bars'}} tiles={tiles}/>
 </div>;
}
