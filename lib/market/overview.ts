import {isNonTradingDay} from '@/lib/time/marketHolidays';
import type {PriceStampInput} from './priceStamp';
import type {TrustStatus} from '@/components/market/TrustBadge';
export type MarketPick={symbol:string;asset_class?:string;grade?:string|null;permission?:string|null;scorePercentile?:number|null;scan_date?:string;price?:number|null;change_percent?:number|null;priceBasis?:string;priceBasisLabel?:string;canonicalClose?:number|null;canonicalBarDate?:string|null;data_as_of?:string|null;dataTimestamp?:string|null;trust?:{level?:string;freshness?:string;reasons?:string[]}};
export type DailyObservation={symbol:string;assetClass:'equity'|'crypto';scanDate:string|null;price:number|null;changePercent:number|null;priceBasis:string;priceBasisLabel:string;indicators:Record<string,number|null>;dataQuality:{level?:string;freshness?:string;reasons?:string[];dataTimestamp?:string|null;dataAsOf?:string|null}};
export type PicksResponse={success?:boolean;contract?:string;observations?:{equity?:DailyObservation[];crypto?:DailyObservation[]};topPicks?:{crypto?:MarketPick[];equity?:MarketPick[]};bottomPicks?:{crypto?:MarketPick[];equity?:MarketPick[]}};
/** Adapt only observed fields. Never reconstruct dropped verdicts or synthetic scores. */
export function observationPick(row:DailyObservation):MarketPick {
 return {symbol:row.symbol,asset_class:row.assetClass,scan_date:row.scanDate??undefined,price:row.price,change_percent:row.changePercent,priceBasis:row.priceBasis,priceBasisLabel:row.priceBasisLabel,data_as_of:row.dataQuality.dataAsOf,dataTimestamp:row.dataQuality.dataTimestamp,trust:{level:row.dataQuality.level,freshness:row.dataQuality.freshness,reasons:row.dataQuality.reasons}};
}
export function dailyObservationRows(data:PicksResponse|null|undefined,asset:'crypto'|'equity'):MarketPick[]{
 return data?.contract==='public-daily-observations-v1'?(data.observations?.[asset]??[]).map(observationPick):(data?.topPicks?.[asset]??[]);
}
export function topPicks(data:PicksResponse|null|undefined,asset:'crypto'|'equity'){return dailyObservationRows(data,asset).slice(0,5);}
export function diffPicks(latest:MarketPick[],previous:MarketPick[]){
 const before=new Map(previous.map(p=>[p.symbol,p])),after=new Set(latest.map(p=>p.symbol));
 return {hasPrevious:previous.length>0,added:latest.filter(p=>!before.has(p.symbol)),dropped:previous.filter(p=>!after.has(p.symbol)),gradeChanges:latest.flatMap(p=>{const old=before.get(p.symbol);return old&&old.grade!==p.grade?[{symbol:p.symbol,from:old.grade??'unknown',to:p.grade??'unknown'}]:[];})};
}
/** Expected prior publication day, not a claim that a stored snapshot exists. */
export function previousScanDate(date:string|undefined,asset:'crypto'|'equity'){
 if(!date)return null;const d=new Date(`${date.slice(0,10)}T12:00:00Z`);if(!Number.isFinite(d.getTime()))return null;
 do{d.setUTCDate(d.getUTCDate()-1);}while(asset==='equity'&&isNonTradingDay(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
 return d.toISOString().slice(0,10);
}
export function pickTrust(p:MarketPick):TrustStatus {
 if(p.trust?.freshness==='stale'||p.trust?.level==='STALE')return 'Stale';
 if(p.trust?.level==='DEGRADED'||p.trust?.level==='INSUFFICIENT_DATA')return 'Degraded';
 return p.trust?.level==='GOOD'?'Last close':'Unknown';
}
export function pickStamp(p:MarketPick):PriceStampInput {
 const bar=typeof p.canonicalClose==='number'&&p.canonicalClose>0&&Boolean(p.canonicalBarDate);
 return {symbol:p.symbol,assetType:p.asset_class,price:bar?p.canonicalClose:p.price,priceBasis:bar?'daily_bar_close':p.priceBasis,priceBasisLabel:bar?'daily bar close':p.priceBasisLabel,data_as_of:bar?`${p.canonicalBarDate}T00:00:00Z`:p.data_as_of??p.dataTimestamp,latestDay:bar?p.canonicalBarDate:undefined,source:'daily scan',stale:pickTrust(p)==='Stale'};
}
