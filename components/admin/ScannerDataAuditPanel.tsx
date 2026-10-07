'use client';
import {useState} from 'react';
import type {ScannerAuditReport} from '@/lib/admin/scannerDataAudit';
const box={marginTop:'1.5rem',padding:'0.85rem 1rem',background:'rgba(13,22,38,0.7)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,fontSize:12,color:'#CBD5E1'} as const;
const day=(s:string|null)=>s?s.slice(0,10):'—';
/** Read-only. Runs only when asked (the query scans every stored daily bar); results are cached for an hour. */
export default function ScannerDataAuditPanel(){
 const [r,setR]=useState<ScannerAuditReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(refresh=false){
  setBusy(true);setError('');
  try{const secret=typeof window==='undefined'?'':sessionStorage.getItem('admin_secret');
   const res=await fetch(`/api/admin/scanner-data-audit${refresh?'?refresh=1':''}`,{cache:'no-store',headers:secret?{Authorization:`Bearer ${secret}`}:{}});
   const j=await res.json().catch(()=>({}));if(!res.ok||!j.ok)throw Error(j.error||'Audit unavailable');setR(j);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section aria-label="Scanner data audit" style={box}>
  <h2 style={{fontSize:14,fontWeight:700,color:'#E5E7EB',margin:'0 0 0.3rem'}}>Scanner data audit · read-only</h2>
  <p style={{color:'#94A3B8',margin:'0 0 0.6rem'}}>How much stored daily history the scanner&apos;s setups could be tested on, and where it has gaps. Reads the database only; nothing is changed.</p>
  <button disabled={busy} onClick={()=>void load(!!r)} style={{border:'1px solid #334155',borderRadius:6,padding:'4px 10px',color:'#E5E7EB',background:'#0f172a'}}>{busy?'Running…':r?'Run again (fresh)':'Run audit'}</button>
  {error&&<p role="alert" style={{color:'#FBBF24'}}>{error}</p>}
  {r&&<div style={{marginTop:'0.6rem'}}>
   <p style={{color:'#94A3B8'}}>Source: {r.source} · generated {new Date(r.generatedAt).toLocaleString()}{r.cached?' (cached)':''} · canonical calibration {r.calibration.version} ({r.calibration.generated})</p>
   <ul style={{paddingLeft:18}}>{r.findings.map(f=><li key={f}>{f}</li>)}</ul>
   <div style={{overflowX:'auto'}}><table style={{minWidth:760,textAlign:'left'}}><thead><tr>{['Asset','Symbols','Daily bars','Earliest','Latest','Median years','≥250 / 500 / 1000 / 2000 bars','Years for 25 / 100 / 250 symbols','Stale (>5d)','Dormant (>30d)','Gappy','Mostly zero volume'].map(h=><th key={h} style={{padding:4}}>{h}</th>)}</tr></thead><tbody>
    {r.assets.map(a=><tr key={a.asset} style={{borderTop:'1px solid #1e293b'}}><td style={{padding:4}}>{a.asset}</td><td style={{padding:4}}>{a.symbols}</td><td style={{padding:4}}>{a.bars.toLocaleString()}</td><td style={{padding:4}}>{day(a.earliest)}</td><td style={{padding:4}}>{day(a.latest)}</td><td style={{padding:4}}>{a.medianYears??'—'}</td>
     <td style={{padding:4}}>{Object.values(a.depth).join(' / ')}</td><td style={{padding:4}}>{['25','100','250'].map(k=>a.yearsFor[k]??'—').join(' / ')}</td><td style={{padding:4}}>{a.stale}</td><td style={{padding:4}}>{a.dormant}</td><td style={{padding:4}}>{a.incomplete}</td><td style={{padding:4}}>{a.zeroVolumeSymbols}</td></tr>)}
   </tbody></table></div>
   <p style={{color:'#94A3B8'}}>Other stored timeframes: {r.timeframes.map(t=>`${t.timeframe} ${t.rows.toLocaleString()} rows / ${t.symbols} symbols`).join(' · ')||'none'}</p>
   <p style={{color:'#94A3B8'}}>Enabled scanner symbols: {r.universe.map(u=>`${u.asset} ${u.enabled} (${u.withoutBars} without daily bars)`).join(' · ')||'none'}</p>
   <p style={{color:'#94A3B8'}}>Crypto history (CoinGecko): {'unavailable' in r.cryptoHistory?r.cryptoHistory.unavailable:`${r.cryptoHistory.coins.toLocaleString()} coins · ${r.cryptoHistory.days.toLocaleString()} days · ${r.cryptoHistory.first} → ${r.cryptoHistory.last}`}</p>
  </div>}
 </section>;
}
