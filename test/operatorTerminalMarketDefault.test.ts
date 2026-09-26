/** /admin/operator-terminal opens on Equities when crypto data is off; the Equity button sends "EQUITIES". */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialOperatorMarket } from '@/app/admin/operator-terminal/OperatorTerminalClient';

describe('operator terminal market', () => {
  it('defaults to EQUITIES when crypto market data is disabled, CRYPTO when enabled', () => {
    expect(initialOperatorMarket(false)).toBe('EQUITIES');
    expect(initialOperatorMarket(true)).toBe('CRYPTO');
  });
  it('the server page passes the OPERATOR_CG_FETCH_ENABLED state and renders per request', () => {
    const page = readFileSync('app/admin/operator-terminal/page.tsx', 'utf8');
    expect(page).toContain('<OperatorTerminalClient cryptoEnabled={operatorCgFetchEnabled()} />');
    expect(page).toContain('export const dynamic = "force-dynamic";');
    expect(page).not.toContain('"use client"');
  });
  it('toolbar sends the API market names and shows "Crypto data paused" instead of "Auto-Scan Live"', () => {
    const bar = readFileSync('components/admin/operator/OperatorTopToolbar.tsx', 'utf8');
    expect(bar).toContain('{ value: "EQUITIES", label: "EQUITY" }');
    expect(bar).not.toContain('["CRYPTO", "EQUITY"]');
    expect(bar).toContain('cryptoPaused ? "Crypto data paused"');
  });
});
