'use client';
import {useEffect,useRef,useState} from 'react';
import {createChart,CandlestickSeries,ColorType,type UTCTimestamp} from 'lightweight-charts';
import type {BaseReview} from '@/lib/admin/cryptoBase';
import type {MomentumChart,MomentumReview} from '@/lib/admin/cryptoMomentum';
import {setupDisplayLabel,type VolumeMomentum} from '@/lib/admin/cryptoVolumeMomentum';
type RuleRow=VolumeMomentum&{id?:string;symbol?:string};
const fmt=(n?:number|null)=>typeof n==='number'&&Number.isFinite(n)?n.toPrecision(6):'—';

export function VolumeRuleChart({row}:{row:RuleRow}){
  const container=useRef<HTMLDivElement>(null);
  const label=setupDisplayLabel(row);
  useEffect(()=>{
    const candle=row.signal??(row.close&&row.asOf?{t:Date.parse(row.asOf),o:row.close,h:row.close,l:row.close,c:row.close}:null);
    if(!container.current||!candle||!Number.isFinite(candle.t))return;
    const api=createChart(container.current,{autoSize:true,height:280,
      layout:{background:{type:ColorType.Solid,color:'#0f172a'},textColor:'#cbd5e1'},
      grid:{vertLines:{color:'#1e293b'},horzLines:{color:'#1e293b'}},
      timeScale:{timeVisible:true,secondsVisible:false},handleScroll:{vertTouchDrag:false}});
    const series=api.addSeries(CandlestickSeries,{upColor:'#10b981',downColor:'#f87171',borderVisible:false,wickUpColor:'#10b981',wickDownColor:'#f87171'});
    series.setData([{time:candle.t/1000 as UTCTimestamp,open:candle.o,high:candle.h,low:candle.l,close:candle.c}]);
    for(const [title,price,color] of [
      ['Signal candle',candle.c,'#e2e8f0'],['Prior 20-bar high',row.trigger,'#38bdf8'],['20-bar average',row.sma20,'#a78bfa'],
      ['Stop',row.stop,'#f87171'],['Max entry',row.maxEntry,'#fbbf24'],
    ] as const) if(typeof price==='number'&&Number.isFinite(price)) series.createPriceLine({price,color,lineWidth:2,axisLabelVisible:true,title});
    api.timeScale().fitContent();
    return ()=>api.remove();
  },[row]);
  return <section aria-label={`${row.symbol??row.id} volume rule chart`} className="space-y-2">
    <h3 className="text-base">{row.symbol??row.id} · {label}</h3>
    <div ref={container} role="img" aria-label={`${row.symbol??row.id} signal candle with the 4-hour volume rule`} className="h-[280px] w-full" />
    <p className="text-xs text-slate-400">Signal candle {row.asOf??'—'} · Prior 20-bar high {fmt(row.trigger)} · 20-bar average {fmt(row.sma20)} · Stop {fmt(row.stop)} · Max entry {fmt(row.maxEntry)}</p>
    {!row.sma20&&<p className="text-xs text-slate-400">20-bar average was not stored on this saved scan. Prior high, stop and max entry are the saved rule levels.</p>}
  </section>;
}
export default function CryptoReviewChart({chart,review,base,onLabel}:{chart:MomentumChart|null;review:MomentumReview;base?:BaseReview|null;onLabel?:(label:string|null)=>void}) {
  const container=useRef<HTMLDivElement>(null);
  const [timeframe,setTimeframe]=useState<'hourly'|'fourHourly'|'daily'>('fourHourly');
  const [rule,setRule]=useState<RuleRow|null>(null);
  const bars=chart?.[timeframe];
  useEffect(()=>{const c=new AbortController();
    void fetch('/api/admin/crypto-markets/momentum',{cache:'no-store',signal:c.signal}).then(async r=>r.ok?r.json():null).then(body=>{
      const row=(body?.scan?.rows as RuleRow[]|undefined)?.find(x=>x.id===review.coinId||x.symbol===review.symbol);
      const next=row?.stage==='MOMENTUM_VOLUME'?row:null;
      if(!c.signal.aborted){setRule(next);onLabel?.(next?setupDisplayLabel(next,review.levels?.entry):null);}
    }).catch(()=>{});
    return ()=>{c.abort();onLabel?.(null);};
  },[review.coinId,review.symbol,review.levels,onLabel]);
  useEffect(()=>{
    if(!container.current || !bars?.length) return;
    const api=createChart(container.current,{autoSize:true,height:400,
      layout:{background:{type:ColorType.Solid,color:'#0f172a'},textColor:'#cbd5e1'},
      grid:{vertLines:{color:'#1e293b'},horzLines:{color:'#1e293b'}},
      timeScale:{timeVisible:true,secondsVisible:false},handleScroll:{vertTouchDrag:false}});
    const smallest=Math.min(...bars.map(b=>b.l));
    const precision=Math.min(12,Math.max(2,3-Math.floor(Math.log10(smallest))));
    const series=api.addSeries(CandlestickSeries,{upColor:'#10b981',downColor:'#f87171',borderVisible:false,
      wickUpColor:'#10b981',wickDownColor:'#f87171',priceFormat:{type:'price',precision,minMove:10**-precision}});
    series.setData(bars.map(b=>({time:b.t/1000 as UTCTimestamp,open:b.o,high:b.h,low:b.l,close:b.c})));
    const levels=review.levels;
    if(levels) for(const [title,price,color] of [
      ['Observed quote',levels.entry,'#e2e8f0'],['Trigger',levels.trigger,'#38bdf8'],
      ['Maximum entry',levels.maxEntry,'#fbbf24'],['Structural stop',levels.stop,'#f87171'],
      ['Model 2R target',levels.target,'#10b981'],
    ] as const) series.createPriceLine({price,color,lineWidth:1,axisLabelVisible:true,title});
    if(rule&&timeframe==='fourHourly') for(const [title,price,color] of [
      ['Signal candle',rule.signal?.c??rule.close,'#e2e8f0'],['Prior 20-bar high',rule.trigger,'#38bdf8'],['20-bar average',rule.sma20,'#a78bfa'],
      ['Stop',rule.stop,'#f87171'],['Max entry',rule.maxEntry,'#fbbf24'],
    ] as const) if(typeof price==='number') series.createPriceLine({price,color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title});
    if(base?.stage==='BASE'||base?.stage==='BREAKOUT_PRICE_ONLY'||base?.stage==='EXTENDED'||base?.stage==='FAILED_BREAKOUT') {
      if(base.high)series.createPriceLine({price:base.high,color:'#a78bfa',lineWidth:1,axisLabelVisible:true,title:'Base high'});
      if(base.low)series.createPriceLine({price:base.low,color:'#818cf8',lineWidth:1,axisLabelVisible:true,title:'Base low'});
    }
    api.timeScale().fitContent();
    return ()=>api.remove();
  },[bars,review,base,rule,timeframe]);
  return <section aria-label={`${review.symbol} price chart`} className="space-y-2 rounded border border-slate-700 p-3">
    <div className="flex flex-wrap items-center gap-2"><h3>{review.symbol} · {rule?setupDisplayLabel(rule,review.levels?.entry):'USD chart'}</h3>
      {(['hourly','fourHourly','daily'] as const).map((value,i)=><button key={value} type="button" aria-pressed={timeframe===value}
        onClick={()=>setTimeframe(value)} className={`rounded px-3 py-1 ${timeframe===value?'bg-emerald-700':'bg-slate-800'}`}>{['1h','4h','1D'][i]}</button>)}
    </div>
    {bars?.length?<div ref={container} role="img" aria-label={`${review.symbol} completed candles, ${timeframe}. Drag to pan and scroll to zoom.`} className="h-[400px] w-full" />:
      <p role="status">Chart unavailable: {chart?.error??'No completed candles returned.'}</p>}
    <p className="text-xs text-slate-400">CoinGecko aggregate USD prices · {bars?.length??0} completed candles · Times show candle closes in UTC. Drag to pan; scroll to zoom. 4h candles aggregate completed 1h bars. Switching timeframes uses the same saved history.</p>
    <p className="text-xs text-slate-400">{rule?`4h volume rule on this chart: signal candle, prior 20-bar high ${fmt(rule.trigger)}, 20-bar average ${fmt(rule.sma20)}, stop ${fmt(rule.stop)}, max entry ${fmt(rule.maxEntry)}. Label: ${setupDisplayLabel(rule,review.levels?.entry)}.` :review.levels?'Lines show research levels from this review, not orders.':'No proposed trade levels for this review.'} Candle volume is unavailable from this feed.</p>
  </section>;
}
