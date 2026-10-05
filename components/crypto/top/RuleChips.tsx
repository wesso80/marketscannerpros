import {ruleChips,type TopFacts} from '@/lib/crypto/breakdown/top';
import {COPY} from '../copy';
import SourceLine from './SourceLine';
export type DisplayRule = {name:string;value:string;limit:string;pass:boolean|null};
export default function RuleChips({top,zone='UTC',items,showSource=true}:{top?:TopFacts;zone?:string;items?:DisplayRule[];showSource?:boolean}){
 if(items || !showSource) return <div className="flex flex-wrap gap-2">{(items??(top?ruleChips(top.rule):[])).map(c=><span data-rule-chip key={c.name} title={`${c.value} ${c.limit}`} className="rounded-full border border-current px-2.5 py-1 text-xs" style={{color:c.pass==null?'var(--msp-warn)':c.pass?'var(--msp-bull)':'var(--msp-bear)'}}>{c.pass==null?'!':c.pass?'✓':'✗'} {c.name}{c.value!=='—'?` · ${c.value}`:''}</span>)}</div>;
 if(!top)return null;
 return <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{ruleChips(top.rule).map(c=>{
  const state=c.pass==null?COPY.top.insufficient:c.pass?COPY.top.met:COPY.top.notMet;
  return <div data-top-number data-rule-chip key={c.name} aria-label={COPY.top.chipSummary(c.name,c.value,c.limit,state)} className="min-w-0 break-words rounded-lg border border-white/10 p-3">
   <p className="text-sm font-medium" style={{color:c.pass==null?'var(--msp-text-muted)':c.pass?'var(--msp-info)':'var(--msp-warn)'}}><span aria-hidden="true">{c.pass==null?'—':c.pass?'✓':'✗'} </span>{c.name}</p>
   <p className="mt-1 text-sm tabular-nums">{c.value} / {c.limit}</p><p className="text-xs text-slate-400">{state}</p><SourceLine stamp={top.daily} zone={zone}/>
  </div>;
 })}</div>;
}
