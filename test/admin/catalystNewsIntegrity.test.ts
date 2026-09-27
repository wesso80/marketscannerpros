import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn() }));
import { classifyNews } from '@/lib/catalyst/classifier';
import { mapToNewsItem } from '@/lib/catalyst/alphaVantageNewsProvider';
import { reviewStoredCatalyst } from '@/lib/catalyst/researchIntegrity';
const item = (headline: string, body = '') => ({ headline, body, source: 'test', url: 'https://example.com', tickers: ['AMZN'], timestamp: new Date() });
describe('news catalyst evidence', () => {
  it.each([
    'Asset Allocation Strategies LLC Acquires New Holdings in Amazon.com, Inc. $AMZN',
    'Fund acquires 40,763 shares of Amazon $AMZN',
    'Bridger Management LLC Buys New Holdings in Amazon.com, Inc. $AMZN',
    'Cypherpunk technologies director Oei Khing Djien sells $661,500 in stock',
  ])('does not call ordinary holdings or insider trades a takeover: %s', headline => {
    expect(classifyNews(item(headline, 'The company acquired another business years ago.'))).toBeNull();
  });
  it('preserves actual deals, rumors and other corporate events', () => {
    expect(classifyNews(item('Amazon acquires Example Robotics in $2 billion deal'))?.subtype).toBe('MNA_DEFINITIVE');
    expect(classifyNews(item('Amazon signs definitive agreement to acquire Example'))?.subtype).toBe('MNA_DEFINITIVE');
    expect(classifyNews(item('Amazon merger talks reported'))?.subtype).toBe('MNA_RUMOR');
    expect(classifyNews(item('Amazon announces share repurchase program'))?.subtype).toBe('BUYBACK_AUTH');
  });
  it('does not attach AMZN news to incidental MSFT or KO sentiment entries', () => {
    const article = { title: 'Amazon announces share repurchase $AMZN', url: 'https://example.com', time_published: '20260927T100000', source: 'test', ticker_sentiment: ['AMZN','MSFT','KO'].map(ticker => ({ ticker, relevance_score: '.65', ticker_sentiment_score: '0', ticker_sentiment_label: 'Neutral' })) };
    expect(mapToNewsItem(article)?.tickers).toEqual(['AMZN']);
    expect(mapToNewsItem(article)?.relevanceVerified).toBe(true);
  });
  it('withholds unsupported legacy news without changing SEC filing evidence or input records', () => {
    const row = { ticker: 'MSFT', catalyst_type: 'NEWS', headline: 'Amazon share repurchase $AMZN', catalyst_subtype: 'MNA_DEFINITIVE', raw_payload: {} };
    expect(reviewStoredCatalyst(row)).toBeNull();
    const supported = { ...row, ticker: 'AMZN' };
    expect(reviewStoredCatalyst(supported)?.catalyst_subtype).toBe('BUYBACK_AUTH');
    expect(supported.catalyst_subtype).toBe('MNA_DEFINITIVE');
    const sec = { ...row, catalyst_type: 'SEC_FILING' };
    expect(reviewStoredCatalyst(sec)).toEqual(sec);
    expect(reviewStoredCatalyst({ ...supported, raw_payload: 'malformed' })).toBeNull();
  });
});
