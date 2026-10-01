import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
import type {ChartStamp} from './cryptoJevChart';
/**
 * Pure helpers that read a saved Jev stamp. No network, no redis, so stats and forward-score modules can import them
 * without touching the gateway. Evidence only: nothing here blocks, opens, or recommends.
 */
export const JEV_QUESTION_IDS=['chase','flowAgrees','btcHeadwind'] as const;
export type JevQuestionId=typeof JEV_QUESTION_IDS[number];
/** Neutral split for reading a Noul; the provider's default when yes and no cost the same. Not a tuned threshold. */
export const JEV_YES=0.5;
export const JEV_MIN_SIDE=30;
export const JEV_LABELS:Record<JevQuestionId,string>={chase:'chase',flowAgrees:'flow agrees',btcHeadwind:'btc headwind'};
export function jevScored(jev:JevStamp|null|undefined):jev is JevStamp&{chase:number;flowAgrees:number;btcHeadwind:number}{
 return !!jev&&jev.status==='scored'&&typeof jev.chase==='number'&&typeof jev.flowAgrees==='number'&&typeof jev.btcHeadwind==='number';
}
/** `chase ≥0.50` / `chase <0.50`; `Jev unavailable` when a stamp exists but was not scored; `NOT_RECORDED` when no stamp. */
export function jevSideLabel(q:JevQuestionId,jev:JevStamp|null|undefined){
 if(!jev)return 'NOT_RECORDED';
 if(!jevScored(jev))return 'Jev unavailable';
 return `${JEV_LABELS[q]} ${jev[q]>=JEV_YES?'≥':'<'}${JEV_YES.toFixed(2)}`;
}
/** Parses the jev object stored inside a paper position's createdReason JSON. Missing or malformed stays undefined. */
export function jevFromReason(reason:string|null|undefined):JevStamp|undefined{
 const i=reason?.indexOf('{')??-1;if(!reason||i<0)return undefined;
 try{const j=JSON.parse(reason.slice(i))?.jev;return j&&typeof j==='object'&&typeof j.rule==='string'&&(j.status==='scored'||j.status==='unavailable')?j as JevStamp:undefined;}catch{return undefined;}
}
/** Tooltip text for a Jev cell: when it was scored, with which Bitcoin read, by which model, and why it failed if it did. */
export function jevDetail(jev:JevStamp|null|undefined){
 if(!jev)return 'No Jev stamp saved for this row.';
 const parts=[`rule ${jev.rule}`,`checked ${jev.checkedAt}`,`btcTrend ${jev.btcTrend}`,`flowStamp ${jev.flowStamp}`];
 if(jev.model)parts.push(`model ${jev.model}`);
 if(jev.status!=='scored')parts.push(`unavailable: ${jev.reason??'reason not recorded'}`);
 return parts.join(' · ');
}
export type JevCoverage={scored:number;unavailable:number;unscored:number;reasons:Record<string,number>};
export function jevCoverage(stamps:Array<JevStamp|null|undefined>):JevCoverage{
 const c:JevCoverage={scored:0,unavailable:0,unscored:0,reasons:{}};
 for(const jev of stamps){
  if(!jev){c.unscored++;continue;}
  if(jevScored(jev)){c.scored++;continue;}
  c.unavailable++;const r=jev.reason??'not recorded';c.reasons[r]=(c.reasons[r]??0)+1;
 }
 return c;
}
/** Catalyst cell: headline count plus any event class at or above 0.50. `no headlines` is a real answer, not a failure. */
export const CATALYST_IDS=['listingNews','supplyEvent','exploitOrOutage','regulatoryNegative','narrativeOnly'] as const;
export type CatalystQuestionKey=typeof CATALYST_IDS[number];
export const CATALYST_LABELS:Record<CatalystQuestionKey,string>={listingNews:'listing news',supplyEvent:'supply event',exploitOrOutage:'exploit or outage',regulatoryNegative:'regulatory negative',narrativeOnly:'narrative only'};
/** `no headlines` is a real side: the coin had no coin-tagged news in the window. Unavailable and unstamped are informational. */
export function catalystSideLabel(qid:CatalystQuestionKey,c:CatalystStamp|null|undefined){
 if(!c)return 'NOT_RECORDED';
 if(c.status==='no-headlines')return 'no headlines';
 const p=c[qid];
 if(c.status!=='scored'||typeof p!=='number')return 'Catalyst unavailable';
 return `${CATALYST_LABELS[qid]} ${p>=JEV_YES?'≥':'<'}${JEV_YES.toFixed(2)}`;
}
export function catalystText(c:CatalystStamp|null|undefined,named:boolean){
 if(!named||!c)return '—';
 if(c.status==='no-headlines')return `no headlines (${c.windowHours}h)`;
 if(c.status!=='scored')return `unavailable${c.reason?` · ${c.reason}`:''}`;
 const flags:string[]=[];
 for(const [k,p] of [['listing',c.listingNews],['supply',c.supplyEvent],['exploit',c.exploitOrOutage],['regulatory',c.regulatoryNegative],['narrative',c.narrativeOnly]] as const)if(typeof p==='number'&&p>=JEV_YES)flags.push(`${k} ${p.toFixed(2)}`);
 return `${c.headlines} headline${c.headlines===1?'':'s'}${flags.length?` · ${flags.join(' · ')}`:` · no flag ≥${JEV_YES.toFixed(2)}`}`;
}
export function catalystDetail(c:CatalystStamp|null|undefined){
 if(!c)return 'No catalyst stamp saved for this row.';
 const parts=[`rule ${c.rule}`,`source ${c.source}`,`checked ${c.checkedAt}`,`window ${c.windowHours}h`,`headlines ${c.headlines}`];
 if(c.newestAt)parts.push(`newest ${c.newestAt}`);
 if(c.status==='scored')parts.push(`listing ${c.listingNews?.toFixed(2)} · supply ${c.supplyEvent?.toFixed(2)} · exploit ${c.exploitOrOutage?.toFixed(2)} · regulatory ${c.regulatoryNegative?.toFixed(2)} · narrative ${c.narrativeOnly?.toFixed(2)}`);
 if(c.model)parts.push(`model ${c.model}`);
 if(c.status==='unavailable')parts.push(`unavailable: ${c.reason??'reason not recorded'}${c.detail?` — ${c.detail}`:''}`);
 return parts.join(' · ');
}
/** Chart confirmer cell: the four reads at or above 0.50, or why the row could not be read. `no-bars` means the scan stored only the signal candle. */
export const CHART_IDS=['cleanBase','strongClose','volumeExpansion','overheadSupply'] as const;
export type ChartQuestionKey=typeof CHART_IDS[number];
export const CHART_LABELS:Record<ChartQuestionKey,string>={cleanBase:'clean base',strongClose:'strong close',volumeExpansion:'volume expansion',overheadSupply:'overhead supply'};
export function chartScored(c:ChartStamp|null|undefined):c is ChartStamp&{cleanBase:number;strongClose:number;volumeExpansion:number;overheadSupply:number}{
 return !!c&&c.status==='scored'&&CHART_IDS.every(k=>typeof c[k]==='number');
}
export function chartSideLabel(qid:ChartQuestionKey,c:ChartStamp|null|undefined){
 if(!c)return 'NOT_RECORDED';
 if(!chartScored(c))return 'Chart unavailable';
 return `${CHART_LABELS[qid]} ${c[qid]>=JEV_YES?'≥':'<'}${JEV_YES.toFixed(2)}`;
}
export function chartFromReason(reason:string|null|undefined):ChartStamp|undefined{
 const i=reason?.indexOf('{')??-1;if(!reason||i<0)return undefined;
 try{const c=JSON.parse(reason.slice(i))?.chart;return c&&typeof c==='object'&&typeof c.rule==='string'&&(c.status==='scored'||c.status==='unavailable')?c as ChartStamp:undefined;}catch{return undefined;}
}
export function chartText(c:ChartStamp|null|undefined,named:boolean){
 if(!named||!c)return '—';
 if(!chartScored(c))return `unavailable${c.reason?` · ${c.reason}`:''}`;
 return `base ${c.cleanBase.toFixed(2)} · close ${c.strongClose.toFixed(2)} · vol ${c.volumeExpansion.toFixed(2)} · overhead ${c.overheadSupply.toFixed(2)}`;
}
export function chartDetail(c:ChartStamp|null|undefined){
 if(!c)return 'No chart confirmer stamp saved for this row.';
 const parts=[`rule ${c.rule}`,`checked ${c.checkedAt}`,`${c.bars} stored candles`];
 if(c.model)parts.push(`model ${c.model}`);
 if(c.status==='scored')parts.push('each value is the probability that the read is true; overhead supply high is a caution, the other three high are confirmations');
 else parts.push(`unavailable: ${c.reason??'reason not recorded'}${c.reason==='no-bars'?' (the scan stored only the signal candle; the next 4h window stores all 25)':''}`);
 return parts.join(' · ');
}
export type SetupRead={opportunity:string;evidenceQuality:string;exposure:string;confidence:string;confirms:string;invalidates:string;mainRisk:string};
/** Private setup read. Confidence steps down when a stamp is missing or the scan is stale. Nothing here is an order. `book` is the forward-score coverage: that panel has no single chart or catalyst stamp. */
export function setupRead(input:{stale?:boolean;jev?:JevStamp|null;chart?:ChartStamp|null;catalyst?:CatalystStamp|null;shadow?:{score:number}|null;book?:{scored:number;unavailable:number;unscored:number}}):SetupRead{
 const bookComplete=!!input.book&&input.book.scored>0&&input.book.unavailable===0&&input.book.unscored===0;
 const jevOk=input.book?bookComplete:jevScored(input.jev);
 const chartOk=input.book?bookComplete:chartScored(input.chart);
 const cat=input.catalyst;
 const catKnown=input.book?bookComplete:(cat?.status==='scored'||cat?.status==='no-headlines');
 const degraded=!!input.stale||!jevOk||!chartOk||!catKnown;
 const evidenceQuality=input.stale||!jevOk?'low · 15':!chartOk||!catKnown?'medium · 45':'high · 75';
 return {
  opportunity:input.book?'unavailable — this panel reads saved probabilities against marks already stored. It is not a forecast.':input.shadow&&typeof input.shadow.score==='number'?`shadow ${input.shadow.score.toFixed(2)} (sum of confirmed sides; not a forecast)`:'unavailable — the shadow score stays off until two confirmed fields exist',
  evidenceQuality,
  exposure:'Personal exposure: none on this scan. Research only. No order is sent.',
  confidence:degraded?'Confidence is not established. An input is stale, missing, or unavailable, so this read stays uncertain and is not a trade.':'Confidence is limited to stored probabilities. It is not a win rate and it is not permission to trade.',
  confirms:degraded?'Nothing is confirmed while an input is stale or missing.':'A later completed candle that stays inside the entry zone, with the catalyst still free of an exploit or regulatory flag.',
  invalidates:'A close back through the entry floor, a Jev or chart stamp that becomes unavailable, or a catalyst exploit or regulatory flag.',
  mainRisk:'Chase and volume expansion repeat the entry rule, so a high probability on either is not new evidence. The main risk is treating this read as a fill.',
 };
}
export function setupReadText(read:SetupRead){
 return [`Opportunity score: ${read.opportunity}`,`Evidence quality: ${read.evidenceQuality}`,read.exposure,read.confidence,`What confirms: ${read.confirms}`,`What invalidates: ${read.invalidates}`,`Main risk: ${read.mainRisk}`].join('\n');
}
