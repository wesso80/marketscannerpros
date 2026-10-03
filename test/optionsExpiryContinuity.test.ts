import {expect,it} from 'vitest';
import {selectOptionsExpiry,marketDateKey,withOptionsExpiry} from '@/lib/options/expiry';
it('shares New York default and preserves explicit expiry without a fallback',()=>{
 const now=Date.parse('2026-10-03T00:30Z');expect(marketDateKey(now)).toBe('2026-10-02');
 expect(selectOptionsExpiry(['2026-10-02','2026-10-05','2026-10-09'],undefined,now)).toBe('2026-10-05');
 expect(selectOptionsExpiry(['2026-10-05','2026-10-09'],'2026-10-09',now)).toBe('2026-10-09');
 expect(selectOptionsExpiry(['2026-10-05'],'2026-10-09',now)).toBeNull();
 const p=withOptionsExpiry(new URLSearchParams('tab=options-terminal&symbol=AAPL'),'2026-10-09');p.set('tab','options-flow');expect(p.get('expiry')).toBe('2026-10-09');expect(p.get('symbol')).toBe('AAPL');
});
