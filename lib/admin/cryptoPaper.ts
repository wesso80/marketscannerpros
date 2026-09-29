import {supportsPaperPair,fetchOkxUsdQuote,fetchOkxUsdPath,usdSignal,paperCostPortfolio,type ConvertedPaperQuote} from './cryptoPaperOkx';
import {reconcileCryptoPaper,type CryptoReconciliation} from './cryptoPaperReconciliation';
import {q,atomicQueries} from '@/lib/db';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from './adminCrypto';
import {ARCA_DEFAULT_SETTINGS} from './portfolio-lab/constants';
import {getDefaultPortfolio,getPortfolioById,insertPortfolio,listOpenPositions,listTrades,listJournal} from './portfolio-lab/portfolioStore';
import {createSimulatedOrder,fillOrderAndOpenPosition} from './portfolio-lab/simulatedOrderEngine';
import {markAndMaybeExit} from './portfolio-lab/positionEngine';
import {evaluatePaperExitPath} from './portfolio-lab/paperExitPath';
import {refreshPaperBalances} from './portfolio-lab/refreshPaperBalances';
import {writeJournal} from './portfolio-lab/journalEngine';
import {fetchVolumeMomentum,type MomentumScan} from './cryptoVolumeMomentum';
import {fetchPaperQuote,fetchPaperPath,planCryptoPaper,PaperMarketError} from './cryptoPaperMarket';
export const CRYPTO_PAPER_NAME='Crypto Markets Paper';
export type CryptoPaperDecision={coin:string;product:string|null;venue:string|null;signalAt:string|null;checkedAt:string;status:'OPENED'|'BLOCKED'|'DEFERRED';reason:string;quoteAt?:string;bid?:number;ask?:number;quoteCurrency?:'USD';conversion?:ConvertedPaperQuote['conversion']};
const PLAYBOOK='crypto-momentum-v1',STATUS='Crypto paper cycle completed';
const BUSY='Crypto paper cycle already running or cooling down',MANUAL_RECENT='Manual crypto paper cycle ran within the last three minutes';
export async function cryptoPaperState(workspaceId:string){
 return atomicQueries(async()=>{
 let portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
 if(!portfolio)return {portfolio:null,positions:[],trades:[],journal:[]};
 await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR SHARE',[workspaceId,portfolio.id]);
 portfolio=await getPortfolioById(workspaceId,portfolio.id);if(!portfolio)throw Error('Paper account unavailable');
 const [positions,trades,journal]=await Promise.all([listOpenPositions(workspaceId,portfolio.id),listTrades(workspaceId,portfolio.id,{limit:100}),listJournal(workspaceId,portfolio.id,{limit:25})]);
 let reconciliation:CryptoReconciliation;
 try{
  const [totals]=await q<{net:string;fees:string;count:string;invalid:string}>(`SELECT COALESCE(SUM(realised_pnl),0) AS net,COALESCE(SUM(fees_estimate),0) AS fees,COUNT(*) AS count,COUNT(*) FILTER (WHERE side<>'LONG' OR ABS(realised_pnl-((exit_price-entry_price)*quantity-fees_estimate))>0.03) AS invalid FROM arca_trades WHERE workspace_id=$1 AND portfolio_id=$2`,[workspaceId,portfolio.id]);
  if(!totals)throw Error('Missing ledger totals');
  reconciliation=reconcileCryptoPaper(portfolio,positions,{net:Number(totals.net),fees:Number(totals.fees),count:Number(totals.count),invalid:Number(totals.invalid)});
 }catch{reconciliation={status:'UNAVAILABLE',checkedAt:new Date().toISOString(),reason:'Ledger totals could not be read'};}
 return {portfolio,positions,trades,journal,reconciliation};
 });
}
export async function setCryptoPaperActive(workspaceId:string,active:boolean){
 return atomicQueries(async()=>{
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`crypto-paper-create:${workspaceId}`]);
  let portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
  if(!portfolio&&active)portfolio=await insertPortfolio({workspaceId,name:CRYPTO_PAPER_NAME,startingBalance:200000,baseCurrency:'USD',settings:{...ARCA_DEFAULT_SETTINGS,riskPerTradePct:.25,maxSingleTradeRiskPct:.25,maxOpenPortfolioRiskPct:2,enabledAssetClasses:['crypto'],enabledPlaybooks:[PLAYBOOK],maxAssetClassExposurePct:{...ARCA_DEFAULT_SETTINGS.maxAssetClassExposurePct,crypto:50},feesPctEstimate:.05,slippagePctEstimate:.05,benchmarkSymbol:'BTC'}});
  if(!portfolio)return null;
  await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,portfolio.id]);
  await q('UPDATE arca_portfolios SET status=$1,updated_at=NOW() WHERE workspace_id=$2 AND id=$3',[active?'ACTIVE':'PAUSED',workspaceId,portfolio.id]);
  await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:active?'Crypto paper entries enabled':'Crypto paper entries paused',reasoning:'SIMULATED ONLY. Coinbase USD and converted OKX USDT momentum entries. Exit monitoring continues when entries are paused. 0.25% risk, 10% notional cap per trade, five positions, 2% portfolio risk, 5% loss-from-start entry stop. Fees and slippage each 0.05% per side for Coinbase, 0.10% per side for two-leg OKX conversions. No changes to personal holdings or other paper portfolios.'});
  return portfolio.id;
 });
}
export async function runCryptoPaperCycle(workspaceId:string,trigger:'manual'|'cron'='manual',monitorOnly=false){
 const redis=getRedis();if(!redis)throw Error('Paper coordination cache unavailable');
 if(!isAdminCryptoEnabled())return {skipped:true,reason:'Admin crypto disabled'};
 const lock=`admin:crypto-paper:cycle:${workspaceId}${monitorOnly?':monitor':''}`;
 // The holder is recorded so a recent manual cycle is not reported as a cron failure; it already checked exits.
 if(!await redis.set(lock,trigger,{nx:true,ex:180}))return (await redis.get(lock))==='manual'?{skipped:true,reason:MANUAL_RECENT}:{skipped:true,reason:BUSY};
 let portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
 if(!portfolio)return {skipped:true,reason:'Crypto paper account not enabled'};
 const decisions:CryptoPaperDecision[]=[];
 const notes:string[]=[];let opened=0,closed=0,marked=0,monitorHealthy=true;
 const positions=await listOpenPositions(workspaceId,portfolio.id);
 if(positions.length>5){monitorHealthy=false;notes.push('Unexpected position count; entries blocked');}
 for(const position of positions){
  try{
   const converted=position.instrumentType.startsWith('okx-usd-v1:');
   const product=converted?position.instrumentType.slice(11):position.instrumentType.startsWith('coinbase:')?position.instrumentType.slice(9):'';
   if(position.assetClass!=='crypto'||position.side!=='LONG'||!(converted?/^[A-Z0-9]{1,30}-USDT$/.test(product):/^[A-Z0-9]{1,30}-USD$/.test(product)))throw Error('Unsupported position scope');
   const [quoteResult,pathResult]=await Promise.allSettled([converted?fetchOkxUsdQuote(product):fetchPaperQuote(product),converted?fetchOkxUsdPath(position.symbol,product,position.exitCheckpoint?.through??position.openedAt):fetchPaperPath(position.symbol,product,position.exitCheckpoint?.through??position.openedAt)]);
   if(pathResult.status!=='fulfilled')throw new PaperMarketError(pathResult.reason instanceof PaperMarketError?pathResult.reason.message:'Exit history request failed or timed out');
   const path=pathResult.value,quote=quoteResult.status==='fulfilled'?quoteResult.value:null;
   await atomicQueries(async()=>{
    await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,portfolio!.id]);
    const current=await getPortfolioById(workspaceId,portfolio!.id);if(!current||current.mode!=='SIMULATED')throw Error('Paper account unavailable');
    const pos=(await listOpenPositions(workspaceId,current.id)).find(p=>p.id===position.id);if(!pos)return;
    const checked=evaluatePaperExitPath(pos,path);
    // Missing chronology blocks valuation/target awards and further entries. Never skip a missing prefix.
    if(!['candle_path_checked','candle_path_exit','candle_path_no_closed_bars'].includes(checked.status))throw new PaperMarketError(`Exit chronology: ${checked.status}`);
    const through=Date.parse(checked.checkedThrough??pos.exitCheckpoint?.through??pos.openedAt);
    if(!checked.exit&&through<Math.floor(Date.now()/900000)*900000)throw new PaperMarketError('Exit history does not reach the last completed candle');
    const freshQuote=quote&&Date.now()-Date.parse(quote.priceAt)<=60000;
    if(!checked.exit&&!freshQuote)throw new PaperMarketError(quoteResult.status==='rejected'&&quoteResult.reason instanceof PaperMarketError?quoteResult.reason.message:'Exit quote unavailable or expired');
    // A proven earlier stop/target can settle even if the ticker is down.
    const result=await markAndMaybeExit({portfolio:paperCostPortfolio(current,pos.instrumentType),position:pos,currentPrice:freshQuote?quote.bid:pos.averageEntry,candlePath:path,skipLearning:true});
    const updated=await getPortfolioById(workspaceId,current.id);if(!updated)throw Error('Paper account unavailable');
    await refreshPaperBalances(updated,updated.currentCash,updated.realisedPnl);
    marked++;if(result.exit)closed++;
   });
  }catch(error){monitorHealthy=false;notes.push(`${position.symbol}: ${error instanceof PaperMarketError?error.message:'Exit accounting failed'}; entries blocked until monitoring recovers`);}
 }
 if(monitorOnly){
  const report={trigger,phase:'monitor',at:new Date().toISOString(),opened,closed,marked,monitorHealthy,notes};
  await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:'Crypto paper exit monitoring completed',reasoning:notes.join('; ')||'Exit monitoring completed before scanning',evidence:[JSON.stringify(report)]});
  return report;
 }
 portfolio=await getPortfolioById(workspaceId,portfolio.id);if(!portfolio)throw Error('Paper account unavailable');
 const scan=await redis.get<MomentumScan>('admin:crypto-markets:momentum-volume:v1');
 const scanAge=Date.now()-Date.parse(scan?.startedAt??'');
 const recent=scan&&Number.isFinite(scanAge)&&scanAge>=0&&Math.floor(Date.parse(scan.startedAt)/(4*3600000))===Math.floor(Date.now()/(4*3600000));
 const all=recent?scan.rows.filter(r=>r.stage==='MOMENTUM_VOLUME'):[];
 if(!recent)notes.push('No current 4h momentum scan; no entries');
 const decide=(candidate:typeof all[number],status:CryptoPaperDecision['status'],reason:string,quote?:Awaited<ReturnType<typeof fetchPaperQuote>>)=>{
  decisions.push({coin:candidate.id,product:candidate.pair?.product??null,venue:candidate.pair?.exchange??null,signalAt:candidate.asOf,checkedAt:new Date().toISOString(),status,reason,...(quote?{quoteAt:quote.priceAt,bid:quote.bid,ask:quote.ask,quoteCurrency:'USD' as const,...('conversion' in quote?{conversion:(quote as ConvertedPaperQuote).conversion}:{})}:{})});
 };
 for(const candidate of all)if(!supportsPaperPair(candidate.pair))decide(candidate,'BLOCKED','Unsupported paper venue/quote; Coinbase USD or OKX USDT required');
 const candidates=all.filter(r=>supportsPaperPair(r.pair));
 if(all.length>candidates.length)notes.push(`${all.length-candidates.length} setups use other quote/venue combinations; paper support pending`);
 if(!candidates.length&&recent)notes.push('No confirmed supported momentum setups in saved scan');
 if(portfolio.status!=='ACTIVE')notes.push('Entries paused; exits checked');
 for(const candidate of candidates)if(!monitorHealthy||portfolio.status!=='ACTIVE')decide(candidate,'BLOCKED',!monitorHealthy?'Exit monitoring unhealthy':'Paper entries paused');
 let attempts=0;
 if(monitorHealthy&&portfolio.status==='ACTIVE')for(const candidate of candidates){
  if(opened>=2||attempts>=5){decide(candidate,'DEFERRED',opened>=2?'Two-entry cycle limit':'Five-validation cycle limit');continue;}
  const pair=candidate.pair!;
  let checkedQuote:Awaited<ReturnType<typeof fetchPaperQuote>>|undefined;
  try{
   const key=`crypto-v1|${candidate.id}|${pair.product}|${candidate.asOf}|`;
   // Cheap duplicate check before provider requests; transaction repeats it under the portfolio lock.
   if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,portfolio.id,key])).length){decide(candidate,'BLOCKED','Signal already traded');continue;}
   const currentOpens=await listOpenPositions(workspaceId,portfolio.id);
   if(currentOpens.length>=5){decide(candidate,'BLOCKED','Five-position cap');continue;}
   if(currentOpens.some(p=>p.symbol===candidate.id)){decide(candidate,'BLOCKED','Position already open');continue;}
   attempts++;
   const converted=pair.exchange==='okex',instrument=converted?`okx-usd-v1:${pair.product}`:`coinbase:${pair.product}`;
   const [nativeSignal,quote]=await Promise.all([fetchVolumeMomentum(pair,Date.now()),converted?fetchOkxUsdQuote(pair.product):fetchPaperQuote(pair.product)]);
   checkedQuote=quote;
   if(converted&&nativeSignal.stage==='MOMENTUM_VOLUME'){const c=(quote as ConvertedPaperQuote).conversion;if(c.nativeAsk<nativeSignal.entryFloor!||c.nativeAsk*1.001>nativeSignal.maxEntry!)throw Error('Native USDT quote is outside the valid entry zone');}
   const signal=converted?usdSignal(nativeSignal,quote as ConvertedPaperQuote):nativeSignal;
   // Prove both exit providers can cover a completed interval before opening this venue.
   if(converted)await fetchOkxUsdPath(candidate.id,pair.product,new Date(Math.floor(Date.now()/900000)*900000-900000).toISOString());
   checkedQuote=quote;
   if(signal.asOf!==candidate.asOf||signal.kind!==candidate.kind)throw Error('Setup candle changed; refresh momentum scan');
   await atomicQueries(async()=>{
    await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,portfolio!.id]);
    const current=await getPortfolioById(workspaceId,portfolio!.id);if(!current||current.mode!=='SIMULATED'||current.status!=='ACTIVE')throw Error('Entries paused');
    if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,current.id,key])).length)throw Error('Signal already traded');
    const opens=await listOpenPositions(workspaceId,current.id);
    if(opens.some(p=>p.symbol===candidate.id))throw Error('Position already open');
    if(opens.length>=5)throw Error('Five-position cap');
    if(current.settings.feesPctEstimate!==.05||current.settings.slippagePctEstimate!==.05)throw Error('Unexpected paper cost settings');
    if(current.totalEquity<current.startingBalance*.95)throw Error('5% loss-from-start entry stop');
    const [daily]=await q<{n:string}>('SELECT COUNT(*) AS n FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND filled_at >= date_trunc(\'day\',NOW() AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\'',[workspaceId,current.id]);
    if(Number(daily?.n)>=10)throw Error('Daily ten-entry cap');
    const plan=planCryptoPaper(signal,quote,current.totalEquity,current.currentCash,Date.now(),converted ? .001 : .0005);if(!plan.ok)throw Error(plan.reason);
    if(opens.reduce((s,p)=>{const cost=p.instrumentType.startsWith('okx-usd-v1:') ? .001 : .0005;return s+(p.stopLoss==null?Infinity:Math.max(0,p.averageEntry-p.stopLoss*(1-cost))*p.quantity+(p.entryFee??p.averageEntry*p.quantity*cost)+p.stopLoss*(1-cost)*p.quantity*cost);},0)+plan.risk>current.totalEquity*.02)throw Error('2% portfolio risk cap');
    const order=await createSimulatedOrder({portfolio:paperCostPortfolio(current,instrument),symbol:candidate.id,assetClass:'crypto',instrumentType:instrument,side:'LONG',orderType:'MARKET_SIM',plannedEntry:signal.close,triggerPrice:null,quantity:plan.quantity,notional:plan.notional,stopLoss:plan.stop,takeProfit1:plan.target,takeProfit2:null,takeProfit3:null,sourceEdgePacketId:null,playbookId:PLAYBOOK,createdReason:key+JSON.stringify({version:converted?2:1,signal,nativeSignal,pair,quote,plan,currency:'USD',exitModel:converted?'conservative-cross-currency-bounds':'native-usd',simulation:true}),arcaConfidence:null});
    await fillOrderAndOpenPosition({portfolio:paperCostPortfolio(current,instrument),order,currentPrice:quote.ask,validationEvidence:{packetId:key,priceAt:quote.priceAt,regime:null,policyId:'crypto-paper-v1'}});
    opened++;
    decide(candidate,'OPENED','Fresh signal, quote and account checks passed',quote);
   });
  }catch(error){decide(candidate,'BLOCKED',error instanceof Error?error.message:'Entry validation failed',checkedQuote);notes.push(`${candidate.id}: ${error instanceof Error?error.message:'entry validation failed'}`);}
 }
 const report={trigger,at:new Date().toISOString(),opened,closed,marked,monitorHealthy,notes,decisions};
 await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:STATUS,reasoning:trigger+': '+(notes.join('; ')||'Paper cycle completed'),evidence:[JSON.stringify(report)]});
 return report;
}
export async function runCryptoPaperAll(monitorOnly=false){
 const accounts=await q<{workspace_id:string}>("SELECT workspace_id FROM arca_portfolios WHERE name=$1 AND mode='SIMULATED' AND status IN ('ACTIVE','PAUSED')",[CRYPTO_PAPER_NAME]);
 const results=[];for(const a of accounts){try{results.push(await runCryptoPaperCycle(a.workspace_id,'cron',monitorOnly));}catch{results.push({error:'Crypto paper cycle failed; check account status'});}}
 return {ok:!results.some(r=>'error' in r||('monitorHealthy' in r&&!r.monitorHealthy)||('skipped' in r&&r.reason===BUSY)),simulated:true,accounts:accounts.length,results};
}
