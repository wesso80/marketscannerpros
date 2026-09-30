'use client';
import type {CryptoPaperStats as Stats,CryptoStatsGroup,ExitPlanComparison} from '@/lib/admin/cryptoPaperStats';
const r=(n:number|null)=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}R`;
const pct=(n:number|null)=>n==null?'—':`${(n*100).toFixed(0)}%`;
const money=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});
export function Table({title,rows}:{title:string;rows:CryptoStatsGroup[]}){
 if(!rows.length)return null;
 return <div className="overflow-auto"><h4 className="mt-2 text-sm font-semibold">{title}</h4><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{['Group','Trades','Win rate','Expectancy','Avg win','Avg loss','Profit factor','Net P&L','Avg hold'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead>
  <tbody>{rows.map(g=><tr key={g.label} className="border-t border-slate-700"><td className="p-2">{g.label}</td><td className="p-2">{g.trades}{g.trades<10?<span className="text-amber-300"> · few</span>:null}</td><td className="p-2">{pct(g.winRate)}</td><td className={`p-2 ${g.avgR==null?'':g.avgR>0?'text-emerald-300':'text-red-300'}`}>{r(g.avgR)}</td><td className="p-2">{r(g.avgWinR)}</td><td className="p-2">{r(g.avgLossR)}</td><td className="p-2">{g.profitFactor?.toFixed(2)??'—'}</td><td className="p-2">{money(g.netPnl)}</td><td className="p-2">{g.avgHoldHours==null?'—':`${g.avgHoldHours.toFixed(1)}h`}</td></tr>)}</tbody></table></div>;
}
function ExitPlans({plans}:{plans:ExitPlanComparison|null|undefined}){
 return <div className="space-y-1 rounded border border-sky-800 p-3">
  <h4 className="text-sm font-semibold">Exit plan comparison · RESEARCH ONLY</h4>
  <p className="text-xs text-slate-400">Current plan (the paper ledger): full exit at the stop or at a fixed target set 2R above the signal candle's close. Entries fill later at the live ask plus costs, so reward:risk at the fill varies; entry requires at least 1.5R after costs. Shadow plan (partial-trail-v2): half at +1.5R, remaining stop to breakeven, then trailed 2× signal ATR below the highest completed-candle high; exit after 72h (18 completed 4h candles) if +1R was never reached. v1 used a 24h time stop and is compared separately (rule change). The shadow replays the same 15-minute candles using only completed candles, charges the same fees and slippage, and never changes a paper position.</p>
  {!plans?<p>Comparison unavailable: saved shadow states could not be read. No figures are estimated.</p>:<>
   <p className={plans.pairs>=30?'':'text-amber-300'}>{plans.note} Shadows still running: {plans.openShadows} · unavailable: {plans.unavailableShadows}{plans.earlierPlanShadows?` · ${plans.earlierPlanShadows} earlier-rule (v1) shadows excluded`:''}.</p>
   {plans.pairs>0&&<div className="overflow-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr>{['Plan','Trades','Win rate','Expectancy','Total R'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
    {([['Fixed target (ledger)',plans.fixed],['Partial + trail (shadow)',plans.trail]] as const).map(([label,x])=><tr key={label} className="border-t border-slate-700"><td className="p-2">{label}</td><td className="p-2">{x.trades}</td><td className="p-2">{pct(x.winRate)}</td><td className={`p-2 ${x.avgR==null?'':x.avgR>0?'text-emerald-300':'text-red-300'}`}>{r(x.avgR)}</td><td className="p-2">{r(x.totalR)}</td></tr>)}
   </tbody></table>
   <p className="text-xs text-slate-400">Shadow final exits: {Object.entries(plans.trailExitReasons).map(([k,v])=>`${k} ${v}`).join(' · ')}</p></div>}
  </>}
 </div>;
}
export default function CryptoPaperStats({stats,exitPlans,title='Strategy statistics',source='closed trades in this paper ledger'}:{stats:Stats|null|undefined;exitPlans?:ExitPlanComparison|null;title?:string;source?:string}){
 return <section aria-label="Strategy statistics" className="space-y-2 rounded border border-emerald-800 p-3">
  <h3 className="font-semibold">{title} · SIMULATED · {stats?.sample.replace('_',' ')??'UNAVAILABLE'}</h3>
  {!stats?<p>Statistics unavailable: closed trades could not be read. No figures are estimated.</p>:<>
   <p className={stats.sample==='USABLE'?'':'text-amber-300'}>{stats.sampleNote}</p>
   <p className="text-xs text-slate-400">Expectancy is the average result per trade in R (1R = the planned risk at entry), after estimated fees and slippage. Above +0R means the rules made money on paper. Source: {source} · computed {new Date(stats.checkedAt).toLocaleString()}. Trades opened before BTC trend tagging show NOT_RECORDED.</p>
   {stats.overall.trades>0&&<>
    <Table title="Overall" rows={[stats.overall]} />
    <Table title="By BTC daily trend at entry" rows={stats.byBtcRegime} />
    {stats.byBtc200?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By BTC 200-day regime at entry (bull-market hypothesis; evidence only, never blocks)" rows={stats.byBtc200} />}
    {stats.byRsRule?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By relative-strength leader rule at entry (top third vs BTC over 30 days and above own 50d; evidence only, never blocks)" rows={stats.byRsRule} />}
    {stats.byFlow?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By liquidation / taker-flow state at entry (flow-v1 shadow label: OKX, evidence only, never blocks)" rows={stats.byFlow} />}
    {stats.byShadowFilter?.some(g=>g.label==='PASS'||g.label==='WOULD_SKIP')&&<>
     <Table title="Shadow filter: skip new entries when BTC daily trend is DOWN (evidence only; never blocks a trade)" rows={stats.byShadowFilter} />
     <p className="text-xs text-slate-400">PASS is what the account would have traded with the filter on; WOULD_SKIP trades were still taken for comparison. The filter is judged on these rows only; with few trades in either row the difference is noise. Trades without a recorded BTC trend show NOT_RECORDED and are never assigned a side.</p>
    </>}
    {stats.byFunding?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By OKX perpetual funding state at entry (evidence only)" rows={stats.byFunding} />}
    <Table title="By setup type" rows={stats.bySetup} />
    <Table title="By venue" rows={stats.byVenue} />
    <Table title="By exit reason" rows={stats.byExit} />
   </>}
  </>}
  <ExitPlans plans={exitPlans} />
 </section>;
}
