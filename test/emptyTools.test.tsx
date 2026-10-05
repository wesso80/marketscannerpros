// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import Scalper from '@/app/tools/scalper/page';
import Flow from '@/components/options-terminal/OptionsFlowView';
import TimeScanner from '@/components/time/TimeScannerPage';
const access = vi.hoisted(() => ({ tier: 'pro', isLoggedIn: true, isLoading: false }));
vi.mock('@/lib/useUserTier', async original => ({ ...await original<any>(), useUserTier: () => access }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/time/CloseCalendar', () => ({ default: () => <div>Calendar</div> }));
vi.mock('@/components/UpgradeGate', () => ({ default: () => <div>Locked preview</div> }));
let root: Root, el: HTMLDivElement;
beforeEach(() => {
  Object.assign(access, { tier: 'pro', isLoggedIn: true, isLoading: false });
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  el = document.createElement('div'); document.body.append(el); root = createRoot(el);
});
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals(); });
it('Scalper has one honest amber card and no scan controls or fabricated results', () => {
  act(() => root.render(<Scalper />));
  expect(el.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(el.querySelector('[role="status"]')?.className).toContain('amber');
  expect(el.textContent).toContain('Live scalping scan not available yet.');
  expect(el.textContent).not.toMatch(/example|Results 0|Status Ready|real.time|intraday decisions/i);
  expect(el.querySelectorAll('input, button, table')).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
});
it('embedded paid Flow runs for MU and follows SPY without a second input or duplicate fetch', async () => {
  await act(async () => root.render(<Flow embeddedInTerminal symbol="MU" />));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenLastCalledWith('/api/options-flow?symbol=MU', expect.anything());
  expect(el.textContent).toContain('Analyzing options flow for MU');
  expect(el.textContent).not.toContain('Enter a symbol');
  expect(el.querySelector('input')).toBeNull();
  const firstSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  await act(async () => root.render(<Flow embeddedInTerminal symbol="SPY" />));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(firstSignal?.aborted).toBe(true);
  expect(fetch).toHaveBeenLastCalledWith('/api/options-flow?symbol=SPY', expect.anything());
});
it.each([{ tier: 'free', isLoggedIn: true }, { tier: 'free', isLoggedIn: false }, { tier: 'pro', isLoggedIn: true, isLoading: true }])('does not auto-fetch Flow before paid access: %j', async state => {
  Object.assign(access, state);
  await act(async () => root.render(<Flow embeddedInTerminal symbol="MU" />));
  expect(fetch).not.toHaveBeenCalled();
});
it('Time Confluence has no measured tiles, score or alert before an explicit run', async () => {
  await act(async () => root.render(<TimeScanner embeddedInTerminal symbol="BTCUSD" assetType="crypto" />));
  expect(el.textContent).toContain('Not run yet for BTCUSD');
  expect(el.textContent).not.toMatch(/Unavailable|UNKNOWN|0 · LOW|Set Confluence Alert|Window Quality|R:R/);
  expect(fetch).not.toHaveBeenCalled();
  expect(el.querySelector('details')).toBeNull();
});

const snapshot = (symbol: string) => ({
  success: true, symbol, currentPrice: 180.5, changePct: 1.25, expiration: '2026-10-09',
  contractCount: 20, timestamp: '2026-10-05T14:35:00Z', duration: '0.1s',
  sourceLabel: 'Alpha Vantage · 5 Oct 2026 14:35 UTC', inferenceAvailable: false,
  aggregate: { netPremium: null, conviction: null, callPremiumBought: 12000, callPremiumSold: 8000, putPremiumBought: 4000, putPremiumSold: 5000, boughtCount: 2, soldCount: 2, neutralCount: 1 },
  flowPattern: { pattern: null, reason: 'Snapshot strike distribution', activeStrikes: 10, concentrationRatio: 0.4 },
  ivSkew: { skew: 0.03, skewSignal: 'normal_put_skew', atmIV: 0.35, skew25Delta: null },
  smartMoney: { direction: null, signals: [] }, topFlows: [],
});
it('paid Flow renders measured figures and source for the inherited symbol', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => snapshot('MU') } as Response);
  await act(async () => root.render(<Flow embeddedInTerminal symbol="MU" />));
  expect(el.textContent).toContain('$180.5');
  expect(el.textContent).toContain('35.0%');
  expect(el.textContent).toContain('Alpha Vantage · 5 Oct 2026 14:35 UTC');
  expect(el.textContent).not.toContain('Enter a symbol');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('paid Flow does not let an old response replace the newly selected symbol', async () => {
  let resolveFirst!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce({ ok: true, json: async () => snapshot('SPY') } as Response);
  await act(async () => root.render(<Flow embeddedInTerminal symbol="MU" />));
  await act(async () => root.render(<Flow embeddedInTerminal symbol="SPY" />));
  await act(async () => resolveFirst({ ok: true, json: async () => snapshot('MU') } as Response));
  expect(el.textContent).toContain('SPY');
  expect(el.textContent).not.toContain('MU');
});
