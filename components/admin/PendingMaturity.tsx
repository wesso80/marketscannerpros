import type {PendingMaturity as Maturity} from '@/lib/admin/pendingMaturity';
export default function PendingMaturity({data}:{data:Maturity}){
 return <section aria-label="Pending maturity" style={{marginTop:16,fontSize:13}}>
  <h2 style={{fontSize:16}}>Why outcomes may still be pending</h2>
  <p>{data.total} pending · assessed {new Date(data.asOf).toLocaleString()}</p>
  <ul>
   <li>{data.before24h} before the 24-hour horizon, with supported asset and valid entry</li>
   <li>{data.eligibleWindow} in the 24-hour to under-seven-day candidate window</li>
   <li>{data.atOrBeyond7d} at or beyond seven days, outside the candidate window</li>
   <li>{data.unsupportedAsset} unsupported asset types · {data.invalidEntry} missing/invalid entry prices</li>
   <li>{data.futureTime} future timestamps · {data.unknownTime} unknown timestamps</li>
  </ul>
  <p style={{color:'#94A3B8',fontSize:12}}>Candidate age does not prove a completed bar is available or a job is stalled. Market closures, delayed prices, provider failures and run budgets can defer measurement. The labeller expires rows older than seven days when it runs; exactly seven days is excluded from candidates but not yet from its strict expiry condition. Counts prioritise invalid/future time, then the seven-day boundary, unsupported asset, invalid entry and age.</p>
 </section>;
}
