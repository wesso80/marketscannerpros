import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {SCHEDULE,cronField,cronMatches,dueJobs,runsPerMonth,type HttpJob,type ScheduledJob} from '@/lib/worker/schedule';
import {runHttpJob,startScheduler,type JobOutcome} from '../../worker/scheduler';
const at=(iso:string)=>new Date(iso);
const renderYaml=()=>readFileSync('render.yaml','utf8').replace(/\r\n/g,'\n'); // Windows checkouts are CRLF
describe('cron matcher (UTC)',()=>{
 it('expands fields: lists, ranges, steps, offset steps',()=>{
  expect([...cronField('0-59/5',0,59)]).toHaveLength(12);
  expect([...cronField('3-59/10',0,59)]).toEqual([3,13,23,33,43,53]);
  expect([...cronField('*/15',0,59)]).toEqual([0,15,30,45]);
  expect([...cronField('33,3',0,59)]).toEqual([33,3]);
  expect([...cronField('2,8,14,20',0,23)]).toEqual([2,8,14,20]);
  expect([...cronField('1-5',0,7)]).toEqual([1,2,3,4,5]);
  expect(()=>cronField('60',0,59)).toThrow();
  expect(()=>cronField('x',0,59)).toThrow();
 });
 it('matches the real schedules at the right minutes and not otherwise',()=>{
  expect(cronMatches('0-59/5 * * * *',at('2026-10-02T09:05:00Z'))).toBe(true);
  expect(cronMatches('0-59/5 * * * *',at('2026-10-02T09:06:00Z'))).toBe(false);
  expect(cronMatches('5,35 13-20 * * 1-5',at('2026-10-02T13:35:00Z'))).toBe(true);   // Friday
  expect(cronMatches('5,35 13-20 * * 1-5',at('2026-10-03T13:35:00Z'))).toBe(false);  // Saturday
  expect(cronMatches('5,35 13-20 * * 1-5',at('2026-10-02T21:05:00Z'))).toBe(false);
  expect(cronMatches('0 */4 * * *',at('2026-10-02T08:00:00Z'))).toBe(true);
  expect(cronMatches('0 */4 * * *',at('2026-10-02T09:00:00Z'))).toBe(false);
  expect(cronMatches('11 */6 * * *',at('2026-10-02T18:11:00Z'))).toBe(true);
  expect(cronMatches('30 7 * * 1-5',at('2026-10-05T07:30:00Z'))).toBe(true);        // Monday
  expect(cronMatches('0 0 30 2 *',at('2026-02-28T00:00:00Z'))).toBe(false);          // the old pause date never fires
  expect(()=>cronMatches('* * * *',at('2026-10-02T00:00:00Z'))).toThrow();
 });
 it('counts runs per month the way the cost estimate did',()=>{
  expect(runsPerMonth('0-59/5 * * * *')).toBe(8640);
  expect(runsPerMonth('*/15 * * * *')).toBe(2880);
  expect(runsPerMonth('0 21 * * *')).toBe(30);
  expect(runsPerMonth('0 0 30 2 *')).toBe(0);
 });
});
describe('schedule table',()=>{
 it('every job has a valid five-field schedule, a unique name, and an absolute /api path or npm script',()=>{
  const names=new Set<string>();
  for(const j of SCHEDULE){
   expect(names.has(j.name),j.name).toBe(false);names.add(j.name);
   expect(()=>cronMatches(j.schedule,at('2026-10-02T00:00:00Z'))).not.toThrow();
   if(j.kind==='http'){expect(j.path.startsWith('/api/')).toBe(true);expect(j.timeoutMs).toBeGreaterThan(0);expect(j.retries).toBeGreaterThanOrEqual(0);}
   else expect(j.script).toMatch(/^(worker|jarvis):/);
  }
 });
 it('arca-cycle and the Jarvis scripts stay on Render; nothing in the table duplicates a remaining render.yaml cron',()=>{
  const yaml=renderYaml();
  const remaining=[...yaml.matchAll(/\n  - type: cron\n    name: (\S+)/g)].map(m=>m[1]);
  expect(remaining.sort()).toEqual(['arca-cycle','jarvis-crypto-refresh','jarvis-overnight-radar-a','jarvis-overnight-radar-b']);
  for(const name of remaining)expect(SCHEDULE.some(j=>j.name===name),name).toBe(false);
  // The paused radar crons were removed, not migrated.
  expect(SCHEDULE.some(j=>j.name.startsWith('admin-radar-crypto'))).toBe(false);
  expect(yaml).not.toContain('"0 0 30 2 *"');
 });
 it('keeps the values that used to be pinned in render.yaml and checked against the Render dashboard',()=>{
  const byName=Object.fromEntries(SCHEDULE.map(j=>[j.name,j])) as Record<string,ScheduledJob>;
  expect(byName['persist-edge-packets-crypto']).toMatchObject({schedule:'*/15 * * * *',path:'/api/cron/persist-edge-packets',body:{market:'CRYPTO',timeframe:'15m'}});
  expect(byName['daily-operator-morning-brief']).toMatchObject({path:'/api/jobs/email-morning-brief',body:{scanLimit:80,market:'EQUITIES'}});
  expect(byName['refresh-fundamentals']).toMatchObject({schedule:'0 22 * * 1-5',body:{maxAgeHours:20}});
  expect(byName['journal-auto-close']).toMatchObject({schedule:'2-59/5 * * * *',path:'/api/jobs/journal-auto-close?limit=200'});
  expect(byName['upe-crcs-hourly']).toMatchObject({kind:'script',script:'worker:upe:crcs:hourly'});
 });
 it('the worker has WEB_URL and CRON_SECRET in render.yaml, and the web service still owns the secret',()=>{
  const yaml=renderYaml();
  const worker=yaml.split(/\n(?=  - type: )/).find(b=>/\n    name: msp-data-worker\n/.test(b))!;
  expect(worker).toMatch(/- key: WEB_URL\n\s+value: "https:\/\/marketscannerpros\.app"/);
  expect(worker).toMatch(/- key: CRON_SECRET\n\s+fromService:\n\s+type: web\n\s+name: marketscannerpros\n\s+envVarKey: CRON_SECRET/);
 });
 it('at a busy minute the due set is exactly the jobs whose schedules match',()=>{
  const due=dueJobs(at('2026-10-02T14:00:00Z')).map(j=>j.name).sort();
  expect(due).toEqual(['admin-radar-equity-defensive','alerts-price-check','persist-edge-packets-crypto'].sort());
  expect(dueJobs(at('2026-10-03T03:01:00Z')).map(j=>j.name)).toEqual(['alerts-smart-check']);
 });
});
describe('runner',()=>{
 const job:HttpJob={name:'t',schedule:'* * * * *',kind:'http',path:'/api/x?limit=5',timeoutMs:1000,retries:2,retryDelayMs:0,body:{a:1}};
 it('POSTs with the cron secret header and body, and stops on the first 2xx',async()=>{
  const fetch=vi.fn(async()=>({ok:true,status:200}));
  const out=await runHttpJob(job,{webUrl:'https://w',cronSecret:'s3',fetch:fetch as never,now:Date.now});
  expect(out).toMatchObject({ok:true,status:200,attempts:1});
  expect(fetch).toHaveBeenCalledWith('https://w/api/x?limit=5',expect.objectContaining({method:'POST',headers:{'x-cron-secret':'s3','Content-Type':'application/json'},body:'{"a":1}'}));
 });
 it('retries like curl --retry and reports the last failure',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:false,status:503}).mockRejectedValueOnce(Object.assign(new Error('x'),{name:'TimeoutError'})).mockResolvedValueOnce({ok:false,status:401});
  const out=await runHttpJob(job,{webUrl:'https://w',cronSecret:'s3',fetch:fetch as never,now:Date.now});
  expect(out).toMatchObject({ok:false,status:401,attempts:3,error:'HTTP 401'});
 });
 it('fires due jobs on the minute, never starts a job that is still running, and records outcomes',async()=>{
  vi.useFakeTimers();
  const t0=Date.UTC(2026,9,2,9,4,30);vi.setSystemTime(t0);
  let resolveSlow:(v:{ok:boolean;status:number})=>void=()=>{};
  const fetch=vi.fn((url:string)=>url.includes('slow')?new Promise<{ok:boolean;status:number}>(r=>{resolveSlow=r;}):Promise.resolve({ok:true,status:200}));
  const recorded:JobOutcome[]=[];const log:string[]=[];
  const jobs:ScheduledJob[]=[{name:'slow',schedule:'* * * * *',kind:'http',path:'/api/slow',timeoutMs:60_000,retries:0,retryDelayMs:0},{name:'quick',schedule:'5 9 * * *',kind:'http',path:'/api/quick',timeoutMs:1000,retries:0,retryDelayMs:0}];
  const stop=startScheduler({webUrl:'https://w',cronSecret:'s',fetch:fetch as never,jobs,log:l=>log.push(l),record:async(_n,o)=>{recorded.push(o);}});
  await vi.advanceTimersByTimeAsync(31_000);          // 09:05:00 tick
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map(c=>c[0]).sort()).toEqual(['https://w/api/quick','https://w/api/slow']);
  await vi.advanceTimersByTimeAsync(60_000);          // 09:06:00: slow still in flight -> skipped, quick not due
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(log.some(l=>/slow still running/.test(l))).toBe(true);
  resolveSlow({ok:true,status:200});
  await vi.advanceTimersByTimeAsync(60_000);          // 09:07:00: slow fires again
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(recorded.filter(o=>o.name==='quick')).toHaveLength(1);
  stop();vi.useRealTimers();
 });
});
