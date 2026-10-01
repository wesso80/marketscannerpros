import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
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
 if(c.status==='unavailable')parts.push(`unavailable: ${c.reason??'reason not recorded'}`);
 return parts.join(' · ');
}
