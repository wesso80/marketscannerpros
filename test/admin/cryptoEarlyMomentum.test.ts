import {afterEach,expect,it,vi} from 'vitest';
import {hourlyMomentumUrl,fetchEarlyMomentum} from '@/lib/admin/cryptoEarlyMomentum';
import {assessVolumeMomentum} from '@/lib/admin/cryptoVolumeMomentum';
const H=3600000,now=Date.UTC(2026,8,29,1),pair={exchange:'gdax' as const,product:'TEST-USD',quote:'USD',volumeUnit:'TEST'};
const bars=()=>Array.from({length:25},(_,i)=>({t:now-(24-i)*H,o:100+i*.1,h:101+i*.1,l:99+i*.1,c:100+i*.1,v:i===24?200:100}));
afterEach(()=>vi.unstubAllGlobals());
it('uses UTC hourly boundaries at every supported exchange',()=>{
 for(const exchange of ['gdax','binance','kucoin','okex'] as const){
  const url=new URL(hourlyMomentumUrl({...pair,exchange},now+120000));
  expect(url.searchParams.get(exchange==='gdax'?'granularity':exchange==='binance'?'interval':exchange==='kucoin'?'type':'bar')).toBe(exchange==='gdax'?'3600':exchange==='binance'?'1h':exchange==='kucoin'?'1hour':'1H');
 }
 expect(new URL(hourlyMomentumUrl(pair,now)).searchParams.get('end')).toBe(new Date(now).toISOString());
});
it('returns early research without executable levels or confirmed entry status',async()=>{
 const b=bars();b[24]={...b[24],h:104,l:102,c:103.5};
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(b.map(x=>[(x.t-H)/1000,x.l,x.h,x.o,x.c,x.v]))));
 const r=await fetchEarlyMomentum(pair,now);expect(r.stage).toBe('EARLY_WATCH');expect(r.relativeVolume).toBe(2);
 expect(r.stop).toBeUndefined();expect(r.target).toBeUndefined();expect(r.maxEntry).toBeUndefined();
});
it('rejects stale and missing hourly candles, without weakening the four-hour default',()=>{
 expect(assessVolumeMomentum(bars(),now,H).stage).toBe('VOLUME_WATCH');
 expect(assessVolumeMomentum(bars(),now+2*H,H).stage).toBe('UNAVAILABLE');
 const b=bars();b[20].t-=H;expect(assessVolumeMomentum(b,now,H).stage).toBe('UNAVAILABLE');
 expect(assessVolumeMomentum(bars(),now).stage).toBe('UNAVAILABLE');
});
it('does not treat a forming candle as hourly confirmation',async()=>{
 const raw=bars().slice(1).map(x=>[(x.t-H)/1000,x.l,x.h,x.o,x.c,x.v]);raw.push([now/1000,102,105,103,104,1000]);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(raw)));
 expect((await fetchEarlyMomentum(pair,now)).stage).toBe('UNAVAILABLE');
});
