import {supportsPaperPair,fetchOkxUsdQuote,fetchOkxUsdPath,usdSignal,paperCostPortfolio,type ConvertedPaperQuote} from './cryptoPaperOkx';
import {currentBtcRegime,type BtcRegime} from './cryptoBtcRegime';
import {q,atomicQueries} from '@/lib/db';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from './adminCrypto';
import {ARCA_DEFAULT_SETTINGS} from './portfolio-lab/constants';
import type {PaperExitRules} from './portfolio-lab/types';
import {getDefaultPortfolio,getPortfolioById,insertPortfolio,listOpenPositions,listTrades} from './portfolio-lab/portfolioStore';
import {createSimulatedOrder,fillOrderAndOpenPosition} from './portfolio-lab/simulatedOrderEngine';
import {writeJournal} from './portfolio-lab/journalEngine';
import {fetchVolumeMomentum,type MomentumScan,type MomentumScanRow} from './cryptoVolumeMomentum';
import type {BaseScan,BaseScanRow} from './cryptoBaseScan';
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
import {unavailableJev} from './cryptoJev';
import {unavailableCatalyst} from './cryptoJevCatalyst';
import {unavailableChart} from './cryptoJevChart';
import {fetchPaperQuote,planCryptoPaper} from './cryptoPaperMarket';
import {positionRiskUsd} from './cryptoCorrelation';
import {monitorPaperPosition,CRYPTO_PAPER_NAME,type CryptoPaperDecision} from './cryptoPaper';
/**
 * Base-breakout sleeve (SIMULATED). The early setup: a coin that sat in a tight daily base and has just closed its
 * first confirmed 4h breakout above that base on expanded volume. Separate $200,000 ledger so its outcomes are not
 * mixed with the momentum sleeves. Exit is a 2-ATR trailing stop ratcheted on completed candles, a structural initial
 * stop, and a 7-day time stop only if the trade never reached +1R. There is no fixed target: the sleeve is meant to
 * hold a working breakout. Jev stamps (shadow, chart confirmer, catalyst) are recorded with every entry and never gate it.
 * No exchange orders. CoinGecko and exchange candles are the only market data.
 */
