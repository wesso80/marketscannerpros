// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/tools/terminal',
}));
vi.mock('@/lib/useUserTier', () => ({
  useUserTier: () => ({ tier: 'pro', isLoading: false, isLoggedIn: true, isAdmin: false, email: null }),
  canAccessOptionsTerminal: () => true,
}));

import OptionsFlowPage from '@/components/options-terminal/OptionsFlowView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Options Flow ticker input', () => {
  it('keeps a single ticker field on the standalone view and none when the page already supplies the symbol', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'blocked' }) })));
    const { unmount } = render(<OptionsFlowPage />);
    expect(screen.getAllByLabelText('Ticker symbol')).toHaveLength(1);
    unmount();

    render(<OptionsFlowPage embeddedInTerminal symbol="MU" />);
    expect(screen.queryByLabelText('Ticker symbol')).toBeNull();
    expect(screen.getByTestId('flow-loaded-symbol').textContent).toBe('MU');
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
