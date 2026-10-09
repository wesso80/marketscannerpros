import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {CALIBRATION_META} from '@/lib/scoring/canonical/calibrationData';

/**
 * Scanner data audit (READ-ONLY, admin). Answers "how far back can the scanner's setups be tested honestly?" before
 * any replay is built: daily bar depth and completeness in ohlcv_bars by asset type, staleness, missing volume,
 * enabled symbols with no stored history, whether names that stopped updating are still kept (survivorship), and the
 * CoinGecko history used by the crypto research. No writes except an admin-only cache entry.
 */
export const SCANNER_AUDIT={version:'scanner-data-audit-v1',cacheKey:'admin:scanner-data-audit:v1',cacheSeconds:3600,
 depthBars:[250,500,1000,2000],staleDays:5,dormantDays:30,completenessMin:.9} as const;
const D=86400000;
export type SymbolDepth={symbol:string;asset:string;bars:number;first:string;last:string;zeroVolume:number};
/** Expected daily bars per calendar day: ~252/365 for exchange-traded equities, every day for crypto. */
export const barsPerDay=(asset:string)=>asset==='crypto'?1:252/365;
export type AssetSummary={asset:string;symbols:number;bars:number;earliest:string|null;latest:string|null;
 depth:Record<string,number>;medianBars:number|null;medianYears:number|null;
 stale:number;dormant:number;incomplete:number;zeroVolumeSymbols:number;
 /** Years of history available to at least N symbols (N = 25 / 100 / 250). */
 yearsFor:Record<string,number|null>};
const median=(a:number[])=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
/** Pure: per-asset summary of per-symbol depth rows. `now` fixes staleness for tests. */
export function summarise(rows:SymbolDepth[],now:number):AssetSummary[]{
 const by=new Map<string,SymbolDepth[]>();for(const r of rows)by.set(r.asset,[...(by.get(r.asset)??[]),r]);
 return [...by].sort((a,b)=>b[1].length-a[1].length).map(([asset,rs])=>{
  const years=rs.map(r=>(Date.parse(r.last)-Date.parse(r.first))/D/365.25);
  const yearsFor:Record<string,number|null>={};
  for(const n of [25,100,250]){const s=[...years].sort((a,b)=>b-a);yearsFor[n]=s.length>=n?Math.round(s[n-1]*10)/10:null;}
  const complete=(r:SymbolDepth)=>{const span=(Date.parse(r.last)-Date.parse(r.first))/D+1;return span<=0||r.bars/(span*barsPerDay(asset))>=SCANNER_AUDIT.completenessMin;};
  return {asset,symbols:rs.length,bars:rs.reduce((s,r)=>s+r.bars,0),
   earliest:rs.reduce<string|null>((m,r)=>m==null||r.first<m?r.first:m,null),latest:rs.reduce<string|null>((m,r)=>m==null||r.last>m?r.last:m,null),
   depth:Object.fromEntries(SCANNER_AUDIT.depthBars.map(n=>[`>=${n}`,rs.filter(r=>r.bars>=n).length])),
   medianBars:median(rs.map(r=>r.bars)),medianYears:(()=>{const m=median(years);return m==null?null:Math.round(m*10)/10;})(),
   stale:rs.filter(r=>now-Date.parse(r.last)>SCANNER_AUDIT.staleDays*D).length,
   dormant:rs.filter(r=>now-Date.parse(r.last)>SCANNER_AUDIT.dormantDays*D).length,
   incomplete:rs.filter(r=>!complete(r)).length,zeroVolumeSymbols:rs.filter(r=>r.zeroVolume>r.bars*.5).length,yearsFor};
 });
}
/** Plain-language findings derived only from the summary (no guesses about data that was not read). */
export function findings(s:AssetSummary[],universe:{asset:string;enabled:number;withoutBars:number}[]):string[]{
 const out:string[]=[];
 for(const a of s){
  out.push(`${a.asset}: ${a.symbols} symbols with stored daily bars; median ${a.medianYears ?? '—'} years; at least ${a.yearsFor['100'] ?? '—'} years for 100 symbols.`);
  if(a.dormant===0)out.push(`${a.asset}: no symbol stopped updating more than ${SCANNER_AUDIT.dormantDays} days ago, so delisted or removed names are probably not kept: a replay on this data would be survivorship-biased.`);
  else out.push(`${a.asset}: ${a.dormant} symbols stopped updating over ${SCANNER_AUDIT.dormantDays} days ago (delisted, disabled or failing); they are kept, which partly reduces survivorship bias.`);
  if(a.incomplete)out.push(`${a.asset}: ${a.incomplete} symbols have fewer than ${Math.round(SCANNER_AUDIT.completenessMin*100)}% of the expected daily bars between their first and last bar (gaps).`);
  if(a.zeroVolumeSymbols)out.push(`${a.asset}: ${a.zeroVolumeSymbols} symbols have zero volume on more than half their bars; volume evidence is unavailable for them.`);
 }
 for(const u of universe)if(u.withoutBars)out.push(`${u.asset}: ${u.withoutBars} of ${u.enabled} enabled scanner symbols have no stored daily bars.`);
 return out;
}
export type ScannerAuditReport={version:string;generatedAt:string;source:string;cached:boolean;assets:AssetSummary[];
 timeframes:{timeframe:string;rows:number;symbols:number}[];universe:{asset:string;enabled:number;withoutBars:number}[];
 cryptoHistory:{coins:number;days:number;first:string|null;last:string|null}|{unavailable:string};
 calibration:{version:string;generated:string;horizonBars:number};findings:string[]};
