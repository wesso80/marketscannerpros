import {it,expect} from 'vitest';
import {reviewCryptoBase} from '@/lib/admin/cryptoBase';
const H=3600000,D=24*H,now=Date.parse('2026-09-28T12:30Z'),end=Math.floor(now/(4*H))*4*H;
function fixture(){return {daily:Array.from({length:30},(_,i)=>[Math.floor(now/D)*D-(29-i)*D,100,102,98,100]),hourly:Array.from({length:48},(_,i)=>[end-(47-i)*H,100,101,99,100])};}
it('identifies a price base without claiming volume confirmation',()=>{const f=fixture(),r=reviewCryptoBase(f.hourly,f.daily,100,now);expect(r.stage).toBe('BASE');expect(r.volumeConfirmed).toBe(false);});
it('requires a completed 4h crossing and never confirms volume',()=>{const f=fixture();f.hourly[47]=[end,100,104,99,103];expect(reviewCryptoBase(f.hourly,f.daily,103,now).stage).toBe('BREAKOUT_PRICE_ONLY');expect(reviewCryptoBase(f.hourly,f.daily,110,now).stage).toBe('EXTENDED');expect(reviewCryptoBase(f.hourly,f.daily,101,now).stage).toBe('FAILED_BREAKOUT');});
it('excludes daily bars overlapping the trigger candle',()=>{const f=fixture();f.daily.push([Math.ceil(now/D)*D,100,1000,1,500]);expect(reviewCryptoBase(f.hourly,f.daily,100,now).high).toBe(102);});
it('rejects gaps and stale history',()=>{const f=fixture();expect(reviewCryptoBase(f.hourly.slice(0,-10),f.daily,100,now).stage).toBe('UNAVAILABLE');f.hourly.splice(20,1);expect(reviewCryptoBase(f.hourly,f.daily,100,now).stage).toBe('UNAVAILABLE');});
