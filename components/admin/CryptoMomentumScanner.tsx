'use client';
import {useEffect,useRef,useState} from 'react';
import {setupDisplayLabel,type MomentumScan as BaseScan} from '@/lib/admin/cryptoVolumeMomentum';
import {catalystDetail,catalystText,jevCoverage,jevDetail} from '@/lib/admin/cryptoJevEvidence';
import {VolumeRuleChart} from '@/components/admin/CryptoReviewChart';
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
  const NAMED=['MOMENTUM_VOLUME','VOLUME_WATCH','EXTENDED','EARLY_WATCH'];
  const jevLines=(r:BaseScan['rows'][number])=>{
    const j=r.jev;
    if(!NAMED.includes(r.stage))return null;
    if(!j)return <span className="text-slate-500">—</span>;
    if(j.status!=='scored'||j.chase==null||j.flowAgrees==null||j.btcHeadwind==null)return <span title={jevDetail(j)}>unavailable{j.reason?` · ${j.reason}`:''}</span>;
    return <div className="space-y-0.5 tabular-nums" title={jevDetail(j)}><div>chase {j.chase.toFixed(2)}</div><div>flow {j.flowAgrees.toFixed(2)}</div><div>btc {j.btcHeadwind.toFixed(2)}</div></div>;
  };
  const rows=scan?[...scan.rows].sort((a,b)=>order[a.stage]-order[b.stage]||(b.relativeVolume??0)-(a.relativeVolume??0)||a.id.localeCompare(b.id)):[];
  const named=rows.filter(r=>NAMED.includes(r.stage)),jevCov=jevCoverage(named.map(r=>r.jev));
  const jevReasons=Object.entries(jevCov.reasons).map(([k,v])=>`${k} ${v}`).join(', ');
  return <section aria-label={hourly?'Hourly early momentum watchlist':'Momentum and volume scanner'} className="space-y-3 rounded border border-sky-700 p-4">
    <h2 className="text-xl">{hourly?'1h early momentum watchlist':'4h momentum & volume'}</h2>
    <p>{hourly?'Early research only: completed hourly price and volume expansion. No paper entries or setup emails are generated from this watchlist.':'Independent setup: rising trend with a fresh breakout or continuation and increased candle volume. No daily base required.'}</p>
    <button disabled={busy&&!running} onClick={()=>setRunning(v=>!v)} className="rounded bg-sky-800 px-3 py-2">{running?`Pause ${label} scan`:`Start / resume ${label} scan`}</button>
    {busy&&<p>Checking next five momentum pairs…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
    {!scan&&!error&&<p>No saved {label} scan yet. Start a manual batch or wait for enabled background scans.</p>}
    {scan&&<>
      <p>{Math.floor(now/((hourly?1:4)*3600000))!==Math.floor(Date.parse(scan.startedAt)/((hourly?1:4)*3600000))?<span className="text-amber-300">OLD SCAN WINDOW · </span>:''}Saved {new Date(scan.updatedAt).toLocaleString()} · Started {new Date(scan.startedAt).toLocaleString()} · Discovery universe {new Date(scan.discoveryAt).toLocaleString()}</p>
      <p className="text-sm">{Object.keys(order).flatMap(stage=>{const n=rows.filter(r=>r.stage===stage).length;const lead=hourly?'EARLY_WATCH':'MOMENTUM_VOLUME';return n>0||stage===lead?[`${stage} ${n}`]:[];}).join(' · ')}</p>
      {!!named.length&&<p className={jevCov.unscored||jevCov.unavailable?'text-xs text-amber-300':'text-xs text-slate-400'}>Jev shadow: {jevCov.scored} scored · {jevCov.unavailable} unavailable{jevReasons?` (${jevReasons})`:''} · {jevCov.unscored} without a stamp{jevCov.unscored?' (no gateway key, or the row is newer than the last Jev pass)':''}. Hover a Jev or Catalyst cell for scoring time, Bitcoin read, model, and headline detail.</p>}
      <details className="rounded border border-slate-700 p-3 text-xs text-slate-400"><summary className="cursor-pointer text-sm text-slate-300">Rule, evidence columns, and request budget</summary>
        <p className="mt-2"><b>Rule.</b> Volume ≥1.5× the preceding 20 completed {label} candles; close above a rising SMA20; either a 20-bar high breakout or ≥1% advance above the previous candle high. EXTENDED if more than 2.5 prior ATR above SMA20, 1 ATR past the breakout level, or signal range exceeds 3 ATR. Volume surges without upward confirmation are VOLUME_WATCH. Experimental research only: completed candle prices, not live entry quotes or trade permission.</p>
        <p className="mt-2"><b>Flow, Jev, and Catalyst.</b>{hourly?'':' MOMENTUM_VOLUME rows carry one OKX taker-flow stamp: aggressive buying, divergence, or unavailable.'} Named setups carry a Jev shadow (chase, flow, Bitcoin headwind; each a probability 0–1) and a Catalyst read of the last 48 hours of coin-tagged CoinGecko headlines (listing, supply event, exploit or outage, regulatory negative, narrative only). A coin with no coin-tagged headlines is recorded as no headlines, never as a no. All of it is evidence only: it does not block a setup and it does not open a trade. A failed call stays unavailable.</p>
        <p className="mt-2"><b>Requests.</b> {hourly?'Runs with enabled background scans: up to 100 exchange requests per scheduled batch, capped at 300 coins per UTC hour (up to 7,200 requests/day). Manual batches use the same progress and limit: five requests per minute while visible. Reuses discovery up to four hours old; no extra CoinGecko or Alpha Vantage calls. Coverage is the saved discovery universe, not every listed coin. Refresh saved dashboard reads results only.':'Manual scan: five exchange requests per batch, at least one minute apart, while this page is visible. An active batch may finish after pausing. Separate from the daily base scan: running both can use ten exchange requests per minute. Coinbase, Binance, KuCoin and OKX for candles. Named setups also fetch one CoinGecko /news call per coin for the catalyst stamp, cached four hours, capped at 40 calls per batch, and skipped while CoinGecko credits are below the pause threshold. No Alpha Vantage calls. Enabled background scans continue every 15 minutes even when this page is closed. Use Refresh saved dashboard to see their latest progress. Refresh discovery for each new manual UTC 4h window.'}</p>
      </details>
      <div className="max-h-[32rem] overflow-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr>{['Coin','Setup',`${label} close`,'Volume','20-bar high','Candle',...(hourly?[]:['Flow']),'Jev','Catalyst','Reason'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=>{const namedRow=NAMED.includes(r.stage);return <tr className="border-t border-slate-700 align-top" key={r.id}><td className="p-2">{r.symbol}<div className="text-xs text-slate-400">{r.pair?.exchange??'Unavailable'} · {r.pair?.product??'Unsupported'}</div></td><td className="p-2 whitespace-nowrap">{r.stage==='MOMENTUM_VOLUME'?setupDisplayLabel(r):r.stage}<div className="text-xs text-slate-400">{r.kind??''}</div></td><td className="p-2 tabular-nums">{r.close?.toPrecision(5)??'—'} {r.pair?.quote??''}<div>{r.changePct?.toFixed(2)??'—'}%</div></td><td className="p-2 tabular-nums">{r.relativeVolume?.toFixed(2)??'—'}×</td><td className="p-2 tabular-nums">{r.trigger?.toPrecision(5)??'—'}</td><td className="whitespace-nowrap p-2 text-xs">{r.asOf??'—'}</td>{!hourly&&<td className="p-2 text-xs">{r.stage==='MOMENTUM_VOLUME'?r.flowStamp?.stamp??'unavailable':'—'}</td>}<td className="p-2 text-xs">{jevLines(r)??'—'}</td><td className="p-2 text-xs" title={namedRow?catalystDetail(r.catalyst):undefined}>{namedRow?catalystText(r.catalyst,true):'—'}</td><td className="max-w-[240px] p-2 text-xs text-slate-400">{r.reason}</td></tr>;})}</tbody></table></div>
      {!hourly&&<div className="space-y-4">{rows.filter(r=>r.stage==='MOMENTUM_VOLUME').map(r=><VolumeRuleChart key={r.id} row={r}/>)}</div>}
    </>}
  </section>;
}
