// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FuturesCloseClusterTimeline from '@/components/terminal/futures/FuturesCloseClusterTimeline';
import FuturesTerminalPanel from '@/components/terminal/futures/FuturesTerminalPanel';
import type { FuturesTerminalResponse } from '@/app/v2/_lib/api';
import { buildFuturesSessionState } from '@/lib/terminal/futures/futuresSessionEngine';
import { buildFuturesCloseCalendar } from '@/lib/terminal/futures/futuresCloseCalendar';

const now = new Date('2026-10-05T15:00:00Z');
const session = buildFuturesSessionState('/ES', now);
const calendar = buildFuturesCloseCalendar('/ES', 'globex', 1, now);

beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('pins the futures close list to wrapping rows and a folded schedule', () => {
  const timeline = readFileSync('components/terminal/futures/FuturesCloseClusterTimeline.tsx', 'utf8');
  const page = readFileSync('app/tools/terminal/page.tsx', 'utf8');
  expect(timeline).not.toContain('overflow-x');
  expect(timeline).not.toContain('min-w-[');
  expect(timeline).not.toContain('<table');
  expect(timeline).not.toContain('whitespace-nowrap');
  expect(timeline).toContain('min-w-0');
  expect(timeline).toContain('break-words');
  expect(page).toContain('title="Schedule range"');
  expect(page).toContain('Schedule basis');
  expect(page).not.toContain('min-w-[620px]');
  expect(page).not.toContain('Anchor Mode');
});

it('shows five closes in calendar order, then the full list, without raw timestamps', () => {
  const snapshot = JSON.stringify(calendar);
  const { container } = render(<FuturesCloseClusterTimeline closeCalendar={calendar} />);
  const rows = () => container.querySelectorAll('[data-futures-close-row]');
  expect(rows()).toHaveLength(5);
  expect(calendar.schedule.length).toBeGreaterThan(5);
  calendar.schedule.slice(0, 5).forEach((row, index) => {
    expect(rows()[index].textContent?.startsWith(row.timeframe)).toBe(true);
  });
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  expect(container.querySelector('table')).toBeNull();
  expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  expect(container.textContent).not.toMatch(/\bScore\b|cash_bridge|Anchor Mode/);
  expect(container.textContent).toContain('Globex');
  fireEvent.click(screen.getByRole('button', { name: `Show all ${calendar.schedule.length}` }));
  expect(rows()).toHaveLength(calendar.schedule.length);
  expect(rows()[5].textContent).toContain(calendar.schedule[5].timeframe);
  fireEvent.click(screen.getByRole('button', { name: 'Show five' }));
  expect(rows()).toHaveLength(5);
  expect(JSON.stringify(calendar)).toBe(snapshot);
});

it('resets the expanded list when the schedule basis changes', () => {
  const cashBridge = buildFuturesCloseCalendar('/ES', 'cash_bridge', 1, now);
  const { container, rerender } = render(<FuturesCloseClusterTimeline closeCalendar={calendar} />);
  fireEvent.click(screen.getByRole('button', { name: `Show all ${calendar.schedule.length}` }));
  rerender(<FuturesCloseClusterTimeline closeCalendar={cashBridge} />);
  expect(container.querySelectorAll('[data-futures-close-row]')).toHaveLength(5);
  expect(container.textContent).toContain('Cash bridge');
  expect(container.textContent).not.toContain('cash_bridge');
});

it('keeps one futures summary and source line, and states an empty range', () => {
  const data = {
    symbol: '/ES',
    marketPath: 'futures',
    session,
    closeCalendar: calendar,
    riskNotice: 'Research and simulation only.',
    dataState: 'ready',
    errors: [],
  } as FuturesTerminalResponse;
  const { container, rerender } = render(
    <FuturesTerminalPanel data={data} loading={false} error={null} tab="Close Calendar" symbol="/ES" />,
  );
  expect(container.querySelectorAll('[data-futures-summary]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-futures-close-row]')).toHaveLength(5);
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  expect(container.querySelector('table')).toBeNull();
  rerender(
    <FuturesTerminalPanel
      data={{ ...data, closeCalendar: { ...calendar, schedule: [], clusters: [], timeline: [], warnings: ['Globex is currently closed. Next open: Sunday 18:00 ET.'] } }}
      loading={false}
      error={null}
      tab="Close Calendar"
      symbol="/ES"
    />,
  );
  expect(container.textContent).toContain('No upcoming closes in this range.');
  expect(container.textContent).toContain('Globex is currently closed.');
  expect(container.querySelectorAll('[data-futures-close-row]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-futures-summary]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
