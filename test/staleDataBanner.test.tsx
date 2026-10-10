// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import StaleDataBanner from '@/components/StaleDataBanner';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StaleDataBanner', () => {
  it('shows the banner when /api/health/stale returns stale true', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ stale: true }) }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StaleDataBanner />);

    expect(await screen.findByText('Data may be stale')).toBeTruthy();
    expect(screen.getByText(/hasn't refreshed recently/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/health/stale', { cache: 'no-store' });
  });

  it('renders nothing when the stale check errors', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<StaleDataBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await fetchMock.mock.results[0]?.value.catch(() => undefined);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Data may be stale')).toBeNull();
  });

  it('renders nothing when the stale check returns a non-OK response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ stale: true, circuits: { alphaVantage: { name: 'alpha-vantage' } } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<StaleDataBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await fetchMock.mock.results[0]?.value;
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Data may be stale')).toBeNull();
  });
});
