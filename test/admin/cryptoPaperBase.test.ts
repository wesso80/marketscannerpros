import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[]),atomicQueries:vi.fn(async(f:()=>Promise<unknown>)=>f())}));
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:()=>true}));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore',()=>({getDefaultPortfolio:vi.fn(),getPortfolioById:vi.fn(),insertPortfolio:vi.fn(),listOpenPositions:vi.fn(),listTrades:vi.fn(async()=>[]),listJournal:vi.fn(async()=>[])}));
vi.mock('@/lib/admin/portfolio-lab/simulatedOrderEngine',()=>({createSimulatedOrder:vi.fn(async()=>({id:'o'})),fillOrderAndOpenPosition:vi.fn()}));
vi.mock('@/lib/admin/portfolio-lab/positionEngine',()=>({markAndMaybeExit:vi.fn(async()=>({exit:null}))}));
vi.mock('@/lib/admin/portfolio-lab/refreshPaperBalances',()=>({refreshPaperBalances:vi.fn()}));
vi.mock('@/lib/admin/portfolio-lab/journalEngine',()=>({writeJournal:vi.fn()}));
vi.mock('@/lib/admin/cryptoVolumeMomentum',()=>({fetchVolumeMomentum:vi.fn()}));
vi.mock('@/lib/admin/cryptoBtcRegime',()=>({currentBtcRegime:vi.fn(async()=>({state:'UP',asOf:'2026-09-28T00:00:00.000Z'})),savedBtcRegime:vi.fn(async()=>null)}));
vi.mock('@/lib/admin/cryptoCorrelation',async(importOriginal)=>({...await importOriginal<object>(),fourHourBars:vi.fn()}));
vi.mock('@/lib/admin/cryptoFlow',()=>({fetchFlow:vi.fn(async()=>({state:'NEUTRAL',flags:[]}))}));
vi.mock('@/lib/admin/cryptoDerivatives',()=>({fetchDerivatives:vi.fn(async()=>({status:'OK',flags:[]}))}));
vi.mock('@/lib/admin/cryptoPaperOkx',async(importOriginal)=>({...await importOriginal<object>(),fetchOkxUsdQuote:vi.fn(),fetchOkxUsdPath:vi.fn()}));
vi.mock('@/lib/admin/cryptoPaperMarket',async(importOriginal)=>({...await importOriginal<object>(),fetchPaperQuote:vi.fn(),fetchPaperPath:vi.fn()}));
import {q} from '@/lib/db';
import {getRedis} from '@/lib/redis';
import * as store from '@/lib/admin/portfolio-lab/portfolioStore';
import {createSimulatedOrder} from '@/lib/admin/portfolio-lab/simulatedOrderEngine';
import {markAndMaybeExit} from '@/lib/admin/portfolio-lab/positionEngine';
import {fetchVolumeMomentum,type MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
import {fetchPaperQuote,fetchPaperPath} from '@/lib/admin/cryptoPaperMarket';
import type {BaseScan} from '@/lib/admin/cryptoBaseScan';
import {BASE_LIMITS,BASE_SCAN_KEY,MOMENTUM_KEY,PLAYBOOK_BASE,baseBreakoutCandidates,baseExitRules,baseExitRulesFor,runCryptoBaseSleeveCycle} from '@/lib/admin/cryptoPaperBase';
import type {ArcaPortfolio,ArcaPosition} from '@/lib/admin/portfolio-lab/types';
const now=Date.parse('2026-09-28T05:00:00Z'),step=900000;
const pair={exchange:'gdax' as const,product:'QNT-USD',quote:'USD' as const,volumeUnit:'QNT'};
const signal={stage:'MOMENTUM_VOLUME' as const,asOf:'2026-09-28T04:00:00Z',kind:'BREAKOUT' as const,stop:95,target:112,maxEntry:104,entryFloor:99,close:101,reason:'test',relativeVolume:2.4,changePct:3,trigger:100,atr:2,sma20:97};
const scanAt=new Date(now-1000).toISOString();
const scan=(rows:Partial<MomentumScan['rows'][number]>[]=[{}]):MomentumScan=>({version:1,startedAt:scanAt,updatedAt:scanAt,discoveryAt:scanAt,rows:rows.map(r=>({...signal,id:'quant-network',symbol:'QNT',pair,...r}))} as MomentumScan);
const bases=(rows:Partial<BaseScan['rows'][number]>[]=[{}],startedAt=new Date(now-6*3600000).toISOString()):BaseScan=>({version:2,discoveryAt:startedAt,startedAt,updatedAt:startedAt,rows:rows.map(r=>({id:'quant-network',symbol:'QNT',product:'QNT-USD',exchange:'gdax',quote:'USD',volumeUnit:'QNT',stage:'BASE',reason:'base',asOf:'2026-09-27T00:00:00.000Z',high:100,low:90,widthPct:11,gapPct:1,slopePct:.5,contraction:.6,...r}))} as BaseScan);
let portfolio:ArcaPortfolio,positions:ArcaPosition[],saved:{scan:MomentumScan|null;bases:BaseScan|null};
const discovery={rows:[{id:'quant-network',venues:[{exchange:'gdax',pair:'QNT/USD',volumeUsd:5e7,observedAt:new Date(now-600000).toISOString()}]}]};
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);
 portfolio={id:'b',workspaceId:'w',mode:'SIMULATED',status:'ACTIVE',startingBalance:200000,totalEquity:200000,currentCash:200000,realisedPnl:0,settings:{feesPctEstimate:.05,slippagePctEstimate:.05}} as ArcaPortfolio;
 positions=[];saved={scan:scan(),bases:bases()};
 vi.mocked(getRedis).mockReturnValue({set:vi.fn(async()=>'OK'),get:vi.fn(async(key:string)=>key==='admin:crypto-discovery:v1'?discovery:key===BASE_SCAN_KEY?saved.bases:key===MOMENTUM_KEY?saved.scan:null)} as never);
 vi.mocked(store.getDefaultPortfolio).mockImplementation(async()=>portfolio);
 vi.mocked(store.getPortfolioById).mockImplementation(async()=>portfolio);
 vi.mocked(store.listOpenPositions).mockImplementation(async()=>positions);
 vi.mocked(q).mockResolvedValue([]);
 vi.mocked(fetchVolumeMomentum).mockResolvedValue(signal);
 vi.mocked(fetchPaperQuote).mockResolvedValue({bid:100.9,ask:101,product:'QNT-USD',priceAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString()});
 vi.mocked(fetchPaperPath).mockResolvedValue({symbol:'quant-network',market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[{openAt:now-step,closeAt:now,open:100,high:101,low:98,close:100}]});
});
afterEach(()=>vi.restoreAllMocks());
it('a candidate is the first confirmed 4h BREAKOUT closing 0–3% above a saved daily base high, in a USD-family quote',()=>{
 const found=baseBreakoutCandidates(scan(),bases(),now);
 expect(found.candidates).toHaveLength(1);
 expect(found.candidates[0]).toMatchObject({extensionPct:1,base:{high:100}});
 expect(found.note).toBeNull();
 const cases:[Partial<MomentumScan['rows'][number]>,Partial<BaseScan['rows'][number]>|null,string][]=[
  [{kind:'CONTINUATION'},{},'continuation is not the first breakout'],
  [{stage:'VOLUME_WATCH'},{},'volume without price confirmation'],
  [{close:103.5},{},'more than 3% above the base high'],
  [{close:99.5},{},'closed below the base high'],
  [{},{stage:'NOT_BASE'},'coin was not in a base'],
  [{},{id:'other'},'no base for this coin'],
  [{pair:{...pair,quote:'BTC' as never}},{},'non-USD quote on the signal'],
  [{},{quote:'BTC'},'non-USD quote on the base'],
 ];
 for(const [row,base,why] of cases)expect(baseBreakoutCandidates(scan([row]),bases(base?[base]:[]),now).candidates,why).toHaveLength(0);
 expect(baseBreakoutCandidates(scan(),bases([{}],new Date(now-49*3600000).toISOString()),now).note).toMatch(/48h/);
 expect(baseBreakoutCandidates({...scan(),startedAt:new Date(now-5*3600000).toISOString()},bases(),now).note).toMatch(/current 4h/);
 expect(baseBreakoutCandidates(scan(),null,now).candidates).toHaveLength(0);
});
it('exit rules: 2-ATR trail, 168h time stop below +1R, and they are read back from the saved order ATR',async()=>{
 expect(baseExitRules(2)).toEqual({timeStopHours:168,timeStopMinR:1,trail:{atr:2,atrMultiple:2}});
 vi.mocked(q).mockResolvedValueOnce([{created_reason:'crypto-base-v1|x|QNT-USD|t|'+JSON.stringify({signal:{atr:1.5}})}]);
 expect(await baseExitRulesFor('w',{playbookId:PLAYBOOK_BASE,sourceOrderId:'o'})).toEqual(baseExitRules(1.5));
 expect(await baseExitRulesFor('w',{playbookId:'crypto-momentum-v2',sourceOrderId:'o'})).toBeNull();
 vi.mocked(q).mockResolvedValueOnce([{created_reason:'no json'}]);
 expect(await baseExitRulesFor('w',{playbookId:PLAYBOOK_BASE,sourceOrderId:'o'})).toBeNull();
});
it('opens a simulated base-breakout entry with no fixed target, the trail saved in its reason, and every Jev stamp recorded',async()=>{
 saved.scan=scan([{jev:{rule:'jev-shadow-v2',status:'scored',chase:.1,flowAgrees:.7,btcHeadwind:.1,btcTrend:'UP',flowStamp:'aggressive buying',model:'typesafe-ai/jev',checkedAt:scanAt},chart:{rule:'jev-chart-v1',status:'scored',cleanBase:.9,strongClose:.8,volumeExpansion:.9,overheadSupply:.1,bars:25,model:'typesafe-ai/jev',checkedAt:scanAt}}]);
 const report=await runCryptoBaseSleeveCycle('w');
 expect(report).toMatchObject({opened:1,sleeve:'base',decisions:[{status:'OPENED',sleeve:'base'}]});
 expect(createSimulatedOrder).toHaveBeenCalledTimes(1);
 const order=vi.mocked(createSimulatedOrder).mock.calls[0][0];
 expect(order).toMatchObject({playbookId:PLAYBOOK_BASE,takeProfit1:null,stopLoss:95,symbol:'quant-network',instrumentType:'coinbase:QNT-USD'});
 const reason=JSON.parse(order.createdReason.slice(order.createdReason.indexOf('{')));
 expect(reason).toMatchObject({sleeve:'base',extensionPct:1,base:{high:100,low:90,widthPct:11},exitRules:{timeStopHours:168,timeStopMinR:1,trail:{atr:2,atrMultiple:2}},plan:{targetPlaced:false},jev:{status:'scored'},chart:{status:'scored',cleanBase:.9},catalyst:{status:'unavailable',reason:'not-stamped'},exchangeOrder:false});
 expect(order.createdReason.startsWith('crypto-base-v1|quant-network|QNT-USD|2026-09-28T04:00:00Z|')).toBe(true);
});
it('refuses when the live quote has run more than 3% above the base high, and records why',async()=>{
 vi.mocked(fetchPaperQuote).mockResolvedValue({bid:103.4,ask:103.5,product:'QNT-USD',priceAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString()});
 const report=await runCryptoBaseSleeveCycle('w');
 expect(report).toMatchObject({opened:0,decisions:[{status:'BLOCKED',sleeve:'base'}]});
 expect((report as {decisions:{reason:string}[]}).decisions[0].reason).toMatch(/3% above the base high/);
 expect(createSimulatedOrder).not.toHaveBeenCalled();
});
it('monitors open base positions with their saved trail before entries and stays within its own caps',async()=>{
 positions=[{id:'pos',symbol:'quant-network',assetClass:'crypto',instrumentType:'coinbase:QNT-USD',side:'LONG',averageEntry:101,stopLoss:95,initialStopLoss:95,takeProfit1:null,openedAt:new Date(now-step).toISOString(),quantity:10,playbookId:PLAYBOOK_BASE,sourceOrderId:'o'} as unknown as ArcaPosition];
 vi.mocked(q).mockImplementation(async(sql:string)=>/created_reason FROM arca_simulated_orders WHERE workspace_id=\$1 AND id=\$2/.test(sql)?[{created_reason:'k|'+JSON.stringify({signal:{atr:2}})}]:[]);
 const report=await runCryptoBaseSleeveCycle('w');
 expect(markAndMaybeExit).toHaveBeenCalledWith(expect.objectContaining({exitRules:{timeStopHours:168,timeStopMinR:1,trail:{atr:2,atrMultiple:2}}}));
 expect(report).toMatchObject({marked:1,monitorHealthy:true});
 // The same coin is already open, so the candidate is refused without a provider request.
 expect((report as {decisions:{reason:string}[]}).decisions[0].reason).toBe('Position already open');
 expect(BASE_LIMITS.positions).toBe(10);
});
it('the base sleeve never gates on a Jev stamp, never routes an order, and never writes a recommendation',()=>{
 const src=readFileSync('lib/admin/cryptoPaperBase.ts','utf8');
 expect(src).not.toMatch(/createRecommendation|exchangeOrder:true|if\s*\([^)]*\b(jev|chart|catalyst)\b[^)]*\)/);
 expect(src).toMatch(/never gate/i);
 expect(readFileSync('lib/admin/portfolio-lab/paperExitPath.ts','utf8')).toMatch(/candles already completed/);
});
