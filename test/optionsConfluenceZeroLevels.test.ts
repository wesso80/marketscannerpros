import {expect,it} from 'vitest';
import {selectStrikesFromConfluence} from '@/lib/options-confluence-analyzer';

// Equity scans use 30m base bars, so the 5m/10m/15m/30m timeframes cannot be resampled: the agent emits
// level 0 (an "unmeasured" sentinel) and, on a closed market, marks them decompressing + clusters them.
const strikes=[185,187.5,190,192.5,195];
const base=(over:any={})=>({
  currentPrice:190.4,
  mid50Levels:[
    {tf:'5m',level:0,distance:0,isDecompressing:true},
    {tf:'10m',level:0,distance:0,isDecompressing:true},
    {tf:'1D',level:192.1,distance:-0.9,isDecompressing:false},
  ],
  clusters:[{levels:[0,0],tfs:['5m','10m'],avgLevel:0}],
  decompression:{},
  prediction:{confidence:60},
  ...over,
}) as any;

it('ignores unmeasured (level 0) clusters and decompressions instead of throwing "No listed strikes available"',()=>{
  const r=selectStrikesFromConfluence(base(),true,strikes,0.25);
  expect(r.length).toBeGreaterThan(0);
  expect(r.every(x=>strikes.includes(x.strike))).toBe(true);
  expect(r[0].strike).toBe(190);
});

it('still returns the ATM strike when only unmeasured levels exist',()=>{
  const r=selectStrikesFromConfluence(base({mid50Levels:[{tf:'5m',level:0,distance:0,isDecompressing:true}]}),false,strikes,0.25);
  expect(r.map(x=>x.strike)).toEqual([190]);
});

it('still reports a genuinely empty chain',()=>{
  expect(()=>selectStrikesFromConfluence(base(),true,[],0.25)).toThrow('No listed strikes available');
});
