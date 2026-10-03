/**
 * The job schedule that used to be 44 separate Render cron services, each one a container booted to run a single
 * `curl`. Render bills every cron job a flat minimum per month plus runtime, and rebuilds every one on each deploy,
 * so the same table now lives in the always-on data worker (worker/scheduler.ts) and fires the identical requests.
 *
 * Pure module: the table, a five-field cron matcher (UTC), and the due-job query. No network, no timers.
 * Changing a row here is the same as changing the old render.yaml entry: same path, same body, same `x-cron-secret`.
 *
 * Not in this table (still real Render cron jobs, on purpose):
 *   arca-cycle                — kept as the one platform-run backstop so paper exits are checked even if this worker is down.
 *   jarvis-overnight-radar-a/b, jarvis-crypto-refresh — 20-minute, ~200 MB scripts; too heavy for the Starter worker.
 * Removed outright (were paused with a never-firing date since 2026-06-14): admin-radar-crypto, -altcoins, -ai, -gaming.
 */
export type HttpJob={name:string;schedule:string;kind:'http';path:string;timeoutMs:number;retries:number;retryDelayMs:number;body?:Record<string,unknown>};
export type ScriptJob={name:string;schedule:string;kind:'script';script:string;timeoutMs:number};
export type ScheduledJob=HttpJob|ScriptJob;

