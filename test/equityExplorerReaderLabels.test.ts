import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { equityExplorerLabel } from '@/lib/presentation/equityExplorerLabel';

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

const mapped: Array<[string, string]> = [
  ['CRCS', 'Capital score'],
  ['crcs', 'Capital score'],
  ['ΔHr', 'Hourly adjustment'],
  ['ΔHR', 'Hourly adjustment'],
  ['Zone 1', 'Equity analysis gate'],
  ['ZONE_1', 'Equity analysis gate'],
  ['Zone 2 · Action', 'Price and alignment'],
  ['Zone 2 • Context', 'Market context'],
  ['Zone 3', 'Additional detail'],
  ['Zone 3 • Informational', 'Additional detail'],
];

it.each(mapped)('maps %s to the reader label %s', (raw, label) => {
  expect(equityExplorerLabel(raw)).toBe(label);
  expect(equityExplorerLabel(raw)).not.toMatch(ENGINE_TOKEN);
  expect(equityExplorerLabel(raw)).not.toMatch(/Zone [123]|CRCS|ΔHr/);
});

it('falls back to plain words for an unknown engine token', () => {
  expect(equityExplorerLabel('ZZZ_NEW_STATE')).toBe('Zzz new state');
  expect(equityExplorerLabel('FUTURE STAGE')).toBe('Future stage');
  expect(equityExplorerLabel('ZZZ_NEW_STATE')).not.toBe('ZZZ_NEW_STATE');
  expect(equityExplorerLabel(null)).toBe('Not recorded');
  expect(equityExplorerLabel('')).toBe('Not recorded');
  expect(equityExplorerLabel('   ')).toBe('Not recorded');
});

it('uses the reader labels on the Equity Explorer and leaves scores alone', () => {
  const page = readFileSync('app/tools/equity-explorer/page.tsx', 'utf8');
  expect(page).toContain("equityExplorerLabel('CRCS')");
  expect(page).toContain("equityExplorerLabel('ΔHr')");
  expect(page).toContain("equityExplorerLabel('Zone 1')");
  expect(page).toContain("equityExplorerLabel('Zone 2 · Action')");
  expect(page).toContain("equityExplorerLabel('Zone 2 • Context')");
  expect(page).toContain("equityExplorerLabel('Zone 3')");
  expect(page).not.toContain("['CRCS'");
  expect(page).not.toContain("['ΔHr'");
  expect(page).not.toContain('>Zone 1');
  expect(page).not.toContain('>Zone 2');
  expect(page).not.toContain('>Zone 3');
  expect(readFileSync('lib/upe.ts', 'utf8')).not.toContain('equityExplorerLabel');
  expect(readFileSync('worker/upe-crcs-hourly.ts', 'utf8')).not.toContain('equityExplorerLabel');
  expect(readFileSync('lib/scoring/canonical/dailyPick.ts', 'utf8')).not.toContain('equityExplorerLabel');
});
