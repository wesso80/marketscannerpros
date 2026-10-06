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
  expect(formatChangePercent(1.17361729778529)).toBe('+1.17%');
  expect(formatChangePercent(-0.62708)).toBe('-0.63%');
  expect(formatChangePercent(-0.61583)).toBe('-0.62%');
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

it('rounds crypto dashboard changes in the shared tile and shows the response time in Sydney', () => {
  const tile = readFileSync('components/visual/StatTile.tsx', 'utf8');
  const page = readFileSync('app/tools/crypto-dashboard/page.tsx', 'utf8');
  expect(tile).toContain('formatChangePercent(measuredChange)');
  expect(page).toContain("formatMarketTime(lastUpdate.toISOString(), 'Australia/Sydney')");
  expect(page).not.toContain('received ${lastUpdate.toISOString()}');
  expect(readFileSync('app/api/crypto/open-interest/route.ts', 'utf8')).not.toContain('formatChangePercent');
});
