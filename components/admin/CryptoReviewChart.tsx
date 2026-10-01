'use client';
import {useEffect,useRef,useState} from 'react';
import {createChart,createSeriesMarkers,CandlestickSeries,HistogramSeries,ColorType,type UTCTimestamp,type MouseEventParams,type Time} from 'lightweight-charts';
import type {BaseReview} from '@/lib/admin/cryptoBase';
import type {MomentumChart,MomentumReview} from '@/lib/admin/cryptoMomentum';
import {setupDisplayLabel,type VolumeMomentum,type MomentumScanRow} from '@/lib/admin/cryptoVolumeMomentum';
import {catalystText,chartDetail,chartText,jevDetail,jevScored} from '@/lib/admin/cryptoJevEvidence';
type RuleRow=VolumeMomentum&{id?:string;symbol?:string;jev?:MomentumScanRow['jev'];catalyst?:MomentumScanRow['catalyst'];chart?:MomentumScanRow['chart'];shadow?:MomentumScanRow['shadow']};
const fmt=(n?:number|null)=>typeof n==='number'&&Number.isFinite(n)?n.toPrecision(6):'—';
const DARK={layout:{background:{type:ColorType.Solid,color:'#0f172a'},textColor:'#cbd5e1'},grid:{vertLines:{color:'#1e293b'},horzLines:{color:'#1e293b'}},timeScale:{timeVisible:true,secondsVisible:false},handleScroll:{vertTouchDrag:false}} as const;
const pricePrecision=(lows:number[])=>Math.min(12,Math.max(2,3-Math.floor(Math.log10(Math.max(1e-12,Math.min(...lows))))));
/** Rule levels in one place so both charts label them identically. */
function ruleLevels(row:RuleRow):Array<readonly [string,number|undefined,string,string]>{
 return [['Prior 20-bar high',row.trigger??undefined,'#38bdf8','High'],['20-bar average',row.sma20,'#a78bfa','SMA'],['Entry floor',row.entryFloor,'#34d399','Floor'],['Chase limit',row.maxEntry,'#fbbf24','Chase'],['Stop',row.stop,'#f87171','Stop'],['2R target',row.target,'#10b981','2R']] as const;
}
function EvidenceBadge({row}:{row:RuleRow}){
 const j=row.jev;
 const jev=!j?'Jev —':jevScored(j)?`Jev chase ${j.chase.toFixed(2)} · flow ${j.flowAgrees.toFixed(2)} · btc ${j.btcHeadwind.toFixed(2)}`:`Jev unavailable${j.reason?` · ${j.reason}`:''}`;
 return <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300"><span title={jevDetail(j)}>{jev}</span> · <span title={chartDetail(row.chart)}>Chart: {chartText(row.chart,true)}</span> · Catalyst: {catalystText(row.catalyst,true)}{row.shadow?` · Shadow ${row.shadow.score>=0?'+':''}${row.shadow.score.toFixed(2)}`:''}</span>;
}
type Readout={time:string;o:number;h:number;l:number;c:number;v:number|null;atrFromFloor:number|null;atrFromHigh:number|null};
/** One candle cannot be drawn as a chart; list the rule levels around the signal close instead. */
function LevelsLadder({row}:{row:RuleRow}){
 const close=typeof row.close==='number'&&Number.isFinite(row.close)?row.close:null;
 const atr=row.atr&&row.atr>0?row.atr:null;
 const rungs:Array<{title:string;price:number;color:string}>=ruleLevels(row).flatMap(([title,price,color])=>typeof price==='number'&&Number.isFinite(price)?[{title,price,color}]:[]);
 if(close!=null)rungs.push({title:'Signal close',price:close,color:'#e2e8f0'});
 rungs.sort((a,b)=>b.price-a.price);
 return <ol className="divide-y divide-slate-800 rounded border border-slate-700 text-sm tabular-nums">
  {rungs.map(r=><li key={r.title} className={`flex flex-wrap items-center gap-3 px-3 py-1.5 ${r.title==='Signal close'?'bg-slate-800/60 font-semibold':''}`}>
   <span className="inline-block h-2 w-6 rounded" style={{background:r.color}} aria-hidden/>
   <span className="w-44">{r.title}</span>
   <span>{fmt(r.price)}</span>
   {close!=null&&r.title!=='Signal close'&&<span className="text-xs text-slate-400">{((r.price-close)/close*100).toFixed(2)}% from close{atr?` · ${((r.price-close)/atr).toFixed(2)} ATR`:''}</span>}
  </li>)}
 </ol>;
}
export function VolumeRuleChart({row}:{row:RuleRow}){
  const container=useRef<HTMLDivElement>(null);
  const [readout,setReadout]=useState<Readout|null>(null);
  const label=setupDisplayLabel(row);
  const bars=row.bars?.length?row.bars:row.signal?[{...row.signal,v:NaN}]:row.close&&row.asOf?[{t:Date.parse(row.asOf),o:row.close,h:row.close,l:row.close,c:row.close,v:NaN}]:[];
  const hasVolume=bars.some(b=>Number.isFinite(b.v));
  const drawable=bars.length>1;
  useEffect(()=>{
    if(!container.current||!drawable||!Number.isFinite(bars[0].t))return;
    const api=createChart(container.current,{autoSize:true,height:hasVolume?360:280,...DARK});
    const precision=pricePrecision(bars.map(b=>b.l));
    const series=api.addSeries(CandlestickSeries,{upColor:'#10b981',downColor:'#f87171',borderVisible:false,wickUpColor:'#10b981',wickDownColor:'#f87171',priceFormat:{type:'price',precision,minMove:10**-precision}});
    series.setData(bars.map(b=>({time:b.t/1000 as UTCTimestamp,open:b.o,high:b.h,low:b.l,close:b.c})));
    if(hasVolume){
      series.priceScale().applyOptions({scaleMargins:{top:0.08,bottom:0.28}});
      const volume=api.addSeries(HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false});
      volume.priceScale().applyOptions({scaleMargins:{top:0.78,bottom:0}});
      volume.setData(bars.map(b=>({time:b.t/1000 as UTCTimestamp,value:b.v,color:b.c>=b.o?'#10b98188':'#f8717188'})));
    }
    for(const [,price,color,axis] of ruleLevels(row))if(typeof price==='number'&&Number.isFinite(price))series.createPriceLine({price,color,lineWidth:2,axisLabelVisible:true,title:axis});
    const last=bars[bars.length-1];
    createSeriesMarkers(series,[{time:last.t/1000 as UTCTimestamp,position:'belowBar',color:'#e2e8f0',shape:'arrowUp',text:`signal · ${row.relativeVolume?`${row.relativeVolume.toFixed(2)}× vol`:''}`}]);
    const onMove=(p:MouseEventParams<Time>)=>{
      const d=p.seriesData.get(series) as {open:number;high:number;low:number;close:number}|undefined;
      if(!p.time||!d){setReadout(null);return;}
      const t=(p.time as number)*1000,bar=bars.find(b=>b.t===t);
      const atr=row.atr&&row.atr>0?row.atr:null;
      setReadout({time:new Date(t).toISOString(),o:d.open,h:d.high,l:d.low,c:d.close,v:bar&&Number.isFinite(bar.v)?bar.v:null,atrFromFloor:atr&&typeof row.entryFloor==='number'?(d.close-row.entryFloor)/atr:null,atrFromHigh:atr&&typeof row.trigger==='number'?(d.close-row.trigger)/atr:null});
    };
    api.subscribeCrosshairMove(onMove);
    api.timeScale().fitContent();
    api.timeScale().applyOptions({rightOffset:12});
    api.priceScale('right').applyOptions({minimumWidth:72});
    return ()=>{api.unsubscribeCrosshairMove(onMove);api.remove();};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[row]);
  return <section aria-label={`${row.symbol??row.id} volume rule chart`} className="space-y-2">
    <div className="flex flex-wrap items-center gap-2"><h3 className="text-base">{row.symbol??row.id} · {label}</h3><EvidenceBadge row={row}/></div>
    {drawable?<>
      <div ref={container} role="img" aria-label={`${row.symbol??row.id} completed 4-hour candles with the volume rule levels`} className={`${hasVolume?'h-[360px]':'h-[280px]'} w-full`} />
      <p className="text-xs text-slate-300 tabular-nums">{readout?`${readout.time} · O ${fmt(readout.o)} H ${fmt(readout.h)} L ${fmt(readout.l)} C ${fmt(readout.c)}${readout.v!=null?` · Vol ${readout.v.toLocaleString()}`:''}${readout.atrFromFloor!=null?` · ${readout.atrFromFloor>=0?'+':''}${readout.atrFromFloor.toFixed(2)} ATR from entry floor`:''}${readout.atrFromHigh!=null?` · ${readout.atrFromHigh>=0?'+':''}${readout.atrFromHigh.toFixed(2)} ATR from prior high`:''}`:'Hover a candle for OHLC, volume, and distance from the rule levels in ATR.'}</p>
    </>:<>
      <LevelsLadder row={row}/>
      <p className="text-xs text-slate-400">Levels only: this saved scan carries just the signal candle. The next batch in a new 4h window stores the 25 candles the rule read, with volume, and the chart draws here.</p>
    </>}
    <p className="text-xs text-slate-400">Signal candle {row.asOf??'—'}{row.atr?` · ATR ${fmt(row.atr)}`:''}{drawable?` · Prior 20-bar high ${fmt(row.trigger)} · 20-bar average ${fmt(row.sma20)} · Entry floor ${fmt(row.entryFloor)} · Chase limit ${fmt(row.maxEntry)} · Stop ${fmt(row.stop)} · 2R target ${fmt(row.target)}`:''}</p>
    {!row.sma20&&<p className="text-xs text-slate-400">20-bar average was not stored on this saved scan. Prior high, stop and max entry are the saved rule levels.</p>}
  </section>;
}
export default function CryptoReviewChart({chart,review,base,onLabel}:{chart:MomentumChart|null;review:MomentumReview;base?:BaseReview|null;onLabel?:(label:string|null)=>void}) {
  const container=useRef<HTMLDivElement>(null);
  const [timeframe,setTimeframe]=useState<'hourly'|'fourHourly'|'daily'>('fourHourly');
  const [rule,setRule]=useState<RuleRow|null>(null);
  const [readout,setReadout]=useState<{time:string;o:number;h:number;l:number;c:number}|null>(null);
  const bars=chart?.[timeframe];
  useEffect(()=>{const c=new AbortController();
    void fetch('/api/admin/crypto-markets/momentum',{cache:'no-store',signal:c.signal}).then(async r=>r.ok?r.json():null).then(body=>{
      const row=(body?.scan?.rows as RuleRow[]|undefined)?.find(x=>x.id===review.coinId||x.symbol===review.symbol);
      const next=row&&['MOMENTUM_VOLUME','VOLUME_WATCH','EXTENDED'].includes(row.stage)?row:null;
      if(!c.signal.aborted){setRule(next);onLabel?.(next?.stage==='MOMENTUM_VOLUME'?setupDisplayLabel(next,review.levels?.entry):null);}
    }).catch(()=>{});
    return ()=>{c.abort();onLabel?.(null);};
  },[review.coinId,review.symbol,review.levels,onLabel]);
  useEffect(()=>{
    if(!container.current || !bars?.length) return;
    const api=createChart(container.current,{autoSize:true,height:400,...DARK});
    const precision=pricePrecision(bars.map(b=>b.l));
    const series=api.addSeries(CandlestickSeries,{upColor:'#10b981',downColor:'#f87171',borderVisible:false,
      wickUpColor:'#10b981',wickDownColor:'#f87171',priceFormat:{type:'price',precision,minMove:10**-precision}});
    series.setData(bars.map(b=>({time:b.t/1000 as UTCTimestamp,open:b.o,high:b.h,low:b.l,close:b.c})));
    const levels=review.levels;
    if(levels) for(const [title,price,color] of [
      ['Observed quote',levels.entry,'#e2e8f0'],['Trigger',levels.trigger,'#38bdf8'],
      ['Maximum entry',levels.maxEntry,'#fbbf24'],['Structural stop',levels.stop,'#f87171'],
      ['Model 2R target',levels.target,'#10b981'],
    ] as const) series.createPriceLine({price,color,lineWidth:1,axisLabelVisible:true,title});
    if(rule&&timeframe==='fourHourly') for(const [,price,color,axis] of ruleLevels(rule)) if(typeof price==='number'&&Number.isFinite(price)) series.createPriceLine({price,color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title:axis});
    if(base?.stage==='BASE'||base?.stage==='BREAKOUT_PRICE_ONLY'||base?.stage==='EXTENDED'||base?.stage==='FAILED_BREAKOUT') {
      if(base.high)series.createPriceLine({price:base.high,color:'#a78bfa',lineWidth:1,axisLabelVisible:true,title:'Base high'});
      if(base.low)series.createPriceLine({price:base.low,color:'#818cf8',lineWidth:1,axisLabelVisible:true,title:'Base low'});
    }
    const markers:Parameters<typeof createSeriesMarkers<Time>>[1]=[];
    const last=bars[bars.length-1];
    markers.push({time:last.t/1000 as UTCTimestamp,position:'aboveBar',color:'#94a3b8',shape:'circle',text:'last completed'});
    const signalT=rule?.signal?.t;
    if(signalT&&timeframe==='fourHourly'&&bars.some(b=>b.t===signalT))markers.push({time:signalT/1000 as UTCTimestamp,position:'belowBar',color:'#e2e8f0',shape:'arrowUp',text:'4h signal'});
    createSeriesMarkers(series,markers.sort((a,b)=>(a.time as number)-(b.time as number)));
    const onMove=(p:MouseEventParams<Time>)=>{const d=p.seriesData.get(series) as {open:number;high:number;low:number;close:number}|undefined;if(!p.time||!d){setReadout(null);return;}setReadout({time:new Date((p.time as number)*1000).toISOString(),o:d.open,h:d.high,l:d.low,c:d.close});};
    api.subscribeCrosshairMove(onMove);
    api.timeScale().fitContent();
    api.timeScale().applyOptions({rightOffset:12});
    api.priceScale('right').applyOptions({minimumWidth:72});
    return ()=>{api.unsubscribeCrosshairMove(onMove);api.remove();};
  },[bars,review,base,rule,timeframe]);
  const stale=Date.now()-Date.parse(review.reviewedAt)>15*60000;
  return <section aria-label={`${review.symbol} price chart`} className="space-y-2 rounded border border-slate-700 p-3">
    <div className="flex flex-wrap items-center gap-2"><h3>{review.symbol} · {rule?.stage==='MOMENTUM_VOLUME'?setupDisplayLabel(rule,review.levels?.entry):rule?`4h ${rule.stage}`:'USD chart'}</h3>
      {rule&&<EvidenceBadge row={rule}/>}
      {(['hourly','fourHourly','daily'] as const).map((value,i)=><button key={value} type="button" aria-pressed={timeframe===value}
        onClick={()=>setTimeframe(value)} className={`rounded px-3 py-1 ${timeframe===value?'bg-emerald-700':'bg-slate-800'}`}>{['1h','4h','1D'][i]}</button>)}
      {stale&&<span className="text-xs text-amber-300">review {Math.round((Date.now()-Date.parse(review.reviewedAt))/60000)} min old</span>}
    </div>
    {bars?.length?<div ref={container} role="img" aria-label={`${review.symbol} completed candles, ${timeframe}. Drag to pan and scroll to zoom.`} className="h-[400px] w-full" />:
      <p role="status" className="rounded border border-amber-700 p-3 text-amber-300">Chart unavailable: {chart?.error??'no completed candles were returned by CoinGecko for this coin and timeframe.'} {review.reasons[0]?`Review says: ${review.reasons[0]}.`:''} No substitute data is drawn.</p>}
    <p className="text-xs text-slate-300 tabular-nums">{readout?`${readout.time} · O ${fmt(readout.o)} H ${fmt(readout.h)} L ${fmt(readout.l)} C ${fmt(readout.c)}`:'Hover a candle for OHLC.'}</p>
    <p className="text-xs text-slate-400">CoinGecko aggregate USD prices · {bars?.length??0} completed candles · Times show candle closes in UTC. Drag to pan; scroll to zoom. 4h candles aggregate completed 1h bars. Switching timeframes uses the same saved history. Candle volume is not in this feed; use Validate Coinbase volume below for exchange volume.</p>
    <p className="text-xs text-slate-400">{rule?`4h volume rule on this chart (dashed): prior 20-bar high ${fmt(rule.trigger)}, 20-bar average ${fmt(rule.sma20)}, entry floor ${fmt(rule.entryFloor)}, chase limit ${fmt(rule.maxEntry)}, stop ${fmt(rule.stop)}. Label: ${rule.stage==='MOMENTUM_VOLUME'?setupDisplayLabel(rule,review.levels?.entry):rule.stage}.` :review.levels?'Lines show research levels from this review, not orders.':'No proposed trade levels for this review.'}</p>
  </section>;
}
