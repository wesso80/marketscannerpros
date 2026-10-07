import StatCard from '@/components/visual/StatCard';
import { marketText } from '@/lib/marketsPresentation';
export function MarketMetrics({items}:{items:{label:string;value:string|number|null|undefined}[]}) {
 const available=items.filter(item=>marketText(item.value)!=='Not collected');
 const missing=items.filter(item=>marketText(item.value)==='Not collected');
 return <><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{available.map(item=><StatCard key={item.label} label={item.label} value={marketText(item.value)}/>)}</div>{missing.length>0&&<p className="text-xs text-slate-400">Not available yet: {missing.map(item=>item.label).join(', ')}</p>}</>;
}
export function MarketSparkline({values,title}:{values:number[];title:string}) {
 const observed=values.filter(Number.isFinite);
 if(observed.length<2)return <p className="text-xs text-amber-300">Price history has not been collected for a chart.</p>;
 const low=Math.min(...observed),high=Math.max(...observed),span=high-low||1;
 const points=observed.map((v,i)=>`${i/(observed.length-1)*600},${110-(v-low)/span*100}`).join(' ');
 return <figure data-market-chart className="rounded-lg border border-[var(--msp-border)] p-3"><figcaption className="text-xs text-slate-400">{title} · {observed.length} recorded observations</figcaption><svg role="img" aria-label={title} viewBox="0 0 600 120" className="h-28 w-full" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-slate-300"/></svg></figure>;
}
