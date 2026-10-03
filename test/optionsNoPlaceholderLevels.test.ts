import {expect,it,vi,afterEach} from 'vitest';
import {calculateTradeLevels} from '@/lib/options-confluence-analyzer';
import {isLocalGoldenEggDemoAllowed,buildPayload} from '@/lib/goldenEgg/engine';
afterEach(()=>vi.unstubAllEnvs());
it('never enables local demo prices in production, even with the old override',()=>{
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('LOCAL_DEMO_MARKET_DATA','true');expect(isLocalGoldenEggDemoAllowed()).toBe(false);
});
it('withholds synthetic levels without measured ATR and scales buffers from actual candles',()=>{
 const input={currentPrice:100,primaryTF:'1D',mid50Levels:[],clusters:[],decompression:{}} as any;
 expect(calculateTradeLevels(input,'bullish',null)).toBeNull();
 const bars=Array.from({length:20},(_,i)=>({ts:i*86400000,open:100,high:102,low:98,close:100,volume:100}));
 const r=calculateTradeLevels({...input,candlesByTf:{'1D':bars}},'bullish',null)!;
 expect(r.entryZone.low).toBe(99);expect(r.stopLoss).toBeLessThan(98);expect(r.target1.price).toBe(108);
});

it('does not turn a day range into ATR or a zero-distance invalidation',()=>{
 const p=buildPayload('TEST','equity',{price:100,change:1,changePct:1,high:105,low:95,volume:1000,avgVolume:1000,historicalCloses:[] } as any,null,null,null);
 expect(p.canonical?.levels.invalidation.price).toBeNull();
 expect(p.layer2.scenario.invalidationLevel.price).toBeNull();
 expect(p.layer2.scenario.reactionZones).toEqual([]);
 expect(p.layer3.structure.volatility.atr).toBeUndefined();
});
