import { describe, expect, it } from 'vitest';
import { scoreDiamondPool } from '@/lib/diamondHunter';
import type { TokenInfo, TrendingPool } from '@/lib/coingecko';

function pool(overrides: Partial<TrendingPool['attributes']> = {}): TrendingPool {
  return {
    id: 'solana_pool1',
    type: 'pool',
    attributes: {
      name: 'TEST / SOL',
      address: 'pool1',
      base_token_price_usd: '0.01',
      quote_token_price_usd: '150',
      base_token_price_native_currency: null,
      pool_created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      fdv_usd: '5000000',
      market_cap_usd: null,
      price_change_percentage: { m5: '4', m15: '12', m30: '18', h1: '25', h6: '25', h24: '25' },
      transactions: {
        m5: { buys: 150, sells: 40, buyers: 120, sellers: 35 },
        m15: { buys: 260, sells: 90, buyers: 210, sellers: 70 },
        m30: { buys: 330, sells: 130, buyers: 260, sellers: 95 },
        h1: { buys: 420, sells: 170, buyers: 300, sellers: 120 },
        h24: { buys: 420, sells: 170, buyers: 300, sellers: 120 },
      },
      volume_usd: { m5: '120000', m15: '220000', m30: '270000', h1: '320000', h24: '320000' },
      reserve_in_usd: '800000',
      community_sus_report: 0,
      ...overrides,
    },
    relationships: {
      base_token: { data: { id: 'solana_token1' } },
      quote_token: { data: { id: 'solana_sol' } },
      network: { data: { id: 'solana' } },
      dex: { data: { id: 'raydium' } },
    },
  };
}

function safeTokenInfo(overrides: Partial<TokenInfo['attributes']> = {}): TokenInfo {
  return {
    id: 'solana_token1',
    type: 'token',
    attributes: {
      address: 'token1',
      name: 'Test',
      symbol: 'TEST',
      decimals: 6,
      image_url: null,
      coingecko_coin_id: null,
      websites: ['https://example.test'],
      discord_url: null,
      farcaster_url: null,
      zora_url: null,
      telegram_handle: 'test',
      twitter_handle: 'test',
      description: 'test token',
      gt_score: 82,
      gt_score_details: { pool: 90, transaction: 80, creation: 80, info: 80, holders: 80 },
      gt_verified: true,
      categories: ['AI'],
      gt_category_ids: ['ai'],
      holders: {
        count: 5000,
        distribution_percentage: { top_10: '22', rest: '78' },
        last_updated: new Date().toISOString(),
      },
      mint_authority: 'no',
      freeze_authority: 'no',
      is_honeypot: false,
      developer_holding_percentage: '1.5',
      ...overrides,
    },
  };
}

describe('Diamond Hunter scoring', () => {
  it('surfaces an accelerating, liquid, early pool', () => {
    const result = scoreDiamondPool(pool(), {
      tokenInfo: safeTokenInfo(),
      isTrendingPool: false,
      isTrendingCoin: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(['DIAMOND', 'RARE_DIAMOND']).toContain(result.stage);
    expect(result.attention).toBe('EARLY');
    expect(result.confidence).toBe('DEEP_CHECKED');
  });

  it('hard rejects a honeypot even when momentum is strong', () => {
    const result = scoreDiamondPool(pool(), {
      tokenInfo: safeTokenInfo({ is_honeypot: true }),
    });
    expect(result.hardReject).toBe(true);
    expect(result.stage).toBe('REJECT');
    expect(result.riskFlags).toContain('Honeypot flag');
  });

  it('penalizes dangerously thin liquidity', () => {
    const result = scoreDiamondPool(pool({ reserve_in_usd: '5000' }), {
      tokenInfo: safeTokenInfo(),
    });
    expect(result.hardReject).toBe(true);
    expect(result.stage).toBe('REJECT');
  });
});
