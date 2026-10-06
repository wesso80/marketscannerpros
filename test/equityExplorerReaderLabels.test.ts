import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ASSET_EXPLORER_LABELS, assetExplorerLabel, equityExplorerLabel } from '@/lib/presentation/equityExplorerLabel';

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
  ['Zone 2 • News & Guides', 'News and guides'],
  ['ZONE 2 • NEWS & GUIDES', 'News and guides'],
  ['Zone 3 • Institutional Treasury Holdings', 'Institutional treasury holdings'],
];

it.each(mapped)('maps %s to the reader label %s', (raw, label) => {
  expect(assetExplorerLabel(raw)).toBe(label);
  expect(equityExplorerLabel(raw)).toBe(label);
  expect(assetExplorerLabel(raw)).not.toMatch(ENGINE_TOKEN);
  expect(assetExplorerLabel(raw)).not.toMatch(/Zone [123]|CRCS|ΔHr/);
});

it('falls back to plain words for an unknown engine token', () => {
  expect(assetExplorerLabel('ZZZ_NEW_STATE')).toBe('Zzz new state');
  expect(assetExplorerLabel('FUTURE STAGE')).toBe('Future stage');
  expect(assetExplorerLabel('ZZZ_NEW_STATE')).not.toBe('ZZZ_NEW_STATE');
  expect(assetExplorerLabel(null)).toBe('Not recorded');
  expect(assetExplorerLabel('')).toBe('Not recorded');
  expect(assetExplorerLabel('   ')).toBe('Not recorded');
});

it('leaves prose and camelCase alone', () => {
  const prose = 'Use Zone 1 for state and read the CRCS chip before ΔHr.';
  expect(assetExplorerLabel(prose)).toBe(prose);
  expect(assetExplorerLabel('crcsUser')).toBe('crcsUser');
  expect(assetExplorerLabel('microAdjustment')).toBe('microAdjustment');
  expect(assetExplorerLabel('See CRCS in the note')).toBe('See CRCS in the note');
  expect(assetExplorerLabel('Read ZONE 2 • NEWS & GUIDES before the open.')).toBe('Read ZONE 2 • NEWS & GUIDES before the open.');
});

it('exports the shared map for the crypto assets tab', () => {
  expect(ASSET_EXPLORER_LABELS.CRCS).toBe('Capital score');
  expect(ASSET_EXPLORER_LABELS['ΔHR']).toBe('Hourly adjustment');
  expect(ASSET_EXPLORER_LABELS['ZONE 1']).toBe('Equity analysis gate');
  expect(equityExplorerLabel).toBe(assetExplorerLabel);
});

it('uses the reader labels on the Equity Explorer and leaves scores alone', () => {
  const page = readFileSync('app/tools/equity-explorer/page.tsx', 'utf8');
  expect(page).toContain("assetExplorerLabel('CRCS')");
  expect(page).toContain("assetExplorerLabel('ΔHr')");
  expect(page).toContain("assetExplorerLabel('Zone 1')");
  expect(page).toContain("assetExplorerLabel('Zone 2 · Action')");
  expect(page).toContain("assetExplorerLabel('Zone 2 • Context')");
  expect(page).toContain("assetExplorerLabel('Zone 3')");
  expect(page).not.toContain("['CRCS'");
  expect(page).not.toContain("['ΔHr'");
  expect(page).not.toContain('>Zone 1');
  expect(page).not.toContain('>Zone 2');
  expect(page).not.toContain('>Zone 3');
  expect(readFileSync('lib/upe.ts', 'utf8')).not.toContain('assetExplorerLabel');
  expect(readFileSync('worker/upe-crcs-hourly.ts', 'utf8')).not.toContain('assetExplorerLabel');
  expect(readFileSync('lib/scoring/canonical/dailyPick.ts', 'utf8')).not.toContain('assetExplorerLabel');
});
