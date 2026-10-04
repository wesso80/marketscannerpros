import {freshness} from '@/lib/crypto/breakdown/freshness';
import Link from 'next/link';
import PriceStamp from './PriceStamp';
import TrustBadge from './TrustBadge';
import type {PriceStampInput} from '@/lib/market/priceStamp';
import {formatMarketTime} from '@/lib/market/priceStamp';
import {pickTrust,type MarketPick} from '@/lib/market/overview';
import {symbolJournalHref} from '@/lib/market/symbolSnapshot';
export function SymbolSnapshotHeader({symbol,asset,timeframe,stamp,pick,rankLoading=false,rankError}:{symbol:string;asset:'crypto'|'equity';timeframe:string;stamp:PriceStampInput;pick:MarketPick|null;rankLoading?:boolean;rankError?:string|null}){
 const ambiguousCrypto=asset==='crypto'&&/^[A-Z0-9]+USD$/i.test(symbol);
 const safeStamp=ambiguousCrypto?{...stamp,price:null,observedAt:null,latestDay:null}:stamp;
 const observation=typeof safeStamp.observedAt==='string'?safeStamp.observedAt:null;
 const trust=asset==='crypto'?freshness('spot',observation):{status:safeStamp.latestDay?'Last close' as const:'Unknown' as const,reason:'Quote observation shown above'};
 return <section aria-label="Symbol snapshot" className="space-y-3 rounded-lg border border-white/10 p-4">
  <div className="flex flex-wrap justify-between gap-3"><h1 className="text-xl font-bold">{symbol} · {asset==='crypto'?'Crypto':'Stock'}</h1><PriceStamp {...safeStamp}/></div>
  <TrustBadge status={stamp.stale?'Stale':trust.status} reason={ambiguousCrypto?'Legacy quote identity unverified for a bare USD suffix; use the breakdown below.':trust.reason}/>
  <div className="flex flex-wrap gap-4 text-emerald-300">
   <Link href={symbolJournalHref(symbol,asset)}>Log to journal</Link>
   <Link href={`/tools/workspace?${new URLSearchParams({tab:'watchlists',addSymbol:symbol,type:asset})}`}>Add to watchlist</Link>
   <Link href={`/tools/workspace?${new URLSearchParams({tab:'backtest',symbol,type:asset,timeframe})}`}>Backtest</Link>
  </div>
  {rankLoading?<p>Loading daily rank…</p>:rankError?<p className="text-amber-300">Daily rank unavailable: {rankError}</p>:pick?<div>
   <p>Daily pick: {pick.grade??'grade unavailable'} · {pick.permission??'permission unavailable'} · {pick.scorePercentile!=null?`${pick.scorePercentile}th percentile`:'percentile unavailable'} · scan {pick.scan_date?.slice(0,10)??'date unknown'} · data as of {formatMarketTime(pick.data_as_of??pick.dataTimestamp)??'time unknown'}</p>
   <TrustBadge compact status={pickTrust(pick)} reason={pick.trust?.reasons?.join(' · ')}/>
  </div>:<p>Not in today's picks.</p>}
  <p className="text-xs text-slate-500">Research snapshot only — not a trade instruction.</p>
 </section>;
}
