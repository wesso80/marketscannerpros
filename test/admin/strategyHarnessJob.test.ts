import {it,expect,vi} from 'vitest';
const store=new Map<string,unknown>();
vi.mock('@/lib/redis',()=>({getRedis:()=>({set:async(k:string,v:unknown,o?:{nx?:boolean})=>{if(o?.nx&&store.has(k))return null;store.set(k,v);return 'OK';},get:async(k:string)=>store.get(k)??null,del:async(k:string)=>store.delete(k)})}));
let btcDays='0',pending='0';
vi.mock('@/lib/db',()=>({q:vi.fn(async(s:string)=>/coin_id='bitcoin'/.test(s)?[{n:btcDays}]:/chart_status='PENDING'/.test(s)?[{n:pending}]:[])}));
vi.mock('@/lib/admin/cgHistoryJob',()=>({ensureCgHistoryTables:async()=>undefined}));
import {startHarness,computeHarness,harnessBatch} from '@/lib/admin/strategyHarnessJob';
it('refuses to run on an incomplete point-in-time universe instead of silently using partial data',async()=>{
 await expect(startHarness()).rejects.toThrow('BTC needs 200 daily closes');
 btcDays='210';pending='26';
 await expect(startHarness()).rejects.toThrow('26 coins pending, at most 25 allowed');
 await expect(computeHarness()).rejects.toThrow('not complete');
 await expect(harnessBatch()).rejects.toThrow('Start the harness first');
});
