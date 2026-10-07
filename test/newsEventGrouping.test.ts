import {describe,expect,it} from 'vitest';
import {groupNewsEvents,summarizeNews,filterRelevantNews,NEWS_EVENTS,type RelevantArticle,type RawAvArticle} from '@/lib/goldenEgg/newsRelevance';
const art=(title:string,iso:string,source:string,catalyst:RelevantArticle['catalyst']='POSITIVE',reason='analyst upgrade',rel=0.8):RelevantArticle=>({title,summary:'',source,url:`https://x/${encodeURIComponent(title)}`,publishedAt:iso,sentiment:'Bullish',sentimentScore:0.3,relevance:rel,catalyst,catalystReason:reason});
describe('news events',()=>{
 const items=[
  art('Morgan Stanley upgrades Apple to Overweight on iPhone cycle','2026-10-06T12:00:00Z','Reuters'),
  art('Apple upgraded to Overweight at Morgan Stanley on iPhone cycle','2026-10-06T13:10:00Z','Benzinga'),
  art('Morgan Stanley Apple upgrade: overweight call on iPhone cycle strength','2026-10-07T02:00:00Z','MarketWatch'),
  art('Apple faces EU antitrust probe over App Store fees','2026-10-06T15:00:00Z','FT','NEGATIVE','regulatory action'),
  art('Goldman Sachs upgrades Apple, cites services margin','2026-10-06T16:00:00Z','CNBC'),
 ];
 it('reports of the same event become one event; different events stay separate',()=>{
  const {events,articles}=groupNewsEvents(items);
  expect(events).toHaveLength(3);
  const ms=events.find(e=>e.articles===3)!;
  expect(ms.sources.sort()).toEqual(['Benzinga','MarketWatch','Reuters']);
  expect(ms.firstPublishedAt).toBe('2026-10-06T12:00:00Z');
  expect(articles.filter(a=>a.eventId===ms.id).every(a=>a.eventSize===3)).toBe(true);
  // A different firm's upgrade the same day is a separate event, not a duplicate.
  expect(events.some(e=>e.headline.startsWith('Goldman'))).toBe(true);
 });
 it('the summary counts events, not articles',()=>{
  const s=summarizeNews(items);
  expect(s.articles).toBe(5);expect(s.events).toHaveLength(3);
  expect(s.positive).toBe(2);expect(s.negative).toBe(1);
  expect(s.headline).toBe('5 symbol-specific articles about 3 events: 2 positive, 1 negative. Articles about the same event count once.');
 });
 it('similar headlines far apart in time, or with a different catalyst, are separate events',()=>{
  const far=[art('Morgan Stanley upgrades Apple to Overweight','2026-10-01T12:00:00Z','A'),art('Morgan Stanley upgrades Apple to Overweight','2026-10-06T12:00:00Z','B')];
  expect(groupNewsEvents(far).events).toHaveLength(2);
  const diff=[art('Apple results beat estimates','2026-10-06T12:00:00Z','A','POSITIVE','results beat'),art('Apple results beat estimates','2026-10-06T13:00:00Z','B','NEGATIVE','litigation')];
  expect(groupNewsEvents(diff).events).toHaveLength(2);
  expect(NEWS_EVENTS.windowHours).toBe(72);
 });
 it('no news: unchanged headline',()=>{expect(summarizeNews([]).headline).toBe('No material symbol-specific news identified.');});
 it('the article limit applies to events, so one heavily covered story cannot crowd out others',()=>{
  const feed:RawAvArticle[]=[...Array.from({length:10},(_,i)=>({title:`Apple wins record iPhone order, report ${i}`,summary:'Apple record revenue',source:`S${i}`,time_published:'20261006T120000',ticker_sentiment:[{ticker:'AAPL',relevance_score:'0.95',ticker_sentiment_label:'Bullish'}]})),
   {title:'Apple faces EU antitrust probe over App Store fees',summary:'Apple antitrust regulator probe',source:'FT',time_published:'20261006T150000',ticker_sentiment:[{ticker:'AAPL',relevance_score:'0.5',ticker_sentiment_label:'Bearish'}]}];
  const out=filterRelevantNews(feed,'AAPL','equity',{companyName:'Apple',limit:2});
  expect(new Set(out.map(a=>a.eventId)).size).toBe(2);
  expect(out.some(a=>a.source==='FT')).toBe(true);
 });
});
