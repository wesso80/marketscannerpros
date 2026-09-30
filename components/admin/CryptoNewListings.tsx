'use client';
import {useEffect,useState} from 'react';
import type {Listing} from '@/lib/admin/cryptoNewListingsJob';
import type {TickerCheck} from '@/lib/admin/cryptoNewListings';
type View={error?:string;config:{everyMinutes:number;liquid:{minVolumeUsd:number;maxSpreadPct:number;minDepthUsd:number};concentration:{top10Pct:number;top1Pct:number}};lastRunAt:string|null;lastListAt:string|null;lastError:string|null;callsLastRun:number;webhookEvents:number;webhookUnparsed:{at:string;keys:string[]}[];webhookEnabled:boolean;listings:Listing[]};
const usd=(n:number|null|undefined)=>n==null?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(0)}k`:`$${n.toFixed(0)}`;
const liqTone={LIQUID:'text-emerald-300',THIN:'text-amber-300',NO_USABLE_TICKERS:'text-red-300',UNAVAILABLE:'text-slate-400'};
function Liq({t}:{t?:TickerCheck}){
 if(!t)return <span className="text-slate-400">pending</span>;
 return <span title={t.reason}><span className={liqTone[t.liquidity]}>{t.liquidity}</span><br/><span className="text-xs text-slate-400">{usd(t.totalVolumeUsd)} vol · best spread {t.bestSpreadPct==null?'—':`${t.bestSpreadPct.toFixed(2)}%`}</span></span>;
}
export default function CryptoNewListings({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call(run=false){
  setBusy(true);setError('');
  try{const r=await fetch('/api/admin/crypto-markets/new-listings',{method:run?'POST':'GET',cache:'no-store',...(run?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'run'})}:{})}),b=await r.json();if(b.listings)setData(b);if(!r.ok)throw Error(b.error||'New listings unavailable');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void call();},[refreshVersion]);
 const stale=data?.lastListAt?Date.now()-Date.parse(data.lastListAt)>2*60*60000:true;
 return <section aria-label="New CoinGecko listings" className="space-y-2 rounded border border-slate-700 p-3">
  <h3 className="font-semibold">New listings · CoinGecko · RESEARCH ONLY</h3>
  <p className="text-xs">Source: CoinGecko /coins/list/new (latest 200, checked hourly), /coins/&#123;id&#125;/tickers, /coins/&#123;id&#125;, onchain top holders (Beta) · list updated {data?.lastListAt?<span className={stale?'text-red-300':'text-slate-400'}>{new Date(data.lastListAt).toLocaleString()}{stale?' · STALE':''}</span>:<span className="text-amber-300">never</span>} · fallback/simulation: none</p>
  <p className="text-xs text-slate-400">Tickers are matched by CoinGecko id and exchange, never by symbol; stale or anomalous tickers are excluded. LIQUID = at least one venue with ≥ {usd(data?.config.liquid.minVolumeUsd)} 24h volume, ≤ {data?.config.liquid.maxSpreadPct}% spread and ≥ {usd(data?.config.liquid.minDepthUsd)} 2% depth each side (when reported). Concentration flag: top 10 holders ≥ {data?.config.concentration.top10Pct}% or top holder ≥ {data?.config.concentration.top1Pct}% (labelled exchange/LP/burn wallets included). Liquidity is rechecked once after 24h. New listings are high-risk; this is not a buy list.</p>
  <div className="flex gap-3"><button disabled={busy} onClick={()=>void call(true)} className="rounded border px-3 py-1 text-sm">Run now (max every 10 min)</button><button disabled={busy} onClick={()=>void call()} className="rounded border px-3 py-1 text-sm">Reload saved</button></div>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {data&&<>
   <p className="text-xs text-slate-400">Last run {data.lastRunAt?new Date(data.lastRunAt).toLocaleString():'never'} · {data.callsLastRun} CoinGecko calls{data.lastError?<span className="text-amber-300"> · {data.lastError}</span>:''} · webhook cg.coin.listed: {data.webhookEnabled?`ENABLED (${data.webhookEvents} events received)`:'OFF (set CG_WEBHOOK_SECRET; private beta)'}{data.webhookUnparsed.length?` · ${data.webhookUnparsed.length} event(s) without a recognisable coin id, keys: ${data.webhookUnparsed[0].keys.join(', ')}`:''}</p>
   {!data.listings.length?<p className="text-sm">No listings stored yet.</p>:<div className="overflow-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead><tr>{['Listed','Coin (CoinGecko id)','Liquidity at check','After 24h','Top exchanges (pair · 24h vol · spread)','Holders (top 1 / top 10)'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead>
    <tbody>{data.listings.map(l=><tr key={l.id} className="border-t border-slate-800 align-top">
     <td className="p-1">{l.activatedAt?new Date(l.activatedAt).toLocaleString():'—'}<br/><span className="text-xs text-slate-400">{l.source}</span></td>
     <td className="p-1">{l.name} {l.symbol&&`(${l.symbol})`}<br/><span className="text-xs text-slate-400">{l.id}</span>{l.error&&<><br/><span className="text-xs text-red-300">{l.error}</span></>}</td>
     <td className="p-1"><Liq t={l.tickers} /></td><td className="p-1"><Liq t={l.refreshedTickers} /></td>
     <td className="p-1 text-xs">{l.tickers?.exchanges.slice(0,3).map(e=><div key={`${e.exchange}${e.pair}`}>{e.name} · {e.pair} · {usd(e.volumeUsd)} · {e.spreadPct==null?'—':`${e.spreadPct.toFixed(2)}%`}</div>)??'—'}</td>
     <td className="p-1 text-xs">{l.holders?<span title={l.holders.note} className={l.holders.flag==='CONCENTRATED'?'text-red-300':l.holders.flag==='OK'?'':'text-slate-400'}>{l.holders.flag} · {l.holders.top1Pct==null?'—':`${l.holders.top1Pct.toFixed(1)}%`} / {l.holders.top10Pct==null?'—':`${l.holders.top10Pct.toFixed(1)}%`} · {l.holders.network}{l.holders.top[0]?.label?` · #1 ${l.holders.top[0].label}`:''}</span>:l.contract&&'reason' in l.contract?<span className="text-slate-400">{l.contract.reason}</span>:'—'}</td>
    </tr>)}</tbody></table></div>}
  </>}
 </section>;
}
