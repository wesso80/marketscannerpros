import { expect, it } from 'vitest';
import { replaceBannedPhrases, scanForBannedPhrases } from '@/lib/compliance/bannedPhrases';

it('flags the daily picks phrase on a word boundary', () => {
  expect(scanForBannedPhrases('Here are the daily picks').map((match) => match.phrase)).toEqual(['daily picks']);
  expect(scanForBannedPhrases('Daily   Picks today').map((match) => match.phrase)).toEqual(['Daily   Picks']);
  expect(scanForBannedPhrases('daily pickings and pick of the day')).toEqual([]);
  expect(replaceBannedPhrases('the daily picks list')).toBe('the daily scan list');
});
