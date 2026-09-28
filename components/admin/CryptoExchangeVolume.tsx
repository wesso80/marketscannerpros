'use client';
import {useEffect,useRef,useState} from 'react';
import {createChart,CandlestickSeries,HistogramSeries,ColorType,type UTCTimestamp} from 'lightweight-charts';
import type {ExchangeVolume} from '@/lib/admin/cryptoExchangeVolume';
export default function CryptoExchangeVolume({coinId,now}:{coinId:string;now:number}){
  const [data,setData]=useState<ExchangeVolume|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [timeframe,setTimeframe]=useState<'hourly'|'fourHourly'|'daily'>('fourHourly');
  const container=useRef<HTMLDivElement>(null),bars=data?.[timeframe];
  async function load(){setBusy(true);setError('');setData(null);
    try{const res=await fetch('/api/admin/crypto-markets/volume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({coinId})}),body=await res.json();if(!res.ok)throw Error(body.error||'Exchange review failed');setData(body.volume);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  useEffect(()=>{
    if(!container.current||!bars?.length||!data)return;
    const api=createChart(container.current,{height:430,autoSize:true,layout:{background:{type:ColorType.Solid,color:'#0f172a'},textColor:'#cbd5e1'},timeScale:{timeVisible:true},handleScroll:{vertTouchDrag:false}});
    const precision=Math.min(12,Math.max(2,3-Math.floor(Math.log10(Math.min(...bars.map(b=>b.l))))));
    const candles=api.addSeries(CandlestickSeries,{upColor:'#10b981',downColor:'#f87171',wickUpColor:'#10b981',wickDownColor:'#f87171',borderVisible:false,priceFormat:{type:'price',precision,minMove:10**-precision}});
    candles.priceScale().applyOptions({scaleMargins:{top:0.1,bottom:0.3}});
    candles.setData(bars.map(b=>({time:b.t/1000 as UTCTimestamp,open:b.o,high:b.h,low:b.l,close:b.c})));
    const volume=api.addSeries(HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false});
    volume.priceScale().applyOptions({scaleMargins:{top:0.8,bottom:0}});
    volume.setData(bars.map(b=>({time:b.t/1000 as UTCTimestamp,value:b.v,color:b.c>=b.o?'#10b98188':'#f8717188'})));
    if(data.base.stage!=='UNAVAILABLE'&&data.base.stage!=='WATCH')for(const [title,price] of [['Base high',data.base.high],['Base low',data.base.low]] as const)if(price)candles.createPriceLine({price,title,color:'#a78bfa',lineWidth:1,axisLabelVisible:true});
    api.timeScale().fitContent();return()=>api.remove();
  },[bars,data]);
  return <section aria-label="Exchange volume validation" className="space-y-3 rounded border border-emerald-800 p-4">
    <h3 className="text-xl">Exchange price & volume</h3>
    <button disabled={busy} onClick={()=>void load()} className="rounded bg-emerald-800 px-3 py-2 disabled:opacity-50">{busy?'Checking exchange…':'Validate Coinbase volume'}</button>
    <p className="text-xs text-slate-400">Manual check · Up to two public Coinbase requests, no CoinGecko credits. Coinbase USD pairs only in this version; ten reviews per shared 15-minute window. Price and volume come from the same pair, separately from the aggregate CoinGecko chart.</p>
    {error&&<p role="alert" className="text-amber-300">{error}</p>}
    {data&&<>
      <p>{data.product} · Coinbase · {now-Date.parse(data.fetchedAt)>15*60000?'STALE REVIEW':'Research only'} · Fetched {new Date(data.fetchedAt).toLocaleString()}</p>
      <p>Price base: {data.base.stage} · {data.base.reason}</p>
      <p>Latest closed 4h volume: {data.latestVolume.toLocaleString()} {data.volumeUnit} · Prior 20-candle average: {data.averageVolume.toLocaleString()} {data.volumeUnit} · Relative volume: {data.relativeVolume===null?'Unavailable':`${data.relativeVolume.toFixed(2)}×`}</p>
      <p>Pre-breakout daily volume ratio: {data.contractionRatio===null?'Unavailable':`${data.contractionRatio.toFixed(2)}×`} (last 7 days / preceding 14 days, excluding days overlapping the latest 4h candle).</p>
      <p>{data.priceAndVolumeBreakout?'PRICE + VOLUME PATTERN MATCH':'No complete price + volume pattern match'} · Experimental thresholds: 4h volume ≥1.5× and prior daily contraction ≤0.7×, plus a fresh price-base breakout.</p>
      <p className="text-xs text-slate-400">Assessment uses the last completed 4h close, not a current executable quote. Market regime, current entry distance, fees and account risk still need checks. This is not paper-trade permission. Volume is base-asset units on Coinbase only, not total crypto-market volume.</p>
      <div className="flex gap-2">{(['hourly','fourHourly','daily'] as const).map((tf,i)=><button key={tf} aria-pressed={timeframe===tf} onClick={()=>setTimeframe(tf)} className={`rounded px-3 py-1 ${timeframe===tf?'bg-emerald-700':'bg-slate-800'}`}>{['Exchange 1h','Exchange 4h','Exchange 1D'][i]}</button>)}</div>
      <div ref={container} role="img" aria-label={`${data.product} Coinbase candles and volume`} className="h-[430px] w-full" />
      <p className="text-xs text-slate-400">{bars?.length} completed candles · UTC candle-close times · Last close: {bars?.at(-1)?new Date(bars.at(-1)!.t).toISOString():'Unavailable'} · Switching timeframes makes no requests.</p>
    </>}
  </section>;
}
