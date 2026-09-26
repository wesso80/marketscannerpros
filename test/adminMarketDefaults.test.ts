import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { marketForSymbol, parseAdminMarket } from '@/lib/admin/adminMarket';

// M2: EQUITIES is the admin default (crypto is opened explicitly); M3: no fake "newest saved result".

const read = (p: string) => readFileSync(p, 'utf8');

describe('admin market helpers', () => {
  it('parseAdminMarket', () => {
    expect(parseAdminMarket('equity', 'CRYPTO')).toBe('EQUITIES');
    expect(parseAdminMarket(null, 'EQUITIES')).toBe('EQUITIES');
    expect(parseAdminMarket('crypto', 'EQUITIES')).toBe('CRYPTO');
  });

  it('marketForSymbol infers from the admin watchlists and pairs', () => {
    expect(marketForSymbol('AAPL', 'CRYPTO')).toBe('EQUITIES');
    expect(marketForSymbol('SPY', 'CRYPTO')).toBe('EQUITIES');
    expect(marketForSymbol('ADA', 'EQUITIES')).toBe('CRYPTO');
    expect(marketForSymbol('MATIC', 'EQUITIES')).toBe('CRYPTO');
    expect(marketForSymbol('BTC-USD', 'EQUITIES')).toBe('CRYPTO');
    expect(marketForSymbol('ETHUSDT', 'EQUITIES')).toBe('CRYPTO');
    expect(marketForSymbol('STX', 'EQUITIES')).toBe('EQUITIES'); // in both lists → fallback
    expect(marketForSymbol('ZZZZ', 'EQUITIES')).toBe('EQUITIES');
  });
});

describe('wiring (source checks)', () => {
  it('Command Center reads both markets', () => {
    expect(read('components/admin/home/CommandHome.tsx')).toContain('"/api/admin/opportunities?market=ALL"');
  });

  it('opportunities route: admin default market and a null timestamp when nothing is saved (M3)', () => {
    const src = read('app/api/admin/opportunities/route.ts');
    expect(src).not.toContain('searchParams.get("market") || "CRYPTO"');
    expect(src).toContain('resolveAdminMarket(rawMarket)');
    expect(src).not.toContain('scanTimestamp ?? new Date().toISOString()');
    expect(src).toContain('timestamp: null');
  });

  it('Opportunity Board: server default market, "none" when there is no saved result', () => {
    const board = read('components/admin/AdminOpportunityBoard.tsx');
    expect(board).not.toContain('useState<Market>("CRYPTO")');
    expect(board).toContain('newest saved result {timestamp ? new Date(timestamp).toLocaleTimeString() : "none"}');
    expect(read('app/admin/opportunity-board/page.tsx')).toContain('defaultMarket={defaultAdminMarket()}');
  });

  it('Live Scanner: server wrapper reads the admin crypto switch + default market; client is no longer crypto-only', () => {
    expect(read('app/admin/live-scanner/page.tsx')).toContain('cryptoEnabled={isAdminCryptoEnabled()} defaultMarket={defaultAdminMarket()}');
    const client = read('app/admin/live-scanner/LiveScannerClient.tsx');
    expect(client).toContain('cryptoEnabled ? defaultMarket : "EQUITIES"');
    expect(client).not.toContain('Click \\"Scan Now\\"');
    expect(read('app/api/admin/scanner/live/route.ts')).toContain('resolveAdminMarket(searchParams.get("market"))');
  });

  it('hooks no longer default to CRYPTO', () => {
    const hooks = read('lib/admin/hooks.ts');
    expect(hooks).not.toContain('market = "CRYPTO"');
  });

  it('symbol pages and APIs infer the market from the symbol', () => {
    const page = read('app/admin/symbol/[symbol]/page.tsx');
    expect(page).not.toContain('useState<string>("CRYPTO")');
    expect(page).toContain('marketForSymbol(symbol, "EQUITIES")');
    const term = read('app/admin/terminal/[symbol]/page.tsx');
    expect(term).not.toContain('useState("CRYPTO")');
    expect(read('app/api/admin/symbol/[symbol]/route.ts')).toContain('marketForSymbol(symbol, defaultAdminMarket())');
    expect(read('app/api/admin/research-packet/route.ts')).toContain('marketForSymbol(symbol, defaultAdminMarket())');
    expect(read('lib/admin/getAdminResearchPacket.ts')).not.toContain('(params.market || "CRYPTO")');
  });

  it('sidebar and command palette link to SPY, not ADA', () => {
    const layout = read('app/admin/layout.tsx');
    expect(layout).toContain('/admin/symbol/SPY');
    expect(layout).not.toContain('/admin/symbol/ADA');
    expect(read('lib/admin/commandPaletteCommands.ts')).not.toContain('/admin/symbol/ADA');
  });
});
