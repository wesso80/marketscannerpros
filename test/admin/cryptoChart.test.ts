import {describe,it,expect} from 'vitest';
import {momentumChart} from '@/lib/admin/cryptoMomentum';
const H=3600000;
describe('chart evidence',()=>{
  it('keeps close timestamps and aggregates only complete 4h bars',()=>{
    const raw=Array.from({length:5},(_,i)=>[(i+1)*H,10,12+i,9,11]);
    const chart=momentumChart(raw,[],4*H);
    expect(chart.hourly).toHaveLength(4);
    expect(chart.fourHourly).toEqual([{t:4*H,o:10,h:15,l:9,c:11}]);
  });
  it('refuses to draw missing or conflicting candle history',()=>{
    expect(momentumChart([[H,10,12,9,11],[3*H,10,12,9,11]],[],4*H).error).toMatch(/missing/);
    expect(momentumChart([[H,10,12,9,11],[H,10,13,9,11]],[],4*H).hourly).toEqual([]);
  });
});
