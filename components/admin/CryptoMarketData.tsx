'use client';
import {useEffect,useState} from 'react';
import type {DerivRow,CategoryRow,MoverRow,TrendingRow,GlobalPoint} from '@/lib/admin/cryptoMarketData';
import type {CgBudget} from '@/lib/admin/cgCredits';
import {COMPRESSION_STRONG_SCORE,sortCompressionRows,type CompressionRow,type CompressionWindow} from '@/lib/admin/cryptoCompression';
import CryptoNewListings from './CryptoNewListings';
type Status={ok:boolean;at:string;skipped?:string;error?:string;calls:number};
type View={error?:string;config:Record<string,number>;status:{status:Record<string,Status>;lastRunAt:string|null};budget:CgBudget|null;
 derivatives:{at:string;source:string;exchanges:number;tickers:number;dayAgoAt:string|null;flagged:DerivRow[];topFunding:DerivRow[];topOiChange:DerivRow[]}|null;
 global:{latest:GlobalPoint;btcDomChange24h:number|null;btcDomChange7d:number|null;mcapChange24hPct:number|null;mcapChange7dPct:number|null;altsNote:string}|null;
 categories:{at:string;rows:CategoryRow[];historyDays:number}|null;
 movers:{at:string;h1:{gainers:MoverRow[];losers:MoverRow[]}|null;h24:{gainers:MoverRow[];losers:MoverRow[]}|null}|null;
 trending:{at:string;rows:TrendingRow[]}|null;
 relativeStrength?:{saved:boolean;source:string;rule:string;checkedAt:string|null;asOf:string|null;stale:boolean;coins:number;leaders:{id:string;symbol:string;excess:number|null;tercile:string;rule:string}[];failed:string[]}|null;
 compression?:{updatedAt:string|null;rows:CompressionRow[];rule:string;note:string}|null};