export async function scannerDataAudit(refresh=false):Promise<ScannerAuditReport>{
 const redis=getRedis();
 if(!refresh){const c=await redis?.get<ScannerAuditReport>(SCANNER_AUDIT.cacheKey).catch(()=>null);if(c)return {...c,cached:true};}
 const now=Date.now();
 const depth=await q<{symbol:string;asset:string|null;bars:string;first:string|Date;last:string|Date;zero:string}>(
  `SELECT b.symbol,COALESCE(u.asset_type,'unknown') asset,COUNT(*) bars,MIN(b.ts) first,MAX(b.ts) last,COUNT(*) FILTER (WHERE b.volume IS NULL OR b.volume=0) zero
   FROM ohlcv_bars b LEFT JOIN symbol_universe u ON u.symbol=b.symbol WHERE b.timeframe='daily' GROUP BY b.symbol,u.asset_type`);
 const rows:SymbolDepth[]=depth.map(r=>({symbol:r.symbol,asset:r.asset??'unknown',bars:Number(r.bars),first:new Date(r.first).toISOString(),last:new Date(r.last).toISOString(),zeroVolume:Number(r.zero)}));
 const tfs=await q<{timeframe:string;n:string;symbols:string}>(`SELECT timeframe,COUNT(*) n,COUNT(DISTINCT symbol) symbols FROM ohlcv_bars GROUP BY timeframe ORDER BY 2 DESC`);
 const uni=await q<{asset:string;enabled:string;without_bars:string}>(
  `SELECT u.asset_type asset,COUNT(*) enabled,COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM ohlcv_bars b WHERE b.symbol=u.symbol AND b.timeframe='daily')) AS without_bars FROM symbol_universe u WHERE u.enabled GROUP BY u.asset_type ORDER BY 2 DESC`);
 let cryptoHistory:ScannerAuditReport['cryptoHistory'];
 try{const [c]=await q<{coins:string;days:string;first:string|null;last:string|null}>(`SELECT COUNT(DISTINCT coin_id) coins,COUNT(DISTINCT day) days,MIN(day)::text first,MAX(day)::text last FROM cg_hist_daily`);
  cryptoHistory={coins:Number(c?.coins??0),days:Number(c?.days??0),first:c?.first??null,last:c?.last??null};}
 catch{cryptoHistory={unavailable:'CoinGecko history tables not created (History data job not run)'};}
 const assets=summarise(rows,now),universe=uni.map(u=>({asset:u.asset,enabled:Number(u.enabled),withoutBars:Number(u.without_bars)}));
 const report:ScannerAuditReport={version:SCANNER_AUDIT.version,generatedAt:new Date(now).toISOString(),source:'Neon: ohlcv_bars (worker daily bars), symbol_universe, cg_hist_daily',cached:false,
  assets,timeframes:tfs.map(t=>({timeframe:t.timeframe,rows:Number(t.n),symbols:Number(t.symbols)})),universe,cryptoHistory,
  calibration:{version:CALIBRATION_META.version,generated:CALIBRATION_META.generated,horizonBars:CALIBRATION_META.horizonBars},findings:findings(assets,universe)};
 await redis?.set(SCANNER_AUDIT.cacheKey,report,{ex:SCANNER_AUDIT.cacheSeconds}).catch(()=>undefined);
 return report;
}
