// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { futuresScheduleRangeSummary, horizonChipLabel, terminalHorizonLabel } from '@/lib/terminal/horizonChip';
import FuturesCloseClusterTimeline from '@/components/terminal/futures/FuturesCloseClusterTimeline';
import { buildFuturesCloseCalendar } from '@/lib/terminal/futures/futuresCloseCalendar';

afterEach(() => cleanup());

it('labels a known horizon in plain words', () => {
  expect(horizonChipLabel(1)).toBe('1 day');
  expect(horizonChipLabel(7)).toBe('7 days');
  expect(futuresScheduleRangeSummary(1, 'Globex')).toBe('Today, 1 day, Globex');
  expect(terminalHorizonLabel(1, 'Mon Oct 6 16:00 ET')).toBe('1 day to Mon Oct 6 16:00 ET');
  expect(futuresScheduleRangeSummary(1, 'Globex')).not.toContain('?');
  expect(terminalHorizonLabel(1, 'Mon Oct 6 16:00 ET')).not.toContain('?');
});

it('hides the horizon chip when the day count is missing', () => {
  expect(horizonChipLabel(undefined)).toBeNull();
  expect(horizonChipLabel(null)).toBeNull();
  expect(horizonChipLabel(Number.NaN)).toBeNull();
  expect(horizonChipLabel(0)).toBeNull();
  expect(futuresScheduleRangeSummary(null, 'Globex')).toBe('Today, Globex');
  expect(terminalHorizonLabel(undefined, 'Mon Oct 6 16:00 ET')).toBeNull();
});

it('shows the futures close-calendar horizon chip only when the schedule has a day count', () => {
  const calendar = buildFuturesCloseCalendar('/ES', 'globex', 1, new Date('2026-10-05T15:00:00Z'));
  const withValue = render(<FuturesCloseClusterTimeline closeCalendar={calendar} />);
  const chip = withValue.container.querySelector('[data-horizon-chip]');
  expect(chip?.textContent).toBe('1 day');
  expect(withValue.container.textContent).not.toContain('?');
  cleanup();

  const missing = render(
    <FuturesCloseClusterTimeline closeCalendar={{ ...calendar, horizonDays: Number.NaN }} />,
  );
  expect(missing.container.querySelector('[data-horizon-chip]')).toBeNull();
  expect(missing.container.textContent).toContain('Close Calendar');
});

it('does not leave a question-mark glyph on the terminal horizon line', () => {
  const page = readFileSync('app/tools/terminal/page.tsx', 'utf8');
  expect(page).toContain('futuresScheduleRangeSummary(horizon, FUTURES_ANCHOR_LABEL[futuresAnchorMode])');
  expect(page).toContain('terminalHorizonLabel(');
  expect(page).not.toContain('horizonDays}d ?');
});
