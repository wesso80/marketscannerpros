import {it,expect} from 'vitest';
import {assessBtcRegime} from '@/lib/admin/cryptoBtcRegime';
const D=86400000,now=Date.UTC(2026,8,29,6),end=Math.floor(now/D)*D;
const bars=(close:(i:number)=>number,n=60)=>Array.from({length:n},(_,i)=>{const c=close(i);return {t:end-(n-1-i)*D,o:c,h:c,l:c,c,v:1};});
it('labels a rising market UP and a falling market DOWN from completed daily closes',()=>{
 expect(assessBtcRegime(bars(i=>50000+i*100),now)).toMatchObject({state:'UP',asOf:new Date(end).toISOString(),source:'coinbase:BTC-USD 1d'});
 expect(assessBtcRegime(bars(i=>80000-i*100),now).state).toBe('DOWN');
});
it('labels disagreement MIXED rather than forcing a direction',()=>{
 // Long uptrend, then a sharp final drop below the 50-day average while the 20-day remains above it.
 expect(assessBtcRegime(bars(i=>i===59?40000:50000+i*100),now).state).toBe('MIXED');
});
it('reports UNAVAILABLE for short or stale history instead of guessing',()=>{
 expect(assessBtcRegime(bars(i=>50000+i,40),now).state).toBe('UNAVAILABLE');
 expect(assessBtcRegime(bars(i=>50000+i).slice(0,-1),now)).toMatchObject({state:'UNAVAILABLE',reason:expect.stringContaining('missing')});
});
