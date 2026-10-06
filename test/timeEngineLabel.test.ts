import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  decompressionStatusLabel,
  targetStatusLine,
  timeEngineLabel,
  timeEngineProse,
} from '@/lib/presentation/timeEngineLabel';

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

const mapped: Array<[string, string]> = [
  ['TARGET ACTIVE', 'Active target'],
  ['TARGET_ACTIVE', 'Active target'],
  ['TARGET HIT', 'Target reached'],
  ['TARGET_HIT', 'Target reached'],
  ['TARGET OVERSHOT', 'Target passed'],
  ['TARGET_OVERSHOT', 'Target passed'],
  ['OVERSHOT', 'Passed'],
  ['RECOMPUTING', 'Recalculating'],
  ['EXPANSION', 'Expansion'],
  ['NO_TARGET', 'No active target'],
  ['MOMENTUM OVERRIDE', 'Momentum leading'],
  ['MOMENTUM_OVERRIDE', 'Momentum leading'],
  ['MAGNET', 'Magnet'],
  ['LOW PRIORITY', 'Low priority'],
  ['LOW_PRIORITY', 'Low priority'],
  ['COMPRESSION', 'Compression'],
  ['PRE_WINDOW', 'Before window'],
  ['POST_WINDOW', 'After window'],
  ['IN_WINDOW', 'In window'],
  ['TAGGED', 'Reached'],
  ['HIT', 'Reached'],
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
  ['UNKNOWN', 'Not recorded'],
  ['CONFIRMED', 'Confirmed'],
  ['PENDING', 'Pending'],
  ['FAILED', 'Not confirmed'],
  ['RANGE_SPIKE', 'Range spike'],
  ['BREAK_HOLD', 'Break and hold'],
  ['AOI TARGET ZONES', 'Target zones'],
  ['AOI', 'Area of interest'],
];

it.each(mapped)('maps %s to the reader label %s', (raw, label) => {
  expect(timeEngineLabel(raw)).toBe(label);
  expect(timeEngineLabel(raw)).not.toMatch(ENGINE_TOKEN);
});

it('falls back to plain words for an unknown engine token', () => {
  expect(timeEngineLabel('ZZZ_NEW_STATE')).toBe('Zzz new state');
  expect(timeEngineLabel('FUTURE STAGE')).toBe('Future stage');
  expect(timeEngineLabel('ZZZ_NEW_STATE')).not.toBe('ZZZ_NEW_STATE');
  expect(timeEngineLabel('ZZZ_NEW_STATE')).not.toMatch(ENGINE_TOKEN);
  expect(timeEngineLabel(null)).toBe('Not recorded');
  expect(timeEngineLabel('')).toBe('Not recorded');
  expect(timeEngineLabel('   ')).toBe('Not recorded');
  expect(timeEngineLabel('Already plain note')).toBe('Already plain note');
});

it('names decompression ACTIVE as the open window, not a price target', () => {
  expect(decompressionStatusLabel('ACTIVE')).toBe('In window');
  expect(decompressionStatusLabel('PRE_WINDOW')).toBe('Before window');
  expect(decompressionStatusLabel('POST_WINDOW')).toBe('After window');
  expect(decompressionStatusLabel('TAGGED')).toBe('Reached');
  expect(decompressionStatusLabel('COMPRESSION')).toBe('Compression');
  expect(decompressionStatusLabel('ZZZ_NEW_STATE')).toBe('Zzz new state');
});

it('keeps banner facts and replaces only the engine code', () => {
  expect(targetStatusLine('ACTIVE', '253.00', 0)).toBe('Active target: 253.00');
  expect(targetStatusLine('TARGET_HIT', null, 2)).toBe('Target reached — All midpoints tagged');
  expect(targetStatusLine('OVERSHOT', null, 3)).toBe('Target passed — Price blew past 3 midpoint(s)');
  expect(targetStatusLine('EXPANSION', null, 0)).toBe('Momentum leading — Expansion targets active');
  expect(targetStatusLine('RECOMPUTING', null, 0)).toBe('Recalculating — Finding next target...');
  expect(targetStatusLine('NO_TARGET', null, 0)).toBe('No active gravity targets');
  expect(targetStatusLine('ZZZ_NEW_STATE', null, 0)).toBe('Zzz new state');
  expect(targetStatusLine('ACTIVE', '253.00', 0)).not.toMatch(/TARGET ACTIVE/);
});

it('replaces codes inside existing sentences and leaves ordinary words', () => {
  expect(timeEngineProse('TARGET ACTIVE: 253.00')).toBe('Active target: 253.00');
  expect(timeEngineProse('✅ TARGET HIT — All 2 midpoint(s) tagged this cycle.')).toBe('✅ Target reached — All 2 midpoint(s) tagged this cycle.');
  expect(timeEngineProse('⚡ MOMENTUM OVERRIDE: range_spike(2.10x) + break_hold | Mode: EXPANSION')).toBe('⚡ Momentum leading: Range spike(2.10x) + Break and hold | Mode: Expansion');
  expect(timeEngineProse('Gravity dampened. ZZZ_NEW_STATE still recorded. NYSE close stays.')).toBe('Gravity dampened. Zzz new state still recorded. NYSE close stays.');
  expect(timeEngineProse('ordinary_note stays')).toBe('ordinary_note stays');
  expect(timeEngineProse(null)).toBe('Not recorded');
  expect(timeEngineProse('   ')).toBe('Not recorded');
});

it('uses the label helper in the nested panels and does not restructure them', () => {
  const widget = readFileSync('components/TimeGravityMapWidget.tsx', 'utf8');
  const page = readFileSync('components/time/TimeScannerPage.tsx', 'utf8');
  expect(widget).toContain('targetStatusLine');
  expect(widget).toContain('decompressionStatusLabel');
  expect(widget).toContain('timeEngineProse');
  expect(widget).toContain("timeEngineLabel('MOMENTUM OVERRIDE')");
  expect(widget).toContain("timeEngineLabel('AOI TARGET ZONES')");
  expect(widget).not.toContain('TARGET ACTIVE');
  expect(widget).not.toContain('MOMENTUM OVERRIDE:');
  expect(widget).not.toContain('>AOI TARGET ZONES<');
  expect(page).toContain('timeEngineLabel(input.setup.window.status)');
  expect(page).toContain('timeEngineLabel(input.execution.closeConfirmation)');
  expect(page).toContain('<details className="w-full rounded-2xl border border-slate-800 bg-slate-900/30">');
  expect(page).toContain('Time Gravity Map');
  expect(page).toContain('Intraday Equity Close Schedule');
});
