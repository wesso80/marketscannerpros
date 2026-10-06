// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ quote: null as number | null, revision: 'rev-load', posts: 0 }));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/useUserTier', () => ({
  useUserTier: () => ({ tier: 'pro', isLoading: false }),
  getPortfolioLimit: () => 25,
  canExportCSV: () => false,
  canAccessPortfolioInsights: () => false,
}));
vi.mock('@/lib/ai/pageContext', () => ({ useAIPageContext: () => ({ setPageData: vi.fn() }) }));
vi.mock('@/components/risk/RiskPermissionContext', () => ({ useRiskPermission: () => ({ isLocked: false }) }));
vi.mock('@/lib/operatorState', () => ({ writeOperatorState: vi.fn() }));
vi.mock('@/lib/workflow/client', () => ({ createWorkflowEvent: vi.fn(() => ({ event_id: 'e1' })), emitWorkflowEvents: vi.fn() }));

import { PortfolioContent } from '@/app/tools/portfolio/page';

// Debounced saves plus a loaded page take longer than 5s when the full suite is running.
const itSlow = (name: string, fn: () => Promise<void>) => it(name, fn, 20_000);

type Book = {
  positions?: unknown[];
  closedPositions?: unknown[];
  performanceHistory?: unknown[];
  cashState?: { startingCapital: number; cashLedger: unknown[] } | null;
};

let book: Book = {};
let postStatus = 200;

function position(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, symbol: 'AAPL', side: 'LONG', quantity: 2, entryPrice: 100, currentPrice: 100,
    pl: 0, plPercent: 0, entryDate: '2026-10-01T00:00:00.000Z', ...overrides,
  };
}

function serverBook(extra: Book = {}): Book {
  return {
    positions: [position()],
    closedPositions: [],
    performanceHistory: [],
    cashState: { startingCapital: 10000, cashLedger: [] },
    ...extra,
  };
}

function portfolioPosts() {
  return vi.mocked(fetch).mock.calls.filter((call) => String(call[0]) === '/api/portfolio' && (call[1] as RequestInit | undefined)?.method === 'POST');
}

function postBody(index = 0) {
  const init = portfolioPosts()[index][1] as RequestInit;
  return JSON.parse(String(init.body));
}

async function settle(ms = 1200) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function loadPage() {
  render(<PortfolioContent embeddedInWorkspace />);
  // Overview is the default tab. AAPL is allocation text there, not a link.
  await screen.findByText('1 open simulation position');
  await settle();
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  localStorage.clear();
  book = serverBook();
  nav.quote = null;
  postStatus = 200;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    if (target.startsWith('/api/quote')) {
      if (nav.quote == null) return { ok: false, status: 404, json: async () => ({ ok: false }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, price: nav.quote }) };
    }
    if (target === '/api/portfolio' && init?.method === 'POST') {
      if (postStatus === 409) {
        return { ok: false, status: 409, json: async () => ({ conflict: 'stale_revision', syncRevision: 'rev-other' }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, syncRevision: 'rev-next', cashStateSaved: true }) };
    }
    if (target === '/api/portfolio' && init?.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({ success: true, deleted: 1, previousRevision: 'rev-load', syncRevision: 'rev-next' }) };
    }
    if (target === '/api/portfolio') {
      return { ok: true, status: 200, json: async () => ({ syncRevision: 'rev-load', ...book }) };
    }
    return { ok: false, status: 404, json: async () => ({ ok: false }) };
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

itSlow('does not POST when quotes or today\'s snapshot differ from the loaded book', async () => {
  const today = new Date().toISOString();
  book = serverBook({
    performanceHistory: [{ timestamp: today, totalValue: 1, totalPL: 0, basis: 'account_equity_v2' }],
  });
  nav.quote = null;
  render(<PortfolioContent embeddedInWorkspace />);
  await screen.findByText('1 open simulation position');
  await settle();
  expect(portfolioPosts()).toHaveLength(0);

  cleanup();
  nav.quote = 222;
  render(<PortfolioContent embeddedInWorkspace />);
  await screen.findByText('1 open simulation position');
  fireEvent.click(screen.getByRole('tab', { name: 'Positions' }));
  await screen.findByText('$222.00');
  await settle();
  expect(portfolioPosts()).toHaveLength(0);
});

