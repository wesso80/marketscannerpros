import type {Redis} from '@upstash/redis';
import {getApiUsage,getCryptoNews} from '@/lib/coingecko';
import {cgBudgetStatus} from './cgCredits';
import {askJev,JevFailure,jevConfigured} from './jevClient';
import {JEV_STAGES} from './cryptoJev';
/**
 * Catalyst shadow (jev-catalyst-v2): what the last 48 hours of coin-tagged CoinGecko headlines say about a named setup.
 * Source is CoinGecko /news?coin_id=<id> (Analyst plan), cached per coin so one coin costs at most a few credits a day,
 * capped per batch, and skipped entirely while the shared CoinGecko credit budget says pause.
 * Evidence only: a stamp never blocks a setup, opens a trade, or writes a recommendation. A coin with no headlines is
 * recorded as no-headlines, never as a fabricated "no". Changing the questions or the source starts a new sample.
 */
export const CATALYST_RULE='jev-catalyst-v2' as const;
export const CATALYST_SOURCE='coingecko:/news?coin_id' as const;
export const CATALYST={windowHours:48,maxHeadlines:8,cacheSec:4*3600,providerCallsPerBatch:40,perPage:20,titleChars:200} as const;
const CACHE='admin:crypto-markets:catalyst-news:v2';
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
export type CatalystHeadline={title:string;source:string;publishedAt:string};
export type CatalystStamp={rule:typeof CATALYST_RULE;status:'scored'|'no-headlines'|'unavailable';source:typeof CATALYST_SOURCE;windowHours:number;headlines:number;newestAt:string|null;listingNews:number|null;supplyEvent:number|null;exploitOrOutage:number|null;regulatoryNegative:number|null;narrativeOnly:number|null;model:string|null;checkedAt:string;reason?:string;detail?:string;inputTokens?:number};
type CatalystRow={id:string;stage:string;asOf?:string|null;symbol:string;kind?:string|null;catalyst?:CatalystStamp};
const nulls={listingNews:null,supplyEvent:null,exploitOrOutage:null,regulatoryNegative:null,narrativeOnly:null};
export function unavailableCatalyst(now:number,reason:string,headlines=0,newestAt:string|null=null,detail?:string):CatalystStamp{
 return {rule:CATALYST_RULE,status:'unavailable',source:CATALYST_SOURCE,windowHours:CATALYST.windowHours,headlines,newestAt,...nulls,model:null,checkedAt:new Date(now).toISOString(),reason,...(detail?{detail}:{})};
}
export function noHeadlinesCatalyst(now:number):CatalystStamp{
 return {rule:CATALYST_RULE,status:'no-headlines',source:CATALYST_SOURCE,windowHours:CATALYST.windowHours,headlines:0,newestAt:null,...nulls,model:null,checkedAt:new Date(now).toISOString()};
}
const rec=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'?v as Record<string,unknown>:{};
/** CoinGecko dates arrive as ISO strings or unix seconds depending on the wrapper. */
export function cgTime(v:unknown){
 if(typeof v==='number'&&Number.isFinite(v))return v<1e12?v*1000:v;
 if(typeof v==='string'){const t=Date.parse(v);if(Number.isFinite(t))return t;const n=Number(v);if(Number.isFinite(n)&&n>0)return n<1e12?n*1000:n;}
 return null;
}
/** Accepts the flat shape ({title, posted_at}) and the wrapped shape ({data:[{attributes:{title, created_at}}]}). Keeps items inside the window, newest first, capped. */
export function parseHeadlines(body:unknown,coinId:string,now:number):CatalystHeadline[]{
 const list=Array.isArray(body)?body:Array.isArray(rec(body).data)?rec(body).data as unknown[]:[];
 const from=now-CATALYST.windowHours*3600000,out:CatalystHeadline[]=[];
 for(const raw of list){
  const r=rec(raw),a=rec(r.attributes),item={...a,...r};
  const related=Array.isArray(item.related_coin_ids)?item.related_coin_ids:null;
  if(related&&related.length&&!related.includes(coinId))continue;
  const at=cgTime(item.posted_at??item.created_at??item.updated_at);
  if(at==null||at<from||at>now)continue;
  if(typeof item.title!=='string'||!item.title.trim())continue;
  out.push({title:item.title.trim().slice(0,CATALYST.titleChars),source:typeof item.source_name==='string'?item.source_name:typeof item.news_site==='string'?item.news_site:'unknown',publishedAt:new Date(at).toISOString()});
 }
 return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,CATALYST.maxHeadlines);
}
type Cached={headlines:CatalystHeadline[];fetchedAt:string;reason?:string;detail?:string};
type Fetcher=(coinId:string)=>Promise<unknown>;
const defaultFetch:Fetcher=coinId=>getCryptoNews({coin_id:coinId,per_page:CATALYST.perPage,throwOnError:true});
/** One CoinGecko call per coin per cache window. Returns null when this batch's budget is spent. */
async function headlinesFor(redis:Redis,coinId:string,now:number,budget:{left:number},fetcher:Fetcher):Promise<Cached|null>{
 const key=`${CACHE}:${coinId}`;
 const cached=await redis.get<Cached>(key);
 if(cached)return cached;
 if(budget.left<=0)return null;
 budget.left--;
 let body:unknown=null,failure:string|null=null,detail:string|undefined;
 try{body=await fetcher(coinId);if(body==null)failure='cg-unavailable';}
 catch(e){failure='cg-error';detail=(e instanceof Error?e.message:String(e)).slice(0,160);}
 const list=Array.isArray(body)?body:Array.isArray(rec(body).data)?rec(body).data:null;
 const result:Cached=!failure&&list?{headlines:parseHeadlines(body,coinId,now),fetchedAt:new Date(now).toISOString()}:{headlines:[],fetchedAt:new Date(now).toISOString(),reason:failure??'cg-bad-shape',...(detail?{detail}:{})};
 // A failed answer is cached briefly so the next batch retries; a good answer keeps the full window.
 await redis.set(key,result,{ex:result.reason?600:CATALYST.cacheSec});
 return result;
}
export function catalystState(row:CatalystRow,headlines:CatalystHeadline[]){
 return {coin:row.symbol.toUpperCase(),coinId:row.id,stage:row.stage,kind:row.kind??null,windowHours:CATALYST.windowHours,headlines};
}
/**
 * Stamps named setups that have no stamp under the current rule. Never throws, never changes a stage.
 * Order: credit-budget check → cached headlines → CoinGecko call (while batch budget lasts) → one Jev request per coin with headlines.
 */
