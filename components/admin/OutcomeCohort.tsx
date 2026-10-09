"use client";
import type {OutcomeCohort as Cohort,ProvenanceSummary} from '@/lib/admin/verifiedOutcomes';
export default function OutcomeCohort({value,onChange,summary,scope}:{scope:string;value:Cohort;onChange:(value:Cohort)=>void;summary?:ProvenanceSummary}){
 return <section aria-label="Measurement provenance" style={{margin:'12px 0',fontSize:13}}>
  <label>Measurement records{' '}<select aria-label="Measurement records" value={value} onChange={e=>onChange(e.target.value as Cohort)} style={{background:'#0F172A',color:'#E5E7EB',padding:8,maxWidth:'100%'}}>
   <option value="all">All eligible records (mixed provenance)</option><option value="verified">Verified method records only</option><option value="unverified">Unverified / unknown records only</option>
  </select></label>
  <p style={{fontSize:12,color:'#94A3B8'}}>{scope}</p>
  {summary&&<p>{summary.selected} selected from {summary.total} records · {summary.verified} verified method · {summary.unknown} unknown method · {summary.inconsistent} evidence mismatches</p>}
  <p style={{fontSize:12,color:'#94A3B8'}}>Verified means the recorded writer, method and measurement fields agree. It does not prove a trading edge. Unverified records remain available; timestamps alone do not establish their method.</p>
 </section>;
}
