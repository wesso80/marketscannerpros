import { NextRequest, NextResponse } from 'next/server';
import { getMarketData, CoinGeckoMarketData, getDefiData } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

// Crypto sector categorization
const CRYPTO_SECTORS: Record<string, string> = {
  BTC: 'Store of Value', ETH: 'Layer 1', BNB: 'Layer 1',
  SOL: 'Layer 1', XRP: 'Payments', ADA: 'Layer 1',
  DOGE: 'Meme', AVAX: 'Layer 1', DOT: 'Layer 1',
  MATIC: 'Layer 2', LINK: 'Oracle / DeFi', LTC: 'Payments',
  SHIB: 'Meme', UNI: 'DeFi', ATOM: 'Layer 1', XLM: 'Payments',
};

// Top cryptocurrencies with display config
const CRYPTO_CONFIG: Record<string, { weight: number; color: string }> = {
  'bitcoin': { weight: 55, color: '#F7931A' },
  'ethereum': { weight: 17, color: '#627EEA' },
  'binancecoin': { weight: 4, color: '#F3BA2F' },
  'solana': { weight: 3.5, color: '#00FFA3' },
  'ripple': { weight: 3, color: '#23292F' },
  'cardano': { weight: 2, color: '#0033AD' },
  'dogecoin': { weight: 2, color: '#C2A633' },
  'avalanche-2': { weight: 1.5, color: '#E84142' },
  'polkadot': { weight: 1.2, color: '#E6007A' },
  'matic-network': { weight: 1, color: '#8247E5' },
  'chainlink': { weight: 1, color: '#2A5ADA' },
  'litecoin': { weight: 0.8, color: '#345D9D' },
  'shiba-inu': { weight: 0.7, color: '#FFA409' },
  'uniswap': { weight: 0.6, color: '#FF007A' },
  'cosmos': { weight: 0.5, color: '#2E3148' },
  'stellar': { weight: 0.5, color: '#14B6E7' },
};

const CRYPTO_IDS = Object.keys(CRYPTO_CONFIG);

interface CryptoData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  weight: number;
  color: string;
  volume?: number;
  marketCap?: number;
  // Derivatives overlay
  fundingRate?: number | null;
  fundingSentiment?: string | null;
  openInterest?: number | null;
  oiChange24h?: number | null;
  // Sector categorization
  sector?: string;
}

// GET /api/crypto/heatmap - Get crypto performance data via CoinGecko
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch market data + DeFi stats in parallel (both from CoinGecko)
    const [marketData, defiData] = await Promise.all([
      getMarketData({ ids: CRYPTO_IDS, per_page: 20 }),
      getDefiData(),
    ]);
    
    if (!marketData || marketData.length === 0) {
      return NextResponse.json({
        cryptos: [],
        timestamp: new Date().toISOString(),
        source: 'coingecko',
        error: 'Failed to fetch market data'
      }, { status: 500 });
    }

    const cryptos: CryptoData[] = marketData.map((coin: CoinGeckoMarketData) => {
      const config = CRYPTO_CONFIG[coin.id] || { weight: 0.5, color: '#888888' };
      const sym = coin.symbol.toUpperCase();
      
      return {
        symbol: sym,
        name: coin.name,
        price: coin.current_price,
        change: coin.price_change_24h || 0,
        changePercent: coin.price_change_percentage_24h || 0,
        weight: config.weight,
        color: config.color,
        volume: coin.total_volume,
        marketCap: coin.market_cap,
        sector: CRYPTO_SECTORS[sym] || 'Other',
      };
    });

    // Enrich with derivatives data from DB (latest snapshots)
    try {
      const symbols = cryptos.map(c => c.symbol);
      const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');

      // Get latest derivatives snapshot per symbol
      const derivRows = await q(
        `SELECT DISTINCT ON (symbol) symbol, funding_rate_pct, sentiment, total_oi, total_volume_24h
         FROM derivatives_snapshots
         WHERE symbol IN (${placeholders})
         ORDER BY symbol, captured_at DESC`,
        symbols
      );

      // Get previous snapshot for OI change calculation (24h ago)
      const prevRows = await q(
        `SELECT DISTINCT ON (symbol) symbol, total_oi
         FROM derivatives_snapshots
         WHERE symbol IN (${placeholders})
           AND captured_at < NOW() - INTERVAL '20 hours'
         ORDER BY symbol, captured_at DESC`,
        symbols
      );

      const derivMap = new Map<string, Record<string, unknown>>();
      for (const r of derivRows) derivMap.set(r.symbol, r);
      const prevMap = new Map<string, number>();
      for (const r of prevRows) prevMap.set(r.symbol, parseFloat(r.total_oi) || 0);

      for (const c of cryptos) {
        const d = derivMap.get(c.symbol);
        if (d) {
          c.fundingRate = d.funding_rate_pct != null ? parseFloat(String(d.funding_rate_pct)) : null;
          c.fundingSentiment = (d.sentiment as string) || null;
          c.openInterest = d.total_oi != null ? parseFloat(String(d.total_oi)) : null;
          // OI change %
          const prevOI = prevMap.get(c.symbol);
          if (prevOI && prevOI > 0 && c.openInterest && c.openInterest > 0) {
            c.oiChange24h = Math.round(((c.openInterest - prevOI) / prevOI) * 10000) / 100;
          }
        }
      }
    } catch (err) {
      console.error('Crypto heatmap derivatives enrichment (non-fatal):', err);
    }

    // Sort by weight (market cap proxy)
    cryptos.sort((a, b) => b.weight - a.weight);

    return NextResponse.json({
      cryptos,
      defi: defiData ?? null,
      timestamp: new Date().toISOString(),
      source: 'coingecko'
    });
    
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return NextResponse.json({ error: 'Failed to fetch crypto data' }, { status: 500 });
  }
}