export async function attachCatalystShadow<T extends CatalystRow>(redis:Redis,rows:T[],now=Date.now(),deps:{fetcher?:Fetcher;budgetPaused?:()=>Promise<boolean>}={}){
 // A provider-side failure (cg-*) is retried after an hour; a Jev answer, no-headlines, or a Jev failure is final for the row.
 const retryable=(c:CatalystStamp|undefined)=>!!c&&c.status==='unavailable'&&typeof c.reason==='string'&&c.reason.startsWith('cg-')&&now-Date.parse(c.checkedAt)>3600000;
 const due=rows.filter(r=>JEV_STAGES.includes(r.stage as typeof JEV_STAGES[number])&&r.asOf&&r.id&&(r.catalyst?.rule!==CATALYST_RULE||retryable(r.catalyst)));
 if(!due.length)return;
 const paused=await (deps.budgetPaused??(async()=>(await cgBudgetStatus(getApiUsage,now)).pauseNonEssential))().catch(()=>false);
 if(paused){for(const row of due)row.catalyst=unavailableCatalyst(now,'cg-paused',0,null,'CoinGecko credits below the pause threshold; no headline call was made');return;}
 const fetcher=deps.fetcher??defaultFetch,budget={left:CATALYST.providerCallsPerBatch},jevReady=jevConfigured();
 for(let i=0;i<due.length;i+=4){
  await Promise.all(due.slice(i,i+4).map(async row=>{
   const stage=row.stage;
   try{
    const cached=await headlinesFor(redis,row.id,now,budget,fetcher);
    if(!cached)return;
    if(cached.reason){row.catalyst=unavailableCatalyst(now,cached.reason,0,null,cached.detail);return;}
    if(!cached.headlines.length){row.catalyst=noHeadlinesCatalyst(now);return;}
    const newestAt=cached.headlines[0].publishedAt;
    if(!jevReady){row.catalyst=unavailableCatalyst(now,'no-key',cached.headlines.length,newestAt);return;}
    const {model,answers,inputTokens}=await askJev(catalystState(row,cached.headlines),CATALYST_QUESTIONS,{module:'jev-catalyst'});
    row.catalyst={rule:CATALYST_RULE,status:'scored',source:CATALYST_SOURCE,windowHours:CATALYST.windowHours,headlines:cached.headlines.length,newestAt,listingNews:answers.listingNews.probability,supplyEvent:answers.supplyEvent.probability,exploitOrOutage:answers.exploitOrOutage.probability,regulatoryNegative:answers.regulatoryNegative.probability,narrativeOnly:answers.narrativeOnly.probability,model,checkedAt:new Date(now).toISOString(),...(inputTokens!=null?{inputTokens}:{})};
   }catch(e){row.catalyst=unavailableCatalyst(now,e instanceof JevFailure?e.reason:'error');}
   finally{row.stage=stage;}
  }));
 }
}
