/** Ownership regressions use both real handlers; only SQL state and price lookup are fixtures. */
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
let row:any, labelAfterSnapshot=false;
const request=(path:string)=>new NextRequest('http://localhost'+path,{method:'POST',headers:{'x-cron-secret':'fixture'}});
const runLabel=()=>label(request('/api/cron/label-ai-outcomes'));
const runLifecycle=()=>lifecycle(request('/api/jobs/signal-lifecycle'));
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('CRON_SECRET','fixture');
 row={id:1,symbol:'AAPL',asset_type:'equity',trade_bias:'LONG',signal_at:new Date(now-40*3600000).toISOString(),price_at_signal:100,entry_price:100,stop_loss:98,target_1:100.4,price_after_24h:null,pct_move_24h:null,outcome:'pending',outcome_measured_at:null,lifecycle_state:'DISCOVERED'};
 labelAfterSnapshot=false;
 m.resolve.mockReset();m.resolve.mockResolvedValue({price:102,at:now-16*3600000,source:'intraday'});
 m.q.mockReset();m.q.mockImplementation(async(sql:string,p:any[]=[])=>{
  if(sql.includes('information_schema.columns'))return ['price_after_24h_at','outcome_provenance','outcome_4h_provenance'].map(column_name=>({column_name}));
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

   row.lifecycle_state=p[0];return [];
  }
  if(sql.includes('SET lifecycle_state = $2')){
   // The lifecycle update is guarded and owns only separate lifecycle evidence.
   expect(sql).toContain('WHERE id = $1 AND lifecycle_state = $4');
   if(row.lifecycle_state!==p[3])return [];
   expect(JSON.parse(p[4])).toMatchObject({writer:'signal-lifecycle',method:'target-stop-close-v1',outcome:p[2]});
   Object.assign(row,{lifecycle_state:p[1],lifecycle_outcome:p[2]});
   row.lifecycle_outcome_measured_at=new Date(now).toISOString();
   return [{id:1}];
  }
  throw new Error('Unhandled fixture SQL: '+sql);
 });
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
describe('separate outcome ownership',()=>{
 it('lifecycle expiry preserves a 40h pending horizon for its later measurement',async()=>{
  expect((await runLifecycle()).status).toBe(200);
  expect(row.lifecycle_outcome).toBe('expired');expect(row.outcome).toBe('pending');
  const result=await (await runLabel()).json();
  expect(result.horizons['24h'].labeled).toBe(1);expect(m.resolve).toHaveBeenCalled();
  expect(row).toMatchObject({outcome:'correct',price_after_24h:102,lifecycle_outcome:'expired'});
 });
 it('a stale lifecycle snapshot cannot overwrite a completed horizon measurement',async()=>{
  labelAfterSnapshot=true;
  expect((await runLifecycle()).status).toBe(200);
  expect(row).toMatchObject({outcome:'correct',pct_move_24h:2,price_after_24h:102,lifecycle_state:'EXPIRED',lifecycle_outcome:'expired'});
  expect(row.outcome_measured_at).toBe(new Date(now).toISOString());
 });
 it('target semantics remain separate from a neutral 24h result',async()=>{
  m.resolve.mockResolvedValue({price:100.5,at:now-16*3600000,source:'intraday'});
  expect((await runLabel()).status).toBe(200);
  expect(row).toMatchObject({outcome:'neutral',pct_move_24h:0.5,lifecycle_state:'DISCOVERED'});
  expect((await runLifecycle()).status).toBe(200);
  expect(row).toMatchObject({outcome:'neutral',pct_move_24h:0.5,lifecycle_state:'TARGET_1_HIT',lifecycle_outcome:'correct'});
 });
});
