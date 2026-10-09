// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/components/research/SymbolComparisonChart', () => ({ default: () => <div>Comparison fixture</div> }));
import SymbolAiSummary from '@/components/research/SymbolAiSummary';
const sections = { summary: ['Dated fixture overview'], evidence: [{ input: 'Daily price', observations: ['Close 100 on 6 October'] }], events: ['Reported results'], differences: ['Quote and daily bars have different times'], missing: ['Options unavailable'], recheck: ['After the next close'] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function response(narrative: string | null) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, sections, narrative, narrativeSource: 'OpenAI', removedLines: 2, generatedAt: '2026-10-08T00:00:00Z' }) })));
}
it('places every evidence section before the labelled AI explanation', async () => {
  response('Fixture explanation');
  const { container } = render(<SymbolAiSummary symbol="AAPL" type="equity" timeframe="daily" expiry="2026-10-09" />);
  await screen.findByText('Fixture explanation');
  const narrative = container.querySelector('[data-summary-narrative]')!;
  for (const section of container.querySelectorAll('[data-summary-block]')) expect(section.compareDocumentPosition(narrative) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelectorAll('[data-summary-block]')).toHaveLength(5);
  expect(screen.getByText(/^AI summary/).textContent).toContain('evidence above');
  expect(screen.queryByText(/OpenAI|gpt-4|GPT/)).toBeNull();
  expect(vi.mocked(fetch).mock.calls[0][0]).toContain('expiry=2026-10-09');
});
it('keeps evidence and the removed-line count when all AI text is unavailable', async () => {
  response(null);
  render(<SymbolAiSummary symbol="AAPL" type="equity" timeframe="daily" />);
  await screen.findByText(/AI text unavailable/);
  expect(screen.getByText(/Close 100/)).toBeTruthy();
  expect(screen.getByText('2 lines removed for forecasting or recommending.')).toBeTruthy();
});
it('shows an unavailable state on request failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Fixture unavailable' }) })));
  render(<SymbolAiSummary symbol="AAPL" type="equity" timeframe="daily" />);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Fixture unavailable'));
});
