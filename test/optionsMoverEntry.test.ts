import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { backtestOptionsTerminalLink, moverResearchLink } from '@/lib/options/journey';

it('sends only equity movers to the Options Terminal and names that destination', () => {
  const equity = moverResearchLink({ asset_class: 'equity', ticker: 'AAPL', setupClass: 'Breakout', deployment: 'eligible', confluenceScore: 70 }, 'YES');
  const equityUrl = new URL(equity.href, 'https://fixture');
  expect(equityUrl.pathname).toBe('/tools/options');
  expect(equityUrl.searchParams.get('tab')).toBeNull();
  expect(equityUrl.searchParams.get('symbol')).toBe('AAPL');
  expect(equity.label).toBe('Open Options');
  expect(equity.tableLabel).toBe('Open Options →');

  const crypto = moverResearchLink({ asset_class: 'crypto', ticker: 'BTC', setupClass: 'Breakout', deployment: 'eligible', confluenceScore: 70 }, 'YES');
  const cryptoUrl = new URL(crypto.href, 'https://fixture');
  expect(cryptoUrl.pathname).toBe('/tools/golden-egg');
  expect(cryptoUrl.searchParams.get('type')).toBe('crypto');
  expect(cryptoUrl.searchParams.get('symbol')).toBe('BTC');
  expect(crypto.label).toMatch(/Symbol/);
  expect(crypto.tableLabel).toMatch(/Symbol/);
  expect(crypto.href).not.toContain('options-terminal');

  const stock = backtestOptionsTerminalLink('AAPL', 'stock');
  expect(stock?.label).toBe('Open Options');
  expect(new URL(stock!.href, 'https://fixture').pathname).toBe('/tools/options');
  expect(backtestOptionsTerminalLink('BTC', 'crypto')).toBeNull();

  const movers = readFileSync('app/tools/market-movers/page.tsx', 'utf8');
  expect(movers).toContain('moverResearchLink');
  expect(movers).not.toContain('tab=options-terminal&type=equity&symbol=${mover.ticker}');
});