const usd=(n:number|null|undefined)=>n==null?'—':n>=1e12?`$${(n/1e12).toFixed(2)}T`:n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(1)}M`:`$${n.toLocaleString(undefined,{maximumFractionDigits:4})}`;
const pct=(n:number|null|undefined,d=1)=>n==null?'—':`${n>=0?'+':''}${n.toFixed(d)}%`;
const tone=(n:number|null|undefined)=>n==null?'':n>0?'text-emerald-300':n<0?'text-red-300':'';
/** Freshness: stale when older than twice the source's cadence. */
const CADENCE:Record<string,number>={derivatives:15,global:15,categories:15,movers:15,trending:60};
function Fresh({at,cadence,now}:{at:string|null|undefined;cadence:number;now:number}){
 if(!at)return <span className="text-amber-300">NO DATA</span>;
 const m=(now-Date.parse(at))/60000;return <span className={m>2*cadence?'text-red-300':'text-slate-400'}>{new Date(at).toLocaleString()} · {m>2*cadence?'STALE':'fresh'} ({Math.round(m)} min)</span>;
}
function Panel({title,source,at,cadence,now,children}:{title:string;source:string;at?:string|null;cadence:number;now:number;children:React.ReactNode}){
 return <section className="space-y-2 rounded border border-slate-700 p-3"><h3 className="font-semibold">{title}</h3>
  <p className="text-xs">Source: {source} · updated <Fresh at={at} cadence={cadence} now={now} /> · fallback/simulation: none</p>{children}</section>;
}
function Movers({title,rows}:{title:string;rows:MoverRow[]|undefined}){
 return <div className="overflow-auto"><h4 className="text-sm font-semibold">{title}</h4>{!rows?.length?<p className="text-sm">Unavailable.</p>:<table className="w-full min-w-[420px] text-left text-sm"><thead><tr>{['Coin','Change','Price','24h volume','Rank'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead>
  <tbody>{rows.slice(0,12).map(r=><tr key={r.id} className="border-t border-slate-800"><td className="p-1" title={r.id}>{r.symbol}</td><td className={`p-1 ${tone(r.changePct)}`}>{pct(r.changePct)}</td><td className="p-1">{usd(r.priceUsd)}</td><td className="p-1">{usd(r.volume24hUsd)}</td><td className="p-1">{r.marketCapRank??'—'}</td></tr>)}</tbody></table>}</div>;
}
function CompCell({w}:{w:CompressionWindow}){
 if(w.status==='not enough data'||w.score==null)return <span className="text-slate-500">not enough data</span>;
 return <span className={w.status==='quiet'?'text-emerald-300':''}>{w.status==='quiet'?'quiet':'not quiet'} · {w.score.toFixed(1)}</span>;
}
function CompressionFlags({board,now}:{board:NonNullable<View['compression']>|null|undefined;now:number}){
 const [desc,setDesc]=useState(true);
 const rows=sortCompressionRows(board?.rows??[],desc);
 const quiet=rows.filter(r=>r.status==='quiet').length,strong=rows.filter(r=>r.strong).length,missing=rows.filter(r=>r.status==='not enough data').length;
 const factor=(n:number|null|undefined,d=2)=>n==null?'not enough data':n.toFixed(d);
 return <Panel title="Compression flags" source="exchange daily candles, saved with the daily base batch" at={board?.updatedAt} cadence={13*60} now={now}>
  <p className="text-xs text-slate-400">{board?.rule}</p>
  <p className="text-xs text-slate-400">{board?.note}</p>
  {!rows.length?<p>No saved daily candle batch yet. Not enough data.</p>:<>
   <p className="text-sm">{quiet} quiet · {strong} highlighted (quiet and score ≥ {COMPRESSION_STRONG_SCORE}) · {missing} not enough data · {rows.length} coins. Ranked by compression score. Research only. Nothing here places an order or filters an entry.</p>
   <div className="max-h-96 overflow-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead><tr>
    <th className="p-1">Coin</th>
    <th className="p-1"><button type="button" onClick={()=>setDesc(v=>!v)} className="underline" aria-label="Sort by compression score">Compression {desc?'↓':'↑'}</button></th>
    {['21d','45d','90d','Width','Range vs prior','ATR vs prior','Volume'].map(h=><th key={h} className="p-1">{h}</th>)}
   </tr></thead><tbody>{rows.map(row=>{const cell=(days:21|45|90)=>row.windows.find(w=>w.days===days)??{days,status:'not enough data' as const,score:null,widthPct:null,rangeRatio:null,atrRatio:null,volumeRatio:null};const chosen=row.window==null?null:cell(row.window);return <tr key={row.id} className={`border-t border-slate-800 ${row.strong?'bg-emerald-900/50':''}`}><td className="p-1">{row.symbol}<div className="text-xs text-slate-500">{row.id}{row.product?` · ${row.exchange??''} ${row.product}`:''}</div></td><td className="p-1" title={row.reason}>{row.status==='not enough data'||row.score==null?<span className="text-slate-500">not enough data</span>:<span className={row.strong?'font-semibold text-emerald-200':row.status==='quiet'?'text-emerald-300':''}>{row.status==='quiet'?`QUIET ${row.window}d · ${row.score.toFixed(1)}`:`not quiet · ${row.score.toFixed(1)}`}</span>}</td><td className="p-1"><CompCell w={cell(21)} /></td><td className="p-1"><CompCell w={cell(45)} /></td><td className="p-1"><CompCell w={cell(90)} /></td><td className="p-1">{chosen?.widthPct==null?'not enough data':`${factor(chosen.widthPct)}%`}</td><td className="p-1">{factor(chosen?.rangeRatio)}</td><td className="p-1">{factor(chosen?.atrRatio)}</td><td className="p-1">{factor(chosen?.volumeRatio)}</td></tr>;})}</tbody></table></div>
  </>}
 </Panel>;
}
function DerivTable({rows}:{rows:DerivRow[]}){
 return <div className="overflow-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr>{['Coin','Funding /8h','State','Open interest','OI 24h','Basis','Venues','Flags'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead>
  <tbody>{rows.map(r=><tr key={r.base} className="border-t border-slate-800"><td className="p-1">{r.base}</td><td className={`p-1 ${tone(r.fundingRate)}`}>{r.fundingRate==null?'—':`${(r.fundingRate*100).toFixed(4)}%`}</td><td className="p-1">{r.fundingState}</td><td className="p-1">{usd(r.oiUsd)}</td><td className={`p-1 ${tone(r.oiChange24hPct)}`}>{pct(r.oiChange24hPct)}</td><td className="p-1">{pct(r.basisPct,2)}</td><td className="p-1">{r.venues}{r.outliersExcluded?` (${r.outliersExcluded} outlier excluded)`:''}</td><td className="p-1 text-amber-300">{r.flags.join(' ')}</td></tr>)}</tbody></table></div>;
}
export default function CryptoMarketData({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sort,setSort]=useState<'24h'|'7d'>('24h');
 const now=Date.now();
 async function call(run=false){
  setBusy(true);setError('');
  try{const r=await fetch('/api/admin/crypto-markets/market-data',{method:run?'POST':'GET',cache:'no-store',...(run?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'run'})}:{})}),b=await r.json();
   if(b.status)setData(b);if(!r.ok)throw Error(b.error||'Market data unavailable');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void call();},[refreshVersion]);
 const b=data?.budget,st=data?.status.status??{},cats=[...(data?.categories?.rows??[])].sort((x,y)=>((sort==='24h'?y.change24hPct:y.change7dPct)??-Infinity)-((sort==='24h'?x.change24hPct:x.change7dPct)??-Infinity));
 return <section aria-label="CoinGecko market data" className="space-y-3 rounded border border-teal-700 p-4">
  <h2 className="text-xl">Market data · CoinGecko · RESEARCH ONLY</h2>
  <p className="text-sm">Collected on the existing 15-minute paper schedule (trending hourly). Context for research and paper evidence; nothing here places orders or filters entries.</p>
  <div className="flex gap-3"><button disabled={busy} onClick={()=>void call(true)} className="rounded bg-teal-800 px-3 py-2 disabled:opacity-50">Refresh now (max every 5 min)</button><button disabled={busy} onClick={()=>void call()} className="rounded border px-3 py-2">Reload saved</button></div>
  {busy&&<p>Loading…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {data&&<>
   <section className={`space-y-1 rounded border p-3 ${b?.pauseNonEssential?'border-red-600':'border-slate-700'}`}>
    <h3 className="font-semibold">CoinGecko credits</h3>
    {!b?<p>Credit status unavailable.</p>:<>
     <p>{b.remaining.toLocaleString()} of {b.allowance.toLocaleString()} credits remaining this month ({b.remainingPct.toFixed(1)}%) · used {b.used.toLocaleString()} · plan {b.plan??'unknown'} · source {b.source}{b.keyCheckedAt?` · checked ${new Date(b.keyCheckedAt).toLocaleString()}`:''}</p>
     <p className={b.pauseNonEssential?'text-red-300':'text-slate-400'}>{b.pauseNonEssential?`PAUSED: non-essential CoinGecko jobs stop below ${b.pauseBelowPct}% remaining (paper exits are unaffected).`:`Non-essential jobs pause automatically below ${b.pauseBelowPct}% remaining.`}</p>
     <p className="text-xs text-slate-400">This app's own count (every request attempt through the shared client, retries included; requests served from the Next.js cache are also counted, so this over-counts): today {b.local.today.toLocaleString()} · this month {b.local.month.toLocaleString()} · today by endpoint: {Object.entries(b.local.todayByFamily).map(([k,v])=>`${k} ${v}`).join(', ')||'none'}</p>
    </>}
    <p className="text-xs text-slate-400">Last job run: {data.status.lastRunAt?new Date(data.status.lastRunAt).toLocaleString():'never'} · {Object.entries(st).map(([k,s])=><span key={k} className={s.ok?'':'text-amber-300'}>{k}: {s.skipped??(s.ok?'OK':`FAILED ${s.error??''}`)} ({s.calls} calls) · </span>)}</p>
   </section>
   <Panel title="Market regime (global)" source="CoinGecko /global, hourly points stored by this app" at={data.global?new Date(data.global.latest.t).toISOString():null} cadence={60} now={now}>
    {!data.global?<p>No data yet.</p>:<p className="text-sm">Total market cap {usd(data.global.latest.mcapUsd)} (<span className={tone(data.global.mcapChange24hPct)}>{pct(data.global.mcapChange24hPct)} 24h</span>, <span className={tone(data.global.mcapChange7dPct)}>{pct(data.global.mcapChange7dPct)} 7d</span>) · 24h volume {usd(data.global.latest.volUsd)} · BTC dominance {data.global.latest.btcDom.toFixed(2)}% ({data.global.btcDomChange24h==null?'—':`${data.global.btcDomChange24h>=0?'+':''}${data.global.btcDomChange24h.toFixed(2)} pts`} 24h, {data.global.btcDomChange7d==null?'—':`${data.global.btcDomChange7d>=0?'+':''}${data.global.btcDomChange7d.toFixed(2)} pts`} 7d) · ETH dominance {data.global.latest.ethDom.toFixed(2)}% · {data.global.altsNote}. Descriptive only; no regime filter is applied.</p>}
   </Panel>
   <Panel title="Derivatives: funding and open interest" source={data.derivatives?`${data.derivatives.source}, ${data.derivatives.exchanges} exchanges, ${data.derivatives.tickers} tickers`:'CoinGecko derivatives exchanges'} at={data.derivatives?.at} cadence={15} now={now}>
    {!data.derivatives?<p>No snapshot in the last 35 minutes.</p>:<>
     <p className="text-xs text-slate-400">Perpetuals only. Funding is OI-weighted per 8h across venues; venue values beyond ±{(data.config.fundingOutlier*100).toFixed(0)}% are excluded as outliers. 24h OI change compares with this app&apos;s snapshot from {data.derivatives.dayAgoAt?new Date(data.derivatives.dayAgoAt).toLocaleString():'— (needs 24h of snapshots)'}. Flags (coins with at least {usd(data.config.minOiUsdForFlags)} OI): funding ≥ {(data.config.fundingExtremeLong*100).toFixed(2)}% or ≤ {(data.config.fundingExtremeShort*100).toFixed(2)}%, OI ≥ +{data.config.oiSurgePct}% or ≤ {data.config.oiDropPct}%. Positioning, not spot demand.</p>
     <h4 className="text-sm font-semibold">Flagged</h4>{data.derivatives.flagged.length?<DerivTable rows={data.derivatives.flagged} />:<p className="text-sm">None.</p>}
     <details><summary className="text-sm">Highest funding</summary><DerivTable rows={data.derivatives.topFunding} /></details>
     <details><summary className="text-sm">Largest 24h open-interest increase</summary><DerivTable rows={data.derivatives.topOiChange} /></details>
    </>}
   </Panel>
   <Panel title="Sector rotation" source="CoinGecko /coins/categories" at={data.categories?.at} cadence={15} now={now}>
    {!data.categories?<p>No data yet.</p>:<>
     <p className="text-xs text-slate-400">24h change from CoinGecko. 7d change is computed from this app&apos;s daily category market-cap snapshots ({data.categories.historyDays} day(s) stored; blank until 7 days exist). Market-cap change includes new supply and category membership changes.</p>
     <select aria-label="Sort sectors" value={sort} onChange={e=>setSort(e.target.value as '24h'|'7d')} className="rounded border bg-slate-900 px-2"><option value="24h">Sort by 24h</option><option value="7d">Sort by 7d</option></select>
     <div className="overflow-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr>{['Category','24h','7d','Market cap','24h volume'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead>
      <tbody>{cats.filter(c=>(c.marketCap??0)>=1e8).slice(0,25).map(c=><tr key={c.id} className="border-t border-slate-800"><td className="p-1">{c.name}</td><td className={`p-1 ${tone(c.change24hPct)}`}>{pct(c.change24hPct)}</td><td className={`p-1 ${tone(c.change7dPct)}`}>{pct(c.change7dPct)}</td><td className="p-1">{usd(c.marketCap)}</td><td className="p-1">{usd(c.volume24h)}</td></tr>)}</tbody></table>
     <p className="text-xs text-slate-400">Showing the top 25 of categories with at least $100M market cap, by the selected change.</p></div>
    </>}
   </Panel>
   <Panel title="Impulse scanner (top gainers and losers, top 1000 coins)" source="CoinGecko /coins/top_gainers_losers" at={data.movers?.at} cadence={15} now={now}>
    {!data.movers?<p>No data yet.</p>:<div className="grid gap-3 md:grid-cols-2"><Movers title="1h gainers" rows={data.movers.h1?.gainers} /><Movers title="1h losers" rows={data.movers.h1?.losers} /><Movers title="24h gainers" rows={data.movers.h24?.gainers} /><Movers title="24h losers" rows={data.movers.h24?.losers} /></div>}
   </Panel>
   <Panel title="Relative strength" source={data.relativeStrength?.source??'coinbase 1d'} at={data.relativeStrength?.checkedAt} cadence={13*60} now={now}>
    {!data.relativeStrength?.saved?<p>No saved daily snapshot yet. The paper cycle writes one Coinbase daily snapshot per UTC day. Nothing is fetched by opening this page.</p>:<>
     <p className="text-xs text-slate-400">Rule {data.relativeStrength.rule}. A leader is the top third of 30-day return versus BTC and above its own 50-day average, on candles completed by {data.relativeStrength.asOf?.slice(0,10)}. Evidence only. It does not block an entry. {data.relativeStrength.stale?'STALE: the snapshot is older than 26 hours.':`${data.relativeStrength.coins} coins stored.`} {data.relativeStrength.failed.length?`Failed coins: ${data.relativeStrength.failed.join(', ')}.`:'No failed coins on this snapshot.'}</p>
     {!data.relativeStrength.leaders.length?<p>No leaders in the saved snapshot.</p>:<div className="overflow-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr>{['Coin','Rule','Tercile','30d excess vs BTC'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>{data.relativeStrength.leaders.map(row=><tr key={row.id} className="border-t border-slate-800"><td className="p-1">{row.symbol}<div className="text-xs text-slate-500">{row.id}</div></td><td className="p-1">{row.rule}</td><td className="p-1">{row.tercile}</td><td className="p-1">{row.excess==null?'—':`${(row.excess*100).toFixed(2)}%`}</td></tr>)}</tbody></table></div>}
    </>}
   </Panel>
   <CompressionFlags board={data.compression} now={now} />
   <Panel title="Trending (crowding check)" source="CoinGecko /search/trending, matched by CoinGecko id" at={data.trending?.at} cadence={60} now={now}>
    {!data.trending?<p>No data yet.</p>:<ul className="text-sm">{data.trending.rows.map(t=><li key={t.id} className={t.openPosition||t.watchlist?'text-amber-300':''}>#{t.rank} {t.name} ({t.symbol}){t.marketCapRank?` · rank ${t.marketCapRank}`:''}{t.openPosition?' · OPEN PAPER POSITION: possible crowding':''}{t.watchlist?' · on momentum watchlist: possible crowding':''}</li>)}</ul>}
   </Panel>
  </>}
  <CryptoNewListings refreshVersion={refreshVersion} />
 </section>;
}
