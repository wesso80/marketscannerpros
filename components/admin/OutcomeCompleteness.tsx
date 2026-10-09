import type { OutcomeCompleteness as Completeness } from '@/lib/admin/outcomeCompleteness';
export default function OutcomeCompleteness({data}:{data:Completeness}) {
  const t=data.total;
  return <section aria-label="Outcome completeness" style={{marginTop:20}}>
    <h2 style={{fontSize:16}}>Outcome completeness by UTC day</h2>
    <p style={{fontSize:12,color:'#94A3B8'}}>All recorded LONG/SHORT signals in this window. Only measured outcomes enter the estimates above. Pending does not necessarily mean overdue. Calendar days differ from each group's earlier/later periods; dates with no recorded signals are omitted.</p>
    <p>{t.measured} measured of {t.total} recorded · {t.pending} pending · {t.expired} expired · {t.old_method} old method · {t.invalid_move} missing/invalid move · {t.unknown} unknown</p>
    {t.total === 0 ? <p>No recorded signals in this window.</p> : <details><summary>Show daily counts ({data.periods.length} dates)</summary>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:650,fontSize:12,textAlign:'right'}}>
        <thead><tr>{['UTC date','Recorded','Measured','Pending','Expired','Old method','Missing/invalid move','Unknown'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{data.periods.map(p=><tr key={p.day}><th scope="row">{p.day}</th>{[p.total,p.measured,p.pending,p.expired,p.old_method,p.invalid_move,p.unknown].map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody>
      </table></div>
    </details>}
    <p style={{fontSize:12,color:'#94A3B8'}}>Old method includes a missing or pre-fix measurement timestamp on a correct/wrong/neutral label. Missing/invalid move means a fixed-method label lacks a valid bounded 24h move. These categories are mutually exclusive; pending and expired take precedence.</p>
  </section>;
}
