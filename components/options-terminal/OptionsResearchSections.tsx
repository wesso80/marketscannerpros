'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
const SetupIdeas=dynamic(()=>import('./OptionsConfluenceScanner'),{ssr:false,loading:()=> <p>Loading setup research…</p>});
const FlowEstimate=dynamic(()=>import('./OptionsFlowView'),{ssr:false,loading:()=> <p>Loading flow research…</p>});
export default function OptionsResearchSections({symbol,expiry}:{symbol:string;expiry:string}){
 const [setupOpen,setSetupOpen]=useState(false),[flowOpen,setFlowOpen]=useState(false);
 return <div className="space-y-3" key={`${symbol}:${expiry}`}>
  <p className="text-xs text-zinc-400">Research sections use {symbol} · {expiry||'default listed expiry'}. Run each analysis explicitly after opening.</p>
  <details onToggle={e=>setSetupOpen(e.currentTarget.open)} className="rounded border border-zinc-800 p-4"><summary className="cursor-pointer font-bold">Setup ideas</summary>{setupOpen&&expiry&&<SetupIdeas key={`${symbol}:${expiry}`} embeddedInTerminal symbol={symbol} expiry={expiry}/>}</details>
  <details onToggle={e=>setFlowOpen(e.currentTarget.open)} className="rounded border border-zinc-800 p-4"><summary className="cursor-pointer font-bold">Flow estimate</summary>{flowOpen&&expiry&&<FlowEstimate key={`${symbol}:${expiry}`} embeddedInTerminal symbol={symbol} expiry={expiry}/>}</details>
 </div>;
}
