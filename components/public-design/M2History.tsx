"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useUserTier} from '@/lib/useUserTier';
import {isPaidTier} from '@/lib/tiers';
import {M2_HISTORY_BLOCS,type PublicM2History} from '@/lib/research/publicM2History';
import styles from './EconomicResearch.module.css';
const money=(n:number)=>`$${(n/1e12).toFixed(2)}T`;
export default function M2History(){
 const {tier,isAdmin,isLoading}=useUserTier();
 const paid=isAdmin||isPaidTier(tier);
 const [open,setOpen]=useState(false),[bloc,setBloc]=useState('US'),[months,setMonths]=useState('12');
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<{key:string;data:PublicM2History|null;error:string|null}>({key:'',data:null,error:null});
 const key=bloc+':'+months;
 useEffect(()=>{
  if(!open||!paid)return;
  const controller=new AbortController();let active=true;
  setState({key,data:null,error:null});
  const timer=setTimeout(()=>controller.abort(),30000);
  fetch(`/api/research/m2-history?bloc=${bloc}&months=${months}`,{credentials:'include',cache:'no-store',signal:controller.signal})
   .then(async r=>{const b=await r.json();if(!r.ok)throw Error(r.status===403?'Pro access could not be verified. Check your account.':'Stored history could not be loaded.');return b.data as PublicM2History;})
   .then(data=>{if(active)setState({key,data,error:null});})
   .catch(e=>{if(active)setState({key,data:null,error:e.name==='AbortError'?'History request timed out. Please retry.':e.message});})
   .finally(()=>clearTimeout(timer));
  return ()=>{active=false;clearTimeout(timer);controller.abort();};
 },[open,paid,bloc,months,key,attempt]);
 const data=state.key===key?state.data:null,error=state.key===key?state.error:null;
 return <section className={styles.page} aria-label="M2 historical observations"><div className={styles.panel}>
  <p className={styles.eyebrow}>Pro · stored observations</p><h2>M2 through time</h2>
  <p>Explore one economic bloc at a time. Missing months remain gaps; changes in bloc coverage are not presented as a global growth series.</p>
  {isLoading?<p role="status">Checking access…</p>:!paid?<><p>Your current M2 summary, sources and dates remain available on Free.</p><Link href="/pricing">Explore Pro history access</Link></>:<>
   <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Close history':'Open M2 history'}</button>
   {open&&<>
    <div className={styles.historyControls}><label>Economic bloc<select aria-label="Economic bloc" value={bloc} onChange={e=>setBloc(e.target.value)}>{M2_HISTORY_BLOCS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>History window<select aria-label="History window" value={months} onChange={e=>setMonths(e.target.value)}><option value="12">12 months</option><option value="36">36 months</option><option value="60">60 months</option></select></label></div>
    {error?<div role="alert"><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>Retry history</button></div>:!data?<p role="status">Loading stored observations…</p>:<>
      <h3>{data.name} · {data.from} to {data.to}</h3><p>{data.observedMonths} observed months · {data.missingMonths} missing or invalid months</p>
      {data.observedMonths?<HistoryChart data={data}/>:<p>No stored observations for this window.</p>}
      <p>{data.basis}</p><p>{data.revisionNote}</p><p>Read from storage: {data.readAt}. This is not an observation or publication date.</p>
      <details><summary>Observation dates and sources</summary><div className={styles.historyTable}><table><caption>Monthly stored observations for {data.name}</caption><thead><tr><th>Month</th><th>USD amount</th><th>Source metadata</th><th>Stored at</th></tr></thead><tbody>{data.points.map(p=><tr key={p.month}><th scope="row">{p.month}</th><td>{p.usdM2===null?'Not available':money(p.usdM2)}</td><td>{p.source}</td><td>{p.storedAt??'Not supplied'}</td></tr>)}</tbody></table></div></details>
    </>}
   </>}
  </>}
 </div></section>;
}
function HistoryChart({data}:{data:PublicM2History}){
 const values=data.points.flatMap(p=>p.usdM2===null?[]:[p.usdM2]);
 const low=Math.min(...values),high=Math.max(...values),span=high-low||Math.max(high*.05,1);
 const x=(i:number)=>80+i*600/Math.max(1,data.points.length-1),y=(n:number)=>220-(n-low)/span*170;
 let previous=false;const path=data.points.map((p,i)=>{if(p.usdM2===null){previous=false;return '';}const segment=`${previous?'L':'M'}${x(i)},${y(p.usdM2)}`;previous=true;return segment;}).join(' ');
 return <svg viewBox="0 0 720 270" className={styles.chart} role="img" aria-label={`${data.name} stored M2 history, gaps are not connected`}>
  <text x="5" y="50" fill="#a8b9bf" fontSize="13">{money(high)}</text><text x="5" y="220" fill="#a8b9bf" fontSize="13">{money(low)}</text>
  <path d={path} fill="none" stroke="#a5e8cf" strokeWidth="2"/>
  {data.points.map((p,i)=>p.usdM2===null?null:<circle key={p.month} cx={x(i)} cy={y(p.usdM2)} r="3" fill="#a5e8cf"><title>{p.month}: {money(p.usdM2)}</title></circle>)}
  <text x="80" y="255" fill="#a8b9bf" fontSize="13">{data.from}</text><text x="680" y="255" textAnchor="end" fill="#a8b9bf" fontSize="13">{data.to}</text>
 </svg>;
}
