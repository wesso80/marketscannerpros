import {getRedis} from '@/lib/redis';
import {chartState} from './cryptoJevChart';
import {DAILY_BASE_LIMITS} from './cryptoBaseScan';
import type {BaseScanRow} from './cryptoBaseScan';
import {MOMENTUM_LIMITS} from './cryptoVolumeMomentum';
import type {MomentumScanRow} from './cryptoVolumeMomentum';
import {BASE_BREAKOUT_MAX_EXTENSION,BASE_LIMITS,BASE_SCAN_KEY,MOMENTUM_KEY,baseBreakoutCandidates} from './cryptoPaperBase';
import type {BaseScan} from './cryptoBaseScan';
import type {MomentumScan} from './cryptoVolumeMomentum';
import {planCryptoPaper,type CryptoPaperQuote} from './cryptoPaperMarket';
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
/**
 * Advisory only. Verdict for each base-breakout candidate from plain math on stored candles and saved Redis scans.
 * No provider calls, no model calls, no orders. PASS / WARN / REJECT never blocks, sizes, ranks, or
 * changes a paper entry or exit. The paper sleeves do not read this module.
 *
 * Chart reads reuse chartState (the same 21-bar shape the chart confirmer derived). Trade reads reuse
 * the base-sleeve limits and planCryptoPaper. Thresholds that already existed are imported; the rest
 * are named below.
 */
export const BREAKOUT_VERDICT_KEY='admin:crypto-markets:breakout-verdicts:v1';
/** Discovery snapshot the paper cycle already reads for the pair-volume cap. */
export const DISCOVERY_KEY='admin:crypto-discovery:v1';
/**
 * Keep a stale stamp readable. Two daily base intervals, matching how the summary keeps stale rows
 * instead of dropping them. The cron rewrites this every 15 minutes while it is healthy.
 */
export const BREAKOUT_VERDICT_TTL_SEC=48*3600;
/** Two 15-minute arca-cycle intervals. A stamp older than this is stale even if the scans are not. */
export const VERDICT_STALE_AFTER_MS=2*15*60*1000;
/**
 * Scan windows copied from STALE_AFTER_MS in cryptoSummary (two 4h momentum scans, two daily bases).
 * A test locks these to that object so the flags cannot drift.
 */
export const VERDICT_SCAN_STALE_MS={momentum:2*4*3600000,base:2*86400000} as const;
/**
 * planCryptoPaper rejects a plan whose reward/risk is below this after estimated costs.
 * The signal target itself is 2R (TARGET_RULE); this is the floor the planner still accepts.
 */
export const MIN_REWARD_RISK=1.5;
/**
 * Close-strength bands for chartState.closePosition (0 at the low, 1 at the high) and bodyShare.
 * No prior constant existed. Pass: near the high with a real body. Warn: middling. Reject: mid/low or wick.
 */
export const CLOSE_STRENGTH={positionPass:0.7,positionWarn:0.5,bodyPass:0.5,bodyWarn:0.35} as const;
/**
 * 4h base-shape bands for chartState, where the daily base gates do not already apply.
 * priorRangeAtr pass/warn are new. Slope pass reuses DAILY_BASE_LIMITS.slopePct; the warn band is twice that.
 * Volume-trend pass reuses DAILY_BASE_LIMITS.contraction; warn is up to flat (1).
 * Closes-above-SMA20: a base should straddle its average. A flat slope can still pass the warn band.
 */
