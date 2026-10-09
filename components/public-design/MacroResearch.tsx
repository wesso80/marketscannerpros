import Link from 'next/link';
import SignInLock from './SignInLock';
import styles from './EconomicResearch.module.css';

type Observation = {value:number|null;date?:string|null;history?:{date:string;value:number}[]};
type MacroReading = {timestamp:string;rates:{treasury3m?:Observation;treasury2y:Observation;treasury5y?:Observation;treasury10y:Observation;treasury30y?:Observation;fedFunds:Observation};inflation:{inflationRate:Observation};employment:{unemployment:Observation};growth:{realGDP:Observation & {unit:string}}};
const measured=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
// History dates are used only when the newest entry matches the displayed value.
function dateOf(o?:Observation){const latest=o?.history?.[0];return o?.date || (latest && latest.value===o?.value?latest.date:null) || 'Not supplied';}

export default function MacroResearch({data,loading,error,locked=false,retry,paid}:{data:MacroReading|null;loading:boolean;error:boolean;locked?:boolean;retry:()=>void;paid:boolean}){
 const maturities=[['3M',data?.rates.treasury3m],['2Y',data?.rates.treasury2y],['5Y',data?.rates.treasury5y],['10Y',data?.rates.treasury10y],['30Y',data?.rates.treasury30y]] as const;
 const values=maturities.flatMap(([,o])=>measured(o?.value)?[o.value]:[]);
 const min=Math.min(0,...values),max=Math.max(1,...values);const y=(value:number)=>200-(value-min)/(max-min)*160;
 const observations=[['10-year Treasury',data?.rates.treasury10y,'%'],['Inflation rate',data?.inflation.inflationRate,'%'],...(paid?[['Federal funds',data?.rates.fedFunds,'%'],['Unemployment',data?.employment.unemployment,'%'],['Real GDP',data?.growth.realGDP,data?.growth.realGDP.unit??'unit not supplied']]:[])] as [string,Observation|undefined,string][];
 return <article className={styles.page} data-economic-research="macro"><header className={styles.hero}><p className={styles.eyebrow}>The wider picture</p><h1>Macro Outlook</h1><p>Rates, inflation and the real economy. Start with what was measured and when.</p><Link href="/intelligence/global-m2">Explore Global M2 Intelligence</Link></header>
 {locked?<SignInLock heading="Sign in to see macro observations" detail="Rates, inflation and growth readings stay on your account. Nothing here is filled in while you are signed out." next="/tools/macro"/>:loading?<p role="status">Loading macro observations…</p>:error||!data?<div role="status" className={styles.panel}><h2>Macro observations unavailable</h2><p>No current reading can be confirmed.</p><button onClick={retry}>Try again</button></div>:<>
 <div className={styles.metrics}>{observations.map(([label,o,unit])=><section key={label}><h2>{label}</h2><strong>{measured(o?.value)?`${o.value.toLocaleString('en-US',{maximumFractionDigits:2})}${unit==='%'?'%':''}`:'Not available'}</strong>{unit!=='%'?<p>{unit}</p>:null}<p>Observation: {dateOf(o)}</p></section>)}</div>
 {paid?<section className={styles.panel} id="yieldcurve"><div className={styles.heading}><div><p className={styles.eyebrow}>Rates across maturities</p><h2>Treasury yield observations</h2></div><span>Percent · equal maturity spacing</span></div><p className={styles.note}>Each maturity retains its own observation date. Different dates are not a simultaneous yield curve; missing maturities are left blank.</p>
 {values.length?<svg role="img" aria-label="Treasury yields by maturity, with individual observation dates listed below" viewBox="0 0 600 245" className={styles.chart}>{[0,1,2,3,4].map(i=>{const v=min+(max-min)*i/4;return <g key={i}><line x1="50" x2="565" y1={y(v)} y2={y(v)} stroke="#30444c"/><text x="4" y={y(v)+4} fill="#a8b9bf" fontSize="12">{v.toFixed(1)}%</text></g>;})}{maturities.map(([label,o],i)=><g key={label}>{measured(o?.value)?<><line x1={70+i*115} x2={70+i*115} y1={y(0)} y2={y(o.value)} stroke="#a5e8cf" strokeWidth="2"/><circle cx={70+i*115} cy={y(o.value)} r="5" fill="#a5e8cf"/></>:null}<text x={70+i*115} y="230" textAnchor="middle" fill="#a8b9bf" fontSize="12">{label}</text></g>)}</svg>:<p>Yield observations are not available.</p>}
 <div className={styles.observations}>{maturities.map(([label,o])=><div key={label}><strong>{label}</strong><span>{measured(o?.value)?`${o.value.toFixed(2)}%`:'Not available'}</span><small>{dateOf(o)}</small></div>)}</div></section>:<p className={styles.note}>Your current access includes the Treasury and inflation summary. <Link href="/pricing">Review Pro research access</Link></p>}
 <section className={styles.explanation}><h2>Read the dates before the narrative.</h2><p>Rates, inflation, employment and GDP follow different release schedules. An observation date describes the measurement; it does not establish its publication time. Publication timestamps are not supplied in this response.</p><p>Source: existing economic-indicators feed. Response assembled: {data.timestamp}. This is not the observation date.</p><Link href="/learn">Learn how to read economic evidence</Link></section>
 </>}
 </article>;
}
