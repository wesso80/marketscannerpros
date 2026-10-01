'use client';
import type {CryptoPaperStats as Stats,CryptoStatsGroup,ExitPlanComparison,CostSensitivityRow} from '@/lib/admin/cryptoPaperStats';
const r=(n:number|null)=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}R`;
const pct=(n:number|null)=>n==null?'—':`${(n*100).toFixed(0)}%`;
const money=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});
export function Table({title,rows}:{title:string;rows:CryptoStatsGroup[]}){
 if(!rows.length)return null;
 return <div className="overflow-auto"><h4 className="mt-2 text-sm font-semibold">{title}</h4><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{['Group','Trades','Win rate','Expectancy','Avg win','Avg loss','Profit factor','Net P&L','Avg hold'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead>
  <tbody>{rows.map(g=><tr key={g.label} className="border-t border-slate-700"><td className="p-2">{g.label}</td><td className="p-2">{g.trades}{g.trades<10?<span className="text-amber-300"> · few</span>:null}</td><td className="p-2">{pct(g.winRate)}</td><td className={`p-2 ${g.avgR==null?'':g.avgR>0?'text-emerald-300':'text-red-300'}`}>{r(g.avgR)}</td><td className="p-2">{r(g.avgWinR)}</td><td className="p-2">{r(g.avgLossR)}</td><td className="p-2">{g.profitFactor?.toFixed(2)??'—'}</td><td className="p-2">{money(g.netPnl)}</td><td className="p-2">{g.avgHoldHours==null?'—':`${g.avgHoldHours.toFixed(1)}h`}</td></tr>)}</tbody></table></div>;
}
const PLAN_LABELS:Record<string,string>={'partial-trail-v2':'v2 · half at +1.5R, breakeven, 2-ATR trail, 72h time stop','failed-breakout-trail-v3':'v3 · v2 plus exit when a completed 4h candle closes below the entry floor','trail-only-v4':'v4 · no partial; whole position trails 2 ATR from entry, 72h time stop'};
function ExitPlans({plans}:{plans:ExitPlanComparison[]|null|undefined}){
 return <div className="space-y-2 rounded border border-sky-800 p-3">
  <h4 className="text-sm font-semibold">Exit plan comparison · RESEARCH ONLY</h4>
  <p className="text-xs text-slate-400">Ledger: full exit at the structural stop or a fixed target 2R above the fill; entries from 2026-09-30 (crypto-momentum-v2) also close at the first completed 15m candle at or after 72h if +1R was never reached. Each shadow plan replays the same 15-minute candles using only completed candles, charges the same fees and slippage, and never changes a paper position. Rules were fixed in advance from the 4h timeframe, not fitted. Compare each plan against the ledger on the same closed positions only; with few matched trades the difference is noise.</p>
  {!plans?<p>Comparison unavailable: saved shadow states could not be read. No figures are estimated.</p>:plans.map(p=><div key={p.plan} className="space-y-1 border-t border-slate-700 pt-2">
   <p className="text-sm"><span className="font-semibold">{p.plan}</span> · {PLAN_LABELS[p.plan]??'rules as saved with the shadow'}</p>
   <p className={p.pairs>=30?'text-xs':'text-xs text-amber-300'}>{p.note} Shadows still running: {p.openShadows} · unavailable: {p.unavailableShadows}{p.earlierPlanShadows&&p.plan==='partial-trail-v2'?` · ${p.earlierPlanShadows} earlier-rule (v1) shadows excluded`:''}.</p>
   {p.pairs>0&&<div className="overflow-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr>{['Plan','Trades','Win rate','Expectancy','Total R'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
    {([['Ledger (fixed levels)',p.fixed],[`Shadow ${p.plan}`,p.trail]] as const).map(([label,x])=><tr key={label} className="border-t border-slate-700"><td className="p-2">{label}</td><td className="p-2">{x.trades}</td><td className="p-2">{pct(x.winRate)}</td><td className={`p-2 ${x.avgR==null?'':x.avgR>0?'text-emerald-300':'text-red-300'}`}>{r(x.avgR)}</td><td className="p-2">{r(x.totalR)}</td></tr>)}
   </tbody></table>
   <p className="text-xs text-slate-400">Shadow final exits: {Object.entries(p.trailExitReasons).map(([k,v])=>`${k} ${v}`).join(' · ')}</p></div>}
  </div>)}
 </div>;
}
function CostSensitivity({rows}:{rows:CostSensitivityRow[]|undefined}){
 if(!rows?.length)return null;
 const priced=rows[0].trades;
 return <div className="space-y-1 rounded border border-amber-900 p-3">
  <h4 className="text-sm font-semibold">Cost sensitivity · same trades, higher per-side costs</h4>
  <p className="text-xs text-slate-400">The ledger charges 0.05% fee + 0.05% slippage per side (0.10% per side for OKX conversions). Retail Coinbase Advanced taker fees alone are roughly 0.4–0.6%. Each row recomputes every closed trade's R from its slippage-free quote at the stated fee-plus-slippage per side; 1R stays the planned risk at entry. Rows missing prices or the original stop are excluded, never estimated.{priced===0?' No closed trades carry the prices needed for this table.':''}</p>
  {priced>0&&<div className="overflow-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr>{['Cost per side','Trades','Excluded','Win rate','Expectancy','Total R'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
   {rows.map(x=><tr key={x.feePctPerSide} className="border-t border-slate-700"><td className="p-2">{x.feePctPerSide.toFixed(2)}%</td><td className="p-2">{x.trades}</td><td className="p-2">{x.excluded}</td><td className="p-2">{pct(x.winRate)}</td><td className={`p-2 ${x.avgR==null?'':x.avgR>0?'text-emerald-300':'text-red-300'}`}>{r(x.avgR)}</td><td className="p-2">{r(x.totalR)}</td></tr>)}
  </tbody></table></div>}
 </div>;
}
function Breakdown({stats,exitPlans,source}:{stats:Stats;exitPlans?:ExitPlanComparison[]|null;source:string}){
 return <>
  <p className={stats.sample==='USABLE'?'':'text-amber-300'}>{stats.sampleNote}</p>
  <p className="text-xs text-slate-400">Expectancy is the average result per trade in R (1R = the planned risk at entry), after estimated fees and slippage. Above +0R means the rules made money on paper. Source: {source} · computed {new Date(stats.checkedAt).toLocaleString()}. Trades opened before BTC trend tagging show NOT_RECORDED.</p>
  {stats.overall.trades>0&&<>
   <Table title="Overall" rows={[stats.overall]} />
   <Table title="By BTC daily trend at entry" rows={stats.byBtcRegime} />
   {stats.byBtc200?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By BTC 200-day regime at entry (bull-market hypothesis; evidence only, never blocks)" rows={stats.byBtc200} />}
   {stats.byRsRule?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By relative-strength leader rule at entry (top third vs BTC over 30 days and above own 50d; evidence only, never blocks)" rows={stats.byRsRule} />}
   {stats.byFlow?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By liquidation / taker-flow state at entry (flow-v1 shadow label: OKX, evidence only, never blocks)" rows={stats.byFlow} />}
   {stats.byJev?.some(g=>g.label!=='NOT_RECORDED')&&<>
    <Table title="By Jev shadow at entry (chase, flow agrees, btc headwind; each probability split at 0.50; evidence only, never blocks)" rows={stats.byJev} />
    <p className="text-xs text-slate-400">Each trade appears once per question. A trade with an unavailable Jev call is listed once as Jev unavailable; trades opened before the Jev shadow show NOT_RECORDED. The split at 0.50 is the neutral read of a yes/no probability, not a tuned threshold.</p>
   </>}
   {stats.byShadowFilter?.some(g=>g.label==='PASS'||g.label==='WOULD_SKIP')&&<>
    <Table title="Shadow filter: skip new entries when BTC daily trend is DOWN (evidence only; never blocks a trade)" rows={stats.byShadowFilter} />
    <p className="text-xs text-slate-400">PASS is what the account would have traded with the filter on; WOULD_SKIP trades were still taken for comparison. The filter is judged on these rows only; with few trades in either row the difference is noise. Trades without a recorded BTC trend show NOT_RECORDED and are never assigned a side.</p>
   </>}
   {stats.byFunding?.some(g=>g.label!=='NOT_RECORDED')&&<Table title="By OKX perpetual funding state at entry (evidence only)" rows={stats.byFunding} />}
   <Table title="By setup type" rows={stats.bySetup} />
   <Table title="By venue" rows={stats.byVenue} />
   <Table title="By exit reason" rows={stats.byExit} />
   <CostSensitivity rows={stats.costSensitivity} />
  </>}
  <ExitPlans plans={exitPlans} />
 </>;
}
export default function CryptoPaperStats({stats,exitPlans,title='Strategy statistics',source='closed trades in this paper ledger',openRiskUsd=null,openRiskCapPct=null,equity=null,clusterCapPct=null}:{stats:Stats|null|undefined;exitPlans?:ExitPlanComparison[]|null;title?:string;source?:string;openRiskUsd?:number|null;openRiskCapPct?:number|null;equity?:number|null;clusterCapPct?:number|null}){
 const withR=stats?.overall.withR??0;
 const noise=!stats||withR<30;
 const capUsd=(pct:number|null|undefined)=>equity!=null&&pct!=null?money(equity*pct/100):'—';
 return <section aria-label="Strategy statistics" className="space-y-2 rounded border border-emerald-800 p-3">
  {noise?<>
   <h3 className="font-semibold">Closed trades with R · SIMULATED</h3>
   <p>{stats?`${withR} of 30 closed trades with R`:'Closed trades with R could not be read. No figures are estimated.'}</p>
   <p>Open risk {openRiskUsd==null?'—':money(openRiskUsd)} · cap {openRiskCapPct??'—'}% ({capUsd(openRiskCapPct)})</p>
   <p>Cluster cap {clusterCapPct??'—'}% of equity ({capUsd(clusterCapPct)})</p>
   <details><summary className="cursor-pointer">sample is noise</summary>
    {stats?<Breakdown stats={stats} exitPlans={exitPlans} source={source} />:<p>Statistics unavailable: closed trades could not be read. No figures are estimated.</p>}
   </details>
  </>:stats?<>
   <h3 className="font-semibold">{title} · SIMULATED · {stats.sample.replace('_',' ')}</h3>
   <Breakdown stats={stats} exitPlans={exitPlans} source={source} />
  </>:<p>Statistics unavailable: closed trades could not be read. No figures are estimated.</p>}
 </section>;
}
