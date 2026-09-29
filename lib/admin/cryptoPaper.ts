import {supportsPaperPair,fetchOkxUsdQuote,fetchOkxUsdPath,usdSignal,paperCostPortfolio,type ConvertedPaperQuote} from './cryptoPaperOkx';
import {reconcileCryptoPaper,type CryptoReconciliation} from './cryptoPaperReconciliation';
import {summarizeCryptoPaper,type CryptoPaperStats,type CryptoStatsRow} from './cryptoPaperStats';
import {BTC_DOWN_FILTER,btcDownFilter} from './cryptoMarketRegime';
import {mergeDerivativesEvidence} from './cryptoMarketData';
import {latestDerivatives,savedTrending} from './cryptoMarketDataJob';
import {currentRsSnapshot,rsEvidence,type RsSnapshot} from './cryptoRelativeStrength';
import {currentBtcRegime,savedBtcRegime,type BtcRegime} from './cryptoBtcRegime';
import {initShadow,advanceShadow,shadowChanged,SHADOW_TITLE,type ShadowState} from './cryptoPaperShadow';
import {compareExitPlans} from './cryptoPaperStats';
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
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
import {fourHourBars,instrumentPair,correlationScale,clusterAllowance,portfolioClusters,positionRiskUsd,CORRELATION,type PortfolioCluster} from './cryptoCorrelation';
import {fetchDerivatives} from './cryptoDerivatives';
import {paperTradeLog,type PaperLogRow} from './cryptoTradeLog';
import {fetchPaperQuote,fetchPaperPath,planCryptoPaper,PaperMarketError} from './cryptoPaperMarket';
export const CRYPTO_PAPER_NAME='Crypto Markets Paper';
export type CryptoPaperDecision={coin:string;product:string|null;venue:string|null;signalAt:string|null;checkedAt:string;status:'OPENED'|'BLOCKED'|'DEFERRED';reason:string;quoteAt?:string;bid?:number;ask?:number;quoteCurrency?:'USD';conversion?:ConvertedPaperQuote['conversion']};
const PLAYBOOK='crypto-momentum-v1',STATUS='Crypto paper cycle completed';
/** Beta data-collection limits: raised from 5 positions / 2% open risk / 10 daily entries so more setups reach an outcome. Per-trade risk is unchanged. */
export const CRYPTO_PAPER_LIMITS={riskPerTradePct:.25,notionalPct:10,maxPairVolumePct:1,maxVolumeAgeHours:6,positions:20,openRiskPct:5,dailyEntries:30,cycleEntries:4,cycleValidations:8,lossFromStartPct:5};
const L=CRYPTO_PAPER_LIMITS;
const BUSY='Crypto paper cycle already running or cooling down',MANUAL_RECENT='Manual crypto paper cycle ran within the last three minutes';
/** Latest saved shadow exit state per position. Unparseable rows are skipped, never reconstructed. */
async function shadowStates(workspaceId:string,portfolioId:string):Promise<Map<string,ShadowState>>{
 const rows=await q<{state:string|null}>('SELECT DISTINCT ON (position_id) evidence->>0 AS state FROM arca_trade_journal WHERE workspace_id=$1 AND portfolio_id=$2 AND title=$3 AND position_id IS NOT NULL ORDER BY position_id,created_at DESC',[workspaceId,portfolioId,SHADOW_TITLE]);
 const m=new Map<string,ShadowState>();
 for(const row of rows){try{const st=JSON.parse(row.state??'') as ShadowState;if(st?.positionId)m.set(st.positionId,st);}catch{}}
 return m;
}
async function saveShadow(workspaceId:string,portfolioId:string,st:ShadowState){
 await writeJournal({workspaceId,portfolioId,positionId:st.positionId,symbol:st.symbol,journalType:'REVIEW',title:SHADOW_TITLE,reasoning:`RESEARCH ONLY: alternative exit replayed on the ledger's candles; the paper position is unchanged. ${st.status}${st.reason?` · ${st.reason}`:''}`,evidence:[JSON.stringify(st)],dataFreshness:st.through});
}
/** Starts a shadow for every open position before exits are checked, so none can close unobserved. */
async function initShadows(workspaceId:string,portfolioId:string,positions:Awaited<ReturnType<typeof listOpenPositions>>,notes:string[]){
 try{
  const known=await shadowStates(workspaceId,portfolioId);
  for(const p of positions){
   if(known.has(p.id))continue;
   const [order]=p.sourceOrderId?await q<{created_reason:string|null}>('SELECT created_reason FROM arca_simulated_orders WHERE workspace_id=$1 AND id=$2',[workspaceId,p.sourceOrderId]):[];
   let atr=NaN;try{const r=order?.created_reason??'';atr=Number(JSON.parse(r.slice(r.indexOf('{'))).signal?.atr);}catch{}
   await saveShadow(workspaceId,portfolioId,initShadow(p,atr,p.instrumentType.startsWith('okx-usd-v1:')?.001:.0005));
  }
 }catch{notes.push('Shadow exit plan could not start for new positions; paper exits unaffected');}
}
/** Advances open shadows on completed candles. Failures are research gaps only and never block entries. */
async function advanceShadows(workspaceId:string,portfolioId:string,notes:string[]){
 let states:Map<string,ShadowState>;
 try{states=await shadowStates(workspaceId,portfolioId);}catch{notes.push('Shadow exit plan state unavailable; paper exits unaffected');return;}
 for(const st of states.values()){
  if(st.status!=='OPEN')continue;
  try{
   const converted=st.instrumentType.startsWith('okx-usd-v1:'),product=converted?st.instrumentType.slice(11):st.instrumentType.slice(9);
   const path=converted?await fetchOkxUsdPath(st.symbol,product,st.through):await fetchPaperPath(st.symbol,product,st.through);
   const next=advanceShadow(st,path.candles);
   if(shadowChanged(st,next))await saveShadow(workspaceId,portfolioId,next);
  }catch(error){
   const message=error instanceof Error?error.message:'request failed';
   if(/requires recovery/.test(message))await saveShadow(workspaceId,portfolioId,{...st,status:'UNAVAILABLE',reason:'Shadow history is beyond the seven-day catch-up window'}).catch(()=>undefined);
   else notes.push(`Shadow exit ${st.symbol}: ${message}; retried next cycle`);
  }
 }
}
/** CSV of every filled paper order with its entry evidence and outcome. Read-only; null when the account does not exist. */
export async function cryptoPaperTradeLog(workspaceId:string):Promise<string|null>{
 const portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);if(!portfolio)return null;
 const rows=await q<PaperLogRow>(`SELECT o.id AS order_id,o.symbol,o.instrument_type,o.created_reason,o.filled_at,o.filled_price,o.quantity,o.notional_value,o.stop_loss,o.take_profit_1,
  p.id AS position_id,p.status AS position_status,p.current_price,p.unrealised_pnl,t.exit_time,t.exit_price,t.exit_reason,t.realised_pnl,t.r_multiple,t.fees_estimate,t.outcome
  FROM arca_simulated_orders o LEFT JOIN arca_positions p ON p.source_order_id=o.id AND p.workspace_id=o.workspace_id
  LEFT JOIN arca_trades t ON t.position_id=p.id AND t.workspace_id=o.workspace_id
  WHERE o.workspace_id=$1 AND o.portfolio_id=$2 AND o.filled_at IS NOT NULL ORDER BY o.filled_at`,[workspaceId,portfolio.id]);
 return paperTradeLog(rows,await shadowStates(workspaceId,portfolio.id));
}
export async function cryptoPaperState(workspaceId:string){
 return atomicQueries(async()=>{
 let portfolio=await getDefaultPortfolio(workspaceId,CRYPTO_PAPER_NAME);
 if(!portfolio)return {portfolio:null,positions:[],trades:[],journal:[],limits:{...L,clusterRiskPct:CORRELATION.clusterRiskPct},btcRegime:await savedBtcRegime(),stats:null,exitPlans:null};
 await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR SHARE',[workspaceId,portfolio.id]);
 portfolio=await getPortfolioById(workspaceId,portfolio.id);if(!portfolio)throw Error('Paper account unavailable');
 const [positions,trades,journal]=await Promise.all([listOpenPositions(workspaceId,portfolio.id),listTrades(workspaceId,portfolio.id,{limit:100}),listJournal(workspaceId,portfolio.id,{limit:500})]).then(([a,b,j])=>[a,b,j.filter(e=>e.title!=='Paper candle checkpoint v1'&&e.title!==SHADOW_TITLE).slice(0,25)] as const);
 // Per-position checkpoint and shadow rows are bookkeeping; keep them from hiding cycle reports and decisions.
 let reconciliation:CryptoReconciliation;
 try{
  const [totals]=await q<{net:string;fees:string;count:string;invalid:string}>(`SELECT COALESCE(SUM(realised_pnl),0) AS net,COALESCE(SUM(fees_estimate),0) AS fees,COUNT(*) AS count,COUNT(*) FILTER (WHERE side<>'LONG' OR ABS(realised_pnl-((exit_price-entry_price)*quantity-fees_estimate))>0.03) AS invalid FROM arca_trades WHERE workspace_id=$1 AND portfolio_id=$2`,[workspaceId,portfolio.id]);
  if(!totals)throw Error('Missing ledger totals');
  reconciliation=reconcileCryptoPaper(portfolio,positions,{net:Number(totals.net),fees:Number(totals.fees),count:Number(totals.count),invalid:Number(totals.invalid)});
 }catch{reconciliation={status:'UNAVAILABLE',checkedAt:new Date().toISOString(),reason:'Ledger totals could not be read'};}
 let stats:CryptoPaperStats|null=null,exitPlans:ReturnType<typeof compareExitPlans>|null=null;
 try{const rows=await q<CryptoStatsRow>('SELECT t.position_id,t.r_multiple,t.realised_pnl,t.outcome,t.exit_reason,t.instrument_type,t.entry_time,t.exit_time,o.created_reason FROM arca_trades t LEFT JOIN arca_positions p ON p.id=t.position_id AND p.workspace_id=t.workspace_id LEFT JOIN arca_simulated_orders o ON o.id=p.source_order_id AND o.workspace_id=t.workspace_id WHERE t.workspace_id=$1 AND t.portfolio_id=$2',[workspaceId,portfolio.id]);stats=summarizeCryptoPaper(rows);exitPlans=compareExitPlans(rows,[...(await shadowStates(workspaceId,portfolio.id)).values()]);}catch{stats=null;exitPlans=null;}
 return {portfolio,positions,trades,journal,reconciliation,limits:{...L,clusterRiskPct:CORRELATION.clusterRiskPct},btcRegime:await savedBtcRegime(),stats,exitPlans,trending:await savedTrending().catch(()=>null)};
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
  await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:active?'Crypto paper entries enabled':'Crypto paper entries paused',reasoning:'SIMULATED ONLY. Coinbase USD and converted OKX USDT momentum entries. Exit monitoring continues when entries are paused. '+`${L.riskPerTradePct}% risk, ${L.notionalPct}% notional cap per trade, ${L.positions} positions, ${L.openRiskPct}% portfolio risk, ${L.dailyEntries} entries per day, ${L.lossFromStartPct}% loss-from-start entry stop, trade size at most ${L.maxPairVolumePct}% of the pair's 24h volume, risk scaled by 1/sqrt(1+n) for n open positions with 4h return correlation >= 0.7 (floor 25%), combined risk of one correlated cluster capped at ${CORRELATION.clusterRiskPct}% of equity (existing positions never resized), targets 2R from the actual fill (beta data-collection limits). BTC daily trend is recorded on each entry, not used as a filter.`+' Fees and slippage each 0.05% per side for Coinbase, 0.10% per side for two-leg OKX conversions. No changes to personal holdings or other paper portfolios.'});
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
 if(positions.length>L.positions){monitorHealthy=false;notes.push('Unexpected position count; entries blocked');}
 await initShadows(workspaceId,portfolio.id,positions,notes);
 for(const position of positions){
  try{
   const converted=position.instrumentType.startsWith('okx-usd-v1:');
   const product=converted?position.instrumentType.slice(11):position.instrumentType.startsWith('coinbase:')?position.instrumentType.slice(9):'';
   if(position.assetClass!=='crypto'||position.side!=='LONG'||!(converted?/^[A-Z0-9]{1,30}-USDT$/.test(product):/^[A-Z0-9]{1,30}-USD$/.test(product)))throw Error('Unsupported position scope');
   const [quoteResult,pathResult]=await Promise.allSettled([converted?fetchOkxUsdQuote(product):fetchPaperQuote(product),converted?fetchOkxUsdPath(position.symbol,product,position.exitCheckpoint?.through??position.openedAt):fetchPaperPath(position.symbol,product,position.exitCheckpoint?.through??position.openedAt)]);
   if(pathResult.status!=='fulfilled')throw new PaperMarketError(pathResult.reason instanceof PaperMarketError?pathResult.reason.message:'Exit history request failed or timed out');
   const path=pathResult.value,quote=quoteResult.status==='fulfilled'?quoteResult.value:null;
   if(path.filledBars)notes.push(`${position.symbol}: ${path.filledBars} no-trade 15m candle(s) filled flat at the prior close`);
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
    const best=(path as {bestCaseHigh?:number|null}).bestCaseHigh;
    if(converted&&!checked.exit&&pos.takeProfit1!=null&&best!=null&&best>=pos.takeProfit1)notes.push(`${pos.symbol}: OKX high reached the target only at the best USDT/USD rate (${best.toPrecision(6)} vs ${pos.takeProfit1}); not filled under the conservative conversion rule`);
    const result=await markAndMaybeExit({portfolio:paperCostPortfolio(current,pos.instrumentType),position:pos,currentPrice:freshQuote?quote.bid:pos.averageEntry,candlePath:path,skipLearning:true});
    const updated=await getPortfolioById(workspaceId,current.id);if(!updated)throw Error('Paper account unavailable');
    await refreshPaperBalances(updated,updated.currentCash,updated.realisedPnl);
    marked++;if(result.exit)closed++;
   });
  }catch(error){monitorHealthy=false;notes.push(`${position.symbol}: ${error instanceof PaperMarketError?error.message:'Exit accounting failed'}; entries blocked until monitoring recovers`);}
 }
 await advanceShadows(workspaceId,portfolio.id,notes);
 // Every cycle: correlation across ALL open positions. Over-cap clusters are logged; positions are never resized here.
 let clusters:PortfolioCluster[]|null=null;
 try{
  const opens=await listOpenPositions(workspaceId,portfolio.id),withBars=[];
  for(const p of opens){const ip=instrumentPair(p.instrumentType);withBars.push({coin:p.symbol,riskUsd:positionRiskUsd(p),bars:ip?await fourHourBars(ip).catch(()=>null):null});}
  const pc=portfolioClusters(withBars,portfolio.totalEquity);clusters=pc.clusters;
  if(pc.unavailable.length)notes.push(`Correlation history unavailable for ${pc.unavailable.join(', ')}; treated as correlated with any new entry`);
  for(const c of pc.clusters.filter(c=>c.overCap)){
   const msg=`Correlated cluster over the ${CORRELATION.clusterRiskPct}% risk cap: ${c.coins.join(', ')} risk USD ${c.riskUsd.toFixed(2)} vs cap USD ${c.capUsd.toFixed(2)}. Existing positions are NOT resized (no partial exits in this ledger); new entries correlated with this cluster are blocked.`;
   notes.push(msg);
   await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:'Crypto paper correlated cluster over cap',reasoning:`SIMULATED. ${msg}`,evidence:[JSON.stringify({clusters:pc.clusters,pairs:pc.pairs,unavailable:pc.unavailable,at:new Date().toISOString()})]});
  }
 }catch{notes.push('Portfolio correlation recheck unavailable this cycle');}
 if(monitorOnly){
  const report={trigger,phase:'monitor',at:new Date().toISOString(),opened,closed,marked,monitorHealthy,notes,clusters};
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
 let attempts=0,btcRegime:BtcRegime|null=null;
 const discovery=await redis.get<{startedAt?:string;finishedAt?:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1').catch(()=>null);
 /** Pair 24h USD volume from the discovery snapshot (CoinGecko exchange tickers). Missing or stale evidence blocks entry. */
 const liquidity=(coin:string,pair:{exchange:string;product:string})=>{
  const v=discovery?.rows?.find(r=>r.id===coin)?.venues?.find(x=>x.exchange===pair.exchange&&x.pair===pair.product.replace('-','/'));
  const age=Date.now()-Date.parse(v?.observedAt??'');
  if(!v||!Number.isFinite(v.volumeUsd)||v.volumeUsd<=0||!Number.isFinite(age)||age<0||age>L.maxVolumeAgeHours*3600000)throw Error(`Pair 24h volume unavailable or older than ${L.maxVolumeAgeHours}h; liquidity cap cannot be verified`);
  return {volumeUsd:v.volumeUsd,observedAt:v.observedAt,source:'discovery snapshot (CoinGecko exchange tickers)',capUsd:v.volumeUsd*L.maxPairVolumePct/100};
 };
 // Tag only: recorded with each entry so outcomes can be compared by BTC trend before any filter is enforced.
 let rsSnap:RsSnapshot|null=null;
 if(monitorHealthy&&portfolio.status==='ACTIVE'&&candidates.length){btcRegime=await currentBtcRegime();rsSnap=await currentRsSnapshot(discovery?.rows,Date.parse(discovery?.finishedAt??discovery?.startedAt??''));}
 if(monitorHealthy&&portfolio.status==='ACTIVE')for(const candidate of candidates){
  if(opened>=L.cycleEntries||attempts>=L.cycleValidations){decide(candidate,'DEFERRED',opened>=L.cycleEntries?`${L.cycleEntries}-entry cycle limit`:`${L.cycleValidations}-validation cycle limit`);continue;}
  const pair=candidate.pair!;
  let checkedQuote:Awaited<ReturnType<typeof fetchPaperQuote>>|undefined;
  try{
   const key=`crypto-v1|${candidate.id}|${pair.product}|${candidate.asOf}|`;
   // Cheap duplicate check before provider requests; transaction repeats it under the portfolio lock.
   if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,portfolio.id,key])).length){decide(candidate,'BLOCKED','Signal already traded');continue;}
   const currentOpens=await listOpenPositions(workspaceId,portfolio.id);
   if(currentOpens.length>=L.positions){decide(candidate,'BLOCKED',`${L.positions}-position cap`);continue;}
   if(currentOpens.some(p=>p.symbol===candidate.id)){decide(candidate,'BLOCKED','Position already open');continue;}
   attempts++;
   const converted=pair.exchange==='okex',instrument=converted?`okx-usd-v1:${pair.product}`:`coinbase:${pair.product}`;
   const liq=liquidity(candidate.id,pair);
   const [nativeSignal,quote]=await Promise.all([fetchVolumeMomentum(pair,Date.now()),converted?fetchOkxUsdQuote(pair.product):fetchPaperQuote(pair.product)]);
   checkedQuote=quote;
   if(converted&&nativeSignal.stage==='MOMENTUM_VOLUME'){const c=(quote as ConvertedPaperQuote).conversion;if(c.nativeAsk<nativeSignal.entryFloor!||c.nativeAsk*1.001>nativeSignal.maxEntry!)throw Error('Native USDT quote is outside the valid entry zone');}
   const signal=converted?usdSignal(nativeSignal,quote as ConvertedPaperQuote):nativeSignal;
   // Prove both exit providers can cover a completed interval before opening this venue.
   if(converted)await fetchOkxUsdPath(candidate.id,pair.product,new Date(Math.floor(Date.now()/900000)*900000-900000).toISOString());
   checkedQuote=quote;
   if(signal.asOf!==candidate.asOf||signal.kind!==candidate.kind)throw Error('Setup candle changed; refresh momentum scan');
   // Correlation with open positions, checked before the lock (sequential, cached per 4h window). Missing history counts as correlated.
   const candidateBars=await fourHourBars(pair).catch(()=>{throw Error('Candidate 4h history unavailable for correlation check');});
   const openBars:{coin:string;bars:Awaited<ReturnType<typeof fourHourBars>>|null}[]=[];
   for(const p of currentOpens){const ip=instrumentPair(p.instrumentType);openBars.push({coin:p.symbol,bars:ip?await fourHourBars(ip).catch(()=>null):null});}
   const corr=correlationScale(candidateBars,openBars);
   // Evidence only: OKX perpetual funding/open interest (CoinGecko multi-venue fallback/context) is recorded for later comparison and never blocks an entry.
   const base=pair.product.split('-')[0],cgDeriv=await latestDerivatives().catch(()=>null);
   const derivatives=mergeDerivativesEvidence(await fetchDerivatives(base,candidateBars),cgDeriv?.rows.find(r=>r.base===base)??null,cgDeriv?.snap.at??null);
   await atomicQueries(async()=>{
    await q('SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,portfolio!.id]);
    const current=await getPortfolioById(workspaceId,portfolio!.id);if(!current||current.mode!=='SIMULATED'||current.status!=='ACTIVE')throw Error('Entries paused');
    if((await q('SELECT id FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND left(created_reason,length($3))=$3 LIMIT 1',[workspaceId,current.id,key])).length)throw Error('Signal already traded');
    const opens=await listOpenPositions(workspaceId,current.id);
    if(opens.some(p=>p.symbol===candidate.id))throw Error('Position already open');
    if(opens.length>=L.positions)throw Error(`${L.positions}-position cap`);
    if(current.settings.feesPctEstimate!==.05||current.settings.slippagePctEstimate!==.05)throw Error('Unexpected paper cost settings');
    if(current.totalEquity<current.startingBalance*(1-L.lossFromStartPct/100))throw Error(`${L.lossFromStartPct}% loss-from-start entry stop`);
    const [daily]=await q<{n:string}>('SELECT COUNT(*) AS n FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND filled_at >= date_trunc(\'day\',NOW() AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\'',[workspaceId,current.id]);
    if(Number(daily?.n)>=L.dailyEntries)throw Error(`Daily ${L.dailyEntries}-entry cap`);
    // Portfolio-level cap on the candidate's correlated cluster (existing positions are only counted, never resized).
    const cluster=clusterAllowance(corr,opens.map(p=>({coin:p.symbol,riskUsd:positionRiskUsd(p)})),openBars.map(o=>o.coin),current.totalEquity,current.totalEquity*L.riskPerTradePct/100);
    if(cluster.blocked)throw Error(`Correlated cluster risk cap: ${cluster.members.join(', ')} already risk USD ${cluster.clusterRiskUsd.toFixed(2)} of USD ${cluster.capUsd.toFixed(2)}`);
    const plan=planCryptoPaper(signal,quote,current.totalEquity,current.currentCash,Date.now(),converted ? .001 : .0005,liq.capUsd,cluster.scale);if(!plan.ok)throw Error(plan.reason);
    if(opens.reduce((s,p)=>s+positionRiskUsd(p),0)+plan.risk>current.totalEquity*L.openRiskPct/100)throw Error(`${L.openRiskPct}% portfolio risk cap`);
    const order=await createSimulatedOrder({portfolio:paperCostPortfolio(current,instrument),symbol:candidate.id,assetClass:'crypto',instrumentType:instrument,side:'LONG',orderType:'MARKET_SIM',plannedEntry:signal.close,triggerPrice:null,quantity:plan.quantity,notional:plan.notional,stopLoss:plan.stop,takeProfit1:plan.target,takeProfit2:null,takeProfit3:null,sourceEdgePacketId:null,playbookId:PLAYBOOK,createdReason:key+JSON.stringify({version:converted?2:1,signal,nativeSignal,pair,quote,plan,currency:'USD',exitModel:converted?'conservative-cross-currency-bounds':'native-usd',btcRegime,shadowFilter:{rule:BTC_DOWN_FILTER,decision:btcDownFilter(btcRegime?.state)},relativeStrength:rsEvidence(rsSnap,candidate.id,Date.now()),liquidity:{...liq,capped:plan.liquidityCapped},correlation:{...corr,cluster},derivatives,simulation:true}),arcaConfidence:null});
    await fillOrderAndOpenPosition({portfolio:paperCostPortfolio(current,instrument),order,currentPrice:quote.ask,validationEvidence:{packetId:key,priceAt:quote.priceAt,regime:null,policyId:'crypto-paper-v1'}});
    opened++;
    decide(candidate,'OPENED',['Fresh signal, quote and account checks passed',...(corr.scale<1?[`risk scaled to ${Math.round(corr.scale*100)}% for ${corr.correlated.length+corr.unavailable.length} correlated or unverified open positions`]:[]),...(cluster.capped?[`risk capped to ${Math.round(cluster.scale*100)}% by the ${CORRELATION.clusterRiskPct}% correlated-cluster cap`]:[]),...(plan.liquidityCapped?[`size capped at ${L.maxPairVolumePct}% of pair 24h volume`]:[]),...(btcRegime?.state==='DOWN'?['shadow filter: would skip (BTC daily trend DOWN); opened anyway for comparison']:[]),...(derivatives.flags.some(f=>/EXTREME_FUNDING|OI_SURGE|CROWDED_FUNDING|LEVERAGE_DRIVEN/.test(f))?[`derivatives flags: ${derivatives.flags.join(' ')} (evidence only; not a filter)`]:[])].join('; '),quote);
   });
  }catch(error){decide(candidate,'BLOCKED',error instanceof Error?error.message:'Entry validation failed',checkedQuote);notes.push(`${candidate.id}: ${error instanceof Error?error.message:'entry validation failed'}`);}
 }
 const report={trigger,at:new Date().toISOString(),opened,closed,marked,monitorHealthy,notes,decisions,btcRegime,clusters};
 await writeJournal({workspaceId,portfolioId:portfolio.id,journalType:'REVIEW',title:STATUS,reasoning:trigger+': '+(notes.join('; ')||'Paper cycle completed'),evidence:[JSON.stringify(report)]});
 return report;
}
export async function runCryptoPaperAll(monitorOnly=false){
 const accounts=await q<{workspace_id:string}>("SELECT workspace_id FROM arca_portfolios WHERE name=$1 AND mode='SIMULATED' AND status IN ('ACTIVE','PAUSED')",[CRYPTO_PAPER_NAME]);
 const results=[];for(const a of accounts){try{results.push(await runCryptoPaperCycle(a.workspace_id,'cron',monitorOnly));}catch{results.push({error:'Crypto paper cycle failed; check account status'});}}
 return {ok:!results.some(r=>'error' in r||('monitorHealthy' in r&&!r.monitorHealthy)||('skipped' in r&&r.reason===BUSY)),simulated:true,accounts:accounts.length,results};
}
