import {q} from '@/lib/db';
import {pgReadBars,pgReadOverview} from '@/lib/marketData/store';
import {askJev,JevFailure,jevConfigured} from './jevClient';
import {readJevModuleCalls} from './jevUsage';
import {CAL_CORE,calibrateField,splitAt,type CalibrationFieldBase} from './calibrationCore';
/**
 * Equity news verification (jev-news-v1). For each stored catalyst headline, Jev answers four fixed questions from the
 * headline text alone: is it about this company, is it price-material, which direction, which event class. The regex
 * classifier's own subtype is deliberately NOT sent, so the two can be compared on the ledger.
 * Outcome: close of the first trading day after the event day over the close of the last trading day before it, from
 * the worker's daily bars. No provider call is made to label; rows without bars wait.
 * Admin only. Evidence only: nothing here changes a classification, a packet, or a rule.
 */
export const NEWS_JEV_RULE='jev-news-v1' as const;
export const NEWS_JEV={perRun:150,scoreBatch:10,labelBatch:80,lookbackDays:7,labelAfterDays:2,giveUpAfterDays:14,barsPerSymbol:40,summaryChars:400,cooldownMs:600000,maxCallsPerDay:100} as const;
/** Scoring slot on the 15-minute cron. The slot key is written only after that slot succeeds. */
export const NEWS_SCORE_SLOT_MS=60*60*1000;
export const NEWS_EVENT_TYPES=['earnings','guidance','merger_acquisition','regulatory_legal','product','management','financing','analyst','macro_sector','other'] as const;
export const NEWS_DIRECTIONS=['positive','negative','neutral'] as const;
/** Fixed questions. Changing a word starts a new sample (bump NEWS_JEV_RULE). */
export const NEWS_JEV_QUESTIONS={
 aboutCompany:{type:'boolean' as const,instructions:'Is the `headline` (with `summary`) primarily about `company` (`ticker`), rather than mentioning it in passing, listing it among many, or being about a different entity with a similar name?',criteria:{true:'The company is the subject of the news',false:'The company is incidental, one of a long list, or not actually the subject'}},
 priceMaterial:{type:'boolean' as const,instructions:'Would a professional investor expect this news to move the share price of `ticker` by itself within the next trading day?',criteria:{true:'A dated, company-specific development that changes earnings, risk, or ownership expectations',false:'Commentary, a price-target reprint, a roundup, or old news restated'}},
 direction:{type:'choice' as const,instructions:'What is the likely direction of the share price reaction of `ticker` to this news?',criteria:{positive:'Investors would read this as good for the company',negative:'Investors would read this as bad for the company',neutral:'No clear direction, or mixed'}},
 eventType:{type:'choice' as const,instructions:'Which single class best describes the event in the `headline`?',criteria:{earnings:'Reported results',guidance:'Forward outlook raised, cut, or set',merger_acquisition:'Deal, bid, merger, divestiture, or stake',regulatory_legal:'Regulator, court, investigation, fine, approval, or ban',product:'Launch, recall, trial result, contract, or customer win or loss',management:'Executive or board change',financing:'Capital raise, buyback, dividend, debt, or rating action',analyst:'Analyst upgrade, downgrade, or target change',macro_sector:'Sector or macro story that names the company',other:'None of the above'}},
};
export const NEWS_JEV_DDL=`-- Jev verification stamps for stored equity catalyst headlines (admin research only). One row per catalyst event.
-- Probabilities are Jev's calibrated answers to fixed questions; outcome columns are filled later from the worker's daily bars.
CREATE TABLE IF NOT EXISTS news_jev_stamps (
  event_id        UUID PRIMARY KEY REFERENCES catalyst_events(id) ON DELETE CASCADE,
  ticker          TEXT NOT NULL,
  rule            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('scored','unavailable')),
  about_company   DOUBLE PRECISION,
  price_material  DOUBLE PRECISION,
  direction       TEXT,
  direction_probs JSONB,
  direction_conf  DOUBLE PRECISION,
  event_type      TEXT,
  event_type_conf DOUBLE PRECISION,
  model           TEXT,
  input_tokens    INTEGER,
  reason          TEXT,
  company_name    TEXT,
  event_at        TIMESTAMPTZ NOT NULL,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prior_close     DOUBLE PRECISION,
  next_close      DOUBLE PRECISION,
  return_pct      DOUBLE PRECISION,
  labelled_at     TIMESTAMPTZ,
  label_reason    TEXT
);
CREATE INDEX IF NOT EXISTS news_jev_stamps_pending_label_idx ON news_jev_stamps (labelled_at, event_at) WHERE labelled_at IS NULL;
CREATE INDEX IF NOT EXISTS news_jev_stamps_ticker_idx ON news_jev_stamps (ticker, event_at DESC);
`;
export function ddlStatements(sql=NEWS_JEV_DDL):string[]{return sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);}
let ensured:Promise<void>|null=null;
export function ensureNewsJevTable(){
 if(!ensured)ensured=(async()=>{for(const s of ddlStatements())await q(s);})().catch(e=>{ensured=null;throw e;});
 return ensured;
}
export type PendingEvent={id:string;ticker:string;headline:string;source:string|null;event_timestamp_utc:string|Date;event_timestamp_et:string|Date|null;raw_payload:{body?:unknown}|null};
export function newsState(e:PendingEvent,companyName:string|null){
 const body=e.raw_payload&&typeof e.raw_payload.body==='string'?e.raw_payload.body.trim().slice(0,NEWS_JEV.summaryChars):'';
 return {ticker:e.ticker.toUpperCase(),company:companyName??'(name not on file)',headline:e.headline.trim().slice(0,300),summary:body,source:e.source??'unknown',publishedAt:new Date(e.event_timestamp_utc).toISOString()};
}
async function companyName(ticker:string){
 try{const o=await pgReadOverview(ticker);return o?.overview.name??null;}catch{return null;}
}
export type NewsScoreOpts={callsToday?:(now:number)=>Promise<number>};
/** Redis usage counter for module equity-news, else today's stamps. A missing counter is 0. */
export async function equityNewsCallsToday(now=Date.now(),read?:(now:number)=>Promise<number>):Promise<number>{
 if(read)return read(now);
 const day=new Date(now).toISOString().slice(0,10);
 try{
  const n=await readJevModuleCalls(day,'equity-news');
  if(n!=null)return n;
 }catch{/* stamp count below */}
 const rows=await q<{n:number|string}>(`SELECT COUNT(*)::int AS n FROM news_jev_stamps WHERE checked_at >= $1::timestamptz AND (status = 'scored' OR (status = 'unavailable' AND COALESCE(reason, '') <> 'no-key'))`,[`${day}T00:00:00.000Z`]);
 const n=Number(rows[0]?.n??0);
 return Number.isFinite(n)?n:0;
}
/** Stamps up to `limit` unscored headlines from the last lookbackDays. Stops before askJev once maxCallsPerDay is reached. Never throws per row; a missing gateway key stamps nothing. */
export async function scorePendingNews(now=Date.now(),limit:number=NEWS_JEV.perRun,opts:NewsScoreOpts={}){
 await ensureNewsJevTable();
 if(!jevConfigured())return {scored:0,unavailable:0,skipped:'no-key' as const};
 const rows=await q<PendingEvent>(`SELECT e.id,e.ticker,e.headline,e.source,e.event_timestamp_utc,e.event_timestamp_et,e.raw_payload FROM catalyst_events e LEFT JOIN news_jev_stamps s ON s.event_id=e.id WHERE s.event_id IS NULL AND e.event_timestamp_utc>=$1 AND e.event_timestamp_utc<=$2 AND e.headline IS NOT NULL ORDER BY e.event_timestamp_utc DESC LIMIT $3`,[new Date(now-NEWS_JEV.lookbackDays*86400000).toISOString(),new Date(now).toISOString(),limit]);
 let scored=0,unavailable=0,capped=false;
 const names=new Map<string,Promise<string|null>>();
 for(let i=0;i<rows.length;){
  const used=await equityNewsCallsToday(now,opts.callsToday);
  if(used>=NEWS_JEV.maxCallsPerDay){capped=true;break;}
  const room=Math.min(4,NEWS_JEV.maxCallsPerDay-used,rows.length-i);
  const slice=rows.slice(i,i+room);
  i+=room;
  await Promise.all(slice.map(async e=>{
   const t=e.ticker.toUpperCase();
   if(!names.has(t))names.set(t,companyName(t));
   const name=await names.get(t)!;
   try{
    const {model,answers,inputTokens}=await askJev(newsState(e,name),NEWS_JEV_QUESTIONS,{module:'equity-news'});
    await q(`INSERT INTO news_jev_stamps (event_id,ticker,rule,status,about_company,price_material,direction,direction_probs,direction_conf,event_type,event_type_conf,model,input_tokens,company_name,event_at,checked_at) VALUES ($1,$2,$3,'scored',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (event_id) DO NOTHING`,
     [e.id,t,NEWS_JEV_RULE,answers.aboutCompany.probability,answers.priceMaterial.probability,answers.direction.choice,JSON.stringify(answers.direction.probabilities??null),answers.direction.confidence,answers.eventType.choice,answers.eventType.confidence,model,inputTokens??null,name,new Date(e.event_timestamp_utc).toISOString(),new Date(now).toISOString()]);
    scored++;
   }catch(err){
    const reason=err instanceof JevFailure?err.reason:'error';
    await q(`INSERT INTO news_jev_stamps (event_id,ticker,rule,status,reason,company_name,event_at,checked_at) VALUES ($1,$2,$3,'unavailable',$4,$5,$6,$7) ON CONFLICT (event_id) DO NOTHING`,[e.id,t,NEWS_JEV_RULE,reason,name,new Date(e.event_timestamp_utc).toISOString(),new Date(now).toISOString()]).catch(()=>undefined);
    unavailable++;
   }
  }));
 }
 if(capped&&scored===0&&unavailable===0)return {scored,unavailable,skipped:'cap' as const};
 return {scored,unavailable,skipped:null};
}
/** ET calendar date of the event; a headline after the 4pm close still belongs to that ET day, and its next bar is the following session. */
export function eventDateET(e:{event_at:string|Date}):string{
 return new Date(e.event_at).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
}
const barDate=(ts:number)=>new Date(ts).toISOString().slice(0,10);
/** prior = last daily close dated before the event day; next = first daily close dated after it. Null until both exist. */
export function returnAroundEvent(bars:Array<{ts:number;close:number}>,eventDate:string):{priorClose:number;nextClose:number;returnPct:number}|null{
 const sorted=[...bars].filter(b=>Number.isFinite(b.close)&&b.close>0).sort((a,b)=>a.ts-b.ts);
 const prior=[...sorted].reverse().find(b=>barDate(b.ts)<eventDate),next=sorted.find(b=>barDate(b.ts)>eventDate);
 if(!prior||!next)return null;
 return {priorClose:prior.close,nextClose:next.close,returnPct:(next.close/prior.close-1)*100};
}
/** Labels scored stamps older than labelAfterDays from the worker's daily bars. Rows without bars after giveUpAfterDays are closed as no-bars. */
export async function labelNewsOutcomes(now=Date.now(),limit=400){
 await ensureNewsJevTable();
 const rows=await q<{event_id:string;ticker:string;event_at:Date|string}>(`SELECT event_id,ticker,event_at FROM news_jev_stamps WHERE labelled_at IS NULL AND status='scored' AND event_at<=$1 ORDER BY event_at ASC LIMIT $2`,[new Date(now-NEWS_JEV.labelAfterDays*86400000).toISOString(),limit]);
 let labelled=0,waiting=0,noBars=0;
 const bars=new Map<string,Promise<Array<{ts:number;close:number}>|null>>();
 for(const row of rows){
  if(!bars.has(row.ticker))bars.set(row.ticker,pgReadBars(row.ticker,'daily',NEWS_JEV.barsPerSymbol).then(r=>r?.bars.map(b=>({ts:b.ts,close:b.close}))??null).catch(()=>null));
  const series=await bars.get(row.ticker)!;
  const result=series?returnAroundEvent(series,eventDateET(row)):null;
  if(result){
   await q(`UPDATE news_jev_stamps SET prior_close=$2,next_close=$3,return_pct=$4,labelled_at=$5,label_reason='bars' WHERE event_id=$1`,[row.event_id,result.priorClose,result.nextClose,result.returnPct,new Date(now).toISOString()]);
   labelled++;
  }else if(now-new Date(row.event_at).getTime()>NEWS_JEV.giveUpAfterDays*86400000){
   await q(`UPDATE news_jev_stamps SET labelled_at=$2,label_reason='no-bars' WHERE event_id=$1`,[row.event_id,new Date(now).toISOString()]);
   noBars++;
  }else waiting++;
 }
 return {labelled,waiting,noBars};
}
export type NewsObs={at:number;ret:number;aboutCompany:number|null;priceMaterial:number|null;direction:string|null;eventType:string|null;subtype:string|null;severity:string|null;classifierConfidence:number|null};
export type NewsLedgerField=CalibrationFieldBase<'nextDayReturn'>;
export type NewsLedger={version:1;checkedAt:string;rule:typeof NEWS_JEV_RULE;source:{stamped:number;scored:number;unavailable:number;reasons:Record<string,number>;labelled:number;noBars:number;waiting:number;splitAt:string|null};fields:NewsLedgerField[];note:string};
const YES=0.5;
const split=(label:string,p:number|null)=>p==null?'NOT_RECORDED':`${label} ${p>=YES?'≥':'<'}${YES.toFixed(2)}`;
const NEWS_FIELDS:Array<{id:string;label:string;ruleVersion:string;side:(o:NewsObs)=>string|null}>=[
 {id:'jev.aboutCompany',label:'Jev: about this company',ruleVersion:NEWS_JEV_RULE,side:o=>split('about company',o.aboutCompany)},
 {id:'jev.priceMaterial',label:'Jev: price-material',ruleVersion:NEWS_JEV_RULE,side:o=>split('price material',o.priceMaterial)},
 {id:'jev.direction',label:'Jev: direction',ruleVersion:NEWS_JEV_RULE,side:o=>o.direction?`direction ${o.direction}`:'NOT_RECORDED'},
 {id:'jev.eventType',label:'Jev: event class',ruleVersion:NEWS_JEV_RULE,side:o=>o.eventType?`event ${o.eventType}`:'NOT_RECORDED'},
 {id:'classifier.subtype',label:'Regex classifier: subtype',ruleVersion:'catalyst-classifier',side:o=>o.subtype??'NOT_RECORDED'},
 {id:'classifier.severity',label:'Regex classifier: severity',ruleVersion:'catalyst-classifier',side:o=>o.severity??'NOT_RECORDED'},
 {id:'jev.materialAndAbout',label:'Jev: about company AND price-material, both ≥0.50',ruleVersion:NEWS_JEV_RULE,side:o=>o.aboutCompany==null||o.priceMaterial==null?'NOT_RECORDED':o.aboutCompany>=YES&&o.priceMaterial>=YES?'both ≥0.50':'not both'},
];
export function buildNewsLedger(obs:NewsObs[],source:Omit<NewsLedger['source'],'splitAt'>,now=Date.now()):NewsLedger{
 const fields=NEWS_FIELDS.map(def=>calibrateField({...def,file:'lib/catalyst/classifier.ts'},obs,o=>o.ret,'%','nextDayReturn'));
 const confirmed=fields.flatMap(f=>f.sides.filter(s=>s.status==='confirmed').map(s=>`${f.id} ${s.side}`));
 const note=!obs.length?'No labelled headlines yet. Stamps are labelled two trading days after the event from the worker\u2019s daily bars.':`Outcome is the close of the first trading day after the event day over the close of the last trading day before it, in %. Lift is a side\u2019s mean minus the overall mean on the same rows. A side under ${CAL_CORE.minSide} rows is collecting; confirmed needs the same sign in both time halves (${CAL_CORE.minHalf}+ each) and at least ${CAL_CORE.minLiftPct}%. ${confirmed.length?`Confirmed: ${confirmed.join('; ')}.`:'Nothing is confirmed yet.'} Evidence only; nothing here changes a classification or a packet.`;
 return {version:1,checkedAt:new Date(now).toISOString(),rule:NEWS_JEV_RULE,source:{...source,splitAt:splitAt(obs)},fields,note};
}
export async function newsLedger(now=Date.now()):Promise<NewsLedger>{
 await ensureNewsJevTable();
 const [counts]=await q<{stamped:string;scored:string;unavailable:string;labelled:string;no_bars:string;waiting:string}>(`SELECT COUNT(*) AS stamped,COUNT(*) FILTER (WHERE status='scored') AS scored,COUNT(*) FILTER (WHERE status='unavailable') AS unavailable,COUNT(*) FILTER (WHERE return_pct IS NOT NULL) AS labelled,COUNT(*) FILTER (WHERE label_reason='no-bars') AS no_bars,COUNT(*) FILTER (WHERE status='scored' AND labelled_at IS NULL) AS waiting FROM news_jev_stamps`);
 const reasonRows=await q<{reason:string;n:string}>(`SELECT COALESCE(reason,'not recorded') AS reason,COUNT(*) AS n FROM news_jev_stamps WHERE status='unavailable' GROUP BY 1`);
 const rows=await q<{event_at:Date|string;return_pct:string|number;about_company:string|number|null;price_material:string|number|null;direction:string|null;event_type:string|null;catalyst_subtype:string|null;severity:string|null;confidence:string|number|null}>(`SELECT s.event_at,s.return_pct,s.about_company,s.price_material,s.direction,s.event_type,e.catalyst_subtype,e.severity,e.confidence FROM news_jev_stamps s JOIN catalyst_events e ON e.id=s.event_id WHERE s.return_pct IS NOT NULL AND s.status='scored' ORDER BY s.event_at ASC LIMIT 5000`);
 const num=(v:string|number|null)=>v==null?null:Number.isFinite(Number(v))?Number(v):null;
 const obs:NewsObs[]=rows.flatMap(r=>{const ret=num(r.return_pct),at=new Date(r.event_at).getTime();return ret==null||!Number.isFinite(at)?[]:[{at,ret,aboutCompany:num(r.about_company),priceMaterial:num(r.price_material),direction:r.direction,eventType:r.event_type,subtype:r.catalyst_subtype,severity:r.severity,classifierConfidence:num(r.confidence)}];});
 return buildNewsLedger(obs,{stamped:Number(counts?.stamped??0),scored:Number(counts?.scored??0),unavailable:Number(counts?.unavailable??0),reasons:Object.fromEntries(reasonRows.map(r=>[r.reason,Number(r.n)])),labelled:Number(counts?.labelled??0),noBars:Number(counts?.no_bars??0),waiting:Number(counts?.waiting??0)},now);
}
/** Daily step for the evening cron: score what is new, then label what is old enough. Each half fails independently. */
export async function runNewsJevDaily(now=Date.now()){
 const scoring=await scorePendingNews(now).catch(e=>{console.error('[news-jev] scoring failed',e);return {scored:0,unavailable:0,skipped:'error' as const};});
 const labelling=await labelNewsOutcomes(now).catch(e=>{console.error('[news-jev] labelling failed',e);return {labelled:0,waiting:0,noBars:0,error:'labelling failed'};});
 return {scoring,labelling};
}
type NewsRedis={
 set:(key:string,value:string,opts:{nx:true;ex:number})=>Promise<unknown>;
 get?:(key:string)=>Promise<unknown>;
};
const newsDayKey=(now:number)=>`admin:equity-news-jev:day:${new Date(now).toISOString().slice(0,10)}`;
const newsSlotKey=(now:number)=>`admin:equity-news-jev:slot:${Math.floor(now/NEWS_SCORE_SLOT_MS)}`;
/**
 * 15-minute cron step (arca-cycle) while the evening job is discovery-skipped.
 * Labelling runs every call. Scoring runs at most once per hour, in a small batch,
 * and only while the daily cap has room. The day key and the slot key are written
 * after a successful pass. A throw leaves both unset, so the next tick retries.
 */
