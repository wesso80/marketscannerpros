import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {NextRequest} from 'next/server';
const h=vi.hoisted(()=>({service:null as any,plan:'pro',loggedIn:true}));
vi.mock('@/lib/db',()=>({tx:()=>{throw Error('Production DB forbidden');}}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.loggedIn?{workspaceId:'fixture'}:null}));
vi.mock('@/lib/rateLimit',()=>({aiLimiter:{check:()=>({allowed:true})},getClientIP:()=> 'fixture'}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>true,resolvePublicQuotaAccess:async()=>({bypass:false,subject:'account:fixture',plan:h.plan}),
 publicRequestFingerprint:(s:string)=>createHash('sha256').update(s).digest('hex'),
 publicQuota:{reserve:(...a:any[])=>h.service.reserve(...a),settle:(...a:any[])=>h.service.settle(...a)}}));
import {createPublicDailyQuota} from '@/lib/publicDailyQuota';
import {withPublicAiQuota} from '@/lib/publicAiQuota';
import {publicCopilot} from '@/lib/ai/publicCopilot';
import {issueSymbolEvidence} from '@/lib/ai/publicCopilotEvidence';

describe.skipIf(!process.env.QUOTA_TEST_POSTGRES_PORT)('real Copilot + quota wrapper + isolated PostgreSQL',()=>{
 let admin:Pool,pool:Pool,token:string,fetcher:ReturnType<typeof vi.fn>;
 const database='copilot_test_'+randomUUID().replaceAll('-','');
 const call=withPublicAiQuota(publicCopilot,'ai/copilot');
 const request=(id='question-0001',message='Explain the page')=>new NextRequest('http://localhost/api/ai/copilot',{method:'POST',headers:{'Idempotency-Key':id},body:JSON.stringify({message,symbol:'AAPL',pagePath:'/tools/golden-egg',evidenceToken:token})});
 const answer=()=>Response.json({choices:[{message:{content:JSON.stringify({statements:[{kind:'explanation',text:'timing',evidenceIds:[]}]})}}]});
 const state=async()=> (await h.service.status('account:fixture','pro')).quotas.find((q:any)=>q.kind==='ai');
 beforeAll(async()=>{
  const port=Number(process.env.QUOTA_TEST_POSTGRES_PORT);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Explicit loopback port required');
  const config={host:'127.0.0.1',port,user:'quota_test',password:'quota_local_only',connectionTimeoutMillis:5000};
  admin=new Pool({...config,database:'postgres'});await admin.query(`CREATE DATABASE "${database}"`);
  pool=new Pool({...config,database,max:8});
  for(const migration of ['126_public_daily_quotas.sql','127_public_quota_replay.sql'])await pool.query(readFileSync('migrations/'+migration,'utf8'));
  h.service=createPublicDailyQuota(async work=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS "${database}"`);await admin.end();}});
 beforeEach(async()=>{
  await pool.query('TRUNCATE public_daily_quota_entries,public_daily_quota_buckets');
  vi.stubEnv('APP_SIGNING_SECRET','copilot-ledger-fixture');vi.stubEnv('OPENAI_API_KEY','fake-key');
  h.plan='pro';h.loggedIn=true;fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  token=issueSymbolEvidence({contract:'public-symbol-v2',meta:{symbol:'AAPL',timeframe:'daily'},canonical:{price:123}} as any,'account:fixture')!;
 });
 afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
 it('persists one debit and replays identical content without a second model call',async()=>{
  fetcher.mockResolvedValue(answer());
  const first=await call(request());expect(first.status).toBe(200);const body=await first.json();
  expect(body.quota.used).toBe(1);expect(body.content).toContain('Snapshot creation time');
  const replay=await call(request());expect(replay.status).toBe(200);const cached=await replay.json();
  expect(cached.replayed).toBe(true);expect(cached.content).toBe(body.content);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(await state()).toMatchObject({completed:1,pending:0,remaining:19});
  expect((await call(request('question-0001','Different question'))).status).toBe(409);
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('runs only one of two simultaneous identical questions',async()=>{
  let release!:(r:Response)=>void,started!:()=>void;
  const begun=new Promise<void>(r=>started=r);
  fetcher.mockImplementation(()=>{started();return new Promise<Response>(r=>release=r);});
  const first=call(request());await begun;
  expect((await call(request())).status).toBe(409);
  expect(await state()).toMatchObject({completed:0,pending:1,remaining:19});
  release(answer());expect((await first).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(await state()).toMatchObject({completed:1,pending:0});
 });
 it('releases rejected output, then permits the same request to succeed once',async()=>{
  fetcher.mockResolvedValueOnce(Response.json({choices:[{message:{content:JSON.stringify({statements:[{kind:'observation',text:'Buy now',evidenceIds:[]}]})}}]}));
  const failed=await call(request());expect(failed.status).toBe(422);expect((await failed.json()).content).toBeUndefined();
  expect(await state()).toMatchObject({completed:0,pending:0,remaining:20});
  fetcher.mockResolvedValueOnce(answer());expect((await call(request())).status).toBe(200);
  expect(await state()).toMatchObject({completed:1,pending:0,remaining:19});
 });
 it('holds an interrupted model outcome and prevents a second call on retry',async()=>{
  fetcher.mockRejectedValue(Error('synthetic interruption'));
  expect((await call(request())).status).toBe(503);
  expect(await state()).toMatchObject({completed:0,pending:1,remaining:19});
  expect((await call(request())).status).toBe(409);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('releases missing-key failures before a provider call',async()=>{
  vi.stubEnv('OPENAI_API_KEY','');expect((await call(request())).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();expect(await state()).toMatchObject({remaining:20,pending:0});
 });
 it('refuses the twenty-first question before calling the model',async()=>{
  for(let i=0;i<20;i++)await h.service.reserve({subject:'account:fixture',plan:'pro',kind:'ai',resource:'seed-'+i,fingerprint:'seed-'+i});
  expect((await call(request())).status).toBe(429);expect(fetcher).not.toHaveBeenCalled();
  expect(await state()).toMatchObject({remaining:0,pending:20});
 });
 it('refuses signed-out and Free requests before creating ledger entries',async()=>{
  h.loggedIn=false;expect((await call(request())).status).toBe(401);
  h.loggedIn=true;h.plan='free';expect((await call(request())).status).toBe(403);
  expect((await pool.query('SELECT count(*)::int AS n FROM public_daily_quota_entries')).rows[0].n).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
 });
});
