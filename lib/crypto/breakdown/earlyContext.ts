import {relativeStrength} from '@/lib/goldenEgg/networkContext';
import {mean,finite,type DailyBar,type Point} from './types';
import {contiguous} from './symbol';
import {highestClose} from './levels';
export function earlyContext(bars:DailyBar[],history:Point[],btc:Point[],total3:Point[]){
 let baseAge=0;for(let n=1;n<=bars.length;n++){const a=bars.slice(-n);if(!contiguous(a)||a.some(b=>!finite(b.low)||b.low<=0))break;const low=Math.min(...a.map(b=>b.low!));if((Math.max(...a.map(b=>b.close))/low-1)*100>35)break;baseAge=n;}
 const vol=(n:number)=>{const a=bars.slice(-n);return a.length===n&&contiguous(a)&&a.every(b=>finite(b.volume)&&b.volume>0)?mean(a.map(b=>b.volume!)):null;};
 const volume7=vol(7),volume30=vol(30),volume90=vol(90);
 const own=bars.map(b=>({t:b.t,value:b.close}));
 const relative=[['BTC',btc],['TOTAL3',total3]].flatMap(([name,bench])=>[7,30,90].map(days=>{
  const map=new Map((bench as Point[]).map(p=>[p.t,p.value])),a=own.slice(-days-1);
  const ok=a.length===days+1&&contiguous(a)&&a.every(p=>map.has(p.t));
  const r=ok?relativeStrength(a.map(p=>p.value),a.map(p=>map.get(p.t)!),'BTC',days):null;
  return {benchmark:name as string,days,excessPct:r?r.symbolPct-r.benchmarkPct:null,label:r?(r.label==='outperforming'?'ahead':r.label==='underperforming'?'behind':'in line'):'unavailable'};
 }));
 const jan2023=history.find(p=>p.t.slice(0,10)==='2023-01-01')??null;
 const since=history.filter(p=>p.t>='2023-01-01');const highSince=since.reduce<Point|null>((a,b)=>!a||b.value>a.value?b:a,null);
 const last=bars.at(-1)?.close;
 return {baseAge,capped:baseAge===bars.length&&baseAge>0,volume7,volume30,volume90,ratio7to30:volume7!=null&&volume30?volume7/volume30:null,ratio30to90:volume30!=null&&volume90?volume30/volume90:null,high90:highestClose(bars,90),high365:history.length>=365&&contiguous(history.slice(-365))?Math.max(...history.slice(-365).map(p=>p.value)):highestClose(bars,365),jan2023,changeSince2023:jan2023&&last?(last/jan2023.value-1)*100:null,highSince,relative};
}
