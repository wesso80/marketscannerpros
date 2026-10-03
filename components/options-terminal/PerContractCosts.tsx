import type {OptionsContract} from '@/types/optionsTerminal';
import {contractCosts,quoteSpreadPct} from '@/lib/options/contractCosts';
import {quoteDateLabel} from '@/lib/options/quoteQuality';
export default function PerContractCosts({contract,spot,quoteBasis='',asOfDate=''}:{contract:OptionsContract;spot:number;quoteBasis?:string;asOfDate?:string}) {
  const c=contractCosts(contract,spot);
  const money=(n:number|null)=>n==null?'Unavailable':`$${n.toFixed(2)}`;
  const pct=(n:number|null)=>n==null?'Unavailable':`${n.toFixed(2)}%`;
  return <div className="rounded-2xl border border-zinc-800 p-4"><h3 className="text-sm font-semibold">Per contract · long option · 100 shares</h3>
    <div className="mt-3 grid grid-cols-2 gap-3">
      <MiniStat label="Cost at ask" value={money(c.askCost)}/><MiniStat label="Cost at mid" value={money(c.midCost)}/>
      <MiniStat label="Max premium loss" value={money(c.maxLoss)}/><MiniStat label="Expiry breakeven" value={money(c.breakeven)}/>
      <MiniStat label="Breakeven from spot" value={pct(c.breakevenPct)}/><MiniStat label="Theta / day" value={money(c.thetaDollars)}/>
      <MiniStat label="Theta / ask / day" value={pct(c.thetaPct)}/><MiniStat label="Spread cost" value={money(c.spreadCost)}/>
      <MiniStat label="Spread / share" value={quoteSpreadPct(contract)==null?'No valid bid':`$${(contract.ask-contract.bid).toFixed(2)}`}/>
      <MiniStat label="Spread / mid" value={quoteSpreadPct(contract)==null?'No valid bid':`${quoteSpreadPct(contract)!.toFixed(2)}%`}/>
    </div>
    {quoteSpreadPct(contract)==null&&<p className="text-amber-300">No valid bid / two-sided quote</p>}
    <p className="mt-2 text-xs text-zinc-400">{quoteDateLabel(quoteBasis,asOfDate)}</p>
    <p className="mt-2 text-xs text-zinc-400">Excludes fees. Mid is indicative; theta is a model estimate. Expiry breakeven assumes exercise/settlement.</p></div>;
}

function MiniStat({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3"><div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>;}
