import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const h=vi.hoisted(()=>({session:{workspaceId:'w',cid:'reader',tier:'pro'} as any,operator:false,queries:[] as string[],lookup:[] as any[],lookupArgs:[] as unknown[]}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/proTraderAccess',()=>({hasPaidSessionAccess:()=>true}));
vi.mock('@/lib/quant/operatorAuth',()=>({isOperator:()=>h.operator}));
vi.mock('@/lib/db',()=>({q:async(sql:string,args:unknown[])=>{
 if(sql.includes("SELECT * FROM ai_actions")){h.lookupArgs=args;return h.lookup;}
 h.queries.push(sql);
 if(sql.includes('increment_rate_limit'))return [{minute_count:1,hour_count:1}];
 if(sql.includes('INSERT INTO ai_actions'))return [{id:'private-action'}];
 if(sql.includes('UPDATE ai_actions'))return [{id:'private-action'}];
 return [];
}}));
import {POST,GET} from '@/app/api/ai/actions/route';
const parameters={generate_trade_plan:{symbol:'AAPL',direction:'long',entryPrice:100,stopLoss:90,targets:[110]},risk_position_size:{accountSize:10000,riskPercent:1,entryPrice:100,stopLoss:90,symbol:'AAPL'}};
const request=(tool:keyof typeof parameters,extra={})=>new NextRequest('http://fixture.test/api/ai/actions',{method:'POST',headers:{'x-admin-secret':'forged'},body:JSON.stringify({tool,parameters:parameters[tool],skill:'options',idempotencyKey:'previous-public-action',is_admin:true,...extra})});
beforeEach(()=>{h.session={workspaceId:'w',cid:'reader',tier:'pro'};h.operator=false;h.queries=[];h.lookup=[];h.lookupArgs=[];});
afterEach(()=>vi.unstubAllEnvs());
it.each(['generate_trade_plan','risk_position_size'] as const)('rejects public %s before any lookup, replay, dry-run or confirmation',async tool=>{
 for(const enabled of ['true','false'])for(const extra of [{},{dryRun:true},{confirm:true,actionId:'old-pending'},{responseId:'old-response'}]) {
  vi.stubEnv('PUBLIC_DAILY_QUOTAS_ENABLED',enabled);
  const response=await POST(request(tool,extra));expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toMatchObject({success:false,code:'PUBLIC_TRADE_ACTION_RETIRED'});
  expect(h.queries).toEqual([]);
 }
});
it.each(['pro','pro_trader','free'])('does not trust the %s tier or browser admin claims',async tier=>{
 h.session.tier=tier;expect((await POST(request('generate_trade_plan'))).status).toBe(403);expect(h.queries).toEqual([]);
});
it('requires sign-in',async()=>{
 h.session=null;expect((await POST(request('generate_trade_plan'))).status).toBe(401);expect(h.queries).toEqual([]);
});
it.each(['admin','operator'])('preserves %s dry runs and the actual private sizing executor',async identity=>{
 h.session.is_admin=identity==='admin';h.operator=identity==='operator';
 for(const tool of ['generate_trade_plan','risk_position_size'] as const) {
  const response=await POST(request(tool,{dryRun:true}));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({success:true,dryRun:true,executed:false});
 }
 expect(h.queries).toEqual([]);
 const response=await POST(request('risk_position_size'));expect(response.status).toBe(200);
 const body=await response.json();expect(body.success).toBe(true);expect(body.executedResult).toMatchObject({modelShares:10});
});

it.each(['actionId','idempotencyKey'])('withholds old public trade results queried by %s',async key=>{
 for(const tool of ['generate_trade_plan','risk_position_size'])for(const status of ['pending','confirmed','executed']) {
  h.lookup=[{id:'old-action',action_type:tool,status,action_params:{private:'OLD_TRADE_SENTINEL'},result_data:{private:'OLD_TRADE_SENTINEL'}}];
  const response=await GET(new NextRequest(`http://fixture.test/api/ai/actions?${key}=old-action`));
  expect(response.status).toBe(403);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.text()).not.toContain('OLD_TRADE_SENTINEL');
  expect(h.lookupArgs).toEqual(['old-action','w']);
 }
});
it('preserves private result lookup and unrelated public action status',async()=>{
 h.lookup=[{id:'old-action',action_type:'generate_trade_plan',result_data:{referenceLevel:100}}];h.session.is_admin=true;
 const req=()=>new NextRequest('http://fixture.test/api/ai/actions?actionId=old-action');
 expect((await (await GET(req())).json()).action).toEqual(h.lookup[0]);
 h.session.is_admin=false;h.lookup=[{id:'old-action',action_type:'create_alert',status:'executed'}];
 expect((await (await GET(req())).json()).action).toEqual(h.lookup[0]);
});