function addMsft() {
  fireEvent.click(screen.getByRole('button', { name: 'Add Position', exact: true }));
  fireEvent.change(screen.getByPlaceholderText('Symbol (e.g. BTC, AAPL)'), { target: { value: 'MSFT' } });
  fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1' } });
  const priceInputs = screen.getAllByPlaceholderText('0.00');
  fireEvent.change(priceInputs[0], { target: { value: '10' } });
  fireEvent.change(priceInputs[1], { target: { value: '12' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Position' }).at(-1)!);
}

itSlow('POSTs with baseRevision when a position is added', async () => {
  await loadPage();
  addMsft();
  await settle();
  expect(postBody(0).baseRevision).toBe('rev-load');
  expect(postBody(0).positions.some((row: { symbol: string }) => row.symbol === 'MSFT')).toBe(true);
});

itSlow('POSTs with baseRevision when a position is closed', async () => {
  await loadPage();
  fireEvent.click(screen.getByRole('tab', { name: 'Positions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record Full Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record close' }));
  await settle();
  const closePost = postBody(0);
  expect(closePost.baseRevision).toBe('rev-load');
  expect(closePost.closedPositions.map((row: { symbol: string }) => row.symbol)).toContain('AAPL');
});

itSlow('POSTs with baseRevision when a position is deleted', async () => {
  await loadPage();
  fireEvent.click(screen.getByRole('tab', { name: 'Positions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await settle();
  const deletePost = postBody(0);
  // DELETE runs first and moves the gate to the post-delete revision. The debounced POST must carry that revision.
  expect(deletePost.baseRevision).toBe('rev-next');
  expect(deletePost.positions).toHaveLength(0);
});

itSlow('POSTs with baseRevision when cash is edited', async () => {
  await loadPage();
  fireEvent.click(screen.getByRole('tab', { name: 'Risk' }));
  fireEvent.change(screen.getByLabelText('Amount', { selector: 'input', hidden: true }), { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply Cash Flow', hidden: true }));
  await settle();
  const cashPost = postBody(0);
  expect(cashPost.baseRevision).toBe('rev-load');
  expect(cashPost.cashState.cashLedger.map((row: { amount: number }) => row.amount)).toContain(25);
});

itSlow('POSTs with baseRevision when the book is cleared', async () => {
  await loadPage();
  fireEvent.click(screen.getByRole('button', { name: 'Clear All Data', hidden: true }));
  await settle();
  const clearPost = postBody(0);
  expect(clearPost.baseRevision).toBe('rev-load');
  expect(clearPost.confirmClear).toBe(true);
  expect(clearPost.positions).toHaveLength(0);
  expect(clearPost.closedPositions).toHaveLength(0);
});

itSlow('does not POST or import a device book when server cash is missing or the server book is empty', async () => {
  localStorage.setItem('portfolio_cash_ledger', JSON.stringify([{ id: 'local', type: 'deposit', amount: 99, timestamp: '2026-10-01T00:00:00.000Z', note: 'DEVICE-CASH-99' }]));
  localStorage.setItem('portfolio_starting_capital', '424242');
  book = serverBook({ cashState: null });
  render(<PortfolioContent embeddedInWorkspace />);
  await screen.findByText('1 open simulation position');
  await settle();
  fireEvent.click(screen.getByRole('tab', { name: 'Risk' }));
  expect((screen.getByLabelText('Starting Capital', { selector: 'input', hidden: true }) as HTMLInputElement).value).toBe('10000');
  expect(document.body.textContent).not.toContain('DEVICE-CASH-99');
  expect(localStorage.getItem('portfolio_starting_capital')).toBe('10000');
  expect(localStorage.getItem('portfolio_cash_ledger')).not.toContain('DEVICE-CASH-99');
  expect(portfolioPosts()).toHaveLength(0);

  cleanup();
  localStorage.setItem('portfolio_positions', JSON.stringify([position({ id: 9, symbol: 'LOCAL' })]));
  book = { positions: [], closedPositions: [], performanceHistory: [], cashState: null };
  render(<PortfolioContent embeddedInWorkspace />);
  await screen.findByText('No open simulation positions');
  await settle();
  expect(document.body.textContent).not.toContain('LOCAL');
  expect(localStorage.getItem('portfolio_positions')).not.toContain('LOCAL');
  expect(portfolioPosts()).toHaveLength(0);
});

itSlow('does not POST from either copy when two portfolio pages load together', async () => {
  render(<><PortfolioContent embeddedInWorkspace /><PortfolioContent embeddedInWorkspace /></>);
  expect(await screen.findAllByText('1 open simulation position')).toHaveLength(2);
  await settle();
  expect(portfolioPosts()).toHaveLength(0);
});

itSlow('after a 409, does not auto-POST and the next GET does not send the forked book', async () => {
  postStatus = 409;
  await loadPage();
  const before = portfolioPosts().length;
  addMsft();
  await settle();
  expect(portfolioPosts()).toHaveLength(before + 1);
  expect(screen.getByText(/drops unsynced changes on this device/)).toBeTruthy();

  nav.quote = 333;
  fireEvent.click(screen.getByRole('tab', { name: 'Positions' }));
  fireEvent.click(screen.getByRole('button', { name: /Refresh Prices/ }));
  expect(await screen.findAllByText('$333.00')).not.toHaveLength(0);
  await settle();
  expect(portfolioPosts()).toHaveLength(before + 1);

  cleanup();
  postStatus = 200;
  nav.quote = null;
  book = serverBook();
  render(<PortfolioContent embeddedInWorkspace />);
  await screen.findByText('1 open simulation position');
  expect(screen.queryByText('MSFT')).toBeNull();
  await settle();
  expect(portfolioPosts()).toHaveLength(before + 1);
});
