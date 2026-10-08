import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({enabled:true,tier:'free',bypass:false,queries:[] as string[],rows:Array.from({length:8},(_,i)=>({id:i+1,is_open:true}))}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>({workspaceId:'account-a',tier:'free',cid:'reader'})}));
vi.mock('@/lib/entitlements',()=>({getEffectiveTier:async()=>state.tier}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>state.enabled,resolvePublicQuotaAccess:async()=>({bypass:state.bypass,plan:'free'})}));
vi.mock('@/lib/db',()=>({q:async(sql:string)=>sql.includes('COUNT(*)')?[{count:state.rows.length}]:[],tx:async(fn:any)=>fn({query:async(sql:string)=>{
 state.queries.push(sql);if(sql.includes('SELECT id, is_open'))return {rows:state.rows};return {rows:[]};
}})}));
vi.mock('@/lib/notifications/tradeEvents',()=>({emitTradeLifecycleEvent:async()=>{},hashDedupeKey:()=>''}));
vi.mock('@/lib/risk-governor-hard',()=>({buildPermissionSnapshot:()=>({caps:{risk_per_trade:1}}),evaluateCandidate:()=>({permission:'ALLOW'})}));
vi.mock('@/lib/journal/riskAtEntry',()=>({getLatestPortfolioEquity:async()=>10000,computeEntryRiskMetrics:()=>({})}));
vi.mock('@/lib/risk/runtimeSnapshot',()=>({getRuntimeRiskSnapshotInput:async()=>({})}));
vi.mock('@/lib/execution/runPipeline',()=>({runExecutionPipeline:async()=>({})}));
vi.mock('@/lib/intelligence/ingestOutcome',()=>({backfillTradeOutcomes:async()=>{},maybeAutoEvolve:async()=>{}}));
import {POST} from '@/app/api/journal/route';
const entries=()=>state.rows.map(row=>({id:row.id,isOpen:true,symbol:'AAPL',side:'LONG',entryPrice:100,quantity:1,date:'2026-10-08'}));
const request=(data=entries())=>new NextRequest('http://fixture.test/api/journal',{method:'POST',headers:{cookie:'msp_risk_guard=off'},body:JSON.stringify({entries:data})});
beforeEach(()=>{state.enabled=true;state.tier='free';state.bypass=false;state.queries=[];state.rows=Array.from({length:8},(_,i)=>({id:i+1,is_open:true}));});
it('saves an existing eight-entry book and checks under the lock before deletes',async()=>{
 expect((await POST(request())).status).toBe(200);
 expect(state.queries[0]).toContain('pg_advisory_xact_lock');
 expect(state.queries.findIndex(s=>s.includes('SELECT id, is_open'))).toBeLessThan(state.queries.findIndex(s=>s.includes('DELETE FROM journal_entries')));
});
it('allows closing one entry without requiring the book to fall to five immediately',async()=>{
 const data=entries();data[0].isOpen=false;expect((await POST(request(data))).status).toBe(200);
});
it('rejects a new or reopened entry before destructive statements',async()=>{
 for(const reopen of [false,true]) {
  state.queries=[];const data=entries();if(reopen)state.rows[0].is_open=false;else data[0].id=99;
  expect((await POST(request(data))).status).toBe(403);
  expect(state.queries.some(s=>/DELETE|INSERT INTO journal_entries/.test(s))).toBe(false);
 }
});
it('retains the existing flag-off and admin-bypass behaviour',async()=>{
 state.enabled=false;expect((await POST(request())).status).toBe(403);expect(state.queries).toEqual([]);
 state.enabled=true;state.bypass=true;expect((await POST(request())).status).toBe(403);expect(state.queries).toEqual([]);
});
it('leaves paid accounts uncapped',async()=>{
 state.tier='pro';const data=entries();data[0].id=99;expect((await POST(request(data))).status).toBe(200);
});