export async function runNewsJevDailyOnce(redis:NewsRedis,now=Date.now(),opts:NewsScoreOpts={}){
 let labelling:{labelled:number;waiting:number;noBars:number;error?:string};
 let labelFailed=false;
 try{labelling=await labelNewsOutcomes(now,NEWS_JEV.labelBatch);}
 catch(e){labelFailed=true;console.error('[news-jev] labelling failed',e);labelling={labelled:0,waiting:0,noBars:0,error:'labelling failed'};}
 const slot=newsSlotKey(now);
 const slotTaken=redis.get?await redis.get(slot):null;
 if(slotTaken)return {ok:!labelFailed,skipped:false as const,scoring:{scored:0,unavailable:0,skipped:'slot' as const},labelling};
 let scoring:{scored:number;unavailable:number;skipped:'no-key'|'cap'|'error'|null};
 let scoreFailed=false;
 try{scoring=await scorePendingNews(now,NEWS_JEV.scoreBatch,opts);}
 catch(e){scoreFailed=true;console.error('[news-jev] scoring failed',e);scoring={scored:0,unavailable:0,skipped:'error'};}
 const succeeded=!labelFailed&&!scoreFailed&&scoring.skipped!=='error'&&scoring.skipped!=='no-key';
 if(succeeded){
  await redis.set(slot,'done',{nx:true,ex:Math.ceil(NEWS_SCORE_SLOT_MS/1000)+3600});
  await redis.set(newsDayKey(now),'done',{nx:true,ex:36*3600});
 }
 return {ok:succeeded,skipped:false as const,scoring,labelling};
}
