'use client';
import {useEffect} from 'react';
import Link from 'next/link';
import {optionsHref} from '@/lib/market/links';
import {useOptionsChain} from '@/hooks/useOptionsChain';
import {usePublicMarketFeed} from '@/hooks/usePublicMarketFeed';
import {formatMarketTime} from '@/lib/market/priceStamp';
import {quoteDateLabel,chainQuality} from '@/lib/options/quoteQuality';
import TrustBadge from './TrustBadge';
import PriceStamp from './PriceStamp';
export type FundingFeed={coins:Array<{symbol:string;fundingRatePercent:number}>;timestamp?:string;freshnessStatus?:string;source?:string};
export function fundingForSymbol(feed:FundingFeed|null,symbol:string){return feed?.coins.find(c=>c.symbol===symbol.toUpperCase().replace(/[-/]?USDT?$/,''))?.fundingRatePercent??null;}
export function SymbolCryptoContext({symbol}:{symbol:string}){
 const funding=usePublicMarketFeed<FundingFeed>('/api/funding-rates');
 const ratio=usePublicMarketFeed<{coins:Array<{symbol:string;longShortRatio:number;longAccount:number;shortAccount:number}>;timestamp?:string;source?:string}>('/api/long-short-ratio');
 const base=symbol.toUpperCase().replace(/[-/]?USDT?$/,'');
 const coin=ratio.data?.coins.find(c=>c.symbol===base),rate=fundingForSymbol(funding.data,symbol);
 return <section className="rounded-lg border border-white/10 p-4 space-y-2" aria-label="Symbol derivatives">
  <h2 className="font-bold">Derivatives · {base}</h2>
  <p>Funding: {rate==null?'unavailable':`${rate}% per 8h equivalent`} · OKX · {formatMarketTime(funding.data?.timestamp)??'time unknown'}</p>
  <TrustBadge status={funding.error?'Degraded':funding.data?.freshnessStatus==='stale'?'Stale':'Unknown'} reason={funding.error??'Exchange funding is a derivatives observation, not a spot return.'}/>
  <p>Long/short accounts: {coin?`${coin.longShortRatio} · ${coin.longAccount}% long / ${coin.shortAccount}% short`:'unavailable'} · {ratio.data?.source??'OKX'} · {formatMarketTime(ratio.data?.timestamp)??'time unknown'}</p>
  {ratio.error&&<p className="text-amber-300">{ratio.error}</p>}
  <Link className="text-emerald-300" href={`/tools/crypto-dashboard?symbol=${encodeURIComponent(base)}`}>Derivatives detail</Link>
 </section>;
}
export function SymbolOptionsContext({symbol,expiry}:{symbol:string;expiry?:string}){
 const chain=useOptionsChain();
 useEffect(()=>{chain.fetch(symbol,expiry);},[symbol,expiry,chain.fetch]);
 // This is the same hook and buildIVMetrics output as OptionsTerminalView: no parallel calculation.
 const metrics=chain.ivMetrics,selected=chain.contracts[0]?.expiration;
 const quality=chainQuality(chain.contracts,chain.underlyingPrice,chain.quoteBasis,chain.asOfDate);
 return <section className="rounded-lg border border-white/10 p-4 space-y-2" aria-label="Symbol options">
  <h2 className="font-bold">Options · {selected??'expiry unavailable'}</h2>
  {chain.loading?<p>Loading chain…</p>:chain.error?<p className="text-amber-300">{chain.error}</p>:<>
   <TrustBadge status={quality.stale?'Stale':quality.degraded?'Degraded':chain.quoteBasis==='realtime'?'Live':'Last close'} reason={`${quoteDateLabel(chain.quoteBasis,chain.asOfDate)} · near-the-money coverage ${quality.coverage}%`}/>
   <p>ATM IV (2% band): {metrics.avgIV>0?`${(metrics.avgIV*100).toFixed(1)}%`:'unavailable'} · ATM straddle mid: {metrics.atmStraddleMid!=null?`$${metrics.atmStraddleMid.toFixed(2)}`:'unavailable'}</p>
   <p>1-sigma move to expiry: {metrics.expectedMoveAbs>0?`±$${metrics.expectedMoveAbs.toFixed(2)} (±${metrics.expectedMovePct.toFixed(1)}%)`:'unavailable'} · Market basis: {chain.asOfDate||'unavailable'} · model estimate, not a guaranteed range.</p>
   <PriceStamp symbol={`${symbol} underlying`} assetType="equity" price={chain.spotObservation?.price??chain.underlyingPrice} latestDay={chain.spotObservation?.asOf} priceBasis={chain.spotObservation?.asOf?'last_close':'unknown'} source={chain.provider}/>
   <p className="text-xs">Chain: {quoteDateLabel(chain.quoteBasis,chain.asOfDate)} · {chain.provider||'source unknown'}</p>
  </>}
  <Link className="text-emerald-300" href={optionsHref(symbol,selected)}>Open options</Link>
 </section>;
}
