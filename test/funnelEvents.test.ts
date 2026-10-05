// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tracked = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ trackEvent: tracked }));

import {
  flushPendingFunnelEvents,
  limitOnceKey,
  noteFunnelResponse,
  trackFunnelEvent,
  upgradePlacementFromClick,
} from '@/lib/free/funnel';

beforeEach(() => {
  tracked.mockReset();
  localStorage.clear();
});

describe('funnel event helper', () => {
  it('does not send or queue an upgrade click before consent', () => {
    expect(trackFunnelEvent('upgrade_click', { placement: 'header', where: 'header' })).toBe(false);
    expect(tracked).not.toHaveBeenCalled();
    expect(localStorage.getItem('msp-funnel-pending:upgrade_click')).toBeNull();
  });

  it('holds sign_up until consent and then sends it once', () => {
    expect(trackFunnelEvent('sign_up', { placement: 'magic_link', tier: 'free' }, { once: true })).toBe(false);
    expect(tracked).not.toHaveBeenCalled();
    flushPendingFunnelEvents();
    expect(tracked).not.toHaveBeenCalled();
    localStorage.setItem('msp-consent', 'accepted');
    flushPendingFunnelEvents();
    flushPendingFunnelEvents();
    expect(tracked).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveBeenCalledWith('sign_up', { placement: 'magic_link', tier: 'free' });
  });

  it('sends every upgrade click after consent and a limit hit once per day', () => {
    localStorage.setItem('msp-consent', 'accepted');
    trackFunnelEvent('upgrade_click', { placement: 'pricing_pro_monthly', where: 'pricing_pro_monthly' });
    trackFunnelEvent('upgrade_click', { placement: 'pricing_pro_monthly', where: 'pricing_pro_monthly' });
    const day = new Date('2026-10-05T12:00:00Z');
    trackFunnelEvent('limit_hit', { limit: 'scans', placement: 'scanner' }, { once: limitOnceKey('scans', day) });
    trackFunnelEvent('limit_hit', { limit: 'scans', placement: 'scanner' }, { once: limitOnceKey('scans', day) });
    expect(tracked.mock.calls.filter(([name]) => name === 'upgrade_click')).toHaveLength(2);
    expect(tracked.mock.calls.filter(([name]) => name === 'limit_hit')).toEqual([
      ['limit_hit', { limit: 'scans', placement: 'scanner' }],
    ]);
  });

  it('names a pricing control and skips one that already records itself', () => {
    const link = document.createElement('a');
    link.setAttribute('href', '/pricing');
    link.textContent = 'Pricing';
    expect(upgradePlacementFromClick(link, '/tools/scanner')).toBe('/tools/scanner:Pricing');
    link.setAttribute('data-funnel-upgrade', 'handled');
    expect(upgradePlacementFromClick(link, '/tools/scanner')).toBeNull();
    const pro = document.createElement('button');
    pro.textContent = 'Go Pro';
    pro.setAttribute('data-placement', 'pricing_pro_monthly');
    expect(upgradePlacementFromClick(pro, '/pricing')).toBe('pricing_pro_monthly');
    const free = document.createElement('button');
    free.textContent = 'Start Free';
    expect(upgradePlacementFromClick(free, '/pricing')).toBeNull();
  });

  it('reads first_scan and an AI limit from the responses the loader intercepts', async () => {
    localStorage.setItem('msp-consent', 'accepted');
    const scan = { ok: true, status: 200, clone: () => ({ json: async () => ({ firstScan: true }) }) };
    await noteFunnelResponse('/api/scanner/run', 'POST', scan);
    await noteFunnelResponse('/api/scanner/run', 'POST', scan);
    const limited = { ok: false, status: 429, clone: () => ({ json: async () => ({ limitReached: true }) }) };
    await noteFunnelResponse('/api/ai/copilot', 'POST', limited);
    await noteFunnelResponse('/api/ai/copilot', 'POST', limited);
    await noteFunnelResponse('/api/quote', 'POST', limited);
    expect(tracked.mock.calls.map(([name]) => name)).toEqual(['first_scan', 'limit_hit']);
    expect(tracked).toHaveBeenCalledWith('first_scan', { where: 'scanner', placement: 'scanner' });
    expect(tracked).toHaveBeenCalledWith('limit_hit', expect.objectContaining({ limit: 'ai_questions' }));
  });
});
