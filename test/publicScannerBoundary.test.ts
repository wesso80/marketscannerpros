import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { publicScannerHandler } from '@/lib/scanner/publicBoundary';

const request = (body: unknown = { type: 'equity', timeframe: 'daily' }) => new NextRequest('http://localhost/api/scanner/run', { method: 'POST', body: JSON.stringify(body) });
const rows = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${String(i).padStart(2, '0')}`, type: 'equity', price: 100, rsi: i, canonical: { score: i, secret: 'PRIVATE_CANARY' } })).reverse();

describe('Scanner HTTP public boundary', () => {
  it.each(['signed-out', 'free', 'pro', 'pro_trader'])('projects every public role (%s) from the full pre-ranking snapshot', async () => {
    const handler = publicScannerHandler({ isInternal: async () => false, run: async (_, capture) => {
      capture?.(rows);
      return NextResponse.json({ results: rows.slice(0, 10), metadata: { scanCoverage: { universe: 100, attempted: 15, unavailable: 0, outsideSample: 85 }, riskGovernor: { secret: 'PRIVATE_CANARY' } } });
    } });
    const response = await handler(request()); const packet = await response.json();
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(packet.observations).toHaveLength(15);
    expect(packet.observations[0].symbol).toBe('S00');
    expect(JSON.stringify(packet)).not.toMatch(/PRIVATE_CANARY|canonical|riskGovernor/);
    expect(packet.coverage.outsideSample).toBe(85);
  });
  it.each(['admin', 'cron'])('preserves the authenticated internal response (%s)', async () => {
    const original = NextResponse.json({ results: rows });
    const run = vi.fn(async () => original);
    const handler = publicScannerHandler({ isInternal: async () => true, run });
    expect(await handler(request())).toBe(original);
    expect(run.mock.calls[0]).toHaveLength(1);
  });
  it('validates filters before engine work and never trusts a client internal flag', async () => {
    const run = vi.fn();
    const handler = publicScannerHandler({ isInternal: async () => false, run });
    expect((await handler(request({ internal: true, filters: { minScore: 90 } }))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
  it('fails closed when a successful engine path did not capture unranked rows', async () => {
    const handler = publicScannerHandler({ isInternal: async () => false, run: async () => NextResponse.json({ results: rows.slice(0, 10) }) });
    expect((await handler(request())).status).toBe(503);
  });
  it.each([400, 401, 403, 429, 500, 503])('sanitizes errors and disables caching (%s)', async status => {
    const handler = publicScannerHandler({ isInternal: async () => false, run: async () => NextResponse.json({ error: 'https://provider?apikey=PRIVATE_CANARY', details: 'PRIVATE_CANARY', limitReached: status === 429 }, { status }) });
    const response = await handler(request());
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('PRIVATE_CANARY');
    if (status === 429) expect(body.limitReached).toBe(true);
  });
  it('labels and projects local demo rows without copying internal reasons', async () => {
    const handler = publicScannerHandler({ isInternal: async () => false, run: async () => NextResponse.json({ results: rows, metadata: { localDemo: true }, message: 'PRIVATE_CANARY' }) });
    const body = await (await handler(request())).json();
    expect(body.localDemo).toBe(true);
    expect(body.notice).toContain('Not live');
    expect(JSON.stringify(body)).not.toContain('PRIVATE_CANARY');
  });
  it('keeps concurrent request snapshots separate', async () => {
    const handler = publicScannerHandler({ isInternal: async () => false, run: async (req, capture) => {
      const { symbol } = await req.json(); capture?.([{ ...rows[0], symbol }]);
      await Promise.resolve(); return NextResponse.json({ success: true });
    } });
    const [a, b] = await Promise.all([handler(request({ symbol: 'AAA' })), handler(request({ symbol: 'BBB' }))]);
    expect((await a.json()).observations[0].symbol).toBe('AAA');
    expect((await b.json()).observations[0].symbol).toBe('BBB');
  });
  it('wires verified credentials and captures before internal score truncation in the real route', () => {
    const source = readFileSync('app/api/scanner/run/route.ts', 'utf8');
    expect(source).toContain('isInternal: async req => verifyCronAuth(req) || (await requireAdmin(req)).ok');
    expect(source.indexOf('capturePublicRows?.(results)')).toBeLessThan(source.indexOf('results.sort((a, b) => compareCanonicalRows'));
    expect(source.indexOf('capturePublicRows?.(results)')).toBeLessThan(source.indexOf('results.length = 10'));
  });
});
