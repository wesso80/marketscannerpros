// NETWORK INTEGRATION TEST — Global M2 providers.
//
// Contacts REAL official endpoints (no fixtures). It is OPT-IN and skipped by
// default so it never runs in CI/deterministic suites. Enable with:
//   RUN_NETWORK_TESTS=1 npx vitest run test/intelligence/globalM2Network.integration.test.ts
//
// It reports, per provider: network reached? / status / latest month /
// observation count / latency / normalization. Results reflect the CALLING
// network's IP — a residential IP reaches PBOC/RBA that a datacenter/Render IP
// may not (403/geo-block). Never treat this as PRODUCTION LIVE.
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
try {
  const envText = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
} catch { /* ignore */ }

const RUN = process.env.RUN_NETWORK_TESTS === '1';

describe.skipIf(!RUN)('NETWORK INTEGRATION TEST — Global M2 providers', () => {
  it('probes each official M2 provider over the real network', async () => {
    const { fetchUsM2 } = await import('@/lib/intelligence/data/providers/fredM2');
    const { fetchChinaM2 } = await import('@/lib/intelligence/data/providers/pbocM2');
    const { fetchSwissM2 } = await import('@/lib/intelligence/data/providers/snbM2');
    const { fetchEuroM2 } = await import('@/lib/intelligence/data/providers/ecbM2');
    const { fetchUkM2 } = await import('@/lib/intelligence/data/providers/boeM2');
    const { fetchCanadaM2 } = await import('@/lib/intelligence/data/providers/statcanM2');
    const { fetchAustraliaM2 } = await import('@/lib/intelligence/data/providers/rbaM2');
    const { fetchBrazilM2 } = await import('@/lib/intelligence/data/providers/bcbM2');
    const { fetchJapanM2 } = await import('@/lib/intelligence/data/providers/bojM2');
    const { fetchIndiaM2 } = await import('@/lib/intelligence/data/providers/rbiM2');
    const { fetchKoreaM2 } = await import('@/lib/intelligence/data/providers/bokM2');

    const providers: { id: string; run: () => Promise<any> }[] = [
      { id: 'US', run: fetchUsM2 }, { id: 'CN', run: fetchChinaM2 }, { id: 'CH', run: fetchSwissM2 },
      { id: 'EU', run: fetchEuroM2 }, { id: 'GB', run: fetchUkM2 }, { id: 'CA', run: fetchCanadaM2 },
      { id: 'AU', run: fetchAustraliaM2 }, { id: 'BR', run: fetchBrazilM2 }, { id: 'JP', run: fetchJapanM2 },
      { id: 'IN', run: fetchIndiaM2 }, { id: 'KR', run: fetchKoreaM2 },
    ];

    for (const p of providers) {
      const t0 = Date.now();
      try {
        const r = await p.run();
        const latencyMs = Date.now() - t0;
        console.log(`NET ${p.id} reached=${r.ok} latest=${r.latestObservationMonth ?? '-'} count=${r.m2?.length ?? 0} latencyMs=${latencyMs} err=${r.error ? r.error.slice(0, 90) : '-'}`);
      } catch (e) {
        console.log(`NET ${p.id} reached=false latencyMs=${Date.now() - t0} threw=${(e as Error).message.slice(0, 90)}`);
      }
    }
  }, 240000);
});
