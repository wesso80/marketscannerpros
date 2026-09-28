import {expect,it} from 'vitest';
import {parsePaperQuote,planCryptoPaper} from '@/lib/admin/cryptoPaperMarket';
import type {VolumeMomentum} from '@/lib/admin/cryptoVolumeMomentum';
const now=Date.parse('2026-09-28T05:00:00Z');
const signal={stage:'MOMENTUM_VOLUME',asOf:'2026-09-28T04:00:00Z',stop:95,target:112,maxEntry:102,entryFloor:99} as VolumeMomentum;
const quote=parsePaperQuote({bid:'99.99',ask:'100',time:new Date(now).toISOString()},'BTC-USD',now);
it('sizes to risk and notional limits including entry/exit friction',()=>{
 const p=planCryptoPaper(signal,quote,200000,200000,now);expect(p.ok).toBe(true);
 if(p.ok){expect(p.risk).toBeLessThanOrEqual(500);expect(p.notional).toBeLessThanOrEqual(20000);expect(p.fill).toBe(100.05);expect(p.rewardRisk).toBeGreaterThan(1.5);}
});
it.each([
 {stage:'EXTENDED'}, {asOf:'2026-09-27T04:00:00Z'}, {asOf:'2026-09-29T04:00:00Z'},
 {stop:101}, {target:104}, {maxEntry:100}, {entryFloor:101}, {stop:undefined}, {stop:NaN}, {stop:0.000000001},
])('rejects stale, incomplete, chased, invalid and poor reward/risk setups %j',patch=>{
 expect(planCryptoPaper({...signal,...patch} as VolumeMomentum,quote,200000,200000,now).ok).toBe(false);
});
it.each([{bid:99,ask:100},{priceAt:'2026-09-28T04:58:00Z'},{priceAt:'garbage'},{ask:NaN},{bid:101}])('blocks bad quotes %j',patch=>{
 expect(planCryptoPaper(signal,{...quote,...patch},200000,200000,now).ok).toBe(false);
});
it('does not enter on missing cash or equity',()=>{
 expect(planCryptoPaper(signal,quote,200000,0,now).ok).toBe(false);
 expect(planCryptoPaper(signal,quote,NaN,200000,now).ok).toBe(false);
});
it('rejects stale/future tick timestamps and crossed bid/ask',()=>{
 for(const raw of [{bid:100,ask:99,time:new Date(now).toISOString()},{bid:100,ask:101,time:new Date(now-61000).toISOString()},{bid:100,ask:101,time:new Date(now+1).toISOString()}])expect(()=>parsePaperQuote(raw,'BTC-USD',now)).toThrow();
});
