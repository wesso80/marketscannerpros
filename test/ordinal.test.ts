import { expect, it } from 'vitest';
import { fixOrdinalSuffixes, ordinal } from '@/lib/utils/ordinal';

const cases: Array<[number, string]> = [
  [1, '1st'],
  [2, '2nd'],
  [3, '3rd'],
  [4, '4th'],
  [11, '11th'],
  [12, '12th'],
  [13, '13th'],
  [21, '21st'],
  [22, '22nd'],
  [23, '23rd'],
  [83, '83rd'],
  [92, '92nd'],
  [101, '101st'],
  [111, '111th'],
  [112, '112th'],
  [113, '113th'],
];

it.each(cases)('ordinal(%i) is %s', (n, label) => {
  expect(ordinal(n)).toBe(label);
});

it('repairs a hand-rolled th suffix and leaves a correct one', () => {
  expect(fixOrdinalSuffixes('volume 2.40× 20d avg (92th pct of 60d)')).toBe('volume 2.40× 20d avg (92nd pct of 60d)');
  expect(fixOrdinalSuffixes('BB width 83th percentile')).toBe('BB width 83rd percentile');
  expect(fixOrdinalSuffixes('rank 11th, 12th, 13th, 21st, 22nd, 23rd, 101st and 111th')).toBe('rank 11th, 12th, 13th, 21st, 22nd, 23rd, 101st and 111th');
  expect(fixOrdinalSuffixes('101th and 1th and 2th and 3th')).toBe('101st and 1st and 2nd and 3rd');
});
