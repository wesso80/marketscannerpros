'use client';
import {useEffect,useRef,useState} from 'react';
import {V1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {topNumber,type TopFacts} from '@/lib/crypto/breakdown/top';
import {symbolDate} from '@/lib/presentation/symbolDisplay';
import {COPY} from '../copy';
import SourceLine from './SourceLine';
const DAY=86400000;
export type DisplayChart={bars:Array<{t:string;close:number;high:number;low:number}>;levels:Array<{name:string;value:number}>;base?:{from:string;to:string;high:number;low:number};basis:string};
export default function BaseChart({top,zone='UTC',model,showSource=true}:{top?:TopFacts;zone?:string;model?:DisplayChart;showSource?:boolean}){
 const host=useRef<HTMLDivElement>(null),[width,setWidth]=useState(360);
 useEffect(()=>{
  if(!host.current||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setWidth(entry.contentRect.width);});
  observer.observe(host.current);return ()=>observer.disconnect();
 },[]);
 const allBars=model?.bars??top?.chart.bars??[],bars=allBars.slice(-90),c=COPY.top;
 if(bars.length<2)return <div ref={host} className="rounded-lg border border-white/10 p-3 text-sm text-slate-400">{showSource?c.chartUnavailable:'Daily chart feed has no bars for this symbol.'}</div>;
 const chart=top?.chart??{baseHigh:null,baseLow:null,ruleStop:null},first=Date.parse(bars[0].t),last=Date.parse(bars.at(-1)!.t);
 const levels=model?.levels??[{name:c.baseHigh,value:chart.baseHigh},{name:c.baseLow,value:chart.baseLow},{name:c.ruleStop,value:chart.ruleStop}].filter(l=>l.value!=null) as {name:string;value:number}[];
 const values=[...bars.map(b=>b.close),...levels.map(l=>l.value)],min=Math.min(...values),max=Math.max(...values),span=max-min||Math.abs(max)*.02||1;
 const left=8,right=Math.max(left+1,width-85),y=(v:number)=>144-(v-min)/span*116,x=(t:string)=>left+(Date.parse(t)-first)/Math.max(DAY,last-first)*(right-left);
 const groups:typeof bars[]=[];
 bars.forEach((b,i)=>{if(!i||Date.parse(b.t)-Date.parse(bars[i-1].t)!==DAY&&(!model||Date.parse(b.t)-Date.parse(bars[i-1].t)>4*DAY))groups.push([]);groups.at(-1)!.push(b);});
 const base=bars.slice(-(V1.baseDays+1),-1),box=base.length===V1.baseDays&&chart.baseHigh!=null&&chart.baseLow!=null;
 const date=showSource?bars.at(-1)!.t.slice(0,10):symbolDate(bars.at(-1)!.t.slice(0,10),true),caption=model?`${bars.length} daily closes · ${model.basis} · last bar ${date}`:c.chartCaption(date,V1.baseDays,bars.length);
 const averages=bars.map(b=>{const i=allBars.indexOf(b);return i<49?null:{t:b.t,close:allBars.slice(i-49,i+1).reduce((sum,v)=>sum+v.close,0)/50};}).filter((b):b is {t:string;close:number}=>b!==null);
 const baseBox=model?.base??(box?{from:base[0].t,to:base.at(-1)!.t,high:chart.baseHigh!,low:chart.baseLow!}:null);
 // Keep level labels readable when their prices are close; the connector retains the true level.
 const labels=levels.map(l=>({...l,at:y(l.value)})).sort((a,b)=>a.at-b.at);
 labels.forEach((l,i)=>{l.at=Math.max(l.at,i?labels[i-1].at+14:16);});
 if(labels.length&&labels.at(-1)!.at>144){const shift=labels.at(-1)!.at-144;labels.forEach(l=>{l.at-=shift;});}
 return <div ref={host} data-top-number className="min-w-0 rounded-lg border border-white/10 p-3">
  <svg role="img" aria-label={`${caption} ${levels.map(l=>c.chartLevel(l.name,topNumber(l.value,'price'))).join('. ')}${showSource&&chart.baseLow==null?`. ${c.baseLowUnavailable}`:''}`} viewBox={`0 0 ${width} 180`} width="100%" height="180" className="block text-slate-400">
   {baseBox&&<rect data-base-box x={x(baseBox.from)} y={y(baseBox.high)} width={Math.max(0,x(baseBox.to)-x(baseBox.from))} height={Math.max(0,y(baseBox.low)-y(baseBox.high))} fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeDasharray="4 4" strokeOpacity="0.35"/>}
   {!showSource&&averages.length>1&&<polyline data-average points={averages.map(b=>`${x(b.t)},${y(b.close)}`).join(' ')} fill="none" stroke="var(--msp-text-muted)" strokeWidth="1"/>}
   {groups.map((group,i)=><polyline key={i} points={group.map(b=>`${x(b.t).toFixed(2)},${y(b.close).toFixed(2)}`).join(' ')} fill="none" stroke="var(--msp-text)" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>)}
   {labels.map(l=><g key={l.name}><line x1={left} x2={right} y1={y(l.value)} y2={y(l.value)} stroke="currentColor" strokeDasharray="4 4" opacity="0.6"/><line x1={right} x2={right+8} y1={y(l.value)} y2={l.at} stroke="currentColor" opacity="0.6"/><text x={width-2} y={l.at} textAnchor="end" fontSize="10" fill="currentColor">{c.chartLevel(l.name,topNumber(l.value,'price'))}</text></g>)}
   <text x="0" y="22" fontSize="10" fill="currentColor">{topNumber(max,'price')}</text><text x="0" y="148" fontSize="10" fill="currentColor">{topNumber(min,'price')}</text>
   <text x={left} y="172" fontSize="10" fill="currentColor">{showSource?bars[0].t.slice(0,10):symbolDate(bars[0].t.slice(0,10),true)}</text><text x={width-2} y="172" textAnchor="end" fontSize="10" fill="currentColor">{date}</text>
  </svg>
  {showSource&&chart.baseLow==null&&<p className="text-xs text-amber-300">{c.baseLowUnavailable}</p>}
  <p className="text-xs text-slate-400">{caption}{!showSource&&averages.length>1?' · grey: 50-day average':''}</p>{showSource&&top&&<SourceLine stamp={top.daily} zone={zone}/>}
 </div>;
}
