import Link from 'next/link';
import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import {symbolJournalHref,cryptoResearchNote} from '@/lib/market/symbolSnapshot';
import type {Breakdown} from '@/lib/crypto/breakdown/types';
export default function HandoffSection({data}:{data:Breakdown}){
 const rule=data.sections.ruleCheck;
 const fact=(label:string)=>{const value=rule.value?.metrics.find(m=>m.label===label)?.value;return typeof value==='number'?value:null;};
 const notes=cryptoResearchNote(rule.value?.stage??'NOT ENOUGH DATA',{asOf:rule.asOf,rangePct:fact('Base range; limit 35%'),volumeRatio:fact('Volume / base median; minimum 3x'),distancePct:fact('Distance to base high')});
 const journal=`${symbolJournalHref(data.symbol,'crypto')}&${new URLSearchParams({notes})}`;
 const stamp={...data.sections.ruleCheck,value:{metrics:[],notes:[COPY.drafts]}};
 return <SectionShell id="notes" title={COPY.titles.notes} data={stamp}><div className="flex flex-wrap gap-4"><Link className="text-sky-300 underline" href={journal}>{COPY.journal}</Link><Link className="text-sky-300 underline" href={`/tools/workspace?${new URLSearchParams({tab:'watchlists',addSymbol:data.symbol,type:'crypto'})}`}>{COPY.watchlist}</Link></div></SectionShell>;
}
