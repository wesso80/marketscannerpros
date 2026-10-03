import { expect, it } from 'vitest';
import { calculateAllIndicators, ema, atr } from '@/lib/indicators';
it.each([0.09,0.000008])('retains price-scaled precision at %s',scale=>{
 const bars=Array.from({length:700},(_,i)=>({timestamp:new Date(Date.UTC(2024,0,i+1)).toISOString(),open:scale*(1+i/1000),close:scale*(1+i/1000+Math.sin(i/10)*0.01),high:scale*(1.03+i/1000),low:scale*(0.97+i/1000),volume:100+i}));
 const r=calculateAllIndicators(bars);
 expect(r.ema20).not.toBe(r.ema50);
 expect(r.ema20).toBeCloseTo(ema(bars.map(b=>b.close),20)!,12);
 expect(r.atr14).toBeCloseTo(atr(bars,14)!,12);
 expect(r.macdLine).not.toBe(0);
 const large=calculateAllIndicators(bars.map(b=>({...b,open:b.open/scale,high:b.high/scale,low:b.low/scale,close:b.close/scale})));
 expect(r.macdLine!/scale).toBeCloseTo(large.macdLine!,9);
});
