import {describe,it,expect} from 'vitest';
import {reviewCryptoMomentum,completedFourHourBars,reviewStatusLabel} from '@/lib/admin/cryptoMomentum';
import type {DiscoveryRow} from '@/lib/admin/cryptoDiscovery';
const H=3600000,D=24*H,now=Date.parse('2026-09-28T02:30:00Z');
function fixture(){
  const hourly=Array.from({length:120},(_,i)=>{const c=100+i*.1;return [Math.floor(now/H)*H-(119-i)*H,c-.05,c+.2,c-.2,c];});
  const daily=Array.from({length:40},(_,i)=>{const c=70+i;return [Math.floor(now/D)*D-(39-i)*D,c-.5,c+1,c-1,c];});
  hourly[119]=[hourly[119][0],111.85,112.15,111.75,112.08];
  const coin={id:'quant-network',symbol:'QNT',price:112.08,stage:'MOMENTUM',observedAt:new Date(now-60000).toISOString()} as DiscoveryRow;
  return {hourly,daily,coin};
}
describe('completed-candle momentum research',()=>{
  it('finds a confirmed breakout without weekly/monthly history and labels target as model',()=>{
    const f=fixture(),r=reviewCryptoMomentum(f.coin,f.hourly,f.daily,now);
    expect(r.status).toBe('BREAKOUT_CONFIRMED');expect(r.mode).toBe('RESEARCH_ONLY');
    expect(r.levels?.targetBasis).toBe('MODEL_2R');expect(r.levels?.currentRewardRisk).toBeCloseTo(2);
    expect(r.evidence.volumeConfirmation).toBe('UNAVAILABLE');
  });
  it('does not use an unfinished future candle to change a signal',()=>{
    const f=fixture(),base=reviewCryptoMomentum(f.coin,f.hourly,f.daily,now);
    const r=reviewCryptoMomentum(f.coin,[...f.hourly,[Math.ceil(now/H)*H,200,300,150,290]],f.daily,now);
    expect(r).toEqual(base);
  });
  it('does not chase a price that has run past its entry limit',()=>{const f=fixture();f.coin.price=120;expect(reviewCryptoMomentum(f.coin,f.hourly,f.daily,now).status).toBe('EXTENDED');});
  it('blocks a stale quote',()=>{const f=fixture();f.coin.observedAt=new Date(now-H).toISOString();expect(reviewCryptoMomentum(f.coin,f.hourly,f.daily,now).status).toBe('BLOCKED');});
  it('blocks malformed history rather than silently deleting bad bars',()=>{const f=fixture();f.hourly[5][2]=1;expect(reviewCryptoMomentum(f.coin,f.hourly,f.daily,now).reasons[0]).toMatch(/geometry/);});
  it('blocks gaps and conflicting duplicate close times',()=>{const f=fixture();const hole=f.hourly.filter((_,i)=>i!==50);expect(reviewCryptoMomentum(f.coin,hole,f.daily,now).reasons[0]).toMatch(/missing/);
    expect(reviewCryptoMomentum(f.coin,[...f.hourly,[...f.hourly[5].slice(0,4),101]],f.daily,now).status).toBe('BLOCKED');});
  it('ignores exact duplicate bars',()=>{const f=fixture();expect(reviewCryptoMomentum(f.coin,[...f.hourly,f.hourly[0]],f.daily,now)).toEqual(reviewCryptoMomentum(f.coin,f.hourly,f.daily,now));});
  it('requires complete UTC four-hour groups',()=>{
    const end=Math.floor(now/(4*H))*4*H,b=[1,2,3,4].map(i=>({t:end-4*H+i*H,o:1,h:3,l:0.5,c:2}));
    expect(completedFourHourBars(b,now)).toHaveLength(1);expect(completedFourHourBars(b.slice(1),now)).toHaveLength(0);
  });
  it('does not force a trade when higher-timeframe trend disagrees',()=>{const f=fixture();f.daily=f.daily.map(b=>[b[0],200-b[1],200-b[3],200-b[2],200-b[4]]);expect(reviewCryptoMomentum(f.coin,f.hourly,f.daily,now).status).toBe('WATCH');});
  it('does not resurrect a breakout after price falls through its stop',()=>{const f=fixture();f.coin.price=100;expect(reviewCryptoMomentum(f.coin,f.hourly,f.daily,now).status).toBe('BLOCKED');});
  it('does not display confirmed when the stop is above the quote or the quote has left the zone',()=>{
    const f=fixture(),r=reviewCryptoMomentum(f.coin,f.hourly,f.daily,now);
    expect(reviewStatusLabel(r)).toBe('BREAKOUT_CONFIRMED');
    expect(reviewStatusLabel({...r,levels:{...r.levels!,stop:r.levels!.entry}})).toBe('BREAKOUT');
    expect(reviewStatusLabel({...r,levels:{...r.levels!,entry:r.levels!.maxEntry+1}})).not.toMatch(/CONFIRMED/);
  });
});
