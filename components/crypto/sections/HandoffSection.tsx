import Link from 'next/link';
import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import {symbolJournalHref} from '@/lib/market/symbolSnapshot';
import type {Breakdown} from '@/lib/crypto/breakdown/types';
export default function HandoffSection({data}:{data:Breakdown}){
 const stamp={...data.sections.ruleCheck,value:{metrics:[],notes:[COPY.drafts]}};
 return <SectionShell id="notes" title={COPY.titles.notes} data={stamp}><div className="flex flex-wrap gap-4"><Link className="text-sky-300 underline" href={symbolJournalHref(data.symbol,'crypto')}>{COPY.journal}</Link><Link className="text-sky-300 underline" href={`/tools/workspace?${new URLSearchParams({tab:'watchlists',addSymbol:data.symbol,type:'crypto'})}`}>{COPY.watchlist}</Link></div></SectionShell>;
}
