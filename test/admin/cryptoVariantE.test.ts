import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {btcAbove200,variantESignal,variantEStatus,VARIANT_E} from '@/lib/admin/cryptoVariantE';
import {exitDaily,dailyContext} from '@/lib/admin/strategyHarness';
const D=86400000,T0=Date.UTC(2026,5,1);
const day=(i:number,c:number,v=100,h=c*1.01,l=c*.99,o=c)=>({t:T0+(i+1)*D,o,h,l,c,v});
// 40 quiet rising days, then a high-volume continuation day 40.
// An earlier spike high (day 30) keeps day 40 below the 20-day high, so it is a continuation, not a breakout.
const series=()=>{const b=Array.from({length:40},(_,i)=>i===30?day(i,100+i*.2,100,115):day(i,100+i*.2));b.push(day(40,109.6,400,110,107.5,107.9));return b;};
describe('Variant E in shadow (variant-e-v1)',()=>{
 it('BTC gate: close above the mean of the last 200 closes; null with under 200 days',()=>{
  const up=Array.from({length:210},(_,i)=>day(i,100+i));expect(btcAbove200(up,up.at(-1)!.t)).toBe(true);
  const down=Array.from({length:210},(_,i)=>day(i,400-i));expect(btcAbove200(down,down.at(-1)!.t)).toBe(false);
  expect(btcAbove200(up.slice(0,150),up[149].t)).toBeNull();
 });
 it('signals only on the completed daily bar that closed at the day start, and ignores later bars',()=>{
  const b=series(),dayStart=b.at(-1)!.t;
  const sig=variantESignal(b,dayStart);
  expect(sig).toMatchObject({stage:'MOMENTUM_VOLUME',kind:'CONTINUATION'});
  expect(variantESignal([...b,day(41,1,1,999,1)],dayStart)).toEqual(sig); // a later bar never changes it
  expect(variantESignal(b,dayStart+D)).toBeNull(); // no completed bar at that day start
 });
 it('open positions use the harness daily exits exactly (stop, EMA20 close, 3 ATR trail)',()=>{
  const b=series(),entryAt=b.at(-1)!.t,p={fill:108,stop:104,entryAt};
  const after=[...b,day(41,109),day(42,110),day(43,98,100,99,97,99)];
  const mine=variantEStatus(p,after,after.at(-1)!.t);
  const harness=exitDaily({...p,target:null},after,dailyContext(after),after.at(-1)!.t);
  expect(mine).toMatchObject({price:harness!.price,at:harness!.at,reason:harness!.reason,marked:harness!.marked});
  expect(VARIANT_E.rule).toBe('variant-e-v1');
 });
});
