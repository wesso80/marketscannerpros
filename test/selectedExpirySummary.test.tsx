// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OptionsChainEvidence from '@/components/options-terminal/OptionsChainEvidence';
import { toPublicOptionsEvidence } from '@/lib/research/publicOptionsScan';
import { selectedExpirySummary } from '@/components/terminal/researchPresentation';

const base: any = {
  symbol: 'MU', currentPrice: 249.35, direction: 'bullish', directionStatus: 'determined', confluenceStack: 3,
  primaryStrike: null, primaryExpiration: null,
  dataQuality: { freshness: 'REALTIME', optionsChainSource: 'alpha_vantage', lastUpdated: '2026-10-02T20:00:00Z', chainExpiryUsed: null },
  openInterestAnalysis: { totalCallOI: 1, totalPutOI: 1, pcRatio: 1, expirationDate: null, highOIStrikes: [] },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const serve = (o: any) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: toPublicOptionsEvidence(o, { chainQuality: null, providerWarnings: [] }) }) })));
const ready = () => waitFor(() => { if (!screen.queryByText('Selected expiry')) throw Error('not ready'); });

describe('selected expiry summary', () => {
  it('formats a real selected date and stays Not selected only when nothing is selected', () => {
    expect(selectedExpirySummary({ selectedExpiry: '2026-10-07' })).toBe('Wed 7 Oct');
    expect(selectedExpirySummary({ selectedExpiry: '', analyzedExpiry: '2026-10-07' })).toBe('Wed 7 Oct');
    expect(selectedExpirySummary({ selectedExpiry: '2026-10-07', analyzedExpiry: '2026-10-16' })).toBe('Wed 7 Oct');
    expect(selectedExpirySummary({ selectedExpiry: '', analyzedExpiry: '' })).toBe('Not selected');
    expect(selectedExpirySummary({})).toBe('Not selected');
  });

  it('shows the selected expiry when the chain did not report one', async () => {
    serve(base);
    render(<OptionsChainEvidence symbol="MU" expiry="2026-10-07" />);
    await ready();
    expect(screen.getByText('Selected expiry').parentElement?.textContent).toContain('Wed 7 Oct');
    expect(screen.queryByText('Not selected')).toBeNull();
  });

  it('uses the expiry the scan loaded when no expiry was selected', async () => {
    serve({ ...base, openInterestAnalysis: { ...base.openInterestAnalysis, expirationDate: '2026-10-07' } });
    render(<OptionsChainEvidence symbol="MU" expiry="" />);
    await ready();
    expect(screen.getByText('Selected expiry').parentElement?.textContent).toContain('Wed 7 Oct');
    expect(screen.queryByText('Not selected')).toBeNull();
  });

  it('says when the selected expiry was not available and names the one analysed', async () => {
    serve({ ...base, dataQuality: { ...base.dataQuality, chainExpiryUsed: '2026-10-16' } });
    render(<OptionsChainEvidence symbol="MU" expiry="2026-10-07" />);
    await ready();
    expect(document.body.textContent).toContain('The selected expiry was not available; the chain above is for Fri 16 Oct.');
  });
});
