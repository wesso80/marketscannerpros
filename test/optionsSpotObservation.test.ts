import {expect,it} from 'vitest';
import {optionSpotObservation} from '@/lib/options/spotObservation';
it('retains provider change and trading date without inventing an intraday timestamp',()=>{
 expect(optionSpotObservation({'Global Quote':{'05. price':'333.69','09. change':'3.37','10. change percent':'1.01%','07. latest trading day':'2026-10-02'}})).toEqual({price:333.69,change:3.37,changePercent:1.01,asOf:'2026-10-02',basis:'provider trading day; intraday time unavailable'});
 expect(optionSpotObservation({})).toBeNull();
});
