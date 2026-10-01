import {spawn} from 'node:child_process';
import {dueJobs,SCHEDULE,type HttpJob,type ScheduledJob,type ScriptJob} from '../lib/worker/schedule';
/**
 * In-process scheduler for the data worker. Once a minute it fires every job due at that UTC minute: HTTP jobs POST
 * to the web service with `x-cron-secret` (what the old curl crons did), script jobs spawn `npm run <script>` here.
 * One instance runs because the worker holds its lane lock before starting this. A job already in flight is not
 * started again. Failures are logged and retried like curl's --retry; nothing here changes what the routes do.
 */
export type SchedulerDeps={
 webUrl:string;cronSecret:string;
 fetch?:typeof fetch;
 spawn?:typeof spawn;
 now?:()=>number;
 log?:(line:string)=>void;
 /** Optional sink for the last outcome per job (e.g. redis), best effort. */
 record?:(name:string,outcome:JobOutcome)=>Promise<void>;
 jobs?:ScheduledJob[];
};
export type JobOutcome={name:string;kind:'http'|'script';startedAt:string;ms:number;ok:boolean;status?:number;attempts:number;error?:string};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function runHttpJob(job:HttpJob,deps:Required<Pick<SchedulerDeps,'webUrl'|'cronSecret'|'fetch'|'now'>>):Promise<JobOutcome>{
 const startedAt=new Date(deps.now()).toISOString(),t0=deps.now();
 let attempts=0,status:number|undefined,error:string|undefined;
 for(let attempt=0;attempt<=job.retries;attempt++){
  attempts++;
  try{
   const r=await deps.fetch(`${deps.webUrl}${job.path}`,{method:'POST',headers:{'x-cron-secret':deps.cronSecret,'Content-Type':'application/json'},...(job.body?{body:JSON.stringify(job.body)}:{}),signal:AbortSignal.timeout(job.timeoutMs),redirect:'error'});
   status=r.status;
   if(r.ok)return {name:job.name,kind:'http',startedAt,ms:deps.now()-t0,ok:true,status,attempts};
   error=`HTTP ${r.status}`;
  }catch(e){error=e instanceof Error&&e.name==='TimeoutError'?`timeout after ${job.timeoutMs}ms`:e instanceof Error?e.message:'request failed';}
  if(attempt<job.retries)await sleep(job.retryDelayMs);
 }
 return {name:job.name,kind:'http',startedAt,ms:deps.now()-t0,ok:false,status,attempts,error};
}
export function runScriptJob(job:ScriptJob,deps:Required<Pick<SchedulerDeps,'spawn'|'now'>>):Promise<JobOutcome>{
 const startedAt=new Date(deps.now()).toISOString(),t0=deps.now();
 return new Promise(resolve=>{
  const child=deps.spawn('npm',['run',job.script],{stdio:'inherit',env:process.env,shell:process.platform==='win32'});
  const timer=setTimeout(()=>{child.kill('SIGTERM');},job.timeoutMs);
  child.on('error',e=>{clearTimeout(timer);resolve({name:job.name,kind:'script',startedAt,ms:deps.now()-t0,ok:false,attempts:1,error:e.message});});
  child.on('exit',(code,signal)=>{clearTimeout(timer);resolve({name:job.name,kind:'script',startedAt,ms:deps.now()-t0,ok:code===0,attempts:1,...(code===0?{}:{error:signal?`killed by ${signal}`:`exit code ${code}`})});});
 });
}
/** Returns a stop function. Ticks on the minute boundary; the first tick is the next whole minute so a restart never double-fires. */
export function startScheduler(deps:SchedulerDeps){
 const fetchFn=deps.fetch??fetch,spawnFn=deps.spawn??spawn,now=deps.now??Date.now,log=deps.log??((l:string)=>console.log(l)),jobs=deps.jobs??SCHEDULE;
 const inFlight=new Set<string>();
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
 const fire=(job:ScheduledJob)=>{
  if(inFlight.has(job.name)){log(`[scheduler] ${job.name} still running from a previous minute; skipped`);return;}
  inFlight.add(job.name);
  const run=job.kind==='http'?runHttpJob(job,{webUrl:deps.webUrl,cronSecret:deps.cronSecret,fetch:fetchFn,now}):runScriptJob(job,{spawn:spawnFn,now});
  void run.then(async outcome=>{
   log(`[scheduler] ${outcome.ok?'ok':'FAILED'} ${job.name} ${outcome.ms}ms${outcome.status?` http ${outcome.status}`:''}${outcome.attempts>1?` attempts ${outcome.attempts}`:''}${outcome.error?` · ${outcome.error}`:''}`);
   try{await deps.record?.(job.name,outcome);}catch{}
  }).finally(()=>inFlight.delete(job.name));
 };
 const tick=()=>{
  if(stopped)return;
  const at=new Date(now());at.setUTCSeconds(0,0);
  const due=dueJobs(at,jobs);
  if(due.length)log(`[scheduler] ${at.toISOString()} due: ${due.map(j=>j.name).join(', ')}`);
  for(const job of due)fire(job);
  schedule();
 };
 const schedule=()=>{const ms=60_000-(now()%60_000);timer=setTimeout(tick,ms+250);(timer as unknown as {unref?:()=>void}).unref?.();};
 log(`[scheduler] started with ${jobs.length} jobs; HTTP target ${deps.webUrl}`);
 schedule();
 return ()=>{stopped=true;if(timer)clearTimeout(timer);};
}
