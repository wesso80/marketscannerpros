import type {Redis} from '@upstash/redis';
import {avFetch} from '@/lib/avRateGovernor';
import {askJev,JevFailure,jevConfigured} from './jevClient';
import {JEV_STAGES} from './cryptoJev';
/**
 * Catalyst shadow (jev-catalyst-v1): what the last 48 hours of coin-tagged headlines say about a named setup.
 * Headlines come from Alpha Vantage NEWS_SENTIMENT with tickers=CRYPTO:<SYM>, cached per symbol so one symbol costs
 * at most a few provider calls a day, and capped per batch so crypto never crowds the equity feeds.
 * Evidence only: a stamp never blocks a setup, opens a trade, or writes a recommendation. A row with no headlines is
 * recorded as no-headlines, never as a fabricated "no". Changing the questions starts a new sample.
 */
export const CATALYST_RULE='jev-catalyst-v1' as const;
export const CATALYST_SOURCE='alphavantage:NEWS_SENTIMENT' as const;
export const CATALYST={windowHours:48,maxHeadlines:8,cacheSec:4*3600,providerCallsPerBatch:40,minRelevance:0.3,summaryChars:280} as const;
const CACHE='admin:crypto-markets:catalyst-news:v1';
/** Fixed questions. Each is one event class; the code decides what the combination means. */
export const CATALYST_QUESTIONS={
 listingNews:{type:'boolean' as const,instructions:'Do the `headlines` report a new exchange listing, or a major new trading pair or market, for `coin`?',criteria:{true:'At least one headline is about a listing or new market for this coin',false:'No headline is about a listing or new market for this coin'}},
 supplyEvent:{type:'boolean' as const,instructions:'Do the `headlines` report a token unlock, emission change, treasury or foundation sale, or other supply increase for `coin`?',criteria:{true:'At least one headline is about new supply reaching the market',false:'No headline is about a supply event'}},
 exploitOrOutage:{type:'boolean' as const,instructions:'Do the `headlines` report a hack, exploit, chain halt, outage, or depeg affecting `coin`?',criteria:{true:'At least one headline is about a security or availability failure',false:'No headline is about a security or availability failure'}},
 regulatoryNegative:{type:'boolean' as const,instructions:'Do the `headlines` report enforcement, a lawsuit, a delisting, or a ban affecting `coin`?',criteria:{true:'At least one headline is about adverse regulatory or legal action',false:'No headline is about adverse regulatory or legal action'}},
 narrativeOnly:{type:'boolean' as const,instructions:'Is the coverage in `headlines` mainly price commentary or promotion rather than a dated event?',criteria:{true:'The headlines mostly discuss price targets, predictions, or promotion',false:'The headlines mostly report concrete events with dates'}},
};
export type CatalystQuestionId=keyof typeof CATALYST_QUESTIONS;
export const CATALYST_QUESTION_IDS=Object.keys(CATALYST_QUESTIONS) as CatalystQuestionId[];
export type CatalystHeadline={title:string;summary:string;source:string;publishedAt:string;relevance:number|null};
export type CatalystStamp={rule:typeof CATALYST_RULE;status:'scored'|'no-headlines'|'unavailable';source:typeof CATALYST_SOURCE;windowHours:number;headlines:number;newestAt:string|null;listingNews:number|null;supplyEvent:number|null;exploitOrOutage:number|null;regulatoryNegative:number|null;narrativeOnly:number|null;model:string|null;checkedAt:string;reason?:string;detail?:string;inputTokens?:number};
type CatalystRow={stage:string;asOf?:string|null;symbol:string;kind?:string|null;catalyst?:CatalystStamp};
type AvFeed={feed?:Array<{title?:unknown;summary?:unknown;source?:unknown;time_published?:unknown;ticker_sentiment?:Array<{ticker?:unknown;relevance_score?:unknown}>}>;Note?:unknown;Information?:unknown};
const nulls={listingNews:null,supplyEvent:null,exploitOrOutage:null,regulatoryNegative:null,narrativeOnly:null};
export function unavailableCatalyst(now:number,reason:string,headlines=0,newestAt:string|null=null,detail?:string):CatalystStamp{
 return {rule:CATALYST_RULE,status:'unavailable',source:CATALYST_SOURCE,windowHours:CATALYST.windowHours,headlines,newestAt,...nulls,model:null,checkedAt:new Date(now).toISOString(),reason,...(detail?{detail}:{})};
}
export function noHeadlinesCatalyst(now:number):CatalystStamp{
 return {rule:CATALYST_RULE,status:'no-headlines',source:CATALYST_SOURCE,windowHours:CATALYST.windowHours,headlines:0,newestAt:null,...nulls,model:null,checkedAt:new Date(now).toISOString()};
}
/** AV time_published is YYYYMMDDTHHMMSS in UTC. */
export function avTime(v:unknown){
 const m=typeof v==='string'?v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/):null;
 if(!m)return null;
 const t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]);
 return Number.isFinite(t)?t:null;
}
const stamp=(ms:number)=>new Date(ms).toISOString().replace(/[-:]/g,'').slice(0,13);
/** Keeps only items tagged to this coin inside the window, newest first, trimmed for the model. */
export function parseHeadlines(body:AvFeed|null,symbol:string,now:number):CatalystHeadline[]{
 const ticker=`CRYPTO:${symbol.toUpperCase()}`,from=now-CATALYST.windowHours*3600000;
 const out:CatalystHeadline[]=[];
 for(const item of body?.feed??[]){
  const at=avTime(item.time_published);
  if(at==null||at<from||at>now)continue;
  const tag=item.ticker_sentiment?.find(t=>t.ticker===ticker);
  const relevance=tag&&typeof tag.relevance_score==='string'?Number(tag.relevance_score):tag&&typeof tag.relevance_score==='number'?tag.relevance_score:null;
  if(tag&&relevance!=null&&Number.isFinite(relevance)&&relevance<CATALYST.minRelevance)continue;
  if(typeof item.title!=='string'||!item.title.trim())continue;
  out.push({title:item.title.trim().slice(0,200),summary:typeof item.summary==='string'?item.summary.trim().slice(0,CATALYST.summaryChars):'',source:typeof item.source==='string'?item.source:'unknown',publishedAt:new Date(at).toISOString(),relevance:relevance!=null&&Number.isFinite(relevance)?relevance:null});
 }
 return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,CATALYST.maxHeadlines);
}
type Cached={headlines:CatalystHeadline[];fetchedAt:string;reason?:string;detail?:string};
/** The governor throws one Error for every provider problem; the message is the only way to tell quota from a bad ticker. */
export function classifyAvFailure(e:unknown){
 const m=e instanceof Error?e.message:String(e);
 if(/circuit breaker/i.test(m))return 'av-circuit-open';
 if(/timed out/i.test(m))return 'av-timeout';
 if(/quota|rate limit|per minute|per day|premium|higher API call volume/i.test(m))return 'av-quota';
 if(/invalid|not supported|no data/i.test(m))return 'av-no-data';
 if(/HTTP (\d{3})/.test(m))return `av-http-${m.match(/HTTP (\d{3})/)![1]}`;
 return 'av-error';
}
/** One governed provider call per symbol per cache window. Returns null when the budget for this batch is spent. */
async function headlinesFor(redis:Redis,symbol:string,now:number,budget:{left:number}):Promise<Cached|null>{
 const key=`${CACHE}:${symbol.toUpperCase()}`;
 const cached=await redis.get<Cached>(key);
 if(cached)return cached;
 const apiKey=process.env.ALPHA_VANTAGE_API_KEY?.trim();
 if(!apiKey)return {headlines:[],fetchedAt:new Date(now).toISOString(),reason:'no-av-key'};
 if(budget.left<=0)return null;
 budget.left--;
 const url=`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(`CRYPTO:${symbol.toUpperCase()}`)}&time_from=${stamp(now-CATALYST.windowHours*3600000)}&sort=LATEST&limit=50&apikey=${apiKey}`;
 let body:AvFeed|null=null,failure:string|null=null,detail:string|undefined;
 try{body=await avFetch<AvFeed>(url,`NEWS_SENTIMENT CRYPTO:${symbol.toUpperCase()}`);if(!body)failure='av-no-data';}
 catch(e){failure=classifyAvFailure(e);detail=(e instanceof Error?e.message:String(e)).slice(0,160);}
 const result:Cached=body&&Array.isArray(body.feed)?{headlines:parseHeadlines(body,symbol,now),fetchedAt:new Date(now).toISOString()}:{headlines:[],fetchedAt:new Date(now).toISOString(),reason:failure??(body?.Note!=null||body?.Information!=null?'av-quota':'av-bad-shape'),...(detail?{detail}:{})};
 // A quota or outage answer is cached briefly so the next batch retries; good answers keep the full window.
 await redis.set(key,result,{ex:result.reason?600:CATALYST.cacheSec});
 return result;
}
export function catalystState(row:CatalystRow,headlines:CatalystHeadline[]){
 return {coin:row.symbol.toUpperCase(),stage:row.stage,kind:row.kind??null,windowHours:CATALYST.windowHours,headlines:headlines.map(h=>({title:h.title,summary:h.summary,source:h.source,publishedAt:h.publishedAt}))};
}
/**
 * Stamps named setups that have no stamp under the current rule. Never throws, never changes a stage.
 * Order: cached headlines → provider call (while budget lasts) → one Jev request per row with headlines.
 */
