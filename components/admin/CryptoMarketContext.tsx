'use client';
import {useEffect,useState} from 'react';
import type {MarketContext} from '@/lib/admin/cryptoMarketContext';
export default function CryptoMarketContext({now}:{now:number}){
  const [data,setData]=useState<MarketContext|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(method:'GET'|'POST'){
    setBusy(true);setError('');
    try{const r=await fetch('/api/admin/crypto-markets/context',{method,cache:'no-store'}),body=await r.json();if(!r.ok)throw Error(body.error||'Context unavailable');setData(body.context);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  useEffect(()=>{void load('GET');},[]);
  const globalTime=Date.parse(data?.global?.updatedAt??'');
  return <section aria-label="Crypto market context" className="space-y-3 rounded border border-slate-700 p-4">
    <h2 className="text-xl">Further research · Market news & trending</h2>
    <div className="flex gap-3"><button disabled={busy} onClick={()=>void load('POST')} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-50">{busy?'Loading context…':'Refresh market context'}</button>
      <button disabled={busy} onClick={()=>void load('GET')} className="rounded border px-3 py-2">Load saved context</button></div>
    <p className="text-xs text-slate-400">Manual refresh: up to 3 CoinGecko requests, shared five-minute cooldown. Opening this section reads saved data only. Trending means search interest over 24 hours, not buying volume. Headlines cover the whole crypto market, not specifically the selected coin. Headlines and market context do not authorize trades.</p>
    {error&&<p role="alert" className="text-red-300">{error}</p>}
    {!data&&!busy&&<p>No saved context yet.</p>}
    {data&&<>
      <p>{now-Date.parse(data.fetchedAt)>15*60000?'STALE FETCH':'Fetched'} · {new Date(data.fetchedAt).toLocaleString()} · {data.requestAttempts} request attempts</p>
      {!!data.failures.length&&<p className="text-amber-300">Unavailable feeds: {data.failures.join(', ')}. Missing data is not zero.</p>}
      {data.global&&<p>BTC dominance: {data.global.btcDominance?.toFixed(2)??'Unavailable'}% · Total market cap 24h change: {data.global.capChange24h?.toFixed(2)??'Unavailable'}% · Provider updated: {data.global.updatedAt??'Unknown'} · {!Number.isFinite(globalTime)||now-globalTime>15*60000?'STALE / UNKNOWN':'Recent'}<br/>Dominance direction needs comparable historical snapshots; this snapshot alone cannot show falling dominance.</p>}
      <div className="grid gap-4 lg:grid-cols-2"><div><h3 className="font-bold">Trending searches</h3>
        <ul>{data.trending.map(c=><li key={c.id}>{c.name} ({c.symbol}) · <span className="text-slate-400">{c.id}</span></li>)}</ul>
        {!data.trending.length&&<p>{data.failures.includes('trending')?'Trending feed unavailable':'No trending coins returned'}</p>}
      </div><div><h3 className="font-bold">Latest headlines</h3><ul className="space-y-2">{data.news.map(n=><li key={n.url}>
        <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline">{n.title}</a>
        <p className="text-xs text-slate-400">{n.source} · {new Date(n.postedAt).toLocaleString()}{now-Date.parse(n.postedAt)>86400000?' · Older than 24h':''}</p></li>)}</ul>
        {!data.news.length&&<p>{data.failures.includes('news')?'News feed unavailable':'No valid headlines returned'}</p>}
      </div></div>
    </>}
  </section>;
}
