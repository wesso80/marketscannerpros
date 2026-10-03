import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { backtestOptionsTerminalLink, moverResearchLink } from '@/lib/options/journey';

it('sends only equity movers to the Options Terminal and names that destination', () => {
  const equity = moverResearchLink({ asset_class: 'equity', ticker: 'AAPL', setupClass: 'Breakout', deployment: 'eligible', confluenceScore: 70 }, 'YES');
  const equityUrl = new URL(equity.href, 'https://fixture');
  expect(equityUrl.searchParams.get('tab')).toBe('options-terminal');
  expect(equityUrl.searchParams.get('type')).toBe('equity');
  expect(equityUrl.searchParams.get('symbol')).toBe('AAPL');
  expect(equity.label).toBe('Open Options Terminal');
  expect(equity.tableLabel).toBe('Open Options Terminal →');

  const crypto = moverResearchLink({ asset_class: 'crypto', ticker: 'BTC', setupClass: 'Breakout', deployment: 'eligible', confluenceScore: 70 }, 'YES');
  const cryptoUrl = new URL(crypto.href, 'https://fixture');
  expect(cryptoUrl.searchParams.get('tab')).toBe('options-confluence');
  expect(cryptoUrl.searchParams.get('type')).toBeNull();
  expect(cryptoUrl.searchParams.get('symbol')).toBe('BTC');
  expect(crypto.label).toMatch(/Confluence/);
  expect(crypto.tableLabel).toMatch(/Confluence/);
  expect(crypto.href).not.toContain('options-terminal');

  const stock = backtestOptionsTerminalLink('AAPL', 'stock');
  expect(stock?.label).toBe('Open Options Terminal');
  expect(new URL(stock!.href, 'https://fixture').searchParams.get('type')).toBe('equity');
  expect(backtestOptionsTerminalLink('BTC', 'crypto')).toBeNull();

  const movers = readFileSync('app/tools/market-movers/page.tsx', 'utf8');
  const gainers = readFileSync('app/tools/gainers-losers/page.tsx', 'utf8');
  const backtest = readFileSync('app/tools/backtest/page.tsx', 'utf8');
  expect(movers).toContain('moverResearchLink');
  expect(movers).not.toContain('tab=options-terminal&type=equity&symbol=${mover.ticker}');
  expect(gainers).toContain('moverResearchLink');
  expect(gainers).not.toContain('tab=options-terminal&type=equity&symbol=${item.ticker}');
  expect(backtest).toContain('backtestOptionsTerminalLink');
  expect(backtest).not.toContain('tab=options-terminal&type=equity&symbol=${symbol}');
});
