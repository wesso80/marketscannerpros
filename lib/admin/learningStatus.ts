import type {Redis} from '@upstash/redis';
import {q} from '@/lib/db';
import {adminDiscoveryOnly,discoveryOnlyAction} from './discoveryOnly';
import {jevConfigured} from './jevClient';
import {JEV_STAGES} from './cryptoJev';
import {jevCoverage} from './cryptoJevEvidence';
import {EARLY_SCAN_KEY,FORWARD_BOOK_KEY,MOMENTUM_SCAN_KEY,forwardResolved,type ForwardBook} from './cryptoForwardScore';
import {CALIBRATION_FILED_KEY,CALIBRATION_KEY,type CalibrationLedger} from './cryptoCalibration';
import type {MomentumScan} from './cryptoVolumeMomentum';
import {NEWS_JEV_RULE} from './equityNewsJev';
import {TRANSCRIPT_AUDIT_RULE} from './transcriptJevAudit';
/**
 * One read-only health view of the whole Jev learning loop: which stamps are being written, whether they are scoring,
 * why they are not, and what each one is graded against. Nothing here calls a provider or Jev.
 */
export type LearningState='ok'|'collecting'|'attention'|'paused'|'off';
export type LearningItem={id:string;label:string;state:LearningState;summary:string;lastAt:string|null;gradedAgainst:string;where:string;next:string|null;counts:Record<string,number>};
export type LearningStatus={checkedAt:string;mode:{discoveryOnly:boolean;jevKey:boolean;avKey:boolean};items:LearningItem[]};
const ago=(iso:string|null|undefined,now:number)=>iso&&Number.isFinite(Date.parse(iso))?Math.round((now-Date.parse(iso))/60000):null;
const reasons=(r:Record<string,number>)=>Object.entries(r).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(', ');
function stampCoverage(rows:MomentumScan['rows']){
 const named=rows.filter(r=>JEV_STAGES.includes(r.stage as typeof JEV_STAGES[number]));
 const jev=jevCoverage(named.map(r=>r.jev));
 const cat={scored:0,noHeadlines:0,unavailable:0,unstamped:0,reasons:{} as Record<string,number>,detail:null as string|null};
 for(const r of named){
  const c=r.catalyst;
  if(!c){cat.unstamped++;continue;}
  if(c.status==='scored')cat.scored++;else if(c.status==='no-headlines')cat.noHeadlines++;else{cat.unavailable++;const k=c.reason??'not recorded';cat.reasons[k]=(cat.reasons[k]??0)+1;if(!cat.detail&&c.detail)cat.detail=c.detail;}
 }
 return {named:named.length,jev,cat};
}
async function count(sql:string,params:unknown[]=[]){try{const [r]=await q<{n:string}>(sql,params);return Number(r?.n??0);}catch{return null;}}
async function latest(sql:string,params:unknown[]=[]){try{const [r]=await q<{at:Date|string|null}>(sql,params);return r?.at?new Date(r.at).toISOString():null;}catch{return null;}}
export async function learningStatus(redis:Redis|null,now=Date.now()):Promise<LearningStatus>{
 const items:LearningItem[]=[];
 const jevKey=jevConfigured(),avKey=!!process.env.ALPHA_VANTAGE_API_KEY?.trim(),discoveryOnly=adminDiscoveryOnly();
 const [four,early,book,ledger,filed]=redis?await Promise.all([redis.get<MomentumScan>(MOMENTUM_SCAN_KEY),redis.get<MomentumScan>(EARLY_SCAN_KEY),redis.get<ForwardBook>(FORWARD_BOOK_KEY),redis.get<CalibrationLedger>(CALIBRATION_KEY),redis.get<Record<string,string>>(CALIBRATION_FILED_KEY)]):[null,null,null,null,null];
 // 1. Jev shadow on crypto setups
 const c4=stampCoverage(four?.rows??[]),c1=stampCoverage(early?.rows??[]);
 const shadowScored=c4.jev.scored+c1.jev.scored,shadowUnavailable=c4.jev.unavailable+c1.jev.unavailable,shadowUnstamped=c4.jev.unscored+c1.jev.unscored,shadowNamed=c4.named+c1.named;
 const shadowReasons={...c4.jev.reasons};for(const [k,v] of Object.entries(c1.jev.reasons))shadowReasons[k]=(shadowReasons[k]??0)+v;
 items.push({id:'shadow',label:'Jev shadow on crypto setups (jev-shadow-v2)',
  state:!jevKey?'off':!shadowNamed?'collecting':shadowUnavailable>shadowScored?'attention':'ok',
  summary:!jevKey?'AI_GATEWAY_API_KEY is not set on this deployment; no row is scored.':!shadowNamed?'No named setups in the saved 4h/1h scans yet.':`${shadowScored} scored · ${shadowUnavailable} unavailable${Object.keys(shadowReasons).length?` (${reasons(shadowReasons)})`:''} · ${shadowUnstamped} not yet stamped, across ${shadowNamed} named rows.`,
  lastAt:four?.updatedAt??early?.updatedAt??null,gradedAgainst:'paper R (closed trades) and forward 4h / 24h marks',where:'Setups tab → Jev column; Paper account → By Jev; Learning → ledger',next:shadowUnavailable>shadowScored&&shadowReasons.parse?'Gateway answers are not parsing: check the question type (boolean vs noul).':null,counts:{named:shadowNamed,scored:shadowScored,unavailable:shadowUnavailable,unstamped:shadowUnstamped}});
 // 2. Catalyst stamp
 const catScored=c4.cat.scored+c1.cat.scored,catNone=c4.cat.noHeadlines+c1.cat.noHeadlines,catUnavailable=c4.cat.unavailable+c1.cat.unavailable,catUnstamped=c4.cat.unstamped+c1.cat.unstamped;
 const catReasons={...c4.cat.reasons};for(const [k,v] of Object.entries(c1.cat.reasons))catReasons[k]=(catReasons[k]??0)+v;
 const catDetail=c4.cat.detail??c1.cat.detail;
 const catTop=Object.entries(catReasons).sort((a,b)=>b[1]-a[1])[0]?.[0];
 items.push({id:'catalyst',label:'Catalyst stamp on crypto setups (jev-catalyst-v1, Alpha Vantage headlines)',
  state:!avKey?'off':!shadowNamed?'collecting':catUnavailable>catScored+catNone?'attention':'ok',
  summary:!avKey?'ALPHA_VANTAGE_API_KEY is not set; no headlines are fetched.':`${catScored} scored · ${catNone} no headlines · ${catUnavailable} unavailable${Object.keys(catReasons).length?` (${reasons(catReasons)})`:''} · ${catUnstamped} not yet stamped.${catDetail?` Provider said: “${catDetail}”`:''}`,
  lastAt:four?.updatedAt??early?.updatedAt??null,gradedAgainst:'paper R and forward 24h mark',where:'Setups tab → Catalyst column; Learning → ledger (catalyst.* fields)',
  next:catTop==='av-quota'?'Alpha Vantage is refusing NEWS_SENTIMENT for CRYPTO: tickers on this plan or at this rate. Confirm the plan covers news for crypto symbols, or lower CATALYST.providerCallsPerBatch.':catTop==='av-no-data'?'Alpha Vantage does not know these crypto tickers; only major coins carry CRYPTO:<SYM> news. Expect no-headlines on small caps.':catTop?.startsWith('av-http')||catTop==='av-circuit-open'?'Alpha Vantage is erroring; the governor’s circuit breaker may be open. Check provider status before reading anything into the catalyst rows.':null,
  counts:{scored:catScored,noHeadlines:catNone,unavailable:catUnavailable,unstamped:catUnstamped}});
 // 3. Forward score
 const fRows=book?.rows.length??0,fResolved=book?forwardResolved(book.rows):0;
 items.push({id:'forward',label:'Forward score (VOLUME_WATCH / EXTENDED / EARLY_WATCH marks)',state:!fRows?'collecting':'ok',summary:`${fRows} saved rows · ${fResolved} resolved on both marks${fResolved<30?' · under 30, no rate is shown':''}.`,lastAt:book?.updatedAt??null,gradedAgainst:'next completed 4h close and 24h mark',where:'Setups tab → Forward score',next:null,counts:{rows:fRows,resolved:fResolved}});
 // 4. Calibration ledger
 const confirmed=ledger?.fields.flatMap(f=>f.sides.filter(s=>s.status==='confirmed')).length??0,graded=ledger?.fields.flatMap(f=>f.sides.filter(s=>!s.informational)).length??0;
 const stale=ledger?(now-Date.parse(ledger.checkedAt))>36*3600000:false;
 items.push({id:'calibration',label:'Calibration ledger and proposals',state:!ledger?'collecting':stale?'attention':'ok',
  summary:!ledger?'No ledger saved yet. The daily pass writes one after the first paper cycle of the day; Recompute runs it now.':`${ledger.source.withR} closed trades with R · ${ledger.source.forwardFilled24h} forward rows with a 24h mark · ${graded} graded sides · ${confirmed} confirmed · ${Object.keys(filed??{}).length} proposals filed so far${stale?' · STALE (over 36h)':''}.`,
  lastAt:ledger?.checkedAt??null,gradedAgainst:'two-window lift on paper R and forward 24h',where:'Learning tab (this page); proposals appear in Recommendations',next:ledger&&ledger.source.withR<30&&ledger.source.forwardFilled24h<30?'Collecting. Nothing can confirm until a side has 30 rows; the forward book fills faster than the paper ledger.':null,counts:{withR:ledger?.source.withR??0,forward24h:ledger?.source.forwardFilled24h??0,confirmed,filed:Object.keys(filed??{}).length}});
 // 5. Equity news verification (DB)
 const newsPaused=discoveryOnlyAction('/api/admin/equity-news-jev')!=='allow';
 const headlines7d=await count(`SELECT COUNT(*) AS n FROM catalyst_events WHERE event_timestamp_utc>=$1`,[new Date(now-7*86400000).toISOString()]);
 const stamps=await count(`SELECT COUNT(*) AS n FROM news_jev_stamps WHERE rule=$1`,[NEWS_JEV_RULE]);
 const labelled=await count(`SELECT COUNT(*) AS n FROM news_jev_stamps WHERE return_pct IS NOT NULL`);
 const newsLast=await latest(`SELECT MAX(checked_at) AS at FROM news_jev_stamps`);
 items.push({id:'news',label:'Equity news verification (jev-news-v1)',
  state:stamps==null?'collecting':headlines7d===0?'attention':newsPaused?'paused':!stamps?'collecting':'ok',
  summary:stamps==null?'Table not created yet; it is created on the first scoring pass.':`${headlines7d??'?'} headlines ingested in 7 days · ${stamps} stamped · ${labelled} labelled with a next-day return.${newsPaused?' The admin page and route are paused by ADMIN_DISCOVERY_ONLY; the daily scoring step still runs from the crypto cron.':''}`,
  lastAt:newsLast,gradedAgainst:'next trading day close over prior close (worker daily bars)',where:newsPaused?'/admin/equity-research (paused while ADMIN_DISCOVERY_ONLY is on)':'/admin/equity-research → News verification',
  next:headlines7d===0?'No catalyst headlines are arriving: the /api/catalyst/ingest cron is not writing rows, so there is nothing to score.':newsPaused?'Set ADMIN_DISCOVERY_ONLY=false on Render to open the equity pages; evidence keeps accumulating meanwhile.':null,
  counts:{headlines7d:headlines7d??0,stamped:stamps??0,labelled:labelled??0}});
 // 6. Transcript audit (DB)
 const auditsPaused=discoveryOnlyAction('/api/admin/transcripts')!=='allow';
 const audits=await count(`SELECT COUNT(*) AS n FROM transcript_jev_audits WHERE rule=$1`,[TRANSCRIPT_AUDIT_RULE]);
 const summaries=await count(`SELECT COUNT(*) AS n FROM earnings_transcript_summaries`);
 const auditLast=await latest(`SELECT MAX(checked_at) AS at FROM transcript_jev_audits`);
 items.push({id:'transcripts',label:'Transcript summary audit (jev-transcript-audit-v1)',
  state:audits==null?'collecting':auditsPaused?'paused':!audits?'collecting':'ok',
  summary:audits==null?'Table not created yet; it is created on the first audit.':`${audits} audits over ${summaries??'?'} stored summaries. Runs when a summary is written on the transcripts page; there is no backfill job.`,
  lastAt:auditLast,gradedAgainst:'none — guardrail: does the transcript support each summary line',where:auditsPaused?'/admin/transcripts (paused while ADMIN_DISCOVERY_ONLY is on)':'/admin/transcripts',
  next:auditsPaused?'Opens with the equity pages when ADMIN_DISCOVERY_ONLY is turned off.':null,counts:{audits:audits??0,summaries:summaries??0}});
 for(const i of items)if(i.lastAt){const m=ago(i.lastAt,now);if(m!=null&&m>36*60&&i.state==='ok')i.state='attention';}
 return {checkedAt:new Date(now).toISOString(),mode:{discoveryOnly,jevKey,avKey},items};
}
