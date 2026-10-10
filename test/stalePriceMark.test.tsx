import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceAsOfStamp, SymbolAsOfLine } from '@/components/market/StalePriceMark';

const LABEL = 'as of 2026-10-10T15:00:00.000Z';

it('shows a neutral Stale chip beside the scanner as-of time', () => {
  const stale = renderToStaticMarkup(<PriceAsOfStamp priceText="$20.00" label={LABEL} stale />);
  expect(stale).toContain(LABEL);
  expect(stale).toContain('>Stale<');
  expect(stale).toContain('data-testid="price-stale-mark"');
  expect(stale).toContain('text-slate-300');
  expect(stale).not.toContain('msp-warn');
  expect(stale).not.toContain('text-amber');

  const fresh = renderToStaticMarkup(<PriceAsOfStamp priceText="$20.00" label={LABEL} stale={false} />);
  expect(fresh).toContain(LABEL);
  expect(fresh).not.toContain('>Stale<');
});

it('shows a neutral Stale chip beside the symbol report as-of time', () => {
  const stale = renderToStaticMarkup(<SymbolAsOfLine label={LABEL} stale />);
  expect(stale).toContain('as of');
  expect(stale).toContain('>Stale<');
  expect(stale).not.toContain(LABEL);
  expect(stale).not.toContain('msp-warn');

  const fresh = renderToStaticMarkup(<SymbolAsOfLine label={LABEL} />);
  expect(fresh).toContain('as of');
  expect(fresh).not.toContain('>Stale<');
});
