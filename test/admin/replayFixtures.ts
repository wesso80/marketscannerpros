import type {ExchangeBar} from '@/lib/admin/cryptoExchangeVolume';
export const H=3600000,F=4*H,D=86400000,M15=900000;
/** Deterministic hourly series: gentle uptrend; at each `spikes` 4h close a volume burst and a 20-bar breakout (`stretched`: a move past the chase limits). Close-time stamps. */
export function hourlySeries(start:number,hours:number,spikes:number[]=[],base=100,stretched:number[]=[]):ExchangeBar[]{
 const all=[...spikes,...stretched];
 const out:ExchangeBar[]=[];let p=base;
 for(let i=0;i<hours;i++){
  const t=start+(i+1)*H,o=p;
  const wave=Math.sin(i/7)*0.0015,boost=stretched.some(s=>t>s-F&&t<=s)?0.03:spikes.some(s=>t>s-F&&t<=s)?0.004:0;
  p=p*(1+0.0002+wave+boost);
  const c=p,h=Math.max(o,c)*1.003,l=Math.min(o,c)*0.997,v=all.some(s=>t>s-F&&t<=s)?4000:1000;
  out.push({t,o,h,l,c,v});
 }
 return out;
}
export function resample(hourly:ExchangeBar[],step:number):ExchangeBar[]{
 const g=new Map<number,ExchangeBar[]>();for(const b of hourly){const t=Math.ceil(b.t/step)*step;g.set(t,[...(g.get(t)??[]),b]);}
 return [...g].filter(([t,b])=>b.length===step/H&&b[0].t===t-step+H).map(([t,b])=>({t,o:b[0].o,h:Math.max(...b.map(x=>x.h)),l:Math.min(...b.map(x=>x.l)),c:b.at(-1)!.c,v:b.reduce((s,x)=>s+x.v,0)}));
}
/** 15m candles inside each hour (four equal steps from open to close). */
export function quarterHours(hourly:ExchangeBar[]):ExchangeBar[]{
 return hourly.flatMap(b=>[0,1,2,3].map(k=>{const o=b.o+(b.c-b.o)*k/4,c=b.o+(b.c-b.o)*(k+1)/4;return {t:b.t-H+(k+1)*M15,o,c,h:Math.max(o,c)*1.001,l:Math.min(o,c)*0.999,v:b.v/4};}));
}
