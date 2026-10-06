import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { sentimentReaderLabel, sentimentToneClass } from '@/lib/presentation/sentimentLabel';

it('turns hyphenated sentiment codes into reader labels', () => {
  expect(sentimentReaderLabel('Somewhat-Positive')).toBe('Somewhat positive');
  expect(sentimentReaderLabel('Somewhat-Bullish')).toBe('Somewhat positive');
  expect(sentimentReaderLabel('SOMEWHAT_BEARISH')).toBe('Somewhat negative');
  expect(sentimentReaderLabel('somewhat negative')).toBe('Somewhat negative');
  expect(sentimentReaderLabel('Bullish')).toBe('Positive');
  expect(sentimentReaderLabel('Bearish')).toBe('Negative');
  expect(sentimentReaderLabel('Neutral')).toBe('Neutral');
  expect(sentimentReaderLabel('neutral')).toBe('Neutral');
});

it('leaves sentences and camelCase unchanged', () => {
  const prose = 'Somewhat-Positive coverage still names the Neutral tape.';
  expect(sentimentReaderLabel(prose)).toBe(prose);
  expect(sentimentReaderLabel('somewhatBullish')).toBe('somewhatBullish');
  expect(sentimentReaderLabel('See CRCS in the note')).toBe('See CRCS in the note');
  expect(sentimentReaderLabel(null)).toBe('Not collected');
  expect(sentimentReaderLabel('')).toBe('Not collected');
});

it('paints Neutral grey and keeps positive and negative tones apart', () => {
  expect(sentimentToneClass('Neutral')).toBe('text-slate-400');
  expect(sentimentToneClass('Somewhat-Positive')).toBe('text-emerald-400');
  expect(sentimentToneClass('Somewhat-Bearish')).toBe('text-red-400');
  expect(sentimentToneClass('Bearish')).toBe('text-red-400');
  expect(sentimentToneClass('A neutral sentence about losses')).toBe('text-slate-400');
});

it('uses the reader label and tone on Research news', () => {
  const page = readFileSync('app/tools/research/page.tsx', 'utf8');
  expect(page).toContain('sentimentReaderLabel(n.sentiment.label)');
  expect(page).toContain('sentimentToneClass(n.sentiment.label)');
  expect(page).not.toContain('n.sentiment.score > 0');
  expect(readFileSync('lib/equityNewsRelevance.ts', 'utf8')).not.toContain('sentimentReaderLabel');
});
