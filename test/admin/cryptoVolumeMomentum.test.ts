import {it,expect} from 'vitest';
import {assessVolumeMomentum,parseFourHour,fourHourUrl,setupDisplayLabel} from '../../lib/admin/cryptoVolumeMomentum';
const F=4*3600000,now=Date.UTC(2026,8,28,4);
const bars=()=>Array.from({length:25},(_,i)=>({t:now-(24-i)*F,o:100+i*.1,h:101+i*.1,l:99+i*.1,c:100+i*.1,v:i===24?200:100}));
it('detects a volume-confirmed breakout without needing a daily base',()=>{
 const b=bars();b[24]={...b[24],o:102.4,h:104,l:102,c:103.5};
 const r=assessVolumeMomentum(b,now);expect(r.stage).toBe('MOMENTUM_VOLUME');expect(r.kind).toBe('BREAKOUT');expect(r.relativeVolume).toBe(2);
});
it('detects continuation below an older swing high',()=>{
 const b=bars();b[10].h=106;b[24]={...b[24],o:102.4,h:104,l:102,c:103.5};
 const r=assessVolumeMomentum(b,now);expect(r.stage).toBe('MOMENTUM_VOLUME');expect(r.kind).toBe('CONTINUATION');
});
it('flags price-confirmation failures, weak volume and overextension separately',()=>{
 expect(assessVolumeMomentum(bars(),now).stage).toBe('VOLUME_WATCH');
 const b=bars();b[24]={...b[24],h:120,c:119};expect(assessVolumeMomentum(b,now).stage).toBe('EXTENDED');
 b[24].v=100;expect(assessVolumeMomentum(b,now).stage).toBe('NO_SIGNAL');
});
it('rejects stale, incomplete, zero-baseline and invalid candles',()=>{
 expect(assessVolumeMomentum(bars(),now+2*F).stage).toBe('UNAVAILABLE');
 expect(assessVolumeMomentum(bars().slice(1),now).stage).toBe('UNAVAILABLE');
 expect(assessVolumeMomentum(bars().map(b=>({...b,v:0})),now).stage).toBe('UNAVAILABLE');
 const b=bars();b[20].t-=F;expect(assessVolumeMomentum(b,now).stage).toBe('UNAVAILABLE');
});
it('stores the signal candle, 20-bar average and the six-low stop, and withholds confirmed when the quote or stop is invalid',()=>{
 const b=bars();b[24]={...b[24],o:102.4,h:104,l:102,c:103.5};
 const r=assessVolumeMomentum(b,now);
 const lows=Math.min(...b.slice(-6).map(x=>x.l));
 expect(r.signal).toEqual({t:b[24].t,o:102.4,h:104,l:102,c:103.5});
 expect(r.sma20).toBeCloseTo(b.slice(-20).reduce((s,x)=>s+x.c,0)/20);
 expect(r.stop).toBeCloseTo(lows-0.25*r.atr!);
 expect(setupDisplayLabel(r)).toBe('confirmed');
 expect(setupDisplayLabel(r,r.maxEntry!+1)).toBe('outside entry zone');
 expect(setupDisplayLabel({...r,stop:r.close!+1})).toBe('invalid stop');
 expect(setupDisplayLabel({...r,stop:r.close!})).not.toMatch(/confirmed/i);
});
it('aggregates four Coinbase hours and sums base-asset volume',()=>{
 const p={exchange:'gdax' as const,product:'QNT-USD',quote:'USD',volumeUnit:'QNT'};
 const raw=Array.from({length:4},(_,i)=>[(now-F+i*3600000)/1000,9,12,10,11,10]);
 expect(parseFourHour(p,raw,now)).toEqual([{t:now,o:10,h:12,l:9,c:11,v:40}]);
 expect(fourHourUrl(p,now)).toContain('granularity=3600');
 expect(fourHourUrl({...p,exchange:'kucoin'},now)).toContain('type=4hour');
 expect(fourHourUrl({...p,exchange:'okex'},now)).toContain('bar=4H');
});
it('normalizes a completed Binance 4h candle with the correct interval',()=>{
 const p={exchange:'binance' as const,product:'QNT-USDT',quote:'USDT',volumeUnit:'QNT'};
 expect(parseFourHour(p,[[now-F,'10','12','9','11','100',now-1]],now)[0].v).toBe(100);
});
