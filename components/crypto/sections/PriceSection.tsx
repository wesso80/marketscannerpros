import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Breakdown} from '@/lib/crypto/breakdown/types';
export default function PriceSection({data}:{data:Breakdown}){return <SectionShell id="price" title={COPY.titles.price} data={data.sections.price} collapsible={false}>
 <p><strong>{data.name??data.symbol}</strong> · {COPY.coinId}: <code>{data.coinId??'—'}</code> · {COPY.rank}: {data.rank??'—'}</p>
 {data.identityMatches!=null&&data.identityMatches>1?<p className="text-amber-300">{data.identityMatches} {COPY.matches}</p>:data.identityMatches==null?<p className="text-xs text-slate-400">{COPY.identityUnchecked}</p>:null}
 {data.budget.capped&&<p role="status" className="text-amber-300">{data.budget.reason?COPY.budgetUnavailable:COPY.capped}</p>}
 </SectionShell>;}
