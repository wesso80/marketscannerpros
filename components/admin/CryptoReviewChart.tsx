'use client';
import {useEffect,useRef,useState} from 'react';
import {createChart,CandlestickSeries,ColorType,type UTCTimestamp} from 'lightweight-charts';
import type {BaseReview} from '@/lib/admin/cryptoBase';
import type {MomentumChart,MomentumReview} from '@/lib/admin/cryptoMomentum';

export default function CryptoReviewChart({chart,review,base}:{chart:MomentumChart|null;review:MomentumReview;base?:BaseReview|null}) {
  const container=useRef<HTMLDivElement>(null);
  const [timeframe,setTimeframe]=useState<'hourly'|'fourHourly'|'daily'>('fourHourly');
  const bars=chart?.[timeframe];
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
    if(base?.stage==='BASE'||base?.stage==='BREAKOUT_PRICE_ONLY'||base?.stage==='EXTENDED'||base?.stage==='FAILED_BREAKOUT') {
      if(base.high)series.createPriceLine({price:base.high,color:'#a78bfa',lineWidth:1,axisLabelVisible:true,title:'Base high'});
      if(base.low)series.createPriceLine({price:base.low,color:'#818cf8',lineWidth:1,axisLabelVisible:true,title:'Base low'});
    }
    api.timeScale().fitContent();
    return ()=>api.remove();
  },[bars,review,base]);
  return <section aria-label={`${review.symbol} price chart`} className="space-y-2 rounded border border-slate-700 p-3">
    <div className="flex flex-wrap items-center gap-2"><h3>{review.symbol} · USD chart</h3>
      {(['hourly','fourHourly','daily'] as const).map((value,i)=><button key={value} type="button" aria-pressed={timeframe===value}
        onClick={()=>setTimeframe(value)} className={`rounded px-3 py-1 ${timeframe===value?'bg-emerald-700':'bg-slate-800'}`}>{['1h','4h','1D'][i]}</button>)}
    </div>
    {bars?.length?<div ref={container} role="img" aria-label={`${review.symbol} completed candles, ${timeframe}. Drag to pan and scroll to zoom.`} className="h-[400px] w-full" />:
      <p role="status">Chart unavailable: {chart?.error??'No completed candles returned.'}</p>}
    <p className="text-xs text-slate-400">CoinGecko aggregate USD prices · {bars?.length??0} completed candles · Times show candle closes in UTC. Drag to pan; scroll to zoom. 4h candles aggregate completed 1h bars. Switching timeframes uses the same saved history.</p>
    <p className="text-xs text-slate-400">{review.levels?'Lines show research levels from this review, not orders.':'No proposed trade levels for this review.'} Candle volume is unavailable from this feed.</p>
  </section>;
}
