import { expect, it } from 'vitest';
import { replaceBannedPhrases, scanForBannedPhrases } from '@/lib/compliance/bannedPhrases';

it('flags the daily picks phrase on a word boundary', () => {
  expect(scanForBannedPhrases('Here are the daily picks').map((match) => match.phrase)).toEqual(['daily picks']);
  expect(scanForBannedPhrases('Here are the daily picks')[0]?.replacement).toBe('Daily scan observations');
  expect(scanForBannedPhrases('Daily   Picks today').map((match) => match.phrase)).toEqual(['Daily   Picks']);
  expect(scanForBannedPhrases('daily pickings and pick of the day')).toEqual([]);
  expect(scanForBannedPhrases('/daily-pick')).toEqual([]);
  expect(scanForBannedPhrases('dailyPicks')).toEqual([]);
  expect(scanForBannedPhrases('daily-picks')).toEqual([]);
  expect(replaceBannedPhrases('the daily picks list')).toBe('the Daily scan observations list');
  expect(replaceBannedPhrases('the Daily   Picks list')).toBe('the Daily scan observations list');
  expect(scanForBannedPhrases('daily\npicks').map((match) => match.phrase)).toEqual(['daily\npicks']);
  expect(scanForBannedPhrases('daily\tpicks').map((match) => match.phrase)).toEqual(['daily\tpicks']);
  expect(scanForBannedPhrases('DAILY PICKS').map((match) => match.phrase)).toEqual(['DAILY PICKS']);
  expect(replaceBannedPhrases('daily\npicks')).toBe('Daily scan observations');
  expect(replaceBannedPhrases('daily\tpicks')).toBe('Daily scan observations');
  expect(replaceBannedPhrases('see DAILY PICKS today')).toBe('see Daily scan observations today');
});
