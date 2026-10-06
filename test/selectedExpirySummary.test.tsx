// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import OptionsResearchView from '@/components/terminal/OptionsResearchView';
import { selectedExpirySummary } from '@/components/terminal/researchPresentation';

const base: any = {
  symbol: 'MU', currentPrice: 249.35, direction: 'bullish', directionStatus: 'determined', confluenceStack: 3,
  primaryStrike: null, primaryExpiration: null,
  dataQuality: { freshness: 'REALTIME', optionsChainSource: 'alpha_vantage', lastUpdated: '2026-10-02T20:00:00Z', chainExpiryUsed: null },
  openInterestAnalysis: { totalCallOI: 1, totalPutOI: 1, pcRatio: 1, expirationDate: null, highOIStrikes: [] },
};

afterEach(cleanup);

describe('selected expiry summary', () => {
  it('formats a real selected date and stays Not selected only when nothing is selected', () => {
    expect(selectedExpirySummary({ selectedExpiry: '2026-10-07' })).toBe('Wed 7 Oct');
    expect(selectedExpirySummary({ selectedExpiry: '', analyzedExpiry: '2026-10-07' })).toBe('Wed 7 Oct');
    expect(selectedExpirySummary({ selectedExpiry: '2026-10-07', analyzedExpiry: '2026-10-16' })).toBe('Wed 7 Oct');
    expect(selectedExpirySummary({ selectedExpiry: '', analyzedExpiry: '' })).toBe('Not selected');
    expect(selectedExpirySummary({})).toBe('Not selected');
  });

  it('shows the selected expiry when the recommended expiry was withheld', () => {
    render(<OptionsResearchView symbol="MU" result={base} selectedExpiry="2026-10-07" alignment="WATCH" blocked={true} loading={false} error={null} onScan={() => {}} controls={null} />);
    expect(screen.getByText('Selected expiry').parentElement?.textContent).toContain('Wed 7 Oct');
    expect(screen.queryByText('Not selected')).toBeNull();
  });

  it('uses the expiry the scan loaded when the control is still on the shared default', () => {
    render(<OptionsResearchView symbol="MU" result={{ ...base, openInterestAnalysis: { ...base.openInterestAnalysis, expirationDate: '2026-10-07' } }} selectedExpiry="" alignment="WATCH" blocked={true} loading={false} error={null} onScan={() => {}} controls={null} />);
    expect(screen.getByText('Selected expiry').parentElement?.textContent).toContain('Wed 7 Oct');
    expect(screen.queryByText('Not selected')).toBeNull();
  });
});
