import { expect, it } from 'vitest';
import { FREE_COPY } from '@/components/free/copy';
import { FREE_DAILY_SCAN_LIMIT, FREE_JOURNAL_LIMIT } from '@/lib/free/limits';
import { ALERT_LIMITS } from '@/lib/alerts/planLimits';
import { WATCHLIST_LIMITS } from '@/lib/tiers';
import { friendlyStatus } from '@/lib/free/friendlyStatus';
import { assertJournalQuota } from '@/lib/free/journalQuota';
it('copy avoids prescriptive and predictive language',()=>{
  const values=JSON.stringify(FREE_COPY)+FREE_COPY.scanLimit(5)+FREE_COPY.journalLimit(5);
  expect(values).not.toMatch(/\b(?:buy|sell|entry signal|about to|likely|expected to|probability|bullish|bearish|will|should)\b/i);
});
it('pricing comes from enforced limits',()=>{
  expect(FREE_COPY.pricing.scans).toContain(String(FREE_DAILY_SCAN_LIMIT));
  expect(FREE_COPY.pricing.alerts).toContain(String(ALERT_LIMITS.free));
  expect(FREE_COPY.pricing.watchlists).toBe(`${WATCHLIST_LIMITS.free.watchlists} watchlists of ${WATCHLIST_LIMITS.free.items} symbols`);
  expect(FREE_COPY.pricing.journal).toContain(String(FREE_JOURNAL_LIMIT));
});
it('server journal cap accepts five open entries and refuses six',()=>{
  expect(()=>assertJournalQuota(5)).not.toThrow();expect(()=>assertJournalQuota(6)).toThrow();
});
it('friendly statuses do not relabel stale data as fresh or a closed market without evidence',()=>{
  for(const value of ['UNKNOWN','Awaiting data','Pending','Data MISSING','DEGRADED']) expect(friendlyStatus(value)).not.toMatch(/UNKNOWN|Awaiting data|Pending|MISSING|DEGRADED|Market closed/);
  expect(friendlyStatus('UNKNOWN',true)).toBe('Loading…');
});
