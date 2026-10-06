import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { formatChangePercent } from '@/lib/presentation/formatChangePercent';

it('rounds a displayed percentage change to two decimals', () => {
  expect(formatChangePercent('-0.2397%')).toBe('-0.24%');
  expect(formatChangePercent(-0.2397)).toBe('-0.24%');
  expect(formatChangePercent('1.234%')).toBe('+1.23%');
  expect(formatChangePercent(0)).toBe('0.00%');
  expect(formatChangePercent(null)).toBe('Not recorded');
  expect(formatChangePercent('')).toBe('Not recorded');
  expect(formatChangePercent('N/A')).toBe('Not recorded');
});

it('formats the Fundamentals price change in the view and leaves the payload raw', () => {
  const page = readFileSync('app/tools/company-overview/page.tsx', 'utf8');
  const route = readFileSync('app/api/company-overview/route.ts', 'utf8');
  expect(page).toContain('formatChangePercent(data.changePercent)');
  expect(page).not.toContain('{data.changePercent}');
  expect(route).toContain('changePercent: quote?.changePct != null ? `${quote.changePct}%` : null');
  expect(route).not.toContain('formatChangePercent');
  expect(readFileSync('lib/goldenEgg/companyOverview.ts', 'utf8')).not.toContain('formatChangePercent');
});
