import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dailyPickPriceBasis } from '@/lib/scanner/dailyPickPriceBasis';
import { proDisplaySymbol } from '@/lib/scanner/proDisplay';

describe('dailyPickPriceBasis (Gate: SOL 121.10 spot vs 117.01 completed-bar close)', () => {
  const canonical = { raw: { close: 117.01 }, barDate: '2026-09-24T00:00:00.000Z' };

  it('labels a crypto row whose price is a scan-time spot quote, and exposes the canonical close', () => {
    expect(dailyPickPriceBasis('121.10000000', canonical, 'crypto')).toEqual({
      priceBasis: 'spot_quote_at_scan', priceBasisLabel: 'Spot quote at scan time', canonicalClose: 117.01, canonicalBarDate: '2026-09-24',
    });
  });

  it('labels a row whose price is the completed daily close', () => {
    expect(dailyPickPriceBasis('776.40000000', { raw: { close: 776.4 }, barDate: '2026-09-24T00:00:00.000Z' }, 'crypto'))
      .toMatchObject({ priceBasis: 'daily_bar_close', priceBasisLabel: 'Daily close 2026-09-24' });
    expect(dailyPickPriceBasis(187.42, { raw: { close: 187.42 }, barDate: null }, 'equity'))
      .toMatchObject({ priceBasis: 'daily_bar_close', priceBasisLabel: 'Daily close' });
  });

  it('never invents a basis when nothing canonical is stored', () => {
    expect(dailyPickPriceBasis('50.1', null, 'equity')).toEqual({ priceBasis: 'scan_price', priceBasisLabel: 'Price at scan', canonicalClose: null, canonicalBarDate: null });
    expect(dailyPickPriceBasis('50.1', null, 'crypto')).toMatchObject({ priceBasis: 'spot_quote_at_scan', canonicalClose: null });
  });

  it('the daily-picks API attaches the basis to every row', () => {
    const src = readFileSync('app/api/scanner/daily-picks/route.ts', 'utf8');
    expect(src).toMatch(/\.\.\.dailyPickPriceBasis\(pick\.price, storedCanonical, pick\.asset_class\)/);
  });
});

describe('OV-13: crypto movers read as coins, not US stocks', () => {
  it('crypto tickers get the -USD suffix; equities are unchanged', () => {
    for (const t of ['HOOD', 'ETN', 'MPLX', 'SI']) expect(proDisplaySymbol(t, 'crypto')).toBe(`${t}-USD`);
    expect(proDisplaySymbol('HOOD', 'equity')).toBe('HOOD');
    expect(proDisplaySymbol('HOOD', undefined)).toBe('HOOD');
  });

  it('dashboard and explorer mover rows use the display symbol', () => {
    const dash = readFileSync('app/tools/dashboard/page.tsx', 'utf8');
    expect(dash).toMatch(/const label = proDisplaySymbol\(mover\.ticker, mover\.asset_class\)/);
    expect(dash).not.toMatch(/>\{mover\.ticker\}</);
    const explorer = readFileSync('app/tools/explorer/page.tsx', 'utf8');
    const cryptoSection = explorer.slice(explorer.indexOf('Top Crypto Gainers'), explorer.indexOf('SECTORS'));
    expect(cryptoSection).not.toMatch(/>\{m\.ticker\}</);
    expect((cryptoSection.match(/proDisplaySymbol\(m\.ticker, m\.asset_class\)/g) ?? []).length).toBe(4);
  });
});