export async function attachCatalystShadow<T extends CatalystRow>(redis:Redis,rows:T[],now=Date.now()){
 const due=rows.filter(r=>JEV_STAGES.includes(r.stage as typeof JEV_STAGES[number])&&r.asOf&&r.symbol&&r.catalyst?.rule!==CATALYST_RULE);
 if(!due.length)return;
 const budget={left:CATALYST.providerCallsPerBatch},jevReady=jevConfigured();
 for(let i=0;i<due.length;i+=4){
  await Promise.all(due.slice(i,i+4).map(async row=>{
   const stage=row.stage;
   try{
    const cached=await headlinesFor(redis,row.symbol,now,budget);
    if(!cached){return;}
    if(cached.reason){row.catalyst=unavailableCatalyst(now,cached.reason,0,null,cached.detail);return;}
    if(!cached.headlines.length){row.catalyst=noHeadlinesCatalyst(now);return;}
    const newestAt=cached.headlines[0].publishedAt;
    if(!jevReady){row.catalyst=unavailableCatalyst(now,'no-key',cached.headlines.length,newestAt);return;}
    const {model,answers,inputTokens}=await askJev(catalystState(row,cached.headlines),CATALYST_QUESTIONS);
    row.catalyst={rule:CATALYST_RULE,status:'scored',source:CATALYST_SOURCE,windowHours:CATALYST.windowHours,headlines:cached.headlines.length,newestAt,listingNews:answers.listingNews.probability,supplyEvent:answers.supplyEvent.probability,exploitOrOutage:answers.exploitOrOutage.probability,regulatoryNegative:answers.regulatoryNegative.probability,narrativeOnly:answers.narrativeOnly.probability,model,checkedAt:new Date(now).toISOString(),...(inputTokens!=null?{inputTokens}:{})};
   }catch(e){row.catalyst=unavailableCatalyst(now,e instanceof JevFailure?e.reason:'error');}
   finally{row.stage=stage;}
  }));
 }
}
