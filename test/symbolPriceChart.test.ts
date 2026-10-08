import { expect, it } from 'vitest';
import { buildPriceChart } from '@/lib/research/symbolPriceChart';
const now = Date.parse('2026-10-08T12:00:00Z');
const history = (n=80) => ({ historicalDates: Array.from({length:n},(_,i)=>new Date(now-(n-i)*86400000).toISOString().slice(0,10)), historicalCloses: Array.from({length:n},(_,i)=>100+i), source: 'fixture' });
it('uses prior history for indicators before trimming the visible window',()=>{
 const p=buildPriceChart(history(),'crypto',30,now).points;
 expect(p).toHaveLength(30); expect(p[0].sma50).toBe(125.5); expect(p[0].rsi).toBe(100);
 expect(p.at(-1)!.macd).toBeCloseTo(7); expect(p.at(-1)!.signal).toBeCloseTo(7);
 expect(p.at(-1)!.upper).toBeCloseTo(169.5+2*Math.sqrt(33.25));
});
it('keeps insufficient warm-up and flat RSI unavailable',()=>{
 const h=history(10);h.historicalCloses.fill(100);
 const p=buildPriceChart(h,'crypto',90,now).points;
 expect(p.at(-1)).toMatchObject({sma20:null,sma50:null,rsi:null,macd:null,signal:null});
 const flat=history();flat.historicalCloses.fill(100);expect(buildPriceChart(flat,'crypto',90,now).points.at(-1)!.rsi).toBeNull();
});
it('preserves zero volume and withholds misaligned or invalid candles',()=>{
 const h={...history(2),historicalOpens:[99,100],historicalHighs:[102,90],historicalLows:[98,99],historicalVolumes:[0,null]};
 const p=buildPriceChart(h,'crypto',90,now).points;
 expect(p[0]).toMatchObject({open:99,high:102,low:98,volume:0});expect(p[1].open).toBeNull();
 expect(buildPriceChart({...h,historicalOpens:[99]},'crypto',90,now).points[0].open).toBeNull();
});
it('excludes unfinished and invalid closes without inventing history',()=>{
 const h=history(3);h.historicalDates[2]='2026-10-08';h.historicalCloses[0]=NaN;
 expect(buildPriceChart(h,'crypto',90,now).points).toHaveLength(1);
 expect(buildPriceChart(null,'crypto',90,now).points).toEqual([]);
});
