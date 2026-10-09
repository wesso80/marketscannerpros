/** Characterisation of CURRENT writer collisions, not acceptance of the unsafe behaviour.
 * Real route handlers; fixture DB state and price resolver only. Replace expectations when repaired.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({q:vi.fn(),resolve:vi.fn()}));
vi.mock('@/lib/db',()=>({q:m.q}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:async()=>({ok:true})}));
vi.mock('@/lib/opsAlerting',()=>({alertCronFailure:vi.fn()}));
vi.mock('@/lib/admin/notifyAdmin',()=>({notifyAdmin:vi.fn()}));
vi.mock('@/lib/logger',()=>({generateTraceId:()=> 'fixture',logger:{withTrace:()=>({info:vi.fn(),error:vi.fn()})}}));
vi.mock('@/lib/outcomes/positionHorizonLabeller',()=>({labelPositionHorizons:async()=>({enabled:false})}));
vi.mock('@/lib/outcomes/aiOutcomePrices',()=>({createHorizonPriceResolver:()=>Object.assign(m.resolve,{fetchCounts:()=>({intraday:0,daily:0})})}));
import {POST as label} from '@/app/api/cron/label-ai-outcomes/route';
import {POST as lifecycle} from '@/app/api/jobs/signal-lifecycle/route';
const now=Date.parse('2026-10-09T12:00:00Z');
let row:any, labelAfterSnapshot=false, failLifecycleMetadata=false;
const request=(path:string)=>new NextRequest('http://localhost'+path,{method:'POST',headers:{'x-cron-secret':'fixture'}});
const runLabel=()=>label(request('/api/cron/label-ai-outcomes'));
const runLifecycle=()=>lifecycle(request('/api/jobs/signal-lifecycle'));
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('CRON_SECRET','fixture');
 row={id:1,symbol:'AAPL',asset_type:'equity',trade_bias:'LONG',signal_at:new Date(now-40*3600000).toISOString(),price_at_signal:100,entry_price:100,stop_loss:98,target_1:100.4,price_after_24h:null,pct_move_24h:null,outcome:'pending',outcome_measured_at:null,lifecycle_state:'DISCOVERED'};
 labelAfterSnapshot=false;failLifecycleMetadata=false;
 m.resolve.mockReset();m.resolve.mockResolvedValue({price:102,at:now-16*3600000,source:'intraday'});
 m.q.mockReset();m.q.mockImplementation(async(sql:string,p:any[]=[])=>{
  if(sql.includes('information_schema.columns'))return [{column_name:'price_after_24h_at'}];
  if(sql.startsWith('ALTER TABLE'))return [];
  if(sql.includes("SET outcome = 'expired'"))return []; // fixture is 40h, below seven-day expiry
  if(sql.includes('COUNT(*)'))return [{n:0}];
  if(sql.includes('SELECT id')&&sql.includes("lifecycle_state IN")){
   const snapshot=['DISCOVERED','WATCHING','TRIGGERED'].includes(row.lifecycle_state)?[{...row}]:[];
   if(labelAfterSnapshot){labelAfterSnapshot=false;expect((await runLabel()).status).toBe(200);}
   return snapshot;
  }
  if(sql.includes('SELECT id')&&sql.includes("outcome = 'pending'"))return row.outcome==='pending'?[{...row}]:[];
  if(sql.includes('SET outcome = $1, price_after_24h')){
   if(row.outcome!=='pending')return [];
   Object.assign(row,{outcome:p[0],price_after_24h:p[1],pct_move_24h:p[2],price_after_24h_at:p[4],outcome_measured_at:new Date(now).toISOString()});return [{id:1}];
  }
  if(sql.includes('SET lifecycle_state = $1')){
   if(failLifecycleMetadata)throw new Error('fixture metadata write failure');
   row.lifecycle_state=p[0];return [];
  }
  if(sql.includes('SET lifecycle_state = $2')){
   // The actual statement has only WHERE id=$1: it overwrites regardless of changed outcome/state.
   expect(sql).toMatch(/WHERE id = \$1\s*$/);
   Object.assign(row,{lifecycle_state:p[1],outcome:p[2]});
   if(['TARGET_1_HIT','STOPPED','EXPIRED'].includes(p[1]))row.outcome_measured_at=new Date(now).toISOString();
   return [];
  }
  throw new Error('Unhandled fixture SQL: '+sql);
 });
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
describe('CURRENT outcome writer collision reproductions',()=>{
 it('lifecycle expires a 40h unresolved row and prevents the horizon labeller retry',async()=>{
  expect((await runLifecycle()).status).toBe(200);
  expect(row.outcome).toBe('expired');
  const result=await (await runLabel()).json();
  expect(result.horizons['24h'].labeled).toBe(0);expect(m.resolve).not.toHaveBeenCalled();
  expect(row.price_after_24h).toBeNull();
 });
 it('a stale lifecycle snapshot overwrites a completed fixed-horizon write',async()=>{
  labelAfterSnapshot=true;
  expect((await runLifecycle()).status).toBe(200);
  expect(row).toMatchObject({outcome:'expired',pct_move_24h:2,price_after_24h:102,lifecycle_state:'EXPIRED'});
  expect(row.outcome_measured_at).toBe(new Date(now).toISOString());
 });
 it('an optional metadata failure lets target semantics replace a neutral 24h label',async()=>{
  failLifecycleMetadata=true;m.resolve.mockResolvedValue({price:100.5,at:now-16*3600000,source:'intraday'});
  expect((await runLabel()).status).toBe(200);
  expect(row).toMatchObject({outcome:'neutral',pct_move_24h:0.5,lifecycle_state:'DISCOVERED'});
  expect((await runLifecycle()).status).toBe(200);
  expect(row).toMatchObject({outcome:'correct',pct_move_24h:0.5,lifecycle_state:'TARGET_1_HIT'});
 });
});
