import { describe, it, expect } from 'vitest';
import { compactAmount } from '@/lib/presentation/compactAmount';
import { cleanNewsTitle, uniqueNews } from '@/lib/presentation/newsDisplay';
import { smartAlertShare } from '@/lib/alerts/consoleStatus';
import { learningText } from '@/lib/learningPresentation';
import { alertConditionLabel } from '@/lib/alertPresentation';
describe('October display fixes', () => {
 it('formats large money without losing sign or turning missing numbers into zero', () => {
  expect(compactAmount(14.35e9,true)).toBe('$14.35B');
  expect(compactAmount(-1.09e9,true)).toBe('-$1.09B');
  expect(compactAmount(NaN,true)).toBe('Not collected');
 });
 it('deduplicates links and cleaned headlines while preserving provider records', () => {
  const rows = [
   {title:'[RSS] CoinDesk: Bitcoin update',url:'https://example.com/a?utm_source=rss',source_name:'CoinDesk'},
   {title:'Another headline',url:'https://example.com/a',source_name:'Other'},
   {title:'Bitcoin update',url:'https://example.com/b',source_name:'Other'},
   {title:'Different story',url:'https://example.com/c',source_name:'Other'},
  ];
  expect(uniqueNews(rows)).toEqual([rows[0],rows[3]]);
  expect(rows[0].title).toBe('[RSS] CoinDesk: Bitcoin update');
  expect(cleanNewsTitle(rows[0].title,rows[0].source_name)).toBe('Bitcoin update');
 });
 it('does not call plain price rules smart due to a legacy flag', () => {
  const price={condition_type:'price_above',condition_value:.167397,is_active:true,is_smart_alert:true};
  expect(smartAlertShare([price])).toBe(0);
  expect(smartAlertShare([price,{...price,condition_type:'strategy_buy_signal'}])).toBe(50);
  expect(alertConditionLabel(price.condition_type,price.condition_value)).toBe('price above $0.1674');
 });
 it('uses readable learner labels while retaining numeric thresholds', () => {
  expect(learningText('🧠 Brain Signal Replay (Decision Packets)')).toBe('Recorded signal replay');
  expect(learningText('MSP Day Trader AIO (Score 5+)')).toContain('score at least 5');
  expect(learningText('BBWP < 20')).toBe('volatility below its 20th historical percentile');
 });
});