export const CRYPTO_PAPER_BASE_NAME='Crypto Markets Paper Base';
export const PLAYBOOK_BASE='crypto-base-breakout-v1';
export const BASE_SCAN_KEY='admin:crypto-markets:bases:v1';
export const MOMENTUM_KEY='admin:crypto-markets:momentum-volume:v1';
/** A daily base is reusable for 48h: the base is read on completed UTC days and the breakout can come the next day. */
export const BASE_SCAN_MAX_AGE_MS=48*3600000;
/** Entry window above the base high. Past this the breakout is already extended for an early entry (same 3% cryptoBase uses). */
export const BASE_BREAKOUT_MAX_EXTENSION=0.03;
export const BASE_TRAIL_ATR=2;
export const BASE_LIMITS={riskPerTradePct:.25,notionalPct:10,maxPairVolumePct:1,maxVolumeAgeHours:6,positions:10,openRiskPct:4,dailyEntries:6,cycleEntries:2,cycleValidations:6,lossFromStartPct:5,timeStopHours:168,timeStopMinR:1} as const;
const L=BASE_LIMITS;
const STATUS='Crypto base-breakout paper cycle completed';
const BUSY='Base-breakout paper cycle already running or cooling down';
export type BaseCandidate={row:MomentumScanRow;base:BaseScanRow;extensionPct:number};
const usdLike=(quote:string|null|undefined)=>!!quote&&['USD','USDT','USDC'].includes(quote.toUpperCase());
/** Pure: which confirmed 4h setups are the first breakout from a saved daily base. */
export function baseBreakoutCandidates(scan:MomentumScan|null,bases:BaseScan|null,now:number):{candidates:BaseCandidate[];note:string|null}{
 if(!scan||Math.floor(Date.parse(scan.startedAt)/(4*3600000))!==Math.floor(now/(4*3600000)))return {candidates:[],note:'No current 4h momentum scan; no base-breakout entries'};
 const baseAge=now-Date.parse(bases?.startedAt??'');
 if(!bases||!Number.isFinite(baseAge)||baseAge<0||baseAge>BASE_SCAN_MAX_AGE_MS)return {candidates:[],note:'No daily base scan from the last 48h; no base-breakout entries'};
 const byId=new Map(bases.rows.filter(b=>b.stage==='BASE'&&typeof b.high==='number'&&b.high>0).map(b=>[b.id,b]));
 const candidates:BaseCandidate[]=[];
 for(const row of scan.rows){
  if(row.stage!=='MOMENTUM_VOLUME'||row.kind!=='BREAKOUT'||typeof row.close!=='number')continue;
  const base=byId.get(row.id);if(!base)continue;
  if(!usdLike(base.quote)||!usdLike(row.pair?.quote))continue;
  const ext=row.close/base.high!-1;
  if(ext<=0||ext>BASE_BREAKOUT_MAX_EXTENSION)continue;
  candidates.push({row,base,extensionPct:Math.round(ext*10000)/100});
 }
 return {candidates,note:candidates.length?null:byId.size?'No confirmed 4h breakout closed just above a saved daily base':'No coin in the saved daily base scan is in a base'};
}
export function baseExitRules(atr:number):PaperExitRules{
 return {timeStopHours:L.timeStopHours,timeStopMinR:L.timeStopMinR,trail:{atr,atrMultiple:BASE_TRAIL_ATR}};
}
/** Exit rules for an open base-sleeve position come from the ATR saved with its order; a position without one keeps fixed levels and is noted. */
export async function baseExitRulesFor(workspaceId:string,position:{sourceOrderId?:string|null;playbookId?:string|null}):Promise<PaperExitRules|null>{
 if(position.playbookId!==PLAYBOOK_BASE||!position.sourceOrderId)return null;
 const [order]=await q<{created_reason:string|null}>('SELECT created_reason FROM arca_simulated_orders WHERE workspace_id=$1 AND id=$2',[workspaceId,position.sourceOrderId]);
 try{const r=order?.created_reason??'';const atr=Number(JSON.parse(r.slice(r.indexOf('{'))).signal?.atr);return atr>0?baseExitRules(atr):null;}catch{return null;}
}
export async function cryptoBaseSleeveState(workspaceId:string){
 const portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_BASE_NAME);
 if(!portfolio)return {mode:'SIMULATED' as const,portfolio:null,positions:[],trades:[],limits:L};
 const [positions,trades]=await Promise.all([listOpenPositions(workspaceId,portfolio.id),listTrades(workspaceId,portfolio.id,{limit:100})]);
 return {mode:'SIMULATED' as const,portfolio,positions,trades,limits:L};
}
/** Created beside the research account and follows its enable/pause. Returns null when the research account does not exist yet. */
export async function ensureBaseSleeve(workspaceId:string,active:boolean){
 const research=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
 if(!research)return null;
 let book=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_BASE_NAME);
 if(!book&&active)book=await insertPortfolio({workspaceId,name:CRYPTO_PAPER_BASE_NAME,startingBalance:research.startingBalance,baseCurrency:research.baseCurrency||'USD',settings:{...ARCA_DEFAULT_SETTINGS,...research.settings,enabledPlaybooks:[PLAYBOOK_BASE]}});
 if(!book)return null;
 await q('UPDATE arca_portfolios SET status=$1,updated_at=NOW() WHERE workspace_id=$2 AND id=$3',[active?'ACTIVE':'PAUSED',workspaceId,book.id]);
 if(active)await writeJournal({workspaceId,portfolioId:book.id,journalType:'REVIEW',title:'Crypto base-breakout sleeve enabled',reasoning:`SIMULATED ONLY. Entries: the first confirmed 4h BREAKOUT that closes 0–${BASE_BREAKOUT_MAX_EXTENSION*100}% above a saved daily base high (daily base scan under 48h old), Coinbase USD or OKX USDT. ${L.riskPerTradePct}% risk to the structural stop, ${L.positions} positions, ${L.openRiskPct}% open risk, ${L.dailyEntries} entries per day. Exit: ${BASE_TRAIL_ATR}-ATR trailing stop ratcheted on completed 15m candles, ${L.timeStopHours}h time stop only if +${L.timeStopMinR}R was never reached, no fixed target. Jev shadow, chart confirmer and catalyst stamps are recorded, never gates. No exchange orders.`});
 return book.id;
}
export async function runCryptoBaseSleeveCycle(workspaceId:string,trigger:'manual'|'cron'='manual',monitorOnly=false){
 const redis=getRedis();if(!redis)throw Error('Paper coordination cache unavailable');
 if(!isAdminCryptoEnabled())return {skipped:true,reason:'Admin crypto disabled'};
 const lock=`admin:crypto-paper-base:cycle:${workspaceId}${monitorOnly?':monitor':''}`;
 if(!await redis.set(lock,trigger,{nx:true,ex:180}))return {skipped:true,reason:BUSY};
 let book=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_BASE_NAME);
 if(!book)return {skipped:true,reason:'Base-breakout sleeve not created yet; enable the paper account'};
 const notes:string[]=[],decisions:CryptoPaperDecision[]=[];
 let opened=0,closed=0,marked=0,monitorHealthy=true;
 const positions=await listOpenPositions(workspaceId,book.id);
 if(positions.length>L.positions){monitorHealthy=false;notes.push('Unexpected position count; entries blocked');}
 for(const position of positions){
  const r=await monitorPaperPosition(workspaceId,book,position,async pos=>{const rules=await baseExitRulesFor(workspaceId,pos);if(!rules)notes.push(`${pos.symbol}: no saved ATR; fixed stop only, no trail`);return rules;},notes);
  if(!r.ok)monitorHealthy=false;else{marked++;if(r.closed)closed++;}
 }
 if(monitorOnly){
  const report={trigger,phase:'monitor',sleeve:'base',at:new Date().toISOString(),opened,closed,marked,monitorHealthy,notes};
  await writeJournal({workspaceId,portfolioId:book.id,journalType:'REVIEW',title:'Crypto base-breakout exit monitoring completed',reasoning:notes.join('; ')||'Exit monitoring completed before scanning',evidence:[JSON.stringify(report)]});
  return report;
 }
 book=await getPortfolioById(workspaceId,book.id);if(!book)throw Error('Base sleeve unavailable');
 const [scan,bases,discovery]=await Promise.all([redis.get<MomentumScan>(MOMENTUM_KEY),redis.get<BaseScan>(BASE_SCAN_KEY),redis.get<{startedAt?:string;finishedAt?:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1').catch(()=>null)]);
 const found=baseBreakoutCandidates(scan,bases,Date.now());
 if(found.note)notes.push(found.note);
 const decide=(c:BaseCandidate,status:CryptoPaperDecision['status'],reason:string,quote?:Awaited<ReturnType<typeof fetchPaperQuote>>)=>{
  decisions.push({coin:c.row.id,product:c.row.pair?.product??null,venue:c.row.pair?.exchange??null,signalAt:c.row.asOf,checkedAt:new Date().toISOString(),status,reason,sleeve:'base',...(quote?{quoteAt:quote.priceAt,bid:quote.bid,ask:quote.ask,quoteCurrency:'USD' as const,...('conversion' in quote?{conversion:(quote as ConvertedPaperQuote).conversion}:{})}:{})});
 };
 for(const c of found.candidates)if(!supportsPaperPair(c.row.pair))decide(c,'BLOCKED','Unsupported paper venue/quote; Coinbase USD or OKX USDT required');
 const candidates=found.candidates.filter(c=>supportsPaperPair(c.row.pair));
 if(book.status!=='ACTIVE')notes.push('Base-sleeve entries paused; exits checked');
 for(const c of candidates)if(!monitorHealthy||book.status!=='ACTIVE')decide(c,'BLOCKED',!monitorHealthy?'Exit monitoring unhealthy':'Paper entries paused');
 const liquidity=(coin:string,pair:{exchange:string;product:string})=>{
  const v=discovery?.rows?.find(r=>r.id===coin)?.venues?.find(x=>x.exchange===pair.exchange&&x.pair===pair.product.replace('-','/'));
  const age=Date.now()-Date.parse(v?.observedAt??'');
  if(!v||!Number.isFinite(v.volumeUsd)||v.volumeUsd<=0||!Number.isFinite(age)||age<0||age>L.maxVolumeAgeHours*3600000)throw Error(`Pair 24h volume unavailable or older than ${L.maxVolumeAgeHours}h; liquidity cap cannot be verified`);
  return {volumeUsd:v.volumeUsd,observedAt:v.observedAt,source:'discovery snapshot (CoinGecko exchange tickers)',capUsd:v.volumeUsd*L.maxPairVolumePct/100};
 };
 let attempts=0,btcRegime:BtcRegime|null=null;
 if(monitorHealthy&&book.status==='ACTIVE'&&candidates.length)btcRegime=await currentBtcRegime().catch(()=>null);
 if(monitorHealthy&&book.status==='ACTIVE')for(const c of candidates){
  if(opened>=L.cycleEntries||attempts>=L.cycleValidations){decide(c,'DEFERRED',opened>=L.cycleEntries?`${L.cycleEntries}-entry cycle limit`:`${L.cycleValidations}-validation cycle limit`);continue;}
  const row=c.row,pair=row.pair!;
  let checkedQuote:Awaited<ReturnType<typeof fetchPaperQuote>>|undefined;
  try{
   const key=`crypto-base-v1|${row.id}|${pair.product}|${row.asOf}|`;
   if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,book.id,key])).length){decide(c,'BLOCKED','Signal already traded');continue;}
   const opens=await listOpenPositions(workspaceId,book.id);
   if(opens.length>=L.positions){decide(c,'BLOCKED',`${L.positions}-position cap`);continue;}
   if(opens.some(p=>p.symbol===row.id)){decide(c,'BLOCKED','Position already open');continue;}
   attempts++;
   const converted=pair.exchange==='okex',instrument=converted?`okx-usd-v1:${pair.product}`:`coinbase:${pair.product}`;
   const liq=liquidity(row.id,pair);
   const [nativeSignal,quote]=await Promise.all([fetchVolumeMomentum(pair,Date.now()),converted?fetchOkxUsdQuote(pair.product):fetchPaperQuote(pair.product)]);
   checkedQuote=quote;
   if(converted&&nativeSignal.stage==='MOMENTUM_VOLUME'){const cv=(quote as ConvertedPaperQuote).conversion;if(cv.nativeAsk<nativeSignal.entryFloor!||cv.nativeAsk*1.001>nativeSignal.maxEntry!)throw Error('Native USDT quote is outside the valid entry zone');}
   const signal=converted?usdSignal(nativeSignal,quote as ConvertedPaperQuote):nativeSignal;
   if(converted)await fetchOkxUsdPath(row.id,pair.product,new Date(Math.floor(Date.now()/900000)*900000-900000).toISOString());
   if(signal.asOf!==row.asOf||signal.kind!==row.kind)throw Error('Setup candle changed; refresh momentum scan');
   if(!(typeof signal.atr==='number'&&signal.atr>0))throw Error('Signal ATR unavailable; the trailing exit cannot be defined');
   // The quote must still be inside the early window above the base high, not just inside the momentum zone.
   if(quote.ask>c.base.high!*(1+BASE_BREAKOUT_MAX_EXTENSION))throw Error(`Quote is more than ${BASE_BREAKOUT_MAX_EXTENSION*100}% above the base high; no longer an early entry`);
   await atomicQueries(async()=>{
    await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,book!.id]);
    const current=await getPortfolioById(workspaceId,book!.id);if(!current||current.mode!=='SIMULATED'||current.status!=='ACTIVE')throw Error('Entries paused');
    if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,current.id,key])).length)throw Error('Signal already traded');
    const opensNow=await listOpenPositions(workspaceId,current.id);
    if(opensNow.some(p=>p.symbol===row.id))throw Error('Position already open');
    if(opensNow.length>=L.positions)throw Error(`${L.positions}-position cap`);
    if(current.settings.feesPctEstimate!==.05||current.settings.slippagePctEstimate!==.05)throw Error('Unexpected paper cost settings');
    if(current.totalEquity<current.startingBalance*(1-L.lossFromStartPct/100))throw Error(`${L.lossFromStartPct}% loss-from-start entry stop`);
    const [daily]=await q<{n:string}>('SELECT COUNT(*) AS n FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND filled_at >= date_trunc(\'day\',NOW() AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\'',[workspaceId,current.id]);
    if(Number(daily?.n)>=L.dailyEntries)throw Error(`Daily ${L.dailyEntries}-entry cap`);
    // Sizing reuses the momentum planner (0.25% risk to the structural stop); its 2R figure is a sizing reference only and is not placed as a target.
    const plan=planCryptoPaper(signal,quote,current.totalEquity,current.currentCash,Date.now(),converted?.001:.0005,liq.capUsd,1);if(!plan.ok)throw Error(plan.reason);
    const openRisk=opensNow.reduce((s,p)=>s+positionRiskUsd(p),0);
    if(openRisk+plan.risk>current.totalEquity*L.openRiskPct/100)throw Error(`${L.openRiskPct}% portfolio risk cap`);
    const exitRules=baseExitRules(signal.atr!);
    const order=await createSimulatedOrder({portfolio:paperCostPortfolio(current,instrument),symbol:row.id,assetClass:'crypto',instrumentType:instrument,side:'LONG',orderType:'MARKET_SIM',plannedEntry:signal.close,triggerPrice:null,quantity:plan.quantity,notional:plan.notional,stopLoss:plan.stop,takeProfit1:null,takeProfit2:null,takeProfit3:null,sourceEdgePacketId:null,playbookId:PLAYBOOK_BASE,createdReason:key+JSON.stringify({sleeve:'base',version:converted?2:1,signal,nativeSignal,pair,quote,plan:{...plan,targetPlaced:false},base:{high:c.base.high,low:c.base.low,widthPct:c.base.widthPct,gapPct:c.base.gapPct,slopePct:c.base.slopePct,contraction:c.base.contraction,asOf:c.base.asOf,exchange:c.base.exchange,product:c.base.product},extensionPct:c.extensionPct,currency:'USD',exitModel:converted?'conservative-cross-currency-bounds':'native-usd',exitRules,btcRegime,flowStamp:row.flowStamp??null,jev:row.jev??unavailableJev(Date.now()),catalyst:row.catalyst??unavailableCatalyst(Date.now(),'not-stamped'),chart:row.chart??unavailableChart(Date.now(),'not-stamped',row.bars?.length??0),shadow:row.shadow??null,liquidity:{...liq,capped:plan.liquidityCapped},simulation:true,exchangeOrder:false}),arcaConfidence:null});
    await fillOrderAndOpenPosition({portfolio:paperCostPortfolio(current,instrument),order,currentPrice:quote.ask,validationEvidence:{packetId:key,priceAt:quote.priceAt,regime:null,policyId:'crypto-paper-base-v1'}});
    opened++;
    decide(c,'OPENED',[`Base-breakout sleeve entry ${c.extensionPct}% above the daily base high. SIMULATED`,`exit: ${BASE_TRAIL_ATR}-ATR trail on completed candles, initial stop ${plan.stop}, ${L.timeStopHours}h time stop below +${L.timeStopMinR}R, no fixed target`,...(plan.liquidityCapped?[`size capped at ${L.maxPairVolumePct}% of pair 24h volume`]:[]),...(btcRegime?.state==='DOWN'?['BTC daily trend DOWN recorded; not a filter']:[])].join('; '),quote);
   });
  }catch(error){decide(c,'BLOCKED',error instanceof Error?error.message:'Entry validation failed',checkedQuote);notes.push(`${row.id}: ${error instanceof Error?error.message:'entry validation failed'}`);}
 }
 const report={trigger,sleeve:'base',at:new Date().toISOString(),opened,closed,marked,monitorHealthy,notes,decisions,btcRegime};
 await writeJournal({workspaceId,portfolioId:book.id,journalType:'REVIEW',title:STATUS,reasoning:trigger+': '+(notes.join('; ')||'Base-breakout paper cycle completed'),evidence:[JSON.stringify(report)]});
 return report;
}
export async function runCryptoBaseSleeveAll(monitorOnly=false){
 const accounts=await q<{workspace_id:string}>("SELECT workspace_id FROM arca_portfolios WHERE name=$1 AND mode='SIMULATED' AND status IN ('ACTIVE','PAUSED')",[CRYPTO_PAPER_BASE_NAME]);
 const results=[];for(const a of accounts){try{results.push(await runCryptoBaseSleeveCycle(a.workspace_id,'cron',monitorOnly));}catch(error){console.error('[crypto-paper-base] Cycle failed',error);results.push({error:'Base-breakout paper cycle failed; check account status'});}}
 return {ok:!results.some(r=>'error' in r||('monitorHealthy' in r&&!r.monitorHealthy)||('skipped' in r&&r.reason===BUSY)),simulated:true,accounts:accounts.length,results};
}
