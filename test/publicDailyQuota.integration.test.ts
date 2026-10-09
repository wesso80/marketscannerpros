import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const h=vi.hoisted(()=>({pool:null as any}));
vi.mock('@/lib/db', () => ({ q:async(sql:string,args:unknown[]) => (await h.pool.query(sql,args)).rows, tx: () => { throw new Error('Production database forbidden'); } }));
import { createPublicDailyQuota, type QuotaRequest } from '@/lib/publicDailyQuota';
import { reportSummary } from '@/lib/publicReportSummary';
import { publicDailyLimit, symbolQuotaKey } from '@/lib/publicPlans';
it('defines the approved public limits and separates asset identities',()=>{
 expect(publicDailyLimit('visitor','symbol')).toBe(1);expect(publicDailyLimit('free','symbol')).toBe(3);
 expect(publicDailyLimit('free','ai')).toBe(0);expect(publicDailyLimit('pro','ai')).toBe(20);
 expect(publicDailyLimit('pro','symbol')).toBeNull();expect(publicDailyLimit('visitor','ai')).toBe(0);
 expect(symbolQuotaKey('crypto','aapl')).not.toBe(symbolQuotaKey('equity','aapl'));
});
describe.skipIf(!process.env.QUOTA_TEST_POSTGRES_PORT)('public quotas on isolated PostgreSQL',()=>{
 let admin: Pool, pool: Pool;
 const database='quota_test_'+randomUUID().replaceAll('-','');
 const service=createPublicDailyQuota(async work=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});
 const req=(resource:string,extra:Partial<QuotaRequest>={}):QuotaRequest=>({subject:'account:fixture',plan:'free',kind:'symbol',resource,fingerprint:resource,...extra});
 beforeAll(async()=>{
  const port=Number(process.env.QUOTA_TEST_POSTGRES_PORT);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Explicit loopback port required');
  const config={host:'127.0.0.1',port,user:'quota_test',password:'quota_local_only',connectionTimeoutMillis:5000};
  admin=new Pool({...config,database:'postgres'});await admin.query(`CREATE DATABASE "${database}"`);
  pool=new Pool({...config,database,max:8});h.pool=pool;
  const sql=readFileSync('migrations/126_public_daily_quotas.sql','utf8');await pool.query(sql);await pool.query(sql);
  const replay=readFileSync('migrations/127_public_quota_replay.sql','utf8');await pool.query(replay);await pool.query(replay);
  const summaries=readFileSync('migrations/128_public_report_summaries.sql','utf8');await pool.query(summaries);await pool.query(summaries);
 });
 afterAll(async()=>{if(pool)await pool.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS "${database}"`);await admin.end();}});
 beforeEach(async()=>{await pool.query('TRUNCATE public_daily_quota_entries,public_daily_quota_buckets,public_report_summaries');});
 it('serializes contenders at the last credit and isolates subjects',async()=>{
  await service.reserve(req('A'));await service.reserve(req('B'));
  const results=await Promise.all(['C','D'].map(k=>service.reserve(req(k))));
  expect(results.map(r=>r.status).sort()).toEqual(['limited','reserved']);
  expect((await service.reserve(req('E',{subject:'account:other'}))).status).toBe('reserved');
 });
 it('shares the final AI allowance between Journal and Copilot contenders',async()=>{
  for(let i=0;i<19;i++) await service.reserve(req('ai/copilot:'+i,{kind:'ai',plan:'pro'}));
  const results=await Promise.all(['journal/analyze:last','ai/copilot:last'].map(resource=>service.reserve(req(resource,{kind:'ai',plan:'pro'}))));
  expect(results.map(r=>r.status).sort()).toEqual(['limited','reserved']);
 });
 it('deduplicates pending and completed reports and fingerprints AI retries',async()=>{
  const results=await Promise.all([service.reserve(req('A')),service.reserve(req('A'))]);
  expect(results.map(r=>r.status).sort()).toEqual(['pending','reserved']);
  const r=results.find(r=>r.status==='reserved')!;if(r.status!=='reserved')throw Error('reservation missing');
  expect(await service.settle(r.reservation,'completed')).toBe(true);
  expect(await service.settle(r.reservation,'completed')).toBe(true);
  expect((await service.reserve(req('A'))).status).toBe('completed');
  expect((await service.reserve(req('A',{fingerprint:'changed'}))).status).toBe('conflict');
  expect(await service.settle(r.reservation,'released')).toBe(false);
 });
 it('releases confirmed failures and fences stale worker tokens',async()=>{
  const first=await service.reserve(req('A'));if(first.status!=='reserved')throw Error('missing');
  await service.settle(first.reservation,'released');
  const retry=await service.reserve(req('A'));if(retry.status!=='reserved')throw Error('missing');
  expect(retry.used).toBe(1);expect(await service.settle(first.reservation,'completed')).toBe(false);
  expect(await service.settle(retry.reservation,'completed')).toBe(true);
 });
 it('enforces shared AI capacity, visitor limits and unlimited Pro reports',async()=>{
  const ai=await Promise.all(Array.from({length:22},(_,i)=>service.reserve(req('q'+i,{kind:'ai',plan:'pro'}))));
  expect(ai.filter(r=>r.status==='reserved')).toHaveLength(20);
  expect((await service.reserve(req('v',{plan:'visitor',kind:'ai',subject:'visitor:test'}))).status).toBe('limited');
  await service.reserve(req('v',{plan:'visitor',subject:'visitor:test'}));
  expect((await service.reserve(req('v2',{plan:'visitor',subject:'visitor:test'}))).status).toBe('limited');
  const pro=await Promise.all(Array.from({length:6},(_,i)=>service.reserve(req('p'+i,{plan:'pro'}))));expect(pro.every(r=>r.status==='reserved')).toBe(true);
 });
 it('does not reopen unknown outcomes or mix quota days',async()=>{
  await service.reserve(req('A',{plan:'visitor'}));
  expect((await service.reserve(req('B',{plan:'visitor'}))).status).toBe('limited');
  // A previous-day bucket cannot affect current-day counting.
  await pool.query("INSERT INTO public_daily_quota_buckets VALUES('account:old','2020-01-01','symbol')");
  expect((await service.reserve(req('A',{subject:'account:old'}))).used).toBe(1);
 });
 it('computes exact Eastern reset instants across DST transitions',async()=>{
  for(const [instant,expected] of [['2026-03-08T06:30:00Z','2026-03-09T04:00:00.000Z'],['2026-11-01T05:30:00Z','2026-11-02T05:00:00.000Z'],['2026-10-08T03:59:59Z','2026-10-08T04:00:00.000Z']]) {
   const {rows:[r]}=await pool.query("SELECT ((($1::timestamptz AT TIME ZONE 'America/New_York')::date+1)::timestamp AT TIME ZONE 'America/New_York') AS reset",[instant]);
   expect(r.reset.toISOString()).toBe(expected);
  }
 });
 it('stores a private AI replay atomically with completion and rejects completion without output',async()=>{
  const a=await service.reserve(req('question',{kind:'ai',plan:'pro'}));if(a.status!=='reserved')throw Error('missing');
  await expect(service.settle(a.reservation,'completed')).rejects.toThrow('durable response');
  await service.settle(a.reservation,'completed',{answer:'fixture answer'});
  const replay=await service.reserve(req('question',{kind:'ai',plan:'pro'}));expect(replay.status).toBe('completed');
  if(replay.status==='completed')expect(replay.replay).toEqual({answer:'fixture answer'});
  const other=await service.reserve(req('question',{kind:'ai',plan:'pro',subject:'account:other'}));expect(other.status).toBe('reserved');
  const status=await service.status('account:fixture','pro');expect(status.quotas.find(q=>q.kind==='ai')).toMatchObject({completed:1,pending:0,remaining:19});
  expect(JSON.stringify(status)).not.toContain('fixture answer');expect(JSON.stringify(status)).not.toContain('account:fixture');
 });
 it('reserves exactly 20 Pro AI requests under contention',async()=>{
  const results=await Promise.all(Array.from({length:22},(_,i)=>service.reserve(req('q'+i,{kind:'ai',plan:'pro'}))));
  expect(results.filter(r=>r.status==='reserved')).toHaveLength(20);
  expect((await service.status('account:fixture','pro')).quotas.find(q=>q.kind==='ai')).toMatchObject({remaining:0,pending:20});
 });
 it('allows report sections only after successful unlock and generates one automatic summary',async()=>{
  expect(await service.isUnlocked('account:fixture','A')).toBe(false);
  const r=await service.reserve(req('A'));if(r.status!=='reserved')throw Error('missing');
  expect(await service.isUnlocked('account:fixture','A')).toBe(false);await service.settle(r.reservation,'completed');
  expect(await service.isUnlocked('account:fixture','A')).toBe(true);expect(await service.isUnlocked('account:other','A')).toBe(false);
  const generate=vi.fn(async()=> 'synthetic prose');
  await Promise.all([reportSummary('account:fixture','A','evidence',generate),reportSummary('account:fixture','A','evidence',generate)]);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(await reportSummary('account:fixture','A','evidence',generate)).toBe('synthetic prose');
  expect(await reportSummary('account:fixture','A','changed evidence',generate)).toBeNull();expect(generate).toHaveBeenCalledTimes(1);
  expect((await service.status('account:fixture','pro')).quotas.find(q=>q.kind==='ai')?.completed).toBe(0);
 });
 it('fails closed on storage errors'  ,async()=>{
  const broken=createPublicDailyQuota(async()=>{throw Error('offline');});
  await expect(broken.reserve(req('A'))).rejects.toThrow('offline');
 });
});
