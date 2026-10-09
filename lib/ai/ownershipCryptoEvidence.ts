import type { OwnershipContext } from '@/lib/ownership/avOwnership';
import type { Breakdown } from '@/lib/crypto/breakdown/types';
const pick=(value:object,keys:string[])=>Object.fromEntries(keys.map(k=>[k,(value as Record<string,unknown>)[k] ?? null]));
/** Leaf allowlists: future/private properties cannot silently become model input. */
export function ownershipEvidence(c:OwnershipContext){
 const i=c.insider,g=c.congress,h=c.institutional;
 return {symbol:c.symbol,provider:'Alpha Vantage',basis:'Reported filings lag the transactions. Transaction and filing dates are distinct; snapshot capture is not the observation date.',
  insider:i.status==='unavailable'?{status:i.status,reason:i.reason}:{...pick(i,['status','windowDays','from','netShares','netValue','otherCount','lastTransactionDate']),buys:pick(i.buys,['count','shares','value']),sells:pick(i.sells,['count','shares','value']),awards:pick(i.awards,['count','shares']),notable:i.notable.map(t=>pick(t,['date','name','title','side','shares','price','value']))},
  congress:g.status==='unavailable'?{status:g.status,reason:g.reason}:{...pick(g,['status','totalTrades','lastTradeDate']),last12m:pick(g.last12m,['buys','sells','other']),recent:g.recent.map(t=>pick(t,['date','politician','party','state','chamber','type','amountMin','amountMax','owner','filedDate']))},
  institutional:h.status==='unavailable'?{status:h.status,reason:h.reason}:{...pick(h,['status','ownershipPct','holders','totalShares','holdersIncreased','holdersDecreased','holdersUnchanged','netSharesChanged','netSharesChangedPct','reportPeriod']),topHolders:h.topHolders.map(t=>pick(t,['name','shares','changeShares','changePct','changeType','lastReported']))},
 };
}
const LABELS=new Set([
 'Spot','Change vs 24h ago','Change vs 7 days ago','Change vs 30 days ago','Last daily bar close',
 'Average daily volume, 7d','Average daily volume, 30d','Average daily volume, 90d','Volume 7d / 30d','Volume 30d / 90d','90-day highest close','Distance below 90-day high','365-day highest close','Distance below 365-day high','Distance below ATH',
 'BTC close','BTC 50-day average','BTC 200-day average','BTC dominance','BTC.D 20-day average','BTC.D 10 days earlier','BTC.D 20-day average, 10 days earlier','TOTAL3','TOTAL3 50-day average','TOTAL3 change, 30d',
 'Funding, 8h-equivalent','Funding interval (hours)','Next funding time','Open interest (USD)','Open interest (coins)','Open interest change, 24h','Perpetual listed','Swap volume, 24h (coins)',
 'Aggregate 24h volume','30-day average volume','Volume / market cap','Fresh venues on returned page','Best reported fresh spread',
 'Market cap','Market-cap rank','Fully diluted valuation','Circulating supply','Total supply','Max supply','Max supply circulating','ATH','ATH date','Distance from ATH','Categories','Genesis date','Age since reported genesis (days)',
 'ATR(14), all completed bars','ATR / last close',
]);
export function cryptoBreakdownEvidence(b:Breakdown,expectedCoinId:string|undefined){
 if(!expectedCoinId || b.coinId!==expectedCoinId || !b.identity?.verified || b.identity.coinId!==expectedCoinId)return null;
 return {symbol:b.symbol,coinId:b.coinId,name:b.name,generatedAt:b.generatedAt,
  identity:{verified:b.identity.verified,coinId:b.identity.coinId,source:b.identity.source,reason:b.identity.reason,okx:pick(b.identity.okx,['bound','instrument','reason']),yahoo:pick(b.identity.yahoo,['bound','reason'])},
  sections:Object.fromEntries((['price','earlyContext','marketContext','derivatives','liquidity','supply','levels'] as const).map(key=>{
   const s=b.sections[key];return [key,{...pick(s,['source','asOf','basis','status','reason']),metrics:(s.value?.metrics??[]).filter(m=>LABELS.has(m.label)).map(m=>pick(m,['label','value','unit','source','asOf','basis','status','reason']))}];
  })),
  limitations:['Rule stages, rule thresholds, stop levels, scoring, discretionary notes and other non-allowlisted fields are excluded.','Funding is a period estimate; next funding time is a schedule, not the rate observation time. Missing and zero values remain distinct.'],
 };
}
