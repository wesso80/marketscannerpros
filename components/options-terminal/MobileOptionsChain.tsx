'use client';
import { useEffect, useRef, useState } from 'react';
import type { StrikeGroup } from '@/types/optionsTerminal';
import { atmStrike } from '@/lib/options/atmStrike';

export function initialContractSelection(groups: StrikeGroup[], visible: StrikeGroup[], spot: number) {
  const strike = atmStrike(groups.map(row => row.strike), spot);
  const row = visible.find(row => row.strike === strike);
  return row?.call ? { side: 'CALL' as const, strike: row.strike }
    : row?.put ? { side: 'PUT' as const, strike: row.strike } : null;
}
const count = (n?: number) => n == null ? '·' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const number = (n?: number) => n == null || !Number.isFinite(n) ? '·' : n.toFixed(2);

export default function MobileOptionsChain({ rows, selected, onSelect }: {
  rows: StrikeGroup[];
  selected: { side: 'CALL' | 'PUT'; strike: number } | null;
  onSelect: (selection: { side: 'CALL' | 'PUT'; strike: number }) => void;
}) {
  const [side, setSide] = useState<'CALL' | 'PUT'>('CALL');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>('[data-atm="true"]');
    if (row && box.current) box.current.scrollTop = Math.max(0, row.offsetTop - box.current.clientHeight / 2);
  }, [rows]);
  return <div className="sm:hidden" data-mobile-options-chain>
    <div className="mb-2 flex gap-2" aria-label="Contract side" role="group">
      {(['CALL', 'PUT'] as const).map(value => <button key={value} type="button" aria-pressed={side === value} onClick={() => setSide(value)} className="min-h-10 rounded border border-zinc-700 px-4 text-sm">{value === 'CALL' ? 'Calls' : 'Puts'}</button>)}
    </div>
    <div ref={box} className="relative max-h-64 max-w-full overflow-x-hidden overflow-y-auto rounded border border-zinc-800" data-chain-scroll>
      <table className="w-full table-fixed border-collapse text-[10px] tabular-nums" aria-label={`${side === 'CALL' ? 'Calls' : 'Puts'} option chain`}>
        <colgroup>{[18,14,14,10,15,15,14].map((width,i)=><col key={i} style={{width:`${width}%`}}/>)}</colgroup>
        <thead className="sticky top-0 z-20 bg-zinc-900"><tr>{['Strike','Bid','Ask','Vol','OI','IV','Delta'].map((label,i)=><th key={label} scope="col" className={`h-10 overflow-hidden whitespace-nowrap px-0.5 text-center font-medium ${i===0?'sticky left-0 z-30 bg-zinc-900':''}`}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const contract = side === 'CALL' ? row.call : row.put;
          const active = selected?.side === side && selected.strike === row.strike;
          return <tr key={row.strike} data-atm={row.isAtm} className={`border-t border-zinc-800 ${active?'bg-emerald-500/10':''}`}>
            <th scope="row" className="sticky left-0 z-10 bg-zinc-950 px-0.5 font-medium"><span>{row.strike.toLocaleString('en-US',{maximumFractionDigits:2})}</span>{row.isAtm&&<span className="block text-[9px] text-emerald-300">ATM</span>}</th>
            {(['bid','ask'] as const).map(key=><td key={key} className="px-0.5 text-center"><button type="button" disabled={!contract} className="min-h-10 w-full" aria-label={`${side === 'CALL'?'Call':'Put'} ${row.strike} ${key}`} onClick={()=>onSelect({side,strike:row.strike})}><span className="whitespace-nowrap text-[11px]">{contract&&contract[key]>0?number(contract[key]):'·'}</span></button></td>)}
            <td className="px-0.5 text-center" title={contract?.volume?.toLocaleString()}>{count(contract?.volume)}</td>
            <td className="px-0.5 text-center" title={contract?.openInterest?.toLocaleString()}>{count(contract?.openInterest)}</td>
            <td className="px-0.5 text-center">{contract&&contract.iv>0?`${(contract.iv*100).toFixed(1)}%`:'·'}</td>
            <td className="px-0.5 text-center">{number(contract?.delta)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-1 text-[10px] text-zinc-400">· Not quoted or not collected. Select bid or ask to inspect.</p>
  </div>;
}
