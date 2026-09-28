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
const PLAYBOOK='crypto-momentum-v1',STATUS='Crypto paper cycle completed';
export async function cryptoPaperState(workspaceId:string){
 const portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
 if(!portfolio)return {portfolio:null,positions:[],trades:[],journal:[]};
 const [positions,trades,journal]=await Promise.all([listOpenPositions(workspaceId,portfolio.id),listTrades(workspaceId,portfolio.id,{limit:100}),listJournal(workspaceId,portfolio.id,{limit:25})]);
 return {portfolio,positions,trades,journal};
}
export async function setCryptoPaperActive(workspaceId:string,active:boolean){
 return atomicQueries(async()=>{
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`crypto-paper-create:${workspaceId}`]);
  let portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
  if(!portfolio&&active)portfolio=await insertPortfolio({workspaceId,name:CRYPTO_PAPER_NAME,startingBalance:200000,baseCurrency:'USD',settings:{...ARCA_DEFAULT_SETTINGS,riskPerTradePct:.25,maxSingleTradeRiskPct:.25,maxOpenPortfolioRiskPct:2,enabledAssetClasses:['crypto'],enabledPlaybooks:[PLAYBOOK],maxAssetClassExposurePct:{...ARCA_DEFAULT_SETTINGS.maxAssetClassExposurePct,crypto:50},feesPctEstimate:.05,slippagePctEstimate:.05,benchmarkSymbol:'BTC'}});
  if(!portfolio)return null;
  await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,portfolio.id]);
  await q('UPDATE arca_portfolios SET status=$1,updated_at=NOW() WHERE workspace_id=$2 AND id=$3',[active?'ACTIVE':'PAUSED',workspaceId,portfolio.id]);
  await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:active?'Crypto paper entries enabled':'Crypto paper entries paused',reasoning:'SIMULATED ONLY. Coinbase USD momentum entries. Exit monitoring continues when entries are paused. 0.25% risk, 10% notional cap per trade, five positions, 2% portfolio risk, 5% loss-from-start entry stop. Fees and slippage 0.05% each side. No changes to personal holdings or other paper portfolios.'});
  return portfolio.id;
 });
}
export async function runCryptoPaperCycle(workspaceId:string,trigger:'manual'|'cron'='manual'){
 const redis=getRedis();if(!redis)throw Error('Paper coordination cache unavailable');
 if(!isAdminCryptoEnabled())return {skipped:true,reason:'Admin crypto disabled'};
 if(!await redis.set(`admin:crypto-paper:cycle:${workspaceId}`,'reserved',{nx:true,ex:180}))return {skipped:true,reason:'Crypto paper cycle already running or cooling down'};
 let portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
 if(!portfolio)return {skipped:true,reason:'Crypto paper account not enabled'};
 const notes:string[]=[];let opened=0,closed=0,marked=0,monitorHealthy=true;
 const positions=await listOpenPositions(workspaceId,portfolio.id);
 if(positions.length>5){monitorHealthy=false;notes.push('Unexpected position count; entries blocked');}
 for(const position of positions){
  try{
   const product=position.instrumentType.startsWith('coinbase:')?position.instrumentType.slice(9):'';
   if(position.assetClass!=='crypto'||position.side!=='LONG'||!product.endsWith('-USD'))throw Error('Unsupported position scope');
   const [quoteResult,pathResult]=await Promise.allSettled([fetchPaperQuote(product),fetchPaperPath(position.symbol,product,position.exitCheckpoint?.through??position.openedAt)]);
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
    const result=await markAndMaybeExit({portfolio:current,position:pos,currentPrice:freshQuote?quote.bid:pos.averageEntry,candlePath:path,skipLearning:true});
    const updated=await getPortfolioById(workspaceId,current.id);if(!updated)throw Error('Paper account unavailable');
    await refreshPaperBalances(updated,updated.currentCash,updated.realisedPnl);
    marked++;if(result.exit)closed++;
   });
  }catch(error){monitorHealthy=false;notes.push(`${position.symbol}: ${error instanceof PaperMarketError?error.message:'Exit accounting failed'}; entries blocked until monitoring recovers`);}
 }
 portfolio=await getPortfolioById(workspaceId,portfolio.id);if(!portfolio)throw Error('Paper account unavailable');
 const scan=await redis.get<MomentumScan>('admin:crypto-markets:momentum-volume:v1');
 const scanAge=Date.now()-Date.parse(scan?.startedAt??'');
 const recent=scan&&Number.isFinite(scanAge)&&scanAge>=0&&Math.floor(Date.parse(scan.startedAt)/(4*3600000))===Math.floor(Date.now()/(4*3600000));
 const all=recent?scan.rows.filter(r=>r.stage==='MOMENTUM_VOLUME'):[];
 if(!recent)notes.push('No current 4h momentum scan; no entries');
 const candidates=all.filter(r=>r.pair?.exchange==='gdax'&&r.pair.quote==='USD');
 if(all.length>candidates.length)notes.push(`${all.length-candidates.length} setups use other quote/venue combinations; paper support pending`);
 if(!candidates.length&&recent)notes.push('No confirmed Coinbase USD momentum setups in saved scan');
 if(portfolio.status!=='ACTIVE')notes.push('Entries paused; exits checked');
 let attempts=0;
 if(monitorHealthy&&portfolio.status==='ACTIVE')for(const candidate of candidates){
  if(opened>=2||attempts>=5)break;
  const pair=candidate.pair!;
  try{
   const key=`crypto-v1|${candidate.id}|${pair.product}|${candidate.asOf}|`;
   // Cheap duplicate check before provider requests; transaction repeats it under the portfolio lock.
   if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,portfolio.id,key])).length)continue;
   const currentOpens=await listOpenPositions(workspaceId,portfolio.id);
   if(currentOpens.length>=5)break;
   if(currentOpens.some(p=>p.symbol===candidate.id))continue;
   attempts++;
   const [signal,quote]=await Promise.all([fetchVolumeMomentum(pair,Date.now()),fetchPaperQuote(pair.product)]);
   if(signal.asOf!==candidate.asOf||signal.kind!==candidate.kind)throw Error('Setup candle changed; refresh momentum scan');
   await atomicQueries(async()=>{
    await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,portfolio!.id]);
    const current=await getPortfolioById(workspaceId,portfolio!.id);if(!current||current.mode!=='SIMULATED'||current.status!=='ACTIVE')throw Error('Entries paused');
    if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,current.id,key])).length)return;
    const opens=await listOpenPositions(workspaceId,current.id);
    if(opens.some(p=>p.symbol===candidate.id))return;
    if(opens.length>=5)throw Error('Five-position cap');
    if(current.settings.feesPctEstimate!==.05||current.settings.slippagePctEstimate!==.05)throw Error('Unexpected paper cost settings');
    if(current.totalEquity<current.startingBalance*.95)throw Error('5% loss-from-start entry stop');
    const [daily]=await q<{n:string}>('SELECT COUNT(*) AS n FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND filled_at >= date_trunc(\'day\',NOW() AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\'',[workspaceId,current.id]);
    if(Number(daily?.n)>=10)throw Error('Daily ten-entry cap');
    const plan=planCryptoPaper(signal,quote,current.totalEquity,current.currentCash);if(!plan.ok)throw Error(plan.reason);
    if(opens.reduce((s,p)=>s+(p.stopLoss==null?Infinity:Math.max(0,p.averageEntry-p.stopLoss*.9995)*p.quantity+(p.entryFee??p.averageEntry*p.quantity*.0005)+p.stopLoss*.9995*p.quantity*.0005),0)+plan.risk>current.totalEquity*.02)throw Error('2% portfolio risk cap');
    const order=await createSimulatedOrder({portfolio:current,symbol:candidate.id,assetClass:'crypto',instrumentType:`coinbase:${pair.product}`,side:'LONG',orderType:'MARKET_SIM',plannedEntry:signal.close,triggerPrice:null,quantity:plan.quantity,notional:plan.notional,stopLoss:plan.stop,takeProfit1:plan.target,takeProfit2:null,takeProfit3:null,sourceEdgePacketId:null,playbookId:PLAYBOOK,createdReason:key+JSON.stringify({version:1,signal,pair,quote,plan,simulation:true}),arcaConfidence:null});
    await fillOrderAndOpenPosition({portfolio:current,order,currentPrice:quote.ask,validationEvidence:{packetId:key,priceAt:quote.priceAt,regime:null,policyId:'crypto-paper-v1'}});
    opened++;
   });
  }catch(error){notes.push(`${candidate.id}: ${error instanceof Error?error.message:'entry validation failed'}`);}
 }
 const report={trigger,at:new Date().toISOString(),opened,closed,marked,monitorHealthy,notes};
 await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:STATUS,reasoning:trigger+': '+(notes.join('; ')||'Paper cycle completed'),evidence:[JSON.stringify(report)]});
 return report;
}
export async function runCryptoPaperAll(){
 const accounts=await q<{workspace_id:string}>("SELECT workspace_id FROM arca_portfolios WHERE name=$1 AND mode='SIMULATED' AND status IN ('ACTIVE','PAUSED')",[CRYPTO_PAPER_NAME]);
 const results=[];for(const a of accounts){try{results.push(await runCryptoPaperCycle(a.workspace_id,'cron'));}catch{results.push({error:'Crypto paper cycle failed; check account status'});}}
 return {ok:!results.some(r=>'error' in r||('monitorHealthy' in r&&!r.monitorHealthy)||('skipped' in r&&r.reason==='Crypto paper cycle already running or cooling down')),simulated:true,accounts:accounts.length,results};
}
