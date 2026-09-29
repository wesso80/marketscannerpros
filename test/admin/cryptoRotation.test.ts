import {it,expect} from 'vitest';
import {simulateRotation,simulateHold,simulateEqualWeight,rankUniverse,metrics,tradeStats,ROTATION,type RotationSeries,type RotationData} from '@/lib/admin/cryptoRotation';
const D=86400000,N=500,t0=Date.UTC(2021,6,1);
const days=Array.from({length:N},(_,i)=>t0+(i+1)*D);
const start=days[300];
// Deterministic wiggle so volatility is never zero.
const series=(product:string,price:(i:number)=>number|null,vol=5e6):RotationSeries=>{
 const c=days.map((_,i)=>{const p=price(i);return p==null?null:p*(1+.01*Math.sin(i*1.7+product.length));});
 return {product,base:product.split('-')[0],status:'online',o:c.map((x,i)=>x==null?null:(c[i-1]??x)),c,usdVol:c.map(x=>x==null?null:vol)};
};
const coins=Array.from({length:14},(_,k)=>series(`C${k}-USD`,i=>100*(1+(k-6)/1500)**i));
const btc=series('BTC-USD',i=>100*1.001**i);
const data:RotationData={days,btc,coins};
it('ranks by volatility-adjusted momentum and requires listing history and USD volume',()=>{
 const r=rankUniverse(coins,400);
 expect(r[0].product).toBe('C13-USD');expect(r.at(-1)!.product).toBe('C0-USD');
 const thin=[...coins,series('THIN-USD',i=>100*1.01**i,1e5),series('NEW-USD',i=>i<350?null:100*1.01**i)];
 expect(rankUniverse(thin,400).map(x=>x.product)).not.toEqual(expect.arrayContaining(['THIN-USD','NEW-USD']));
});
it('holds at most six leaders, sizes each at most 1/6, and fills at the next open after a Monday close',()=>{
 const run=simulateRotation(data,.003,true,start);
 const firstBuys=run.trades.filter(t=>t.entryDecision===run.trades[0].entryDecision);
 expect(firstBuys.length).toBeLessThanOrEqual(ROTATION.holdings);
 expect(firstBuys.map(t=>t.product)).toEqual(expect.arrayContaining(['C13-USD','C12-USD']));
 expect(new Date(Date.parse(firstBuys[0].entryDecision)-D).getUTCDay()).toBe(1);
 expect(Date.parse(firstBuys[0].entryAt)).toBe(Date.parse(firstBuys[0].entryDecision));
 for(const t of run.trades)expect(t.weight).toBeLessThanOrEqual(1/6+1e-12);
 expect(Math.max(...run.equity.map(p=>p.exposure))).toBeLessThanOrEqual(1+1e-9);
 expect(run.trades.every(t=>!['C0-USD','C1-USD','C2-USD'].includes(t.product))).toBe(true);
});
it('moves to cash when BTC closes below its 200-day average and never buys while the regime is off',()=>{
 const crash=series('BTC-USD',i=>i<380?100*1.001**i:60);
 const run=simulateRotation({...data,btc:crash},.003,true,start);
 const after=run.equity.filter(p=>p.t>days[390]);
 expect(after.every(p=>p.exposure===0)).toBe(true);
 expect(run.trades.some(t=>t.reason==='REGIME_OFF')).toBe(true);
 expect(run.trades.every(t=>Date.parse(t.entryAt)<days[382])).toBe(true);
 // Without the switch, the same data stays invested.
 expect(simulateRotation({...data,btc:crash},.003,false,start).equity.at(-1)!.exposure).toBeGreaterThan(0);
});
it('closes a held coin whose candles stop at its last close and flags DATA_ENDED instead of inventing prices',()=>{
 const dying=coins.map((s,k)=>k===13?series('C13-USD',i=>i>340?null:100*1.009**i):s);
 const run=simulateRotation({...data,coins:dying},.003,true,start);
 const t=run.trades.find(x=>x.product==='C13-USD'&&x.reason==='DATA_ENDED');
 expect(t).toMatchObject({marked:true});expect(run.dataEndedExits).toBeGreaterThan(0);
});
it('costs reduce returns; benchmarks and metrics are computed on the same grid',()=>{
 const cheap=simulateRotation(data,.001,true,start).equity.at(-1)!.equity,dear=simulateRotation(data,.006,true,start).equity.at(-1)!.equity;
 expect(cheap).toBeGreaterThan(dear);
 const hold=simulateHold(btc,days,.003,start),ew=simulateEqualWeight(data,.003,start);
 expect(hold[0].t).toBe(start);expect(ew.length).toBe(hold.length);
 const m=metrics(hold,start,Infinity)!;
 expect(m.totalReturn).toBeCloseTo(hold.at(-1)!.equity/hold[0].equity-1,6);
 expect(m.maxDrawdown).toBeLessThanOrEqual(0);
 const s=tradeStats(simulateRotation(data,.003,true,start).trades,start,Infinity);
 expect(s.trades).toBeGreaterThan(0);expect(s.winRate).not.toBeNull();
});
