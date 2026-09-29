'use client';
import {useEffect,useRef,useState} from 'react';
import type {MomentumScan as BaseScan} from '@/lib/admin/cryptoVolumeMomentum';
export default function CryptoMomentumScanner({now,refreshVersion=0,hourly=false}:{now:number;refreshVersion?:number;hourly?:boolean}){
  const endpoint=hourly?'/api/admin/crypto-markets/early-momentum':'/api/admin/crypto-markets/momentum';
  const label=hourly?'1h':'4h';
  const [scan,setScan]=useState<BaseScan|null>(null),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;const controller=new AbortController();
    void fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);if(alive.current&&!controller.signal.aborted){setScan(b.scan);setError(b.warning??'');}}).catch(e=>{if(alive.current&&e.name!=='AbortError')setError('Saved momentum scan unavailable');});
    return()=>{alive.current=false;controller.abort();};},[refreshVersion,endpoint]);
  useEffect(()=>{
    if(!running)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const batch=async()=>{
      if(cancelled)return;
      if(document.hidden){setRunning(false);return;}
      setBusy(true);setError('');
      try{
        const r=await fetch(endpoint,{method:'POST'}),b=await r.json();
        if(cancelled||!alive.current)return;
        if(r.status===429){if(b.scan)setScan(b.scan);setError(b.error);if(b.scan?.version===1&&!b.scan.rows.some((row:{stage:string})=>row.stage==='PENDING'))setRunning(false);else timer=setTimeout(()=>void batch(),61000);return;}
        if(!r.ok)throw Error(b.error||'Momentum scan failed');
        setScan(b.scan);
        if(b.scan.rows.some((row:{stage:string})=>row.stage==='PENDING'))timer=setTimeout(()=>void batch(),61000);else setRunning(false);
      }catch(e){if(!cancelled&&alive.current){setError((e as Error).message);setRunning(false);}}
      finally{if(alive.current)setBusy(false);}
    };
    void batch();
    const hidden=()=>{if(document.hidden)setRunning(false);};document.addEventListener('visibilitychange',hidden);
    return()=>{cancelled=true;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',hidden);};
  },[running,endpoint]);
  const order={EARLY_WATCH:0,MOMENTUM_VOLUME:0,VOLUME_WATCH:1,EXTENDED:2,PENDING:3,NO_SIGNAL:4,UNAVAILABLE:5,EXCLUDED:6};
  const rows=scan?[...scan.rows].sort((a,b)=>order[a.stage]-order[b.stage]||(b.relativeVolume??0)-(a.relativeVolume??0)||a.id.localeCompare(b.id)):[];
  return <section aria-label={hourly?'Hourly early momentum watchlist':'Momentum and volume scanner'} className="space-y-3 rounded border border-sky-700 p-4">
    <h2 className="text-xl">{hourly?'1h early momentum watchlist':'4h momentum & volume'}</h2>
    <p>{hourly?'Early research only: completed hourly price and volume expansion. No paper entries or setup emails are generated from this watchlist.':'Independent setup: rising trend with a fresh breakout or continuation and increased candle volume. No daily base required.'}</p>
    <button disabled={busy&&!running} onClick={()=>setRunning(v=>!v)} className="rounded bg-sky-800 px-3 py-2">{running?`Pause ${label} scan`:`Start / resume ${label} scan`}</button>
    {hourly?<p className="text-xs text-slate-400">Runs with enabled background scans: up to 100 exchange requests per scheduled batch, capped at 300 coins per UTC hour (up to 7,200 requests/day). Manual batches use the same progress and limit: five requests per minute while visible. Reuses discovery up to four hours old; no extra CoinGecko or Alpha Vantage calls. Coverage is the saved discovery universe, not every listed coin. Refresh saved dashboard reads results only.</p>:<p className="text-xs text-slate-400">Manual scan: five exchange requests per batch, at least one minute apart, while this page is visible. An active batch may finish after pausing. Separate from the daily base scan: running both can use ten exchange requests per minute. Coinbase, Binance, KuCoin and OKX; no Alpha Vantage or CoinGecko candle calls. Enabled background scans continue every 15 minutes even when this page is closed. Use Refresh saved dashboard to see their latest progress. Refresh discovery for each new manual UTC 4h window.</p>}
    {busy&&<p>Checking next five momentum pairs…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
    {!scan&&!error&&<p>No saved {label} scan yet. Start a manual batch or wait for enabled background scans.</p>}
    {scan&&<>
      <p>{Math.floor(now/((hourly?1:4)*3600000))!==Math.floor(Date.parse(scan.startedAt)/((hourly?1:4)*3600000))?'OLD SCAN WINDOW · ':''}Saved {new Date(scan.updatedAt).toLocaleString()} · Started {new Date(scan.startedAt).toLocaleString()} · Discovery universe {new Date(scan.discoveryAt).toLocaleString()}</p>
      <p>{Object.keys(order).map(stage=>`${stage}: ${rows.filter(r=>r.stage===stage).length}`).join(' · ')}</p>
      <p className="text-xs text-slate-400">Volume ≥1.5× the preceding 20 completed {label} candles; close above a rising SMA20; either a 20-bar high breakout or ≥1% advance above the previous candle high. EXTENDED if more than 2.5 prior ATR above SMA20, 1 ATR past the breakout level, or signal range exceeds 3 ATR. Volume surges without upward confirmation are VOLUME_WATCH. Experimental research only: completed candle prices, not live entry quotes or trade permission.</p>
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[1250px] text-left text-sm"><thead><tr>{['Coin / venue','Setup',`${label} close / change`,'Volume ratio','20-bar high','Candle close time','Reason'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr className="border-t border-slate-700" key={r.id}><td className="p-2">{r.symbol} · {r.id}<br/>{r.pair?.exchange??'Unavailable'} · {r.pair?.product??'Unsupported'}<br/>Volume: {r.pair?.volumeUnit??'—'}</td><td>{r.stage}<br/>{r.kind??''}</td><td>{r.close?.toPrecision(5)??'—'} {r.pair?.quote??''}<br/>{r.changePct?.toFixed(2)??'—'}%</td><td>{r.relativeVolume?.toFixed(2)??'—'}×</td><td>{r.trigger?.toPrecision(5)??'—'}</td><td>{r.asOf??'—'}</td><td>{r.reason}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
