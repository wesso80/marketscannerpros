import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ASSET_CLASSES, findUniverseViolations, isCryptoPairSymbol, validateUniverseRow } from '../lib/universe/assetClass';

/** The 47 rows found misclassified in production on 2026-09-18. */
const PROD_MISCLASSIFIED = [
  'ADAUSD', 'AMPUSD', 'APTUSD', 'ARBUSD', 'ARIAUSDT', 'ATOMUSD', 'AXSUSD', 'BARDUSDT', 'BASEDUSD', 'BCHUSD', 'BLESSUSD', 'BNBUSD',
  'CRVUSD', 'DOGEUSD', 'ENJUSD', 'ETHUSD', 'GALAUSD', 'GC', 'GC1', 'GTCUSD', 'HBARUSD', 'INJUSD', 'JTOUSD', 'KAITOUSD', 'LINKUSD',
  'LTCUSD', 'METUSD', 'MGC1', 'NEARUSD', 'NQ1', 'ONDOUSD', 'QNTUSD', 'RAVEUSD', 'ROLLUSD', 'SHIBUSD', 'SOLUSD', 'SPX', 'SUIUSD',
  'SUSHIUSD', 'TONUSD', 'TRXUSD', 'VELVETUSD', 'WETHUSD', 'WLDUSD', 'XCNUSDT', 'XLMUSD', 'ZECUSD',
];

/** Legitimate short / odd equity tickers that must NOT be flagged. */
const LEGIT_EQUITIES = ['A', 'H', 'GO', 'UP', 'BP', 'NV', 'USB', 'UUP', 'USO', 'SPY', 'SPCX', 'GOL', 'GSAT', 'BRK-B', 'TSLA', 'AAPL', 'USDP'];

describe('symbol_universe asset-class hygiene', () => {
  it('flags every known misclassified production row', () => {
    const v = findUniverseViolations(PROD_MISCLASSIFIED.map((s) => ({ symbol: s, asset_type: 'equity' })));
    expect(v.map((x) => x.symbol).sort()).toEqual([...PROD_MISCLASSIFIED].sort());
    expect(v.length).toBe(47);
  });

  it('maps futures/index roots to their true class', () => {
    expect(validateUniverseRow('GC1', 'equity')?.expected).toBe('future');
    expect(validateUniverseRow('NQ1', 'equity')?.expected).toBe('future');
    expect(validateUniverseRow('SPX', 'equity')?.expected).toBe('index');
    expect(validateUniverseRow('ADAUSD', 'equity')?.expected).toBe('crypto');
  });

  it('does not flag legitimate equities, ETFs or correctly classified rows', () => {
    for (const s of LEGIT_EQUITIES) expect(validateUniverseRow(s, 'equity'), s).toBeNull();
    expect(validateUniverseRow('BTC', 'crypto')).toBeNull();
    expect(validateUniverseRow('ADAUSD', 'crypto')).toBeNull();
    expect(validateUniverseRow('EURUSD', 'forex')).toBeNull();
    expect(validateUniverseRow('GC1', 'future')).toBeNull();
    expect(validateUniverseRow('SPX', 'index')).toBeNull();
  });

  it('rejects unknown asset types', () => {
    expect(validateUniverseRow('AAPL', 'stock')?.reason).toMatch(/unknown asset_type/);
    expect(ASSET_CLASSES).toContain('etf');
  });

  it('crypto-pair detection requires a quote suffix and a base', () => {
    expect(isCryptoPairSymbol('USD')).toBe(false);
    expect(isCryptoPairSymbol('XCNUSDT')).toBe(true);
    expect(isCryptoPairSymbol('USDP')).toBe(false);
  });

  it('migration 100 covers every misclassified symbol and installs the CHECK constraint', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/100_symbol_universe_asset_hygiene.sql'), 'utf8');
    for (const s of PROD_MISCLASSIFIED) expect(sql, s).toContain(`'${s}'`);
    expect(sql).toMatch(/CHECK \(asset_type IN \('equity', 'etf', 'crypto', 'forex', 'commodity', 'index', 'future'\)\)/);
    for (const c of ASSET_CLASSES) expect(sql).toContain(`'${c}'`);
  });
});
