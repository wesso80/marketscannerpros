import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[]),atomicQueries:vi.fn(async(f:()=>Promise<unknown>)=>f())}));
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:()=>true}));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore',()=>({getDefaultPortfolio:vi.fn(),getPortfolioById:vi.fn(),insertPortfolio:vi.fn(),listOpenPositions:vi.fn(),listTrades:vi.fn(),listJournal:vi.fn()}));
vi.mock('@/lib/admin/portfolio-lab/simulatedOrderEngine',()=>({createSimulatedOrder:vi.fn(async()=>({id:'o'})),fillOrderAndOpenPosition:vi.fn()}));
vi.mock('@/lib/admin/portfolio-lab/positionEngine',()=>({markAndMaybeExit:vi.fn(async()=>({exit:null}))}));
vi.mock('@/lib/admin/portfolio-lab/refreshPaperBalances',()=>({refreshPaperBalances:vi.fn()}));
vi.mock('@/lib/admin/portfolio-lab/journalEngine',()=>({writeJournal:vi.fn()}));
vi.mock('@/lib/admin/cryptoVolumeMomentum',()=>({fetchVolumeMomentum:vi.fn()}));
vi.mock('@/lib/admin/cryptoBtcRegime',()=>({currentBtcRegime:vi.fn(async()=>({state:'DOWN',asOf:'2026-09-28T00:00:00.000Z'})),savedBtcRegime:vi.fn(async()=>null)}));
vi.mock('@/lib/admin/cryptoPaperOkx',async(importOriginal)=>({...await importOriginal<object>(),fetchOkxUsdQuote:vi.fn(),fetchOkxUsdPath:vi.fn()}));
vi.mock('@/lib/admin/cryptoPaperMarket',async(importOriginal)=>({...await importOriginal<object>(),fetchPaperQuote:vi.fn(),fetchPaperPath:vi.fn()}));
import {fetchOkxUsdQuote,fetchOkxUsdPath} from '@/lib/admin/cryptoPaperOkx';
import {q} from '@/lib/db';
import {getRedis} from '@/lib/redis';
import * as store from '@/lib/admin/portfolio-lab/portfolioStore';
import {createSimulatedOrder,fillOrderAndOpenPosition} from '@/lib/admin/portfolio-lab/simulatedOrderEngine';
import {markAndMaybeExit} from '@/lib/admin/portfolio-lab/positionEngine';
import {writeJournal} from '@/lib/admin/portfolio-lab/journalEngine';
import {fetchVolumeMomentum,type MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
import {fetchPaperQuote,fetchPaperPath} from '@/lib/admin/cryptoPaperMarket';
import {runCryptoPaperCycle,runCryptoPaperAll} from '@/lib/admin/cryptoPaper';
import type {ArcaPortfolio,ArcaPosition} from '@/lib/admin/portfolio-lab/types';
const now=Date.parse('2026-09-28T05:00:00Z'),step=900000;
let portfolio:ArcaPortfolio,positions:ArcaPosition[],scan:MomentumScan,discovery:{rows:{id:string;venues:{exchange:string;pair:string;volumeUsd:number;observedAt:string}[]}[]};
const signal={stage:'MOMENTUM_VOLUME' as const,asOf:'2026-09-28T04:00:00Z',kind:'CONTINUATION' as const,stop:95,target:112,maxEntry:102,entryFloor:99,close:100,reason:'test',relativeVolume:2,changePct:2,trigger:101,atr:2};
const pair={exchange:'gdax' as const,product:'BTC-USD',quote:'USD' as const,volumeUnit:'BTC'};
const position=()=>({id:'pos',symbol:'bitcoin',assetClass:'crypto',instrumentType:'coinbase:BTC-USD',side:'LONG',averageEntry:100,stopLoss:95,initialStopLoss:95,takeProfit1:112,openedAt:new Date(now-step).toISOString(),quantity:10} as ArcaPosition);
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);
 portfolio={id:'p',workspaceId:'w',mode:'SIMULATED',status:'ACTIVE',startingBalance:200000,totalEquity:200000,currentCash:200000,realisedPnl:0,settings:{feesPctEstimate:.05,slippagePctEstimate:.05}} as ArcaPortfolio;
 positions=[];scan={version:1,startedAt:new Date(now-1000).toISOString(),updatedAt:new Date(now).toISOString(),discoveryAt:new Date(now).toISOString(),rows:[{...signal,id:'bitcoin',symbol:'BTC',pair}]};
 discovery={rows:[{id:'bitcoin',venues:[{exchange:'gdax',pair:'BTC/USD',volumeUsd:1e9,observedAt:new Date(now-600000).toISOString()},{exchange:'okex',pair:'BTC/USDT',volumeUsd:1e9,observedAt:new Date(now-600000).toISOString()}]}]};
 vi.mocked(getRedis).mockReturnValue({set:vi.fn(async()=> 'OK'),get:vi.fn(async(key:string)=>key==='admin:crypto-discovery:v1'?discovery:scan)} as never);
 vi.mocked(store.getDefaultPortfolio).mockImplementation(async()=>portfolio);
 vi.mocked(store.getPortfolioById).mockImplementation(async()=>portfolio);
 vi.mocked(store.listOpenPositions).mockImplementation(async()=>positions);
 vi.mocked(q).mockResolvedValue([]);
 vi.mocked(fetchVolumeMomentum).mockResolvedValue(signal);
 vi.mocked(fetchPaperQuote).mockResolvedValue({bid:99.99,ask:100,product:'BTC-USD',priceAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString()});
 vi.mocked(fetchPaperPath).mockResolvedValue({symbol:'bitcoin',market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[{openAt:now-step,closeAt:now,open:100,high:101,low:98,close:100}]});
});
afterEach(()=>vi.restoreAllMocks());
it('creates an evidenced simulated entry after fresh checks',async()=>{
 const report=await runCryptoPaperCycle('w');expect(report).toMatchObject({opened:1,monitorHealthy:true});
 expect(createSimulatedOrder).toHaveBeenCalledWith(expect.objectContaining({symbol:'bitcoin',instrumentType:'coinbase:BTC-USD',orderType:'MARKET_SIM',stopLoss:95,takeProfit1:112}));
 expect(fillOrderAndOpenPosition).toHaveBeenCalledWith(expect.objectContaining({currentPrice:100}));
});
it('rejects a duplicate before fetching provider data',async()=>{
 vi.mocked(q).mockImplementation(async(sql:string)=>sql.startsWith('SELECT id FROM arca_simulated_orders')?[{id:'existing'}] as never:[]);
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0});expect(fetchPaperQuote).not.toHaveBeenCalled();
});
it('rechecks duplicates inside the transaction',async()=>{
 let n=0;vi.mocked(q).mockImplementation(async(sql:string)=>sql.startsWith('SELECT id FROM arca_simulated_orders')&&++n===2?[{id:'raced'}] as never:[]);
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0});expect(createSimulatedOrder).not.toHaveBeenCalled();
});
it('paused accounts still monitor positions but cannot enter',async()=>{
 portfolio.status='PAUSED';positions=[position()];
 expect(await runCryptoPaperCycle('w')).toMatchObject({marked:1,opened:0});expect(markAndMaybeExit).toHaveBeenCalled();expect(fetchVolumeMomentum).not.toHaveBeenCalled();
});
it('monitoring failure blocks new entries',async()=>{
 positions=[position()];vi.mocked(fetchPaperPath).mockRejectedValue(Error('down'));
 expect(await runCryptoPaperCycle('w')).toMatchObject({monitorHealthy:false,opened:0});expect(fetchVolumeMomentum).not.toHaveBeenCalled();
});
it('can settle a proven historical stop without a ticker',async()=>{
 positions=[position()];portfolio.status='PAUSED';vi.mocked(fetchPaperQuote).mockRejectedValue(Error('down'));
 vi.mocked(fetchPaperPath).mockResolvedValue({symbol:'bitcoin',market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[{openAt:now-step,closeAt:now,open:100,high:101,low:94,close:99}]});
 expect(await runCryptoPaperCycle('w')).toMatchObject({monitorHealthy:true,marked:1});expect(markAndMaybeExit).toHaveBeenCalledWith(expect.objectContaining({currentPrice:100,skipLearning:true}));
});
it('does not accept an empty old history as complete monitoring',async()=>{
 positions=[position()];vi.mocked(fetchPaperPath).mockResolvedValue({symbol:'bitcoin',market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[]});
 expect(await runCryptoPaperCycle('w')).toMatchObject({monitorHealthy:false});expect(markAndMaybeExit).not.toHaveBeenCalled();
});
it('ignores previous-window scan signals',async()=>{
 scan.startedAt='2026-09-28T00:00:00Z';expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0});expect(fetchVolumeMomentum).not.toHaveBeenCalled();
});
it('fails closed when shared coordination is unavailable',async()=>{
 vi.mocked(getRedis).mockReturnValue(null);await expect(runCryptoPaperCycle('w')).rejects.toThrow();expect(createSimulatedOrder).not.toHaveBeenCalled();
});
it('does not mix USDT research prices into the USD ledger',async()=>{
 scan.rows[0].pair={exchange:'binance',product:'BTC-USDT',quote:'USDT',volumeUnit:'BTC'};
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0});expect(fetchVolumeMomentum).not.toHaveBeenCalled();
});

