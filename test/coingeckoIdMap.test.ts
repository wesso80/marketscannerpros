import { describe, expect, it } from 'vitest';
import { COINGECKO_ID_MAP } from '@/lib/coingecko';
import { sharedScanUniverse } from '@/lib/admin/sharedScanLogic';

describe('COINGECKO_ID_MAP covers the admin crypto universe', () => {
  it('every crypto shared-scan symbol has a static CoinGecko id (no /search call, no wrong-coin match)', () => {
    const missing = sharedScanUniverse('CRYPTO').filter((s) => !COINGECKO_ID_MAP[s]);
    expect(missing).toEqual([]);
  });

  it('ambiguous tickers map to the verified coins', () => {
    expect(COINGECKO_ID_MAP).toMatchObject({
      APE: 'apecoin', RON: 'ronin', BEAM: 'beam-2', PRIME: 'echelon-prime', PIXEL: 'pixels',
      EGLD: 'elrond-erd-2', STX: 'blockstack', MKR: 'maker', TAO: 'bittensor', FLOW: 'flow',
    });
  });
});
