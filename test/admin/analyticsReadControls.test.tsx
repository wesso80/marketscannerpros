// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ paused: true }));
vi.mock('@/app/admin/admin-client-layout', () => ({ useAdmin: () => ({ discoveryPaused: state.paused }) }));
vi.mock('@/components/admin/OutcomeCohortAnalysis', () => ({ default: () => null }));
import MorningBrief from '@/app/admin/morning-brief/page';
import Outcomes from '@/app/admin/outcomes/page';
const fetchMock = vi.fn();
beforeEach(() => {
  state.paused = true;
  vi.stubGlobal('React', React);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async (url: string) => ({
    ok: true, json: async () => url.includes('/signals?') ? { signals: [], total: 0 } : null,
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('allows saved-brief reload but disables all header writers while paused', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'No saved brief is available.' }) });
  render(<MorningBrief />);
  const reload = await screen.findByRole('button', { name: /Reload Saved/ });
  expect((reload as HTMLButtonElement).disabled).toBe(false);
  const writers = screen.getAllByRole('button').filter(button => button !== reload);
  expect(writers.length).toBeGreaterThanOrEqual(7);
  for (const button of writers) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
  }
  fireEvent.click(reload);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  for (const [, init] of fetchMock.mock.calls) expect(init?.method ?? 'GET').toBe('GET');
});
it('keeps outcome refresh available and never sends manual label requests while paused', async () => {
  render(<Outcomes />);
  const label = screen.getByRole('button', { name: 'Run Labeler Now' });
  expect((label as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  fireEvent.click(label);
  fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/cron/'))).toBe(false);
});
it('restores existing manual controls when the owner explicitly ends the pause', async () => {
  state.paused = false;
  render(<Outcomes />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect((screen.getByRole('button', { name: 'Run Labeler Now' }) as HTMLButtonElement).disabled).toBe(false);
});
