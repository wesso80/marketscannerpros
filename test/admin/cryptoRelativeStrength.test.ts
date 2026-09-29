import {it,expect,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {relativeStrengthAt} from '@/lib/admin/cryptoMarketRegime';
import {rsEvidence} from '@/lib/admin/cryptoRelativeStrength';
const D=86400000,day=Date.UTC(2026,8,29),at=day+6*3600000;
// 61 completed daily closes ending on `day`, growing at `g` per day.
const series=(g:number,start=100):[number,number][]=>Array.from({length:61},(_,i)=>[day-(60-i)*D,start*(1+g)**i]);
const universe=Object.fromEntries(Array.from({length:12},(_,i)=>[`c${i}`,series((i-4)/200)]));
const btc=series(.001);
it('ranks 30-day return minus BTC across the universe and needs the coin above its own 50-day average for LEADER',()=>{
 expect(relativeStrengthAt(universe,btc,'c11',at)).toMatchObject({tercile:'TOP',above50:true,rule:'LEADER',coins:12});
 expect(relativeStrengthAt(universe,btc,'c5',at)).toMatchObject({tercile:'MIDDLE',rule:'NOT_LEADER'});
 expect(relativeStrengthAt(universe,btc,'c0',at)).toMatchObject({tercile:'BOTTOM',above50:false,rule:'NOT_LEADER'});
 // Strong 30-day rally but still below its own 50-day average after a long decline: not a leader.
 const u={...universe,c11:series(0).map(([t],i)=>[t,i<=30?1000*.926**i:1000*.926**30*1.016**(i-30)] as [number,number])};
 expect(relativeStrengthAt(u,btc,'c11',at)).toMatchObject({tercile:'TOP',above50:false,rule:'NOT_LEADER'});
});
it('is UNAVAILABLE instead of guessing when the universe is small, BTC is missing, or the day is not completed',()=>{
 expect(relativeStrengthAt(Object.fromEntries(Object.entries(universe).slice(0,9)),btc,'c8',at).rule).toBe('UNAVAILABLE');
 expect(relativeStrengthAt(universe,btc.slice(0,-1),'c11',at).rule).toBe('UNAVAILABLE');
 expect(relativeStrengthAt(universe,btc,'c11',at+D).rule).toBe('UNAVAILABLE');
});
it('live evidence marks a missing snapshot or a coin outside the universe UNAVAILABLE',()=>{
 expect(rsEvidence(null,'c1',at)).toMatchObject({rule:'UNAVAILABLE',ruleId:'rs-leader-v1',reason:expect.stringContaining('unavailable')});
 const snap={day:new Date(day).toISOString(),checkedAt:'',source:'coinbase 1d' as const,btc,daily:universe,failed:[]};
 expect(rsEvidence(snap,'zzz',at)).toMatchObject({rule:'UNAVAILABLE',reason:expect.stringContaining('not in')});
 expect(rsEvidence(snap,'c11',at)).toMatchObject({rule:'LEADER',asOf:snap.day});
});
