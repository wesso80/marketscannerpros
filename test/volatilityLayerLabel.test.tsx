// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import VEHeatmapGauge from '@/src/features/volatilityEngine/components/VEHeatmapGauge';
import VEPhasePanel from '@/src/features/volatilityEngine/components/VEPhasePanel';
import VESignalCard from '@/src/features/volatilityEngine/components/VESignalCard';
import VEProjectionCard from '@/src/features/volatilityEngine/components/VEProjectionCard';
import { volatilityBadgeLabel, volatilityHeadingLabel } from '@/lib/presentation/volatilityLayerLabel';
import type { PublicPhase, PublicProjection, PublicVolatility } from '@/src/features/volatilityEngine/types';

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

const badges: Array<[string, string]> = [
  ['VOL', 'Volatility'],
  ['DIR', 'Direction'],
  ['PH', 'Phase'],
  ['SIG', 'Marker'],
  ['PROJ', 'Projection'],
  ['SUP', 'Support'],
  ['vol', 'Volatility'],
];

const headings: Array<[string, string]> = [
  ['VOL', 'Volatility state'],
  ['DIR', 'Directional bias'],
  ['PH', 'Phase persistence'],
  ['SIG', 'Marker and invalidation'],
  ['PROJ', 'Outcome projection'],
  ['SUP', 'Supporting analysis'],
];

// W3 DVE v2: the cards render the public reading (lib/research/publicDve).
const vol: PublicVolatility = {
  bbwp: 42, bbwpSma5: 40, regime: 'neutral',
  rateOfChange: 1, rateSmoothed: 1, acceleration: 0, rateDirection: 'flat',
  squeeze: { inSqueeze: false, definition: 'Bollinger bands inside Keltner channels' },
};

const phase: PublicPhase = {
  contraction: { active: false, stats: { currentBars: 1, averageBars: 2, medianBars: 2, maxBars: 3, agePercentile: 40, episodeCount: 1 } },
  expansion: { active: true, stats: { currentBars: 4, averageBars: 3, medianBars: 3, maxBars: 8, agePercentile: 60, episodeCount: 2 } },
};

const projection: PublicProjection = { signalType: 'none', sampleSize: 0, minimumSample: 5, stats: null, period: null, note: 'No recorded rule, so no past-case study.' };

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(badges)('maps badge %s to %s', (raw, label) => {
  expect(volatilityBadgeLabel(raw)).toBe(label);
  expect(volatilityBadgeLabel(raw)).not.toMatch(ENGINE_TOKEN);
});

it.each(headings)('maps heading %s to %s', (raw, label) => {
  expect(volatilityHeadingLabel(raw)).toBe(label);
  expect(volatilityHeadingLabel(raw)).not.toMatch(/LAYER\s+\d/i);
});

it('falls back to plain words for an unknown layer code', () => {
  expect(volatilityBadgeLabel('ZZZ_NEW_LAYER')).toBe('Zzz new layer');
  expect(volatilityHeadingLabel('FUTURE STAGE')).toBe('Future stage');
  expect(volatilityBadgeLabel('ZZZ_NEW_LAYER')).not.toMatch(ENGINE_TOKEN);
  expect(volatilityBadgeLabel(null)).toBe('Not recorded');
  expect(volatilityBadgeLabel('')).toBe('Not recorded');
  expect(volatilityHeadingLabel('   ')).toBe('Not recorded');
  expect(volatilityBadgeLabel('Already plain')).toBe('Already plain');
});

it('shows plain badges on the volatility cards', () => {
  const gauge = render(<VEHeatmapGauge vol={vol} />);
  expect(gauge.container.textContent).toContain('Volatility');
  expect(gauge.container.textContent).not.toMatch(/\bVOL\b/);
  cleanup();
  const phases = render(<VEPhasePanel phase={phase} />);
  expect(phases.container.textContent).toContain('Phase');
  expect(phases.container.textContent).toContain('Phase Persistence');
  expect(phases.container.textContent).not.toMatch(/\bPH\b/);
  cleanup();
  const signal = render(<VESignalCard signal={{ type: 'none', state: 'idle', active: false, triggerReason: [], conditions: null }} />);
  expect(signal.container.textContent).toContain('Signal');
  expect(signal.container.textContent).not.toMatch(/\bSIG\b/);
  cleanup();
  const card = render(<VEProjectionCard proj={projection} />);
  expect(card.container.textContent).toContain('Projection');
  expect(card.container.textContent).not.toMatch(/\bPROJ\b/);
});

it('keeps the layer order and drops terse codes from the page source', () => {
  const page = readFileSync('src/features/volatilityEngine/VolatilityEnginePage.tsx', 'utf8');
  expect(page).toContain('volatilityBadgeLabel');
  expect(page).toContain('volatilityHeadingLabel');
  expect(page.indexOf('<VEVolatilityPhaseCard')).toBeLessThan(page.indexOf('code="VOL"'));
  expect(page).not.toContain('Layer 1 — Volatility State');
  expect(page).not.toContain('Layer 4 — Signal');
  expect(page).not.toContain('>VOL<');
  expect(page).not.toContain('>DIR<');
  expect(page).not.toContain('>SUP<');
  for (const file of [
    'src/features/volatilityEngine/components/VEHeatmapGauge.tsx',
    'src/features/volatilityEngine/components/VEPhasePanel.tsx',
    'src/features/volatilityEngine/components/VESignalCard.tsx',
    'src/features/volatilityEngine/components/VEProjectionCard.tsx',
  ]) {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('volatilityBadgeLabel');
    expect(source).toContain('whitespace-nowrap');
    expect(source).not.toMatch(/>VOL<|>DIR<|>PH<|>SIG<|>PROJ<|>SUP</);
  }
});