it('does not report success when a failed-cycle retry encounters the cooldown',async()=>{
 vi.mocked(q).mockResolvedValue([{workspace_id:'w'}] as never);
 vi.mocked(getRedis).mockReturnValue({set:vi.fn(async()=>null),get:vi.fn(async()=>'cron')} as never);
 expect(await runCryptoPaperAll()).toMatchObject({ok:false,results:[{skipped:true}]});
});

it('the exit-only pass never fetches or opens a new candidate',async()=>{
 expect(await runCryptoPaperCycle('w','cron',true)).toMatchObject({phase:'monitor',opened:0});
 expect(fetchVolumeMomentum).not.toHaveBeenCalled();expect(createSimulatedOrder).not.toHaveBeenCalled();
});
it('records unsupported venues and duplicates explicitly',async()=>{
 scan.rows[0].pair={exchange:'binance',product:'BTC-USDT',quote:'USDT',volumeUnit:'BTC'};
 expect(await runCryptoPaperCycle('w')).toMatchObject({decisions:[{coin:'bitcoin',status:'BLOCKED',reason:'Unsupported paper venue/quote; Coinbase USD or OKX USDT required'}]});
});
it('records the observed quote for an entry price rejection',async()=>{
 vi.mocked(fetchPaperQuote).mockResolvedValue({bid:110,ask:110.01,product:'BTC-USD',priceAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString()});
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0,decisions:[{status:'BLOCKED',bid:110,ask:110.01,quoteAt:new Date(now).toISOString()}]});
});

