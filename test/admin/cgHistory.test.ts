import {it,expect,vi,beforeEach} from 'vitest';
import {readFileSync} from 'fs';
const store=new Map<string,unknown>();
vi.mock('@/lib/redis',()=>({getRedis:()=>({set:async(k:string,v:unknown,o?:{nx?:boolean})=>{if(o?.nx&&store.has(k))return null;store.set(k,v);return 'OK';},get:async(k:string)=>store.get(k)??null,del:async(k:string)=>store.delete(k),incrby:async()=>1,expire:async()=>1,hincrby:async()=>1,hgetall:async()=>({})})}));
const sql:string[]=[];
vi.mock('@/lib/db',()=>({q:vi.fn(async(s:string)=>{sql.push(s);if(/GROUP BY status/.test(s))return [{status:'active',n:'2400'},{status:'inactive',n:'9000'}];if(/SELECT id FROM cg_hist_coins WHERE chart_status='PENDING'/.test(s))return [{id:'a'},{id:'b'}];return [];})}));
const cg={getCoinsList:vi.fn(async()=>[{id:'dead',symbol:'d',name:'Dead'}]),getMarketData:vi.fn(async()=>[{id:'bitcoin',symbol:'btc',name:'Bitcoin'}]),getMarketChartRange:vi.fn(async()=>null),getOHLCRange:vi.fn(async()=>null),getGlobalMarketCapHistory:vi.fn(async()=>null),getApiUsage:vi.fn(async()=>({monthly_call_credit:500000,current_total_monthly_calls:100000,current_remaining_monthly_calls:400000}))};
vi.mock('@/lib/coingecko',()=>cg);
import {CG_HISTORY,CG_HISTORY_DDL,parseMarketChart,parseOhlc,peakMarketCap,looksStable,ohlcChunks,estimateCredits,jobCap,spentSinceApproval,dayKey} from '@/lib/admin/cgHistory';
const D=86400000,t0=Date.UTC(2022,0,1);
beforeEach(()=>{store.clear();sql.length=0;Object.values(cg).forEach(f=>f.mockClear());});
it('keeps only 00:00 UTC daily points and merges price, market cap and volume by day',()=>{
 const r=parseMarketChart({prices:[[t0,10],[t0+D,11],[t0+D+3600000,12]],market_caps:[[t0,1e9],[t0+D,0]],total_volumes:[[t0,5e6]]});
 expect(r).toEqual([{day:'2022-01-01',close:10,marketCap:1e9,volume:5e6},{day:'2022-01-02',close:11,marketCap:null,volume:null}]);
 expect(parseMarketChart(null)).toEqual([]);
});
it('keys OHLC by candle close time and drops invalid geometry',()=>{
 const {rows,dropped}=parseOhlc([[t0+D,1,2,.5,1.5],[t0+2*D,1,.9,.5,1],[t0+3*D+1,1,2,.5,1]]);
 expect(rows).toEqual([{day:'2022-01-02',open:1,high:2,low:.5,close:1.5}]);expect(dropped).toBe(2);
});
it('flags stablecoins by price, computes peak market cap, and splits OHLC into <=180-day chunks with no gaps',()=>{
 const rows=(p:(i:number)=>number)=>Array.from({length:60},(_,i)=>({day:dayKey(t0+i*D),close:p(i),marketCap:i*1e7,volume:1}));
 expect(looksStable(rows(()=>1.001))).toBe(true);expect(looksStable(rows(i=>1+i/100))).toBe(false);
 expect(peakMarketCap(rows(()=>1))).toBe(59e7);
 const ch=ohlcChunks('2021-06-01','2026-09-30');
 expect(ch.every(([a,b])=>b-a<=180*86400&&b>a)).toBe(true);
 for(let i=1;i<ch.length;i++)expect(ch[i][0]).toBe(ch[i-1][1]);
 expect(ch[0][0]).toBe(Date.parse('2021-06-01')/1000);expect(ch.at(-1)![1]).toBe(Date.parse('2026-09-30')/1000);
});
it('estimates credits before running: exact pass 1, bounded pass 2, and a cap of 50% of remaining credits',()=>{
 const e=estimateCredits(2400,9000,'2026-09-30',400000);
 const chunks=Math.ceil(e.days/180);
 expect(e.calls.marketCharts).toBe(11400);expect(e.calls.ohlcLow).toBe(225*chunks);expect(e.calls.ohlcHigh).toBe(600*chunks);
 expect(e.calls.totalHigh).toBe(e.calls.lists+1+11400+600*chunks);expect(e.cap).toBe(200000);expect(e.fitsCap).toBe(true);
 expect(estimateCredits(1,1,'2026-09-30',null)).toMatchObject({cap:null,fitsCap:null});
 expect(jobCap(123457)).toBe(61728);
 expect(spentSinceApproval(400000,390000,4000)).toBe(10000);expect(spentSinceApproval(400000,390000,12000)).toBe(12000);
 expect(spentSinceApproval(400000,500000,300)).toBe(300);
});
it('the tables the job creates are exactly the checked-in migration',()=>{
 expect(CG_HISTORY_DDL).toBe(readFileSync('migrations/108_cg_history.sql','utf8'));
});
it('downloads nothing before approval, stops at the cap, and pauses while credits are below 15%',async()=>{
 const job=await import('@/lib/admin/cgHistoryJob');
 expect(await job.historyStep(40)).toMatchObject({skipped:'IDLE'});
 expect(cg.getMarketChartRange).not.toHaveBeenCalled();
 await expect(job.approveHistory()).rejects.toThrow('Estimate first');
 const est=await job.estimateHistory();
 expect(est.phase).toBe('ESTIMATED');expect(est.estimate?.candidates).toEqual({active:2400,inactive:9000,total:11400});
 expect(cg.getMarketChartRange).not.toHaveBeenCalled();
 const ok=await job.approveHistory();expect(ok).toMatchObject({phase:'RUNNING',startRemaining:400000,cap:200000});
 await job.historyStep(40);expect(cg.getMarketChartRange).toHaveBeenCalledTimes(2);
 // Spend beyond the cap (CoinGecko /key shows 250k used since approval): the job stops, no further calls.
 cg.getApiUsage.mockResolvedValue({monthly_call_credit:500000,current_total_monthly_calls:350000,current_remaining_monthly_calls:150000});store.delete('admin:cg-credits:v1:key');
 cg.getMarketChartRange.mockClear();
 expect(await job.historyStep(40)).toMatchObject({paused:'cap'});expect(cg.getMarketChartRange).not.toHaveBeenCalled();
 // Below 15% total remaining: paused regardless of cap.
 await job.approveHistory();cg.getApiUsage.mockResolvedValue({monthly_call_credit:500000,current_total_monthly_calls:450000,current_remaining_monthly_calls:50000});store.delete('admin:cg-credits:v1:key');
 expect(await job.historyStep(40)).toMatchObject({paused:true});expect(cg.getMarketChartRange).not.toHaveBeenCalled();
 expect(CG_HISTORY.maxShareOfRemaining).toBe(.5);
});
