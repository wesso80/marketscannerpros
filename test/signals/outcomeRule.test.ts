import {readFileSync} from 'node:fs';
import {beforeEach,expect,it,vi} from 'vitest';
import {bandForHorizon,bandsFromRows,classifyMove,DEFAULT_OUTCOME_BANDS,horizonsWithFallback} from '@/lib/signals/outcomeRule';

const q=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/db',()=>({q,tx:vi.fn()}));
import {labelOutcome,labelSignalOutcomes} from '@/lib/signals/outcomeLabeler';

const bands:[number,number][]=[[60,0.5],[240,1],[1440,2],[10080,4]];

it('matches the outcome_thresholds seed',()=>{
 expect(DEFAULT_OUTCOME_BANDS).toEqual({60:0.5,240:1,1440:2,10080:4});
});

it('classifies each horizon band at the inclusive boundary, for both directions',()=>{
 for(const [minutes,band] of bands){
  const under=Number((band-0.01).toFixed(2));
  const over=Number((band+0.01).toFixed(2));
  expect(classifyMove('bullish',under,band),`${minutes} bull under`).toBe('neutral');
  expect(classifyMove('bullish',band,band),`${minutes} bull at`).toBe('correct');
  expect(classifyMove('bullish',over,band),`${minutes} bull over`).toBe('correct');
  expect(classifyMove('bullish',-under,band),`${minutes} bull against under`).toBe('neutral');
  expect(classifyMove('bullish',-band,band),`${minutes} bull against at`).toBe('wrong');
  expect(classifyMove('bullish',-over,band),`${minutes} bull against over`).toBe('wrong');
  expect(classifyMove('bearish',-under,band),`${minutes} bear under`).toBe('neutral');
  expect(classifyMove('bearish',-band,band),`${minutes} bear at`).toBe('correct');
  expect(classifyMove('bearish',-over,band),`${minutes} bear over`).toBe('correct');
  expect(classifyMove('bearish',under,band),`${minutes} bear against under`).toBe('neutral');
  expect(classifyMove('bearish',band,band),`${minutes} bear against at`).toBe('wrong');
  expect(classifyMove('bearish',over,band),`${minutes} bear against over`).toBe('wrong');
 }
 // The examples from the brief, stated as numbers rather than band-0.01.
 expect(classifyMove('bullish',0.49,0.5)).toBe('neutral');
 expect(classifyMove('bullish',0.5,0.5)).toBe('correct');
 expect(classifyMove('bullish',-0.5,0.5)).toBe('wrong');
 expect(classifyMove('bullish',-0.51,0.5)).toBe('wrong');
 expect(classifyMove('bearish',-0.49,0.5)).toBe('neutral');
 expect(classifyMove('bearish',-0.5,0.5)).toBe('correct');
 expect(classifyMove('bearish',0.5,0.5)).toBe('wrong');
 expect(classifyMove('bullish',1.99,2)).toBe('neutral');
 expect(classifyMove('bullish',2,2)).toBe('correct');
 expect(classifyMove('bearish',-2,2)).toBe('correct');
 expect(classifyMove('bearish',2,2)).toBe('wrong');
});

it('uses the nearest seeded band when the horizon is not in the map',()=>{
 expect(bandForHorizon(60)).toBe(0.5);
 expect(bandForHorizon(5)).toBe(0.5);
 expect(bandForHorizon(30)).toBe(0.5);
 expect(bandForHorizon(960)).toBe(2);
 expect(bandForHorizon(150)).toBe(0.5);
});

it('prefers table bands and falls back to the default map when the table is empty',()=>{
 expect(horizonsWithFallback([])).toEqual([
  {horizon_minutes:60,horizon_label:'1h',bandPct:0.5},
  {horizon_minutes:240,horizon_label:'4h',bandPct:1},
  {horizon_minutes:1440,horizon_label:'1d',bandPct:2},
  {horizon_minutes:10080,horizon_label:'1w',bandPct:4},
 ]);
 expect(horizonsWithFallback([{horizon_minutes:60,horizon_label:'1h',correct_threshold:0.5,wrong_threshold:0.5}])).toEqual([
  {horizon_minutes:60,horizon_label:'1h',bandPct:0.5},
 ]);
 expect(horizonsWithFallback([{horizon_minutes:1440,horizon_label:'1d',correct_threshold:Number.NaN}])).toEqual([
  {horizon_minutes:1440,horizon_label:'1d',bandPct:2},
 ]);
});

