'use client';
import {useEffect,useRef,useState} from 'react';
import type {BaseScan} from '@/lib/admin/cryptoBaseScan';
export default function CryptoBaseScanner({now,refreshVersion=0}:{now:number;refreshVersion?:number}){
  const [scan,setScan]=useState<BaseScan|null>(null),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;const controller=new AbortController();
    void fetch('/api/admin/crypto-markets/bases',{cache:'no-store',signal:controller.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);if(alive.current&&!controller.signal.aborted){setScan(b.scan);setError('');}}).catch(e=>{if(alive.current&&e.name!=='AbortError')setError('Saved base scan unavailable');});
    return()=>{alive.current=false;controller.abort();};},[refreshVersion]);
  useEffect(()=>{
    if(!running)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const batch=async()=>{
      if(cancelled)return;
      if(document.hidden){setRunning(false);return;}
      setBusy(true);setError('');
      try{
        const r=await fetch('/api/admin/crypto-markets/bases',{method:'POST'}),b=await r.json();
        if(cancelled||!alive.current)return;
        if(r.status===429){if(b.scan)setScan(b.scan);setError(b.error);if(b.scan?.version===2&&!b.scan.rows.some((row:{stage:string})=>row.stage==='PENDING'))setRunning(false);else timer=setTimeout(()=>void batch(),61000);return;}
        if(!r.ok)throw Error(b.error||'Base scan failed');
        setScan(b.scan);
        if(b.scan.rows.some((row:{stage:string})=>row.stage==='PENDING'))timer=setTimeout(()=>void batch(),61000);else setRunning(false);
      }catch(e){if(!cancelled&&alive.current){setError((e as Error).message);setRunning(false);}}
      finally{if(alive.current)setBusy(false);}
    };
    void batch();
    const hidden=()=>{if(document.hidden)setRunning(false);};document.addEventListener('visibilitychange',hidden);
    return()=>{cancelled=true;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',hidden);};
  },[running]);
  const order={BASE:0,PENDING:1,NOT_BASE:2,UNAVAILABLE:3,EXCLUDED:4};
  const rows=scan?[...scan.rows].sort((a,b)=>order[a.stage]-order[b.stage]||a.id.localeCompare(b.id)):[];
  return <section aria-label="Daily base scanner" className="space-y-3 rounded border border-emerald-800 p-4">
    <h2 className="text-xl">Daily base watchlist</h2>
    <p className="text-sm">Scans supported Coinbase, Binance, KuCoin and OKX spot pairs for a tight 21-day range and contracting candle volume. Bases appear first, independent of momentum. Experimental watchlist; not entry permission.</p>
    <button disabled={busy&&!running} onClick={()=>setRunning(v=>!v)} className="rounded bg-emerald-800 px-3 py-2">{running?'Pause base scan':'Start / resume base scan'}</button>
    <p className="text-xs text-slate-400">Manual scan: five daily-candle requests per batch, at least one minute apart. The manual loop runs only while this page is visible; an active batch may finish after pausing. Enabled background scans continue every 15 minutes with this page closed. Use Refresh saved dashboard to see their latest progress. No CoinGecko or Alpha Vantage calls here. Kraken-only and unsupported pairs remain unavailable. One venue supplies each coin’s price and base-asset volume; USD, USDT and USDC prices retain their quote currency. Refresh discovery first when starting a new UTC day.</p>
    {busy&&<p>Checking next five pairs…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
    {scan&&<>
      <p>{now-Date.parse(scan.updatedAt)>26*3600000?'STALE · ':''}Saved {new Date(scan.updatedAt).toLocaleString()} · Discovery {new Date(scan.discoveryAt).toLocaleString()}</p>
      <p>{Object.keys(order).map(stage=>`${stage}: ${rows.filter(r=>r.stage===stage).length}`).join(' · ')}</p>
      <p className="text-xs text-slate-400">BASE: range ≤15%, SMA5/20 gap ≤3%, SMA20 three-day change ≤3%, latest 7-day mean volume / prior 14-day mean ≤0.70. Completed UTC days only. Missing or zero volume cannot pass. Coverage is frozen for this daily run; this does not monitor 4h breakouts.</p>
      <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Coin / venue pair','Stage','Range','Volume ratio','Daily close time','Reason'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr className="border-t border-slate-700" key={r.id}><td className="p-2">{r.symbol} · {r.id}<br/>{r.exchange??(r.product?'gdax':'Unavailable')} · {r.product??'Unsupported'}<br/>Price: {r.quote??(r.product?'USD':'—')} · Volume: {r.volumeUnit??r.symbol}</td><td>{r.stage}</td><td>{r.low?.toPrecision(5)??'—'} – {r.high?.toPrecision(5)??'—'}</td><td>{r.contraction?.toFixed(2)??'—'}×</td><td>{r.asOf??'—'}</td><td>{r.reason}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