export const SCHEDULE:ScheduledJob[]=[
 // Alerts
 {name:'alerts-price-check',schedule:'0-59/5 * * * *',kind:'http',path:'/api/alerts/check',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 {name:'alerts-signal-check',schedule:'3-59/10 * * * *',kind:'http',path:'/api/alerts/signal-check',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 {name:'alerts-smart-check',schedule:'1-59/5 * * * *',kind:'http',path:'/api/alerts/smart-check',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 {name:'alerts-strategy-check',schedule:'4,19,34,49 * * * *',kind:'http',path:'/api/alerts/strategy-check',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 {name:'public-oi-hourly',schedule:'17 * * * *',kind:'http',path:'/api/jobs/snapshot-open-interest',timeoutMs:120_000,retries:1,retryDelayMs:15_000},
 // Daily jobs
 {name:'daily-market-focus',schedule:'0 21 * * *',kind:'http',path:'/api/jobs/generate-market-focus',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 {name:'daily-scan',schedule:'30 21 * * *',kind:'http',path:'/api/jobs/scan-daily?assets=equity',timeoutMs:290_000,retries:3,retryDelayMs:15_000},
 {name:'daily-scan-crypto-forex',schedule:'40 0 * * *',kind:'http',path:'/api/jobs/scan-daily?assets=crypto,forex',timeoutMs:290_000,retries:3,retryDelayMs:15_000},
 {name:'prewake-universe-scan',schedule:'35 19 * * *',kind:'http',path:'/api/jobs/scan-universe',timeoutMs:290_000,retries:2,retryDelayMs:15_000},
 {name:'opportunity-scan',schedule:'7,37 * * * *',kind:'http',path:'/api/jobs/opportunity-scan',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 // Admin radar, US session only (M–F 13–20 UTC), offsets spread Alpha Vantage calls
 {name:'admin-radar-equity-megacap',schedule:'5,35 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:90_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-mega-cap',timeframe:'15m'}},
 {name:'admin-radar-equity-momentum',schedule:'20,50 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:90_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-momentum',timeframe:'15m'}},
 {name:'admin-radar-equity-smallcap-value',schedule:'8,38 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:120_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-small-cap-value',timeframe:'15m'}},
 {name:'admin-radar-equity-midcap-momentum',schedule:'12,42 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:120_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-mid-cap-momentum',timeframe:'15m'}},
 {name:'admin-radar-equity-biotech',schedule:'17,47 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:120_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-biotech',timeframe:'15m'}},
 {name:'admin-radar-equity-fintech',schedule:'23,53 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:120_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-fintech-disruptors',timeframe:'15m'}},
 {name:'admin-radar-equity-ai-infra',schedule:'27,57 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:120_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-ai-infrastructure',timeframe:'15m'}},
 {name:'admin-radar-equity-energy-transition',schedule:'33,3 13-20 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:120_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-energy-transition',timeframe:'15m'}},
 {name:'admin-radar-equity-defensive',schedule:'0 14,18 * * 1-5',kind:'http',path:'/api/operator/engine/auto-scan',timeoutMs:120_000,retries:2,retryDelayMs:10_000,body:{watchlist:'us-defensive-cashflow',timeframe:'15m'}},
 // Catalyst study
 {name:'catalyst-study-compute',schedule:'14,44 * * * *',kind:'http',path:'/api/catalyst/study/compute?limit=5',timeoutMs:270_000,retries:1,retryDelayMs:10_000},
 {name:'catalyst-overnight-bulk',schedule:'0 22 * * *',kind:'http',path:'/api/catalyst/study/compute?limit=50',timeoutMs:270_000,retries:1,retryDelayMs:10_000},
 {name:'catalyst-news-ingest',schedule:'12,42 * * * *',kind:'http',path:'/api/catalyst/ingest',timeoutMs:180_000,retries:3,retryDelayMs:15_000},
 // Emails
 {name:'daily-operator-morning-brief',schedule:'15 20 * * *',kind:'http',path:'/api/jobs/email-morning-brief',timeoutMs:180_000,retries:3,retryDelayMs:15_000,body:{scanLimit:80,market:'EQUITIES'}},
 {name:'daily-best-opportunities-email',schedule:'0 12 * * *',kind:'http',path:'/api/jobs/email-best-opportunities',timeoutMs:290_000,retries:3,retryDelayMs:15_000},
 {name:'daily-operator-review-email',schedule:'30 7 * * 1-5',kind:'http',path:'/api/jobs/email-daily-review',timeoutMs:180_000,retries:3,retryDelayMs:15_000},
 // Learning / journal
 {name:'label-signal-outcomes',schedule:'7 2,8,14,20 * * *',kind:'http',path:'/api/cron/label-ai-outcomes',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 {name:'learning-outcomes',schedule:'9,24,39,54 * * * *',kind:'http',path:'/api/jobs/learning-outcomes',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 {name:'journal-auto-close',schedule:'2-59/5 * * * *',kind:'http',path:'/api/jobs/journal-auto-close?limit=200',timeoutMs:120_000,retries:3,retryDelayMs:15_000},
 // Scripts that used their own cron container; they need only DATABASE_URL, which this worker has
 {name:'stale-auto-draft-cleanup',schedule:'15 0 * * *',kind:'script',script:'worker:cleanup:stale-auto-drafts',timeoutMs:600_000},
 {name:'upe-global-open',schedule:'35 14 * * 1-5',kind:'script',script:'worker:upe:global:open',timeoutMs:600_000},
 {name:'upe-global-close',schedule:'5 21 * * 1-5',kind:'script',script:'worker:upe:global:close',timeoutMs:600_000},
 {name:'upe-crcs-hourly',schedule:'8 * * * *',kind:'script',script:'worker:upe:crcs:hourly',timeoutMs:600_000},
 // Admin edge layer
 {name:'admin-edge-label-outcomes',schedule:'0 */4 * * *',kind:'http',path:'/api/cron/edge-label-outcomes?limit=500',timeoutMs:300_000,retries:3,retryDelayMs:15_000},
 {name:'admin-edge-rebuild-matrix',schedule:'0 6 * * *',kind:'http',path:'/api/cron/edge-rebuild-matrix',timeoutMs:300_000,retries:3,retryDelayMs:15_000},
 {name:'admin-macro-ingest',schedule:'0 9 * * 1-5',kind:'http',path:'/api/cron/macro-ingest',timeoutMs:300_000,retries:3,retryDelayMs:15_000},
 {name:'admin-label-ai-outcomes',schedule:'11 */6 * * *',kind:'http',path:'/api/cron/label-ai-outcomes',timeoutMs:300_000,retries:3,retryDelayMs:15_000},
 {name:'admin-evening-packet',schedule:'0 22 * * *',kind:'http',path:'/api/cron/evening-packet',timeoutMs:300_000,retries:3,retryDelayMs:15_000},
 {name:'persist-edge-packets-crypto',schedule:'*/15 * * * *',kind:'http',path:'/api/cron/persist-edge-packets',timeoutMs:540_000,retries:2,retryDelayMs:15_000,body:{market:'CRYPTO',timeframe:'15m'}},
 {name:'persist-edge-packets-equity',schedule:'10,40 13-20 * * 1-5',kind:'http',path:'/api/cron/persist-edge-packets',timeoutMs:540_000,retries:2,retryDelayMs:15_000,body:{market:'EQUITIES',timeframe:'15m'}},
 {name:'arca-daily-report',schedule:'30 22 * * *',kind:'http',path:'/api/cron/arca-daily-report',timeoutMs:300_000,retries:3,retryDelayMs:15_000},
 {name:'refresh-fundamentals',schedule:'0 22 * * 1-5',kind:'http',path:'/api/cron/refresh-fundamentals',timeoutMs:300_000,retries:2,retryDelayMs:30_000,body:{maxAgeHours:20}},
];

/** Expands one cron field into the set of matching integers. Supports `*`, `a`, `a-b`, `a,b`, `* / n` (no spaces), `a-b/n`, `a/n`. */
export function cronField(field:string,min:number,max:number):Set<number>{
 const out=new Set<number>();
 for(const part of field.split(',')){
  const m=part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
  if(!m)throw Error(`Invalid cron field: ${field}`);
  const step=m[3]?Number(m[3]):1;
  let lo:number,hi:number;
  if(m[1]==='*'){lo=min;hi=max;}
  else{lo=Number(m[1]);hi=m[2]!=null?Number(m[2]):m[3]?max:lo;}
  if(step<1||lo<min||hi>max||lo>hi)throw Error(`Cron field out of range: ${field}`);
  for(let v=lo;v<=hi;v+=step)out.add(v);
 }
 return out;
}
/** Standard five-field cron, evaluated in UTC. When both day-of-month and day-of-week are restricted either may match (POSIX). */
export function cronMatches(expr:string,at:Date):boolean{
 const f=expr.trim().split(/\s+/);
 if(f.length!==5)throw Error(`Cron needs five fields: ${expr}`);
 const [mi,h,dom,mo,dow]=f;
 const minute=cronField(mi,0,59),hour=cronField(h,0,23),month=cronField(mo,1,12);
 const domSet=cronField(dom,1,31),dowSet=new Set([...cronField(dow,0,7)].map(d=>d%7));
 if(!minute.has(at.getUTCMinutes())||!hour.has(at.getUTCHours())||!month.has(at.getUTCMonth()+1))return false;
 const domOk=domSet.has(at.getUTCDate()),dowOk=dowSet.has(at.getUTCDay());
 return dom!=='*'&&dow!=='*'?domOk||dowOk:domOk&&dowOk;
}
export function dueJobs(at:Date,jobs:ScheduledJob[]=SCHEDULE):ScheduledJob[]{
 return jobs.filter(j=>cronMatches(j.schedule,at));
}
/** Fires per 30-day month, for cost and sanity reporting. Day-of-week schedules assume 22 weekdays. */
export function runsPerMonth(expr:string):number{
 const [mi,h,dom,mo,dow]=expr.trim().split(/\s+/);
 if(mo!=='*'||dom!=='*')return 0;
 const days=dow==='*'?30:Math.round(30*cronField(dow,0,7).size/7);
 return cronField(mi,0,59).size*cronField(h,0,23).size*days;
}
