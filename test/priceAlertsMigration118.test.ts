import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function stripSqlComments(sql: string) {
  return sql.replace(/--[^\n]*/g, '');
}

function statements(sql: string) {
  return stripSqlComments(sql)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function knownCryptoBases() {
  const src = read('lib/detectAssetClass.ts');
  const block = src.slice(src.indexOf('KNOWN_CRYPTO_BASES'), src.indexOf('CRYPTO_QUOTE_SUFFIXES'));
  return [...block.matchAll(/'([A-Z0-9]+)'/g)].map((match) => match[1]);
}

/** The migration's crypto predicate, evaluated the same way the SQL normalises a symbol. */
function migrationMarksCrypto(sql: string, symbol: string) {
  const code = stripSqlComments(sql);
  const patterns = [...code.matchAll(/~ '([^']+)'/g)].map((match) => match[1]);
  const usdt = patterns.find((pattern) => pattern === '^.+USDT$');
  const quoted = patterns.find((pattern) => pattern.includes('(USD|USDC|BUSD|BTC|ETH)'));
  const bareClause = code.match(/upper\(btrim\(symbol\)\) IN \(([^)]*)\)/);
  if (!usdt || !quoted || !bareClause) return false;
  const bare = symbol.toUpperCase().trim();
  const pair = bare.replace(/[-/]/g, '');
  const listed = [...bareClause[1].matchAll(/'([A-Z0-9]+)'/g)].map((match) => match[1]);
  return new RegExp(usdt).test(pair) || new RegExp(quoted).test(pair) || listed.includes(bare);
}

describe('migration 118 price-alert backfill', () => {
  const sql = read('migrations/118_price_alerts_not_smart.sql');
  const code = stripSqlComments(sql);
  const updates = statements(sql);

  it('only updates alerts, never deletes, and each update still needs the change', () => {
    expect(updates).toHaveLength(2);
    expect(updates.every((statement) => /^UPDATE alerts\b/i.test(statement))).toBe(true);
    expect(code).not.toMatch(/\b(DELETE|INSERT|DROP|TRUNCATE|ALTER)\b/i);
    for (const statement of updates) {
      const stillNeedsChange = /is_smart_alert IS TRUE/i.test(statement)
        || /asset_type IS DISTINCT FROM 'crypto'/i.test(statement);
      expect(stillNeedsChange).toBe(true);
    }
  });

  it('flips only price rows that have a level, so zero-price orphans stay smart', () => {
    const flip = updates.find((statement) => /SET is_smart_alert = false/i.test(statement));
    expect(flip).toBeTruthy();
    expect(flip).toMatch(/condition_value > 0/);
    expect(flip).toMatch(/condition_type IN \('price_above', 'price_below'\)/);
    expect(flip).not.toMatch(/condition_value >= 0/);

    const route = read('app/api/alerts/route.ts');
    const cleanup = route.slice(route.indexOf("bulk === 'auto-orphaned'"), route.indexOf('deletedCount'));
    expect(cleanup).toMatch(/is_smart_alert = true/);
    expect(cleanup).toMatch(/condition_value = 0/);
    expect(cleanup).toMatch(/smart_alert_context->>'source' = 'workflow\.auto'/);
    expect(read('app/tools/alerts/page.tsx')).toContain('a.is_smart_alert && Number(a.condition_value) === 0');
  });

  it('marks focus crypto symbols and does not mark EURUSD, GBPUSD, or AUDUSD', () => {
    const asset = updates.find((statement) => /SET asset_type = 'crypto'/i.test(statement));
    expect(asset).toMatch(/smart_alert_context->>'source' = 'focus\.creator'/);
    expect(asset).toMatch(/condition_type IN \('price_above', 'price_below'\)/);
    expect(asset).toMatch(/asset_type IS DISTINCT FROM 'crypto'/);

    const bases = knownCryptoBases();
    const pair = stripSqlComments(sql).match(/~ '\^\(([A-Z0-9|]+)\)\(USD\|USDC\|BUSD\|BTC\|ETH\)\$'/);
    expect(pair).toBeTruthy();
    expect(pair![1].split('|').sort()).toEqual([...bases].sort());

    for (const symbol of ['BTC', 'ETH', 'btc', 'BTCUSD', 'BTC-USD', 'BTC/USD', 'BTCUSDT', 'ETH-USDT', 'SOLUSDC', 'WLDUSDT']) {
      expect(migrationMarksCrypto(sql, symbol)).toBe(true);
    }
    for (const symbol of ['EURUSD', 'GBPUSD', 'AUDUSD', 'EUR', 'AAPL', 'USDT']) {
      expect(migrationMarksCrypto(sql, symbol)).toBe(false);
    }
  });
});
