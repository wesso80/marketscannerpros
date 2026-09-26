/** RS-23: "vesting" is only a token unlock for crypto; equity Form 4 / vesting news is an insider filing. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyCatalyst, filterRelevantNews } from '@/lib/goldenEgg/newsRelevance';

const form4 = 'Form 4 Apple Inc For: 25 September By Investing.com. Filing shows restricted stock unit vesting for an officer.';

describe('RS-23 catalyst labels', () => {
  it('equity Form 4 / vesting news is a neutral insider filing, not a token unlock', () => {
    expect(classifyCatalyst(form4, 'equity')).toEqual({ klass: 'NEUTRAL', reason: 'insider filing' });
    expect(classifyCatalyst('Form 4 Apple Inc For: 24 September By Investing.com', 'equity').reason).toBe('insider filing');
    expect(classifyCatalyst(form4)).toEqual({ klass: 'NEUTRAL', reason: 'insider filing' });
  });
  it('crypto vesting / unlock news is still event risk: token unlock', () => {
    expect(classifyCatalyst('ARB token unlock next week releases 1.1B tokens', 'crypto')).toEqual({ klass: 'EVENT_RISK', reason: 'token unlock' });
    expect(classifyCatalyst('Team vesting cliff ends for SUI investors', 'crypto')).toEqual({ klass: 'EVENT_RISK', reason: 'token unlock' });
    expect(classifyCatalyst('Token unlock schedule', 'equity').reason).not.toBe('token unlock');
  });
  it('insider selling in a Form 4 stays negative; earnings still wins over the filing label', () => {
    expect(classifyCatalyst('Form 4: CFO sells 20,000 shares of stock', 'equity').klass).toBe('NEGATIVE');
    expect(classifyCatalyst('Form 4 filed; company to report Q3 results on Oct 28', 'equity').reason).toBe('scheduled earnings');
  });
  it('filterRelevantNews passes the asset class through', () => {
    const feed = [{ title: 'Form 4 Apple Inc For: 25 September By Investing.com', summary: 'Officer vesting of restricted stock units.', source: 'Investing.com', ticker_sentiment: [{ ticker: 'AAPL', relevance_score: '0.95' }] }];
    expect(filterRelevantNews(feed, 'AAPL', 'equity', { companyName: 'Apple Inc' })[0]).toMatchObject({ catalyst: 'NEUTRAL', catalystReason: 'insider filing' });
  });
  it('the news tag shows a neutral reason such as "insider filing" but not the default one', () => {
    const src = readFileSync('app/tools/deep-analysis/page.tsx', 'utf8');
    expect(src).toContain("item.catalystReason && item.catalystReason !== 'no material catalyst pattern' ? ` · ${item.catalystReason}` : ''");
  });
});
