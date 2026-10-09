import {symbolDate,symbolNumber} from '@/lib/presentation/symbolDisplay';
import {freshness} from '@/lib/crypto/breakdown/freshness';
import Link from 'next/link';
import PriceStamp from './PriceStamp';
import TrustBadge from './TrustBadge';
import type {PriceStampInput} from '@/lib/market/priceStamp';
import {formatMarketTime} from '@/lib/market/priceStamp';
import {pickTrust,type MarketPick} from '@/lib/market/overview';
import {symbolJournalHref} from '@/lib/market/symbolSnapshot';
export function SymbolSnapshotHeader({symbol,asset,timeframe,stamp,pick,rankLoading=false,rankError,quiet=false,compact=false,name}:{symbol:string;name?:string|null;asset:'crypto'|'equity';timeframe:string;stamp:PriceStampInput;pick:MarketPick|null;rankLoading?:boolean;rankError?:string|null;quiet?:boolean;compact?:boolean}){
 const ambiguousCrypto=asset==='crypto'&&/^[A-Z0-9]+USD$/i.test(symbol);
 const safeStamp=ambiguousCrypto?{...stamp,price:null,observedAt:null,latestDay:null}:stamp;
 const observation=typeof safeStamp.observedAt==='string'?safeStamp.observedAt:null;
 const trust=asset==='crypto'?freshness('spot',observation):{status:safeStamp.latestDay?'Last close' as const:'Unknown' as const,reason:'Quote observation shown above'};
 const measured=typeof safeStamp.price==='number'&&Number.isFinite(safeStamp.price)&&safeStamp.price!==0;
 if(compact)return <section aria-label="Symbol snapshot" className="space-y-2">
  <div className="flex flex-wrap items-baseline gap-2"><h1 className="text-2xl font-semibold">{symbol}</h1><span className="text-sm text-[var(--msp-text-muted)]">{name?`${name} · `:'Symbol · '}{asset==='crypto'?'Crypto':'Stock'}</span></div>
  {measured&&<div className="flex flex-wrap items-baseline gap-2"><p className="text-2xl font-semibold">{symbolNumber(safeStamp.price!,'price')}</p>{typeof safeStamp.changePct==='number'&&Number.isFinite(safeStamp.changePct)&&<span className="text-sm" style={{color:safeStamp.changePct<0?'var(--msp-bear)':'var(--msp-bull)'}}>{safeStamp.changePct>0?'+':''}{safeStamp.changePct.toFixed(1)}% {asset==='crypto'?'vs 24h ago':'vs prior close'}</span>}{!safeStamp.latestDay&&observation&&<span className="text-xs text-[var(--msp-text-muted)]">Observed {symbolDate(observation)}</span>}{!safeStamp.latestDay&&!observation&&<span className="text-xs text-amber-300">Quote observation time not recorded</span>}{safeStamp.latestDay&&<span className="text-xs text-[var(--msp-text-muted)]">Last close {symbolDate(safeStamp.latestDay,true)} (New York)</span>}</div>}
  {!quiet&&<div className="flex flex-wrap gap-2">{[['Log to journal',symbolJournalHref(symbol,asset)],['Watchlist',`/tools/workspace?${new URLSearchParams({tab:'watchlists',addSymbol:symbol,type:asset})}`],['Backtest',`/tools/workspace?${new URLSearchParams({tab:'backtest',symbol,type:asset,timeframe})}`]].map(([label,href])=><Link key={label} href={href} className="inline-flex min-h-10 items-center rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3 text-sm">{label}</Link>)}</div>}
  <p className="text-xs text-[var(--msp-text-muted)]">Research snapshot only — not a trade instruction.</p>
 </section>;
 return <section aria-label="Symbol snapshot" className="space-y-3 rounded-lg border border-white/10 p-4">
  <div className="flex flex-wrap justify-between gap-3"><h1 className="text-xl font-bold">{symbol} · {asset==='crypto'?'Crypto':'Stock'}</h1>{quiet&&!measured?null:<PriceStamp {...safeStamp}/>}</div>
  {quiet?null:<TrustBadge status={stamp.stale?'Stale':trust.status} reason={ambiguousCrypto?'Legacy quote identity unverified for a bare USD suffix; use the breakdown below.':trust.reason}/>}
  <div className="flex flex-wrap gap-4 text-emerald-300">
   <Link href={symbolJournalHref(symbol,asset)}>Log to journal</Link>
   <Link href={`/tools/workspace?${new URLSearchParams({tab:'watchlists',addSymbol:symbol,type:asset})}`}>Add to watchlist</Link>
   <Link href={`/tools/workspace?${new URLSearchParams({tab:'backtest',symbol,type:asset,timeframe})}`}>Backtest</Link>
  </div>
  {quiet?null:rankLoading?<p>Loading daily scan…</p>:rankError?<p className="text-amber-300">Daily scan unavailable: {rankError}</p>:pick?<div>
   <p>Daily scan: {pick.scan_date?.slice(0,10)??'date unknown'} · data as of {formatMarketTime(pick.data_as_of??pick.dataTimestamp)??'time unknown'}</p>
   <TrustBadge compact status={pickTrust(pick)} reason={pick.trust?.reasons?.join(' · ')}/>
  </div>:<p>Not in today's picks.</p>}
  <p className="text-xs text-slate-500">Research snapshot only — not a trade instruction.</p>
 </section>;
}
