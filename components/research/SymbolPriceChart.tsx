'use client';
import { useState } from 'react';
import type { PriceChart, PricePoint } from '@/lib/research/symbolPriceChart';
const number = (v: number | null | undefined) => v == null ? 'Unavailable' : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
export default function SymbolPriceChart({ data, width, symbol }: { data?: PriceChart; width: number; symbol: string }) {
  const [ma,setMa] = useState(true), [volume,setVolume] = useState(true), [bands,setBands] = useState(false), [rsi,setRsi] = useState(false), [macd,setMacd] = useState(false), [cursor,setCursor] = useState<number | null>(null);
  const points = data?.points || [], index = Math.min(cursor ?? points.length-1,points.length-1), selected = points[index];
  const left = 54, right = width-12, x = (i: number) => left + i/Math.max(1,points.length-1)*(right-left);
  const paths = (key: keyof PricePoint, y: (v:number)=>number) => { let pen = false; return points.map((p,i) => { const v = p[key]; if (typeof v !== 'number') { pen=false; return ''; } const move=pen?'L':'M'; pen=true; return `${move}${x(i)},${y(v)}`; }).join(' '); };
  const values = points.flatMap(p => [p.low ?? p.close,p.high ?? p.close,...(ma?[p.sma20,p.sma50]:[]),...(bands?[p.upper,p.lower]:[])]).filter((v):v is number=>v!==null);
  const low=Math.min(...values), high=Math.max(...values), pad=Math.max((high-low)*.08,high*.005), y=(v:number)=>244-(v-low+pad)/(high-low+pad*2)*220;
  const maxVolume = Math.max(1,...points.map(b=>b.volume??0));
  const candleWidth=Math.max(1,Math.min(8,(right-left)/Math.max(1,points.length)*.65));
  const controls = [['Moving averages',ma,setMa],['Volume',volume,setVolume],['Bollinger Bands',bands,setBands],['RSI',rsi,setRsi],['MACD',macd,setMacd]] as const;
  const panel = (kind: 'rsi'|'macd') => {
    const keys: Array<'rsi'|'macd'|'signal'> = kind==='rsi'?['rsi']:['macd','signal'];
    const vs=points.flatMap(p=>keys.map(k=>p[k])).filter((v):v is number=>v!==null);
    const min=kind==='rsi'?0:Math.min(0,...vs), max=kind==='rsi'?100:Math.max(0,...vs), py=(v:number)=>86-(v-min)/Math.max(.001,max-min)*64;
    return <div className="mt-4" key={kind}><p className="text-xs text-slate-300">{kind==='rsi'?'RSI (14)':'MACD (12, 26) · line (9)'}: {number(selected?.[kind])}{kind==='macd'?` · MACD line: ${number(selected?.signal)}`:''}</p>{!vs.length?<p className="mt-2 text-xs text-amber-200">Insufficient history for {kind.toUpperCase()}.</p>:<svg role="img" aria-label={`${kind.toUpperCase()} indicator history`} viewBox={`0 0 ${width} 105`} width="100%" height="105">{(kind==='rsi'?[30,70]:[0]).map(v=><g key={v}><line x1={left} x2={right} y1={py(v)} y2={py(v)} stroke="#94a3b8" strokeDasharray="3 4"/><text x="8" y={py(v)+4} fill="#94a3b8" fontSize="10">{v}</text></g>)}{keys.map((k,i)=><path key={k} d={paths(k,py)} fill="none" stroke={i?'#fbbf24':'#a5b4fc'} strokeWidth="1.8"/>)}</svg>}</div>;
  };
  return <div className="mt-5">
    <div className="flex flex-wrap gap-2" aria-label="Chart indicators">{controls.map(([label,on,set])=><label key={label} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-slate-200"><input type="checkbox" checked={on} onChange={e=>set(e.target.checked)} className="accent-teal-300"/>{label}</label>)}</div>
    {!selected?<p role="status" className="py-12 text-sm text-slate-300">Price history unavailable.</p>:<>
      <p className="mt-4 text-xs leading-6 text-slate-300">{selected.date} · O {number(selected.open)} · H {number(selected.high)} · L {number(selected.low)} · C {number(selected.close)}</p>
      {ma&&<p className="text-xs leading-6"><span className="text-amber-200">SMA20 {number(selected.sma20)}</span> · <span className="text-indigo-200">SMA50 {number(selected.sma50)}</span></p>}
      {bands&&<p className="text-xs leading-6 text-sky-200">Bollinger upper {number(selected.upper)} · lower {number(selected.lower)}</p>}
      <svg role="img" aria-label={`${symbol} daily price and selected indicators`} viewBox={`0 0 ${width} 275`} width="100%" height="275">
        {[0,1,2,3,4].map(i=>{const v=low+(high-low)*i/4;return <g key={i}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#94a3b8" strokeOpacity=".15"/><text x="2" y={y(v)+4} fill="#94a3b8" fontSize="10">{number(v)}</text></g>;})}
        <path d={paths('close',y)} fill="none" stroke="#5eead4" strokeOpacity=".4"/>
        {points.map((p,i)=>p.open===null?<circle key={p.date} cx={x(i)} cy={y(p.close)} r="1.5" fill="#5eead4"/>:<g key={p.date} stroke={p.close>=p.open?'#5eead4':'#fb7185'} fill={p.close>=p.open?'#5eead4':'#fb7185'}><line x1={x(i)} x2={x(i)} y1={y(p.high!)} y2={y(p.low!)}/><rect x={x(i)-candleWidth/2} y={y(Math.max(p.open,p.close))} width={candleWidth} height={Math.max(1,Math.abs(y(p.open)-y(p.close)))}/></g>)}
        {(ma?['sma20','sma50'] as const:[]).map((k,i)=><path key={k} d={paths(k,y)} fill="none" stroke={i?'#a5b4fc':'#fbbf24'} strokeWidth="1.6"/>)}
        {bands&&(['upper','lower'] as const).map(k=><path key={k} d={paths(k,y)} fill="none" stroke="#7dd3fc" strokeDasharray="4 3"/>)}
        <line x1={x(index)} x2={x(index)} y1="20" y2="244" stroke="#cbd5e1" strokeDasharray="3 4"/>
        <text x={left} y="270" fill="#94a3b8" fontSize="10">{points[0].date}</text><text x={right} y="270" textAnchor="end" fill="#94a3b8" fontSize="10">{points.at(-1)!.date}</text>
      </svg>
      <input type="range" aria-label="Inspect price date" min="0" max={points.length-1} value={index} onChange={e=>setCursor(Number(e.target.value))} className="h-6 w-full accent-teal-300"/>
      {volume&&<div className="mt-3"><p className="text-xs text-slate-300">Volume: {number(selected.volume)} · provider units</p>{points.every(p=>p.volume===null)?<p className="mt-2 text-xs text-amber-200">Volume history unavailable.</p>:<svg role="img" aria-label="Daily volume" viewBox={`0 0 ${width} 80`} width="100%" height="80">{points.map((p,i)=>p.volume===null?null:<rect key={p.date} x={x(i)-candleWidth/2} y={75-p.volume/maxVolume*65} width={candleWidth} height={p.volume/maxVolume*65} fill="#5eead4" opacity=".5"/>)}</svg>}</div>}
      {rsi&&panel('rsi')}{macd&&panel('macd')}
      {points.some(p=>p.open===null)&&<p className="mt-3 text-xs text-amber-200">Some OHLC observations are unavailable; the close line is shown without invented candles.</p>}
      <details className="mt-4 text-xs leading-5 text-slate-400"><summary className="cursor-pointer text-slate-300">Price data and indicator methods · {points.length} observations</summary><p className="mt-2">{data?.basis}</p><p>Source: {data?.source}. Coverage: {points[0].date} to {points.at(-1)!.date}.</p></details>
    </>}
  </div>;
}