it('the session labeler uses the same boundary as classifyMove, including an unmapped horizon',()=>{
 expect(labelOutcome('bullish',0.49,60)).toBe('neutral');
 expect(labelOutcome('bullish',0.5,60)).toBe(classifyMove('bullish',0.5,bandForHorizon(60)));
 expect(labelOutcome('bearish',0.5,60)).toBe('wrong');
 expect(labelOutcome('bullish',1.99,1440)).toBe('neutral');
 expect(labelOutcome('bullish',2,1440)).toBe('correct');
 expect(labelOutcome('bullish',1.99,960)).toBe('neutral');
 expect(labelOutcome('bullish',2,960)).toBe('correct');
 const labeler=readFileSync('lib/signals/outcomeLabeler.ts','utf8');
 expect(labeler).not.toContain('NEUTRAL_THRESHOLD');
 expect(labeler).toContain('classifyMove');
 expect(labeler).toContain('bandForHorizon');
 const worker=readFileSync('worker/label-outcomes.ts','utf8');
 expect(worker).toContain('labelHorizonMove');
 expect(readFileSync('lib/signals/outcomeGuard.ts','utf8')).toContain('classifyMove');
 expect(worker).toContain('horizonsWithFallback');
 expect(worker).not.toContain('function computeOutcome');
 expect(worker).toContain('refresh_signal_accuracy');
 expect(worker).toContain('get_unlabeled_signals');
 const route=readFileSync('app/api/ai/accuracy/route.ts','utf8');
 expect(route).toContain('FROM outcome_thresholds');
 expect(route).toContain('correct_threshold');
 expect(labeler).toContain('bandsFromRows');
 expect(labeler).toContain('outcome_thresholds');
 expect(worker).toContain('bandForHorizon');
 expect(worker).toContain('bandsFromRows');
 expect(worker).toContain('symbol = UPPER($1)');
 expect(worker).not.toContain('UPPER(symbol)');
 expect(worker).not.toMatch(/FROM quotes_latest/i);
});

const signalRow={id:1,symbol:'AAPL',direction:'bullish' as const,price_at_signal:100,signal_at:'2026-10-01T14:00:00Z',timeframe:'1d'};

beforeEach(()=>{q.mockReset();});

function mockLabelQueries(thresholds:unknown){
 q.mockImplementation(async(sql:string)=>{
  const text=String(sql);
  if(text.includes('outcome_thresholds')){
   if(thresholds instanceof Error)throw thresholds;
   return thresholds;
  }
  if(text.includes('FROM signals_fired'))return [signalRow];
  if(text.includes('FROM journal_entries'))return [{exit_price:102.5,close_date:'2026-10-02'}];
  return [];
 });
}

it('labels with the band from outcome_thresholds',async()=>{
 mockLabelQueries([{horizon_minutes:1440,correct_threshold:3}]);
 const out=await labelSignalOutcomes('ws');
 expect(out).toEqual({labeled:1,errors:0});
 const insert=q.mock.calls.find(c=>String(c[0]).includes('INSERT INTO signal_outcomes'));
 expect(insert?.[1]?.[3]).toBe('neutral');
 expect(q.mock.calls.filter(c=>String(c[0]).includes('outcome_thresholds'))).toHaveLength(1);
 expect(bandsFromRows([{horizon_minutes:1440,correct_threshold:3}])).toEqual({1440:3});
});

it('falls back to the default bands when outcome_thresholds is empty or the read fails',async()=>{
 mockLabelQueries([]);
 const empty=await labelSignalOutcomes('ws');
 expect(empty).toEqual({labeled:1,errors:0});
 const emptyInsert=q.mock.calls.find(c=>String(c[0]).includes('INSERT INTO signal_outcomes'));
 expect(emptyInsert?.[1]?.[3]).toBe('correct');
 q.mockClear();
 mockLabelQueries(new Error('read failed'));
 const failed=await labelSignalOutcomes('ws');
 expect(failed).toEqual({labeled:1,errors:0});
 const failedInsert=q.mock.calls.find(c=>String(c[0]).includes('INSERT INTO signal_outcomes'));
 expect(failedInsert?.[1]?.[3]).toBe('correct');
});
