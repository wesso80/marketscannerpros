/** /admin/operator-terminal opens on the admin default (Equities); the Equity button sends "EQUITIES". */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialOperatorMarket } from '@/app/admin/operator-terminal/OperatorTerminalClient';

describe('operator terminal market', () => {
  it('opens on the admin default market (EQUITIES), and never on crypto while admin crypto is switched off', () => {
    expect(initialOperatorMarket(true)).toBe('EQUITIES');
    expect(initialOperatorMarket(true, 'EQUITIES')).toBe('EQUITIES');
    expect(initialOperatorMarket(true, 'CRYPTO')).toBe('CRYPTO');
    expect(initialOperatorMarket(false, 'CRYPTO')).toBe('EQUITIES');
  });
  it('the server page passes the admin crypto switch (not the CoinGecko flag) and renders per request', () => {
    const page = readFileSync('app/admin/operator-terminal/page.tsx', 'utf8');
    expect(page).toContain('<OperatorTerminalClient cryptoEnabled={isAdminCryptoEnabled()} defaultMarket={defaultAdminMarket()} />');
    expect(page).not.toContain('operatorCgFetchEnabled');
    expect(page).toContain('export const dynamic = "force-dynamic";');
    expect(page).not.toContain('"use client"');
  });
  it('toolbar sends the API market names and shows "Crypto switched off" instead of "Auto-Scan Live"', () => {
    const bar = readFileSync('components/admin/operator/OperatorTopToolbar.tsx', 'utf8');
    expect(bar).toContain('{ value: "EQUITIES", label: "EQUITY" }');
    expect(bar).not.toContain('["CRYPTO", "EQUITY"]');
    expect(bar).toContain('cryptoPaused ? "Crypto switched off"');
  });
});