export const PRIOR_BASE={rangeAtrPass:4,rangeAtrWarn:8,slopeWarnMultiple:2,volumeTrendWarn:1,closesPass:[6,14],closesWarn:[3,17]} as const;
/** Same reference the base-sleeve journal uses when no live balance is on the saved scan. The risk cap is a percent of equity, so the ratio does not depend on this figure. */
export const VERDICT_NOMINAL_EQUITY=200_000;
export type VerdictLevel='PASS'|'WARN'|'REJECT';
export type VerdictCheckId='baseCleanliness'|'closeStrength'|'volumeExpansion'|'overheadSupply'|'stopTargetSanity'|'stopExists'|'plannedSize'|'extension'|'liquidity'|'openRisk';
export type VerdictCheck={id:VerdictCheckId;status:VerdictLevel;reason:string;feed:string};
export type BreakoutVerdictRow={id:string;symbol:string;verdict:VerdictLevel;checks:VerdictCheck[];signalAt:string|null};
export type BreakoutVerdictSnapshot={version:1;advisory:true;simulated:true;asOf:string;stale:boolean;momentumAsOf:string|null;baseAsOf:string|null;note:string|null;rows:BreakoutVerdictRow[]};
export type PublicVerdict={advisory:true;level:VerdictLevel;reasons:string[];asOf:string;stale:boolean};
export type VerdictAccount={equity:number|null;cash:number|null;openRiskUsd:number|null;volumeUsd:number|null;volumeObservedAt:string|null};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const worst=(levels:VerdictLevel[]):VerdictLevel=>levels.includes('REJECT')?'REJECT':levels.includes('WARN')?'WARN':'PASS';
const check=(id:VerdictCheckId,status:VerdictLevel,reason:string,feed:string):VerdictCheck=>({id,status,reason,feed});
/** Feed copy must not carry a number. A digit drops the sentence rather than leaking a level. */
export function sanitizeFeed(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const text=value.replace(/\s+/g,' ').trim();
 if(!text||text.length>200||/\d/.test(text))return null;
 return text;
}
function ageStale(asOf:string|null,now:number,maxAge:number){
 const t=Date.parse(asOf??'');
 if(!Number.isFinite(t))return true;
 const age=now-t;
 return age<0||age>maxAge;
}
export function snapshotIsStale(asOf:string|null,now:number,momentumStartedAt:string|null,baseStartedAt:string|null){
 return ageStale(asOf,now,VERDICT_STALE_AFTER_MS)||ageStale(momentumStartedAt,now,VERDICT_SCAN_STALE_MS.momentum)||ageStale(baseStartedAt,now,VERDICT_SCAN_STALE_MS.base);
}
export function parseVerdictSnapshot(value:unknown):BreakoutVerdictSnapshot|null{
 if(!value||typeof value!=='object')return null;
 const s=value as BreakoutVerdictSnapshot;
 if(s.version!==1||typeof s.asOf!=='string'||!Array.isArray(s.rows))return null;
 return s;
}
export function publicBreakoutVerdict(snapshot:BreakoutVerdictSnapshot,id:string,now:number,momentumStartedAt:string|null,baseStartedAt:string|null):PublicVerdict|null{
 const row=snapshot.rows.find(r=>r&&r.id===id);
 if(!row||(row.verdict!=='PASS'&&row.verdict!=='WARN'&&row.verdict!=='REJECT'))return null;
 const reasons=(row.checks??[]).map(c=>sanitizeFeed(c?.feed)).filter((r):r is string=>!!r);
 return {advisory:true,level:row.verdict,reasons,asOf:snapshot.asOf,stale:snapshotIsStale(snapshot.asOf,now,momentumStartedAt,baseStartedAt)};
}
function band(value:number|null,pass:number,warn:number,higherIsWorse:boolean):VerdictLevel{
 if(!finite(value))return 'WARN';
 if(higherIsWorse)return value<=pass?'PASS':value<=warn?'WARN':'REJECT';
 return value>=pass?'PASS':value>=warn?'WARN':'REJECT';
}
function baseCleanliness(row:MomentumScanRow,base:BaseScanRow):VerdictCheck{
 const L=DAILY_BASE_LIMITS;
 const dailyMissing=![base.widthPct,base.gapPct,base.slopePct,base.contraction].every(finite);
 const dailyFail=!dailyMissing&&(base.stage!=='BASE'||base.widthPct!>L.widthPct||base.gapPct!>L.gapPct||base.slopePct!>L.slopePct||base.contraction!>L.contraction);
 const state=chartState(row);
 const parts:VerdictLevel[]=[];
 const notes:string[]=[];
 if(dailyMissing){parts.push('WARN');notes.push('daily base shape is incomplete');}
 else if(dailyFail){parts.push('REJECT');notes.push(`daily base is outside ${L.widthPct}% width, ${L.gapPct}% MA gap, ${L.slopePct}% slope, or ${L.contraction.toFixed(2)} volume contraction`);}
 else{parts.push('PASS');notes.push(`daily base is inside ${L.widthPct}% width, ${L.gapPct}% MA gap, ${L.slopePct}% slope, and ${L.contraction.toFixed(2)} volume contraction`);}
 if(!state){parts.push('WARN');notes.push('stored candles cannot support the prior-base read');}
 else{
  const range=band(state.priorRangeAtr,PRIOR_BASE.rangeAtrPass,PRIOR_BASE.rangeAtrWarn,true);
  const slope=band(state.priorSlopePct==null?null:Math.abs(state.priorSlopePct),L.slopePct,L.slopePct*PRIOR_BASE.slopeWarnMultiple,true);
  const vol=band(state.priorVolumeTrend,L.contraction,PRIOR_BASE.volumeTrendWarn,true);
  const closes=state.priorClosesAboveSma20;
  const closeLevel:VerdictLevel=closes>=PRIOR_BASE.closesPass[0]&&closes<=PRIOR_BASE.closesPass[1]?'PASS':closes>=PRIOR_BASE.closesWarn[0]&&closes<=PRIOR_BASE.closesWarn[1]?'WARN':'REJECT';
  const softened:VerdictLevel=closeLevel==='REJECT'&&slope==='PASS'?'WARN':closeLevel;
  parts.push(range,slope,vol,softened);
  if(range!=='PASS')notes.push(range==='REJECT'?`prior range is wider than ${PRIOR_BASE.rangeAtrWarn} ATR`:`prior range is wider than ${PRIOR_BASE.rangeAtrPass} ATR`);
  if(slope!=='PASS')notes.push(slope==='REJECT'?`prior slope exceeds ${L.slopePct*PRIOR_BASE.slopeWarnMultiple}%`:`prior slope exceeds ${L.slopePct}%`);
  if(vol!=='PASS')notes.push(vol==='REJECT'?'prior volume is expanding':'prior volume is not contracting');
  if(softened!=='PASS')notes.push('prior closes do not straddle the 20-candle average');
 }
 const status=worst(parts);
 const feed=dailyFail?'Daily base is outside the tightness rules':status==='PASS'?'Daily base and the prior candles are tight, flat and quiet':status==='WARN'?'Base read is incomplete or only partly tight':'Prior candles are outside the tightness rules';
 return check('baseCleanliness',status,notes.join('; '),feed);
}
function closeStrength(row:MomentumScanRow):VerdictCheck{
 const state=chartState(row);
 if(!state||!finite(state.closePosition)||!finite(state.bodyShare))return check('closeStrength','WARN','Stored candles cannot support the close read','Close strength could not be read from stored candles');
 const position=band(state.closePosition,CLOSE_STRENGTH.positionPass,CLOSE_STRENGTH.positionWarn,false);
 const body=band(state.bodyShare,CLOSE_STRENGTH.bodyPass,CLOSE_STRENGTH.bodyWarn,false);
 const wide=finite(state.rangeAtr)&&state.rangeAtr>MOMENTUM_LIMITS.signalRangeAtr;
 const status=wide?'REJECT':worst([position,body]);
 const reason=wide
  ?`Signal range exceeds the ${MOMENTUM_LIMITS.signalRangeAtr} ATR chase limit`
  :status==='PASS'
   ?`Close is in the top of the candle (position ${CLOSE_STRENGTH.positionPass}, body ${CLOSE_STRENGTH.bodyPass})`
   :status==='WARN'
    ?`Close is only middling versus position ${CLOSE_STRENGTH.positionPass} and body ${CLOSE_STRENGTH.bodyPass}`
    :'Close is mid-range, near the low, or mostly wick';
 const feed=status==='PASS'?'Breakout close finished near the high with a real body':status==='WARN'?'Breakout close is only middling':'Breakout close lacks strength';
 return check('closeStrength',status,reason,feed);
}
function volumeExpansion(row:MomentumScanRow):VerdictCheck{
 const rv=finite(row.relativeVolume)?row.relativeVolume:null;
 const state=chartState(row);
 const vsPrev=state?.volumeVsPrevious??null;
 if(rv==null)return check('volumeExpansion','REJECT','Relative volume is missing','Volume expansion could not be read');
 if(rv<MOMENTUM_LIMITS.volumeExpansion)return check('volumeExpansion','REJECT',`Relative volume is below the ${MOMENTUM_LIMITS.volumeExpansion}× prior-average rule`,'Volume did not expand versus the prior average');
 if(!finite(vsPrev))return check('volumeExpansion','WARN',`Relative volume clears ${MOMENTUM_LIMITS.volumeExpansion}× but the previous candle volume was not usable`,'Volume expanded versus the average; the previous candle was not usable');
 if(vsPrev<1)return check('volumeExpansion','WARN',`Relative volume clears ${MOMENTUM_LIMITS.volumeExpansion}× but the signal candle is below the previous candle`,'Volume expanded versus the average but not versus the previous candle');
 return check('volumeExpansion','PASS',`Relative volume clears ${MOMENTUM_LIMITS.volumeExpansion}× and the signal candle is at least the previous candle`,'Volume expanded versus the prior average and the previous candle');
}
function overheadSupply(row:MomentumScanRow):VerdictCheck{
 const state=chartState(row);
 if(!state)return check('overheadSupply','WARN','Stored candles cannot support the overhead read','Overhead supply could not be read from stored candles');
 const near=MOMENTUM_LIMITS.pastTriggerAtr;
 if(!state.priorHighsAboveClose||!finite(state.nearestHighAboveCloseAtr))return check('overheadSupply','PASS','Nothing from the prior candles sits above the close','No nearby overhead supply');
 if(state.nearestHighAboveCloseAtr<=near)return check('overheadSupply','WARN',`A prior high sits within ${near} ATR above the close`,'Overhead supply sits near the close');
 return check('overheadSupply','PASS',`The nearest prior high is more than ${near} ATR above the close`,'No nearby overhead supply');
}
function geometry(row:MomentumScanRow):{ok:true}|{ok:false;kind:'stop'|'target'|'rr'}{
 if(!(finite(row.stop)&&row.stop>0&&finite(row.close)&&row.stop<row.close))return {ok:false,kind:'stop'};
 if(!(finite(row.target)&&row.target>row.close))return {ok:false,kind:'target'};
 const risk=row.close-row.stop,reward=row.target-row.close;
 if(!(risk>0)||reward/risk+1e-9<MIN_REWARD_RISK)return {ok:false,kind:'rr'};
 return {ok:true};
}
function quoteFor(row:MomentumScanRow,now:number):CryptoPaperQuote|null{
 if(!finite(row.close)||row.close<=0)return null;
 const at=new Date(now).toISOString();
 return {bid:row.close,ask:row.close,priceAt:at,receivedAt:at,product:row.pair?.product??'PAIR-USD'};
}
function costRate(row:MomentumScanRow){return row.pair?.exchange==='okex'?0.001:0.0005;}
function planAt(row:MomentumScanRow,now:number,equity:number,cash:number,maxNotional:number){
 const quote=quoteFor(row,now);
 if(!quote)return {ok:false as const,reason:'Missing plan or account inputs'};
 return planCryptoPaper(row,quote,equity,cash,now,costRate(row),maxNotional,1);
}
function stopTargetSanity(row:MomentumScanRow,now:number,equity:number,cash:number):VerdictCheck{
 const g=geometry(row);
 if(!g.ok){
  const reason=g.kind==='stop'?'Stop is missing or not below the close':g.kind==='target'?'Target is missing or not above the close':`Reward to risk is below ${MIN_REWARD_RISK}`;
  const feed=g.kind==='rr'?'Reward to risk is below the existing minimum':'Stop and target are not a sane pair';
  return check('stopTargetSanity','REJECT',reason,feed);
 }
 const plan=planAt(row,now,equity,cash,Infinity);
 if(!plan.ok&&plan.reason.startsWith('Reward/risk'))return check('stopTargetSanity','REJECT',`Reward to risk after estimated costs is below ${MIN_REWARD_RISK}`,'Reward to risk is below the existing minimum');
 return check('stopTargetSanity','PASS',`Stop is under the close and reward to risk is at least ${MIN_REWARD_RISK}, with the planner's ${MIN_REWARD_RISK} floor after costs`,'Stop and target are structurally sane');
}
function stopExists(row:MomentumScanRow):VerdictCheck{
 if(finite(row.stop)&&row.stop>0&&finite(row.close)&&row.stop<row.close)return check('stopExists','PASS','A structural stop is under the close','A protective stop is present');
 return check('stopExists','REJECT','No structural stop under the close','No protective stop');
}
function extension(row:MomentumScanRow,base:BaseScanRow):VerdictCheck{
 if(!finite(row.close)||!finite(base.high)||base.high<=0)return check('extension','REJECT','Extension cannot be measured','Entry extension could not be measured');
 const ext=row.close/base.high-1;
 const pastWindow=!(ext>0&&ext<=BASE_BREAKOUT_MAX_EXTENSION);
 const pastChase=finite(row.maxEntry)&&row.close>row.maxEntry;
 const pastTrigger=finite(row.atr)&&row.atr>0&&finite(row.trigger)&&row.close-row.trigger>MOMENTUM_LIMITS.pastTriggerAtr*row.atr;
 if(pastWindow||pastChase||pastTrigger){
  const why=pastWindow?`close is outside the 0–${BASE_BREAKOUT_MAX_EXTENSION*100}% base window`:pastChase?'close is past the signal chase limit':`close is more than ${MOMENTUM_LIMITS.pastTriggerAtr} ATR past the breakout level`;
  return check('extension','REJECT',`Entry is chasing: ${why}`,'Entry is chasing past the extension limit');
 }
 return check('extension','PASS',`Close is inside the 0–${BASE_BREAKOUT_MAX_EXTENSION*100}% base window and the signal chase limit`,'Entry is inside the extension limit');
}
type PlanResult=ReturnType<typeof planAt>;
function plannedSize(row:MomentumScanRow,plan:PlanResult,equity:number|null):VerdictCheck{
 const usingNominal=equity==null;
 if(!plan.ok){
  if(plan.reason.startsWith('Insufficient size'))return check('plannedSize','REJECT','Planner could not produce a size inside the risk and notional caps','Planned risk does not fit the per-trade cap');
  if(plan.reason.startsWith('Reward/risk')||plan.reason.startsWith('No current')||plan.reason.includes('entry zone')||plan.reason.startsWith('Quote')||plan.reason.startsWith('Spread')||plan.reason.startsWith('Price outside')||plan.reason.startsWith('Unsupported')||plan.reason.startsWith('Invalid risk')||plan.reason.startsWith('Missing'))return check('plannedSize','WARN',`Size was not planned (${plan.reason})`,'Planned size could not be checked');
  return check('plannedSize','REJECT','Planner did not produce a size inside the cap','Planned risk does not fit the per-trade cap');
 }
 const book=equity??VERDICT_NOMINAL_EQUITY;
 const riskCap=book*BASE_LIMITS.riskPerTradePct/100,notionalCap=book*BASE_LIMITS.notionalPct/100;
 if(plan.risk<=riskCap+1e-6&&plan.notional<=notionalCap+1e-6){
  const reason=`Planned risk stays inside the ${BASE_LIMITS.riskPerTradePct}% per-trade cap and the ${BASE_LIMITS.notionalPct}% notional cap${usingNominal?'; no live balance was on the saved scan, and the cap is a percent of equity':''}`;
  return check('plannedSize','PASS',reason,'Planned risk stays inside the per-trade cap');
 }
 return check('plannedSize','REJECT',`Planned risk exceeds the ${BASE_LIMITS.riskPerTradePct}% per-trade cap or the ${BASE_LIMITS.notionalPct}% notional cap`,'Planned risk does not fit the per-trade cap');
}
function liquidity(volumeUsd:number|null,observedAt:string|null,now:number,capped:PlanResult,open:PlanResult):VerdictCheck{
 const age=now-Date.parse(observedAt??'');
 const fresh=finite(volumeUsd)&&volumeUsd>0&&Number.isFinite(age)&&age>=0&&age<=BASE_LIMITS.maxVolumeAgeHours*3600000;
 if(!fresh)return check('liquidity','REJECT',`Pair volume is missing or older than ${BASE_LIMITS.maxVolumeAgeHours}h, so the ${BASE_LIMITS.maxPairVolumePct}% cap cannot be verified`,'Liquidity cap does not hold');
 const cap=volumeUsd!*BASE_LIMITS.maxPairVolumePct/100;
 if(capped.ok)return check('liquidity','PASS',`Pair volume is fresh and the plan fits under the ${BASE_LIMITS.maxPairVolumePct}% volume cap`,'Liquidity cap holds on the saved scan');
 if(open.ok&&!capped.ok)return check('liquidity','REJECT',`The ${BASE_LIMITS.maxPairVolumePct}% volume cap is below the size the planner will accept`,'Liquidity cap does not hold');
 if(cap>0)return check('liquidity','WARN','Pair volume is fresh but size was not planned, so the cap was not applied','Liquidity cap could not be applied');
 return check('liquidity','REJECT','Liquidity cap does not hold','Liquidity cap does not hold');
}
function openRisk(equity:number|null,openRiskUsd:number|null,plan:PlanResult):VerdictCheck{
 if(!finite(equity)||equity<=0||!finite(openRiskUsd)||openRiskUsd<0)return check('openRisk','WARN','Open risk was not on the saved scan','Open risk was not on the saved scan');
 if(!plan.ok)return check('openRisk','WARN','Open risk was not checked because no size was planned','Open risk could not be checked');
 const cap=equity*BASE_LIMITS.openRiskPct/100;
 if(openRiskUsd+plan.risk>cap+1e-6)return check('openRisk','REJECT',`Open risk plus this plan would exceed the ${BASE_LIMITS.openRiskPct}% book limit`,'Open risk would exceed the book limit');
 return check('openRisk','PASS',`Open risk plus this plan stays inside the ${BASE_LIMITS.openRiskPct}% book limit`,'Open risk stays inside the book limit');
}
export function scoreBreakoutCandidate(row:MomentumScanRow,base:BaseScanRow,now:number,account:VerdictAccount):BreakoutVerdictRow{
 const equity=finite(account.equity)&&account.equity>0?account.equity:null;
 const cash=finite(account.cash)&&account.cash>0?account.cash:equity??VERDICT_NOMINAL_EQUITY;
 const book=equity??VERDICT_NOMINAL_EQUITY;
 const capUsd=finite(account.volumeUsd)&&account.volumeUsd>0?account.volumeUsd*BASE_LIMITS.maxPairVolumePct/100:Infinity;
 const openPlan=planAt(row,now,book,cash,Infinity);
 const cappedPlan=planAt(row,now,book,cash,capUsd);
 const checks:VerdictCheck[]=[
  baseCleanliness(row,base),
  closeStrength(row),
  volumeExpansion(row),
  overheadSupply(row),
  stopTargetSanity(row,now,book,cash),
  stopExists(row),
  plannedSize(row,openPlan,equity),
  extension(row,base),
  liquidity(account.volumeUsd,account.volumeObservedAt,now,cappedPlan,openPlan),
  openRisk(equity,account.openRiskUsd,openPlan),
 ];
 return {id:row.id,symbol:row.symbol,verdict:worst(checks.map(c=>c.status)),checks,signalAt:typeof row.asOf==='string'?row.asOf:null};
}
type DiscoverySnap={rows?:(Pick<DiscoveryRow,'id'>&{venues?:Pick<VenueEvidence,'exchange'|'pair'|'volumeUsd'|'observedAt'>[]})[]}|null;
export function pairVolume(discovery:DiscoverySnap,row:MomentumScanRow):{volumeUsd:number|null;volumeObservedAt:string|null}{
 const pair=row.pair;
 if(!pair)return {volumeUsd:null,volumeObservedAt:null};
 const venue=discovery?.rows?.find(r=>r.id===row.id)?.venues?.find(v=>v.exchange===pair.exchange&&v.pair===pair.product.replace('-','/'));
 return venue?{volumeUsd:venue.volumeUsd,volumeObservedAt:venue.observedAt}:{volumeUsd:null,volumeObservedAt:null};
}
export function scoreSavedBreakouts(momentum:MomentumScan|null,bases:BaseScan|null,discovery:DiscoverySnap,now:number,account?:Partial<VerdictAccount>):BreakoutVerdictSnapshot{
 const found=baseBreakoutCandidates(momentum,bases,now);
 const shared={equity:account?.equity??null,cash:account?.cash??null,openRiskUsd:account?.openRiskUsd??null};
 const rows=found.candidates.map(c=>scoreBreakoutCandidate(c.row,c.base,now,{...shared,...pairVolume(discovery,c.row)}));
 const momentumAsOf=typeof momentum?.startedAt==='string'?momentum.startedAt:null;
 const baseAsOf=typeof bases?.startedAt==='string'?bases.startedAt:null;
 return {version:1,advisory:true,simulated:true,asOf:new Date(now).toISOString(),stale:snapshotIsStale(new Date(now).toISOString(),now,momentumAsOf,baseAsOf),momentumAsOf,baseAsOf,note:found.note,rows};
}
/** Reads saved scans only. Never throws. Does not place, size, or block a paper trade. */
export async function saveBreakoutVerdicts(now=Date.now()){
 try{
  const redis=getRedis();
  if(!redis)return {ok:false as const,error:'Redis unavailable',saved:0};
  const [momentum,bases,discovery]=await Promise.all([
   redis.get<MomentumScan>(MOMENTUM_KEY),
   redis.get<BaseScan>(BASE_SCAN_KEY),
   redis.get<DiscoverySnap>(DISCOVERY_KEY).catch(()=>null),
  ]);
  const snapshot=scoreSavedBreakouts(momentum,bases,discovery,now);
  await redis.set(BREAKOUT_VERDICT_KEY,snapshot,{ex:BREAKOUT_VERDICT_TTL_SEC});
  return {ok:true as const,saved:snapshot.rows.length,asOf:snapshot.asOf,stale:snapshot.stale};
 }catch{
  return {ok:false as const,error:'Breakout verdicts failed',saved:0};
 }
}
