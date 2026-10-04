import {mean,type Point} from './types';
import {contiguous} from './symbol';
export function average(points:Point[],n:number){const a=points.slice(-n);return a.length===n&&contiguous(a)?mean(a.map(p=>p.value)):null;}
export function change(points:Point[],n:number){const a=points.slice(-n-1);return a.length===n+1&&contiguous(a)&&a[0].value>0?(a.at(-1)!.value/a[0].value-1)*100:null;}
export function regimeContext(global:Point[],btcCap:Point[],ethCap:Point[],btcPrice:Point[]){
 const b=new Map(btcCap.map(p=>[p.t,p.value])),e=new Map(ethCap.map(p=>[p.t,p.value]));
 const joined=global.filter(p=>p.value>0&&b.has(p.t)&&e.has(p.t)&&p.value>b.get(p.t)!+e.get(p.t)!);
 const total3=joined.map(p=>({t:p.t,value:p.value-b.get(p.t)!-e.get(p.t)!}));
 const dominance=global.filter(p=>p.value>0&&b.has(p.t)).map(p=>({t:p.t,value:b.get(p.t)!/p.value*100}));
 const dom20=average(dominance,20),dom20Prior=average(dominance.slice(0,-10),20),dom=dominance.at(-1)?.value??null;
 const btc50=average(btcPrice,50),btc200=average(btcPrice,200),btc=btcPrice.at(-1)?.value??null;
 return {total3,dominance,btcPrice,btc,btc50,btc200,dom,dom20,dom20Prior,dom10:dominance.at(-11)?.value??null,total:total3.at(-1)?.value??null,total50:average(total3,50),totalChange30:change(total3,30),rule6:btc!=null&&btc200!=null?btc>btc200:null,rule7:dom!=null&&dom20!=null&&dom20Prior!=null?dom<dom20&&dom20<dom20Prior:null};
}
