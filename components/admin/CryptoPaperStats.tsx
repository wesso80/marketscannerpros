'use client';
import type {CryptoPaperStats as Stats,CryptoStatsGroup} from '@/lib/admin/cryptoPaperStats';
const r=(n:number|null)=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}R`;
const pct=(n:number|null)=>n==null?'—':`${(n*100).toFixed(0)}%`;
const money=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});
function Table({title,rows}:{title:string;rows:CryptoStatsGroup[]}){
 if(!rows.length)return null;
 return <div className="overflow-auto"><h4 className="mt-2 text-sm font-semibold">{title}</h4><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{['Group','Trades','Win rate','Expectancy','Avg win','Avg loss','Profit factor','Net P&L','Avg hold'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead>
  <tbody>{rows.map(g=><tr key={g.label} className="border-t border-slate-700"><td className="p-2">{g.label}</td><td className="p-2">{g.trades}{g.trades<10?<span className="text-amber-300"> · few</span>:null}</td><td className="p-2">{pct(g.winRate)}</td><td className={`p-2 ${g.avgR==null?'':g.avgR>0?'text-emerald-300':'text-red-300'}`}>{r(g.avgR)}</td><td className="p-2">{r(g.avgWinR)}</td><td className="p-2">{r(g.avgLossR)}</td><td className="p-2">{g.profitFactor?.toFixed(2)??'—'}</td><td className="p-2">{money(g.netPnl)}</td><td className="p-2">{g.avgHoldHours==null?'—':`${g.avgHoldHours.toFixed(1)}h`}</td></tr>)}</tbody></table></div>;
}
export default function CryptoPaperStats({stats}:{stats:Stats|null|undefined}){
 return <section aria-label="Strategy statistics" className="space-y-2 rounded border border-emerald-800 p-3">
  <h3 className="font-semibold">Strategy statistics · SIMULATED · {stats?.sample.replace('_',' ')??'UNAVAILABLE'}</h3>
  {!stats?<p>Statistics unavailable: closed trades could not be read. No figures are estimated.</p>:<>
   <p className={stats.sample==='USABLE'?'':'text-amber-300'}>{stats.sampleNote}</p>
   <p className="text-xs text-slate-400">Expectancy is the average result per trade in R (1R = the planned risk at entry), after estimated fees and slippage. Above +0R means the rules made money on paper. Source: closed trades in this paper ledger · computed {new Date(stats.checkedAt).toLocaleString()}. Trades opened before BTC trend tagging show NOT_RECORDED.</p>
   {stats.overall.trades>0&&<>
    <Table title="Overall" rows={[stats.overall]} />
    <Table title="By BTC daily trend at entry" rows={stats.byBtcRegime} />
    <Table title="By setup type" rows={stats.bySetup} />
    <Table title="By venue" rows={stats.byVenue} />
    <Table title="By exit reason" rows={stats.byExit} />
   </>}
  </>}
 </section>;
}