it('opens OKX only with converted USD pricing, doubled costs and exit history ready',async()=>{
 scan.rows[0].pair={exchange:'okex',product:'BTC-USDT',quote:'USDT',volumeUnit:'BTC'};
 vi.mocked(fetchOkxUsdQuote).mockResolvedValue({bid:99.49,ask:99.5,product:'BTC-USDT',priceAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString(),conversion:{pair:'USDT-USD',bid:.995,ask:.995,at:new Date(now).toISOString(),nativeBid:99.99,nativeAsk:100,nativeAt:new Date(now).toISOString()}});
 vi.mocked(fetchOkxUsdPath).mockResolvedValue({symbol:'bitcoin',market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[]});
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:1});
 expect(createSimulatedOrder).toHaveBeenCalledWith(expect.objectContaining({instrumentType:'okx-usd-v1:BTC-USDT',stopLoss:94.525,portfolio:expect.objectContaining({settings:expect.objectContaining({feesPctEstimate:.1,slippagePctEstimate:.1})})}));
 expect(fillOrderAndOpenPosition).toHaveBeenCalledWith(expect.objectContaining({currentPrice:99.5}));
 expect(portfolio.settings.feesPctEstimate).toBe(.05);expect(fetchOkxUsdPath).toHaveBeenCalled();
});
it('blocks OKX entry if conversion history cannot be monitored',async()=>{
 scan.rows[0].pair={exchange:'okex',product:'BTC-USDT',quote:'USDT',volumeUnit:'BTC'};
 vi.mocked(fetchOkxUsdQuote).mockResolvedValue({bid:99.99,ask:100,product:'BTC-USDT',priceAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString(),conversion:{pair:'USDT-USD',bid:1,ask:1,at:new Date(now).toISOString(),nativeBid:99.99,nativeAsk:100,nativeAt:new Date(now).toISOString()}});
 vi.mocked(fetchOkxUsdPath).mockRejectedValue(Error('Missing matching USDT/USD exit candle'));
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0,decisions:[{status:'BLOCKED',reason:'Missing matching USDT/USD exit candle'}]});expect(createSimulatedOrder).not.toHaveBeenCalled();
});
it('monitors converted OKX positions while entries are paused using their own cost model',async()=>{
 portfolio.status='PAUSED';positions=[{...position(),instrumentType:'okx-usd-v1:BTC-USDT'}];
 vi.mocked(fetchOkxUsdQuote).mockRejectedValue(Error('ticker down'));
 vi.mocked(fetchOkxUsdPath).mockResolvedValue({symbol:'bitcoin',market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[{openAt:now-step,closeAt:now,open:100,high:101,low:94,close:99}]});
 expect(await runCryptoPaperCycle('w')).toMatchObject({monitorHealthy:true,marked:1});
 expect(markAndMaybeExit).toHaveBeenCalledWith(expect.objectContaining({portfolio:expect.objectContaining({settings:expect.objectContaining({feesPctEstimate:.1,slippagePctEstimate:.1})})}));
});
it('beta limits allow entries beyond the former five-position cap and still enforce the new cap',async()=>{
 // Exit history must match each position's own symbol, or monitoring (correctly) blocks entries.
 vi.mocked(fetchPaperPath).mockImplementation(async(symbol:string)=>({symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[{openAt:now-step,closeAt:now,open:100,high:101,low:98,close:100}]}));
 positions=Array.from({length:6},(_,i)=>({...position(),id:`pos${i}`,symbol:`coin${i}`}));
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:1,monitorHealthy:true});
 vi.clearAllMocks();vi.mocked(fetchVolumeMomentum).mockResolvedValue(signal);
 positions=Array.from({length:20},(_,i)=>({...position(),id:`pos${i}`,symbol:`coin${i}`}));
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0,decisions:[{status:'BLOCKED',reason:'20-position cap'}]});
});
it('records the BTC daily trend on each entry without using it as a filter',async()=>{
 const report=await runCryptoPaperCycle('w');
 expect(report).toMatchObject({opened:1,btcRegime:{state:'DOWN'}});
 const reason=vi.mocked(createSimulatedOrder).mock.calls[0][0].createdReason;
 expect(JSON.parse(reason.slice(reason.indexOf('{'))).btcRegime).toMatchObject({state:'DOWN'});
});
it('starts a research-only shadow exit for open positions, and shadow failures never block entries',async()=>{
 positions=[{...position(),symbol:'other'}];
 vi.mocked(fetchPaperPath).mockImplementation(async(symbol:string)=>({symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[{openAt:now-step,closeAt:now,open:100,high:101,low:98,close:100}]}));
 const shadow={version:1,plan:'partial-trail-v1',positionId:'old',symbol:'gone',instrumentType:'coinbase:GONE-USD',entry:100,entryAt:new Date(now-2*step).toISOString(),stop0:95,atr:2,costRate:.0005,entryFeePerUnit:.05,through:new Date(now-2*step).toISOString(),status:'OPEN',stop:95,highest:null,remaining:1,legs:[],r:null};
 vi.mocked(q).mockImplementation(async(sql:string)=>sql.includes('DISTINCT ON (position_id)')?[{state:JSON.stringify(shadow)}] as never:[]);
 vi.mocked(fetchPaperPath).mockImplementationOnce(async(symbol:string)=>({symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[{openAt:now-step,closeAt:now,open:100,high:101,low:98,close:100}]}))
  .mockImplementationOnce(async()=>{throw Error('shadow provider down');});
 const report=await runCryptoPaperCycle('w');
 expect(report).toMatchObject({opened:1,monitorHealthy:true});
 expect(report.notes).toContain('Shadow exit gone: shadow provider down; retried next cycle');
 expect(vi.mocked(writeJournal).mock.calls.some(([a])=>a.title==='Crypto shadow exit plan partial-trail-v1'&&a.positionId==='pos')).toBe(true);
});
it('caps entry size at 1% of the pair 24h volume and records the evidence',async()=>{
 // Risk sizing alone gives ~$9.6k here, so $500k volume (cap $5k) makes liquidity the binding limit.
 discovery.rows[0].venues[0].volumeUsd=5e5;
 const report=await runCryptoPaperCycle('w');
 expect(report).toMatchObject({opened:1,decisions:[{status:'OPENED',reason:expect.stringContaining('capped at 1%')}]});
 const order=vi.mocked(createSimulatedOrder).mock.calls[0][0];
 expect(order.notional).toBeLessThanOrEqual(5000);expect(order.notional).toBeGreaterThan(4990);
 expect(JSON.parse(order.createdReason.slice(order.createdReason.indexOf('{'))).liquidity).toMatchObject({volumeUsd:5e5,capUsd:5000,capped:true});
});
it('blocks entry when pair volume evidence is missing or stale instead of assuming liquidity',async()=>{
 discovery.rows[0].venues[0].observedAt=new Date(now-7*3600000).toISOString();
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0,decisions:[{status:'BLOCKED',reason:expect.stringContaining('liquidity cap cannot be verified')}]});
 discovery.rows=[];
 expect(await runCryptoPaperCycle('w')).toMatchObject({opened:0,decisions:[{status:'BLOCKED',reason:expect.stringContaining('24h volume unavailable')}]});
 expect(createSimulatedOrder).not.toHaveBeenCalled();
});
it('does not report a cron skip after a recent manual cycle as unhealthy, but still flags overlapping cron runs',async()=>{
 vi.mocked(q).mockImplementation(async(sql:string)=>sql.includes('FROM arca_portfolios WHERE name')?[{workspace_id:'w'}] as never:[]);
 let holder='manual';
 vi.mocked(getRedis).mockReturnValue({set:vi.fn(async()=>null),get:vi.fn(async(key:string)=>key.startsWith('admin:crypto-paper:cycle:')?holder:scan)} as never);
 expect(await runCryptoPaperAll()).toMatchObject({ok:true,results:[{skipped:true,reason:'Manual crypto paper cycle ran within the last three minutes'}]});
 holder='cron';
 expect(await runCryptoPaperAll()).toMatchObject({ok:false,results:[{skipped:true,reason:'Crypto paper cycle already running or cooling down'}]});
});
