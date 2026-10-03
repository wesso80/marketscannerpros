import { it, expect } from 'vitest';
import { stableOiObservation } from '@/lib/crypto/oiComparisons';
const now=Date.parse('2026-10-03T12:00:00Z');
const rows=[{market:'A',symbol:'BTCUSD',openInterest:100,lastTradedAt:now/1000},{market:'B',symbol:'BTCUSDT',openInterest:200,lastTradedAt:now/1000}];
it('pins contracts and carries a missed update without a fictitious OI collapse',()=>{
 const first=stableOiObservation('BTC',rows,null,now)!;
 const next=stableOiObservation('BTC',[{...rows[0],openInterest:101,lastTradedAt:(now+20*60000)/1000},{market:'C',symbol:'BTCUSD',openInterest:999,lastTradedAt:(now+20*60000)/1000}],first,now+20*60000)!;
 expect(next.value).toBe(301);expect(next.coverage).toBe(first.coverage);expect(next.carriedContracts).toBe(1);
 expect(next.contractObservedAt[JSON.stringify(['B','BTCUSDT'])]).toBe(now);
});
it('fails closed when a constituent expires instead of silently rebasing the basket',()=>{
 const first=stableOiObservation('BTC',rows,null,now)!;
 expect(stableOiObservation('BTC',[{...rows[0],lastTradedAt:(now+2*3600000)/1000}],first,now+2*3600000)).toBeNull();
});
