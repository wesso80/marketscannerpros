'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

interface CoinData {
  coin: {
    id: string;
    symbol: string;
    name: string;
    image: string;
    description: string;
    links: {
      homepage?: string;
      whitepaper?: string;
      twitter?: string;
      reddit?: string;
      github?: string;
      blockchain?: string;
    };
    categories: string[];
    genesis_date?: string;
    hashing_algorithm?: string;
  };
  sentiment: {
    votes_up_percentage?: number;
    votes_down_percentage?: number;
    watchlist_users?: number;
  };
  market: {
    rank?: number;
    price_usd?: number;
    price_btc?: number;
    price_eth?: number;
    market_cap?: number;
    fully_diluted_valuation?: number;
    total_volume_24h?: number;
    high_24h?: number;
    low_24h?: number;
    circulating_supply?: number;
    total_supply?: number;
    max_supply?: number;
    ath: { usd?: number; change_percentage?: number; date?: string };
    atl: { usd?: number; change_percentage?: number; date?: string };
  };
  price_changes: {
    '24h'?: number;
    '7d'?: number;
    '14d'?: number;
    '30d'?: number;
    '60d'?: number;
    '200d'?: number;
    '1y'?: number;
  };
  developer?: {
    github_stars?: number;
    github_forks?: number;
    subscribers?: number;
    total_issues?: number;
    closed_issues?: number;
    pull_requests_merged?: number;
    contributors?: number;
    commits_4_weeks?: number;
    additions_4_weeks?: number;
    deletions_4_weeks?: number;
  };
  tickers: Array<{
    exchange: string;
    pair: string;
    price: number;
    volume_usd: number;
    spread?: number;
    trade_url?: string;
    is_stale: boolean;
  }>;
  ohlc: [number, number, number, number, number][];
  chart?: {
    prices: [number, number][];
    volumes: [number, number][];
  };
  sparkline?: number[];
  derivatives?: {
    funding_rate?: number;
    funding_sentiment?: string;
    open_interest?: number;
    volume_24h?: number;
  };
  last_updated?: string;
}

interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
}

// Popular coins for quick selection
const POPULAR_COINS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
];

function formatNumber(num: number | undefined, decimals: number = 2): string {
  if (num === undefined || num === null) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || price === null) return 'N/A';
  if (price < 0.00001) return `$${price.toFixed(10)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(pct: number | undefined): string {
  if (pct === undefined || pct === null) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function PercentBadge({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) return <span className="text-gray-500">N/A</span>;
  const isPositive = value >= 0;
  return (
    <span className={`px-2 py-0.5 rounded text-sm font-medium ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
      {isPositive ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function MiniSparkline({ data, color = '#10B981' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg viewBox="0 0 100 100" className="w-full h-16" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

// Directional intelligence helpers
function getFundingInsight(fundingRate: number | undefined): { text: string; type: 'warning' | 'bullish' | 'bearish' | 'neutral' } | null {
  if (fundingRate === undefined) return null;
  const rate = fundingRate * 100; // Convert to percentage
  
  if (rate > 0.1) return { text: 'Crowded longs — squeeze risk rising', type: 'warning' };
  if (rate > 0.05) return { text: 'Longs paying premium — bullish bias', type: 'bullish' };
  if (rate < -0.1) return { text: 'Crowded shorts — potential short squeeze', type: 'warning' };
  if (rate < -0.05) return { text: 'Shorts paying premium — bearish bias', type: 'bearish' };
  return { text: 'Neutral positioning', type: 'neutral' };
}

function getOIPriceInsight(
  priceChange24h: number | undefined, 
  priceChange7d: number | undefined
): { text: string; type: 'warning' | 'bullish' | 'bearish' | 'neutral' } | null {
  if (priceChange24h === undefined || priceChange7d === undefined) return null;
  
  // Bearish absorption: OI rising + price falling
  if (priceChange24h < -2 && priceChange7d < 0) {
    return { text: 'Price weakness — potential distribution', type: 'bearish' };
  }
  // Bullish accumulation: OI rising + price rising  
  if (priceChange24h > 2 && priceChange7d > 0) {
    return { text: 'Price strength — potential accumulation', type: 'bullish' };
  }
  return null;
}

function getSentimentPriceInsight(
  sentiment: string | undefined,
  priceChange7d: number | undefined
): { text: string; type: 'warning' | 'bullish' | 'bearish' | 'neutral' } | null {
  if (!sentiment || priceChange7d === undefined) return null;
  
  // Divergence warnings
  if (sentiment === 'bullish' && priceChange7d < -5) {
    return { text: 'Euphoria while price weak — distribution risk', type: 'warning' };
  }
  if (sentiment === 'bearish' && priceChange7d > 5) {
    return { text: 'Fear while price strong — accumulation signal', type: 'bullish' };
  }
  return null;
}

// Trend context helpers
function getTrendContext(priceChanges: CoinData['price_changes']): {
  weeklyTrend: 'Bullish' | 'Bearish' | 'Neutral';
  monthlyTrend: 'Bullish' | 'Bearish' | 'Neutral';
  momentum: 'Rising' | 'Falling' | 'Flat';
  above200d: boolean | null;
} {
  const p7d = priceChanges['7d'] ?? 0;
  const p30d = priceChanges['30d'] ?? 0;
  const p200d = priceChanges['200d'];
  
  // Weekly trend
  const weeklyTrend = p7d > 3 ? 'Bullish' : p7d < -3 ? 'Bearish' : 'Neutral';
  
  // Monthly trend
  const monthlyTrend = p30d > 10 ? 'Bullish' : p30d < -10 ? 'Bearish' : 'Neutral';
  
  // Momentum: Compare short-term to mid-term
  const momentum = p7d > p30d / 4 + 2 ? 'Rising' : p7d < p30d / 4 - 2 ? 'Falling' : 'Flat';
  
  // Above 200d (if price is positive vs 200d ago, we're above the rough "200d MA" equivalent)
  const above200d = p200d !== undefined ? p200d > 0 : null;
  
  return { weeklyTrend, monthlyTrend, momentum, above200d };
}

function InsightBadge({ insight }: { insight: { text: string; type: 'warning' | 'bullish' | 'bearish' | 'neutral' } }) {
  const colors = {
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    bullish: 'bg-green-500/20 text-green-400 border-green-500/40',
    bearish: 'bg-red-500/20 text-red-400 border-red-500/40',
    neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/40'
  };
  const icons = { warning: '⚠️', bullish: '📈', bearish: '📉', neutral: '➖' };
  
  return (
    <div className={`text-xs px-3 py-1.5 rounded-lg border ${colors[insight.type]} flex items-center gap-1.5`}>
      <span>{icons[insight.type]}</span>
      <span>{insight.text}</span>
    </div>
  );
}

export default function CryptoDetailPage() {
  const { tier } = useUserTier();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [coinData, setCoinData] = useState<CoinData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Search for coins
  const searchCoins = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const res = await fetch(`/api/crypto/detail?action=search&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.coins || []);
      setShowDropdown(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);
  
  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) searchCoins(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchCoins]);
  
  // Load coin details
  const loadCoinDetails = useCallback(async (symbol: string) => {
    setLoading(true);
    setError(null);
    setSelectedCoin(symbol);
    setShowDropdown(false);
    setSearchQuery('');
    
    try {
      const res = await fetch(`/api/crypto/detail?action=detail&symbol=${encodeURIComponent(symbol)}`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Failed to fetch coin data');
      const data = await res.json();
      setCoinData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCoinData(null);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Gate check
  if (!tier || tier === 'free') {
    return (
      <div className="min-h-screen bg-[#0F172A]">
        <div className="container mx-auto px-4 py-16">
          <UpgradeGate 
            requiredTier="pro" 
            feature="Crypto Asset Explorer" 
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            🔍 Crypto Asset Explorer
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Deep dive into any cryptocurrency with comprehensive market data, on-chain metrics, exchange tickers, and derivatives information.
          </p>
        </div>
        
        {/* Search Section */}
        <div className="max-w-2xl mx-auto mb-8" ref={searchRef}>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="Search for any cryptocurrency (e.g., Bitcoin, ETH, Solana)..."
              className="w-full px-6 py-4 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-lg"
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            
            {/* Search Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto">
                {searchResults.map((coin) => (
                  <button
                    key={coin.id}
                    onClick={() => loadCoinDetails(coin.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <img src={coin.thumb} alt={coin.name} className="w-8 h-8 rounded-full" />
                    <div>
                      <span className="font-medium">{coin.name}</span>
                      <span className="text-gray-400 ml-2 text-sm">{coin.symbol.toUpperCase()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Quick Select Popular Coins */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {POPULAR_COINS.map((coin) => (
            <button
              key={coin.symbol}
              onClick={() => loadCoinDetails(coin.symbol)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedCoin === coin.symbol 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
              }`}
            >
              {coin.symbol}
            </button>
          ))}
        </div>
        
        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        
        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <div className="text-red-400 text-lg">❌ {error}</div>
            <button 
              onClick={() => selectedCoin && loadCoinDetails(selectedCoin)}
              className="mt-4 px-6 py-2 bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
        
        {/* Coin Data Display */}
        {coinData && !loading && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header Card */}
            <div className="bg-slate-800/50 border border-slate-600/50 rounded-2xl p-6">
              <div className="flex flex-wrap items-start gap-6">
                {/* Coin Image & Basic Info */}
                <div className="flex items-center gap-4">
                  {coinData.coin.image && (
                    <img 
                      src={coinData.coin.image} 
                      alt={coinData.coin.name} 
                      className="w-16 h-16 rounded-full"
                    />
                  )}
                  <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3">
                      {coinData.coin.name}
                      <span className="text-lg font-normal text-gray-400">{coinData.coin.symbol}</span>
                      {coinData.market.rank && (
                        <span className="text-sm bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
                          Rank #{coinData.market.rank}
                        </span>
                      )}
                    </h2>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {coinData.coin.categories.slice(0, 3).map((cat, i) => (
                        <span key={i} className="text-xs bg-slate-700 text-gray-300 px-2 py-1 rounded">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Price Section */}
                <div className="ml-auto text-right">
                  <div className="flex items-center justify-end gap-3">
                    <div className="text-4xl font-bold">{formatPrice(coinData.market.price_usd)}</div>
                    <button
                      onClick={() => selectedCoin && loadCoinDetails(selectedCoin)}
                      disabled={loading}
                      className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
                      title="Refresh data"
                    >
                      <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-4 mt-2">
                    <PercentBadge value={coinData.price_changes['24h']} />
                    <span className="text-gray-400 text-sm">24h</span>
                  </div>
                </div>
              </div>
              
              {/* 7-day Sparkline */}
              {coinData.sparkline && coinData.sparkline.length > 0 && (
                <div className="mt-6">
                  <div className="text-sm text-gray-400 mb-2">7-Day Price Chart</div>
                  <MiniSparkline 
                    data={coinData.sparkline} 
                    color={coinData.price_changes['7d'] && coinData.price_changes['7d'] >= 0 ? '#10B981' : '#EF4444'} 
                  />
                </div>
              )}
              
              {/* Links */}
              <div className="flex flex-wrap gap-3 mt-6">
                {coinData.coin.links.homepage && (
                  <a href={coinData.coin.links.homepage} target="_blank" rel="noopener noreferrer" 
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                    🌐 Website
                  </a>
                )}
                {coinData.coin.links.whitepaper && (
                  <a href={coinData.coin.links.whitepaper} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                    📄 Whitepaper
                  </a>
                )}
                {coinData.coin.links.twitter && (
                  <a href={coinData.coin.links.twitter} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                    🐦 Twitter
                  </a>
                )}
                {coinData.coin.links.github && (
                  <a href={coinData.coin.links.github} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                    💻 GitHub
                  </a>
                )}
                {coinData.coin.links.blockchain && (
                  <a href={coinData.coin.links.blockchain} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                    🔗 Explorer
                  </a>
                )}
              </div>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-4">
                <div className="text-gray-400 text-sm">Market Cap</div>
                <div className="text-xl font-bold mt-1">{formatNumber(coinData.market.market_cap)}</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-4">
                <div className="text-gray-400 text-sm">24h Volume</div>
                <div className="text-xl font-bold mt-1">{formatNumber(coinData.market.total_volume_24h)}</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-4">
                <div className="text-gray-400 text-sm">FDV</div>
                <div className="text-xl font-bold mt-1">{formatNumber(coinData.market.fully_diluted_valuation)}</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-4">
                <div className="text-gray-400 text-sm">Circulating Supply</div>
                <div className="text-xl font-bold mt-1">
                  {coinData.market.circulating_supply 
                    ? `${(coinData.market.circulating_supply / 1e6).toFixed(2)}M` 
                    : 'N/A'}
                </div>
              </div>
            </div>
            
            {/* Trend Context - Mini trend intelligence */}
            {(() => {
              const trend = getTrendContext(coinData.price_changes);
              return (
                <div className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-500/30 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">🧭 Trend Context</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-gray-400 text-xs uppercase mb-1">Weekly Trend</div>
                      <div className={`text-lg font-bold ${
                        trend.weeklyTrend === 'Bullish' ? 'text-green-400' : 
                        trend.weeklyTrend === 'Bearish' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {trend.weeklyTrend === 'Bullish' ? '📈' : trend.weeklyTrend === 'Bearish' ? '📉' : '➖'} {trend.weeklyTrend}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 text-xs uppercase mb-1">Monthly Trend</div>
                      <div className={`text-lg font-bold ${
                        trend.monthlyTrend === 'Bullish' ? 'text-green-400' : 
                        trend.monthlyTrend === 'Bearish' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {trend.monthlyTrend === 'Bullish' ? '📈' : trend.monthlyTrend === 'Bearish' ? '📉' : '➖'} {trend.monthlyTrend}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 text-xs uppercase mb-1">Momentum</div>
                      <div className={`text-lg font-bold ${
                        trend.momentum === 'Rising' ? 'text-green-400' : 
                        trend.momentum === 'Falling' ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {trend.momentum === 'Rising' ? '🔥' : trend.momentum === 'Falling' ? '❄️' : '⚖️'} {trend.momentum}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 text-xs uppercase mb-1">vs 200-Day</div>
                      <div className={`text-lg font-bold ${
                        trend.above200d === true ? 'text-green-400' : 
                        trend.above200d === false ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {trend.above200d === true ? '✅ Above' : trend.above200d === false ? '⚠️ Below' : '—'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Quick interpretation */}
                  <div className="mt-4 pt-4 border-t border-blue-500/20">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-blue-300">💡</span>
                      <span className="text-slate-300">
                        {trend.weeklyTrend === 'Bullish' && trend.monthlyTrend === 'Bullish' && 'Strong uptrend — momentum aligned across timeframes'}
                        {trend.weeklyTrend === 'Bearish' && trend.monthlyTrend === 'Bearish' && 'Strong downtrend — caution advised'}
                        {trend.weeklyTrend === 'Bullish' && trend.monthlyTrend === 'Bearish' && 'Potential trend reversal — watch for confirmation'}
                        {trend.weeklyTrend === 'Bearish' && trend.monthlyTrend === 'Bullish' && 'Short-term pullback in larger uptrend — possible dip buy'}
                        {trend.weeklyTrend === 'Neutral' && 'Consolidation phase — waiting for breakout direction'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Price Changes & ATH/ATL */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Price Changes */}
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">📈 Price Performance</h3>
                <div className="space-y-3">
                  {[
                    { label: '24 Hours', key: '24h' as const },
                    { label: '7 Days', key: '7d' as const },
                    { label: '14 Days', key: '14d' as const },
                    { label: '30 Days', key: '30d' as const },
                    { label: '60 Days', key: '60d' as const },
                    { label: '1 Year', key: '1y' as const },
                  ].map(({ label, key }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-gray-400">{label}</span>
                      <PercentBadge value={coinData.price_changes[key]} />
                    </div>
                  ))}
                </div>
              </div>
              
              {/* ATH / ATL */}
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">🏆 All-Time High / Low</h3>
                <div className="space-y-6">
                  <div>
                    <div className="text-emerald-400 font-medium mb-2">All-Time High</div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">{formatPrice(coinData.market.ath.usd)}</span>
                      <PercentBadge value={coinData.market.ath.change_percentage} />
                    </div>
                    {coinData.market.ath.date && (
                      <div className="text-gray-500 text-sm mt-1">
                        {new Date(coinData.market.ath.date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-red-400 font-medium mb-2">All-Time Low</div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">{formatPrice(coinData.market.atl.usd)}</span>
                      <PercentBadge value={coinData.market.atl.change_percentage} />
                    </div>
                    {coinData.market.atl.date && (
                      <div className="text-gray-500 text-sm mt-1">
                        {new Date(coinData.market.atl.date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Derivatives Data (if available) */}
            {coinData.derivatives && (
              <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">📊 Derivatives Data</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {coinData.derivatives.funding_rate !== undefined && (
                    <div>
                      <div className="text-gray-400 text-sm">Funding Rate</div>
                      <div className={`text-xl font-bold ${coinData.derivatives.funding_rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(coinData.derivatives.funding_rate * 100).toFixed(4)}%
                      </div>
                    </div>
                  )}
                  {coinData.derivatives.funding_sentiment && (
                    <div>
                      <div className="text-gray-400 text-sm">Funding Sentiment</div>
                      <div className={`text-xl font-bold ${coinData.derivatives.funding_sentiment === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
                        {coinData.derivatives.funding_sentiment.toUpperCase()}
                      </div>
                    </div>
                  )}
                  {coinData.derivatives.open_interest && (
                    <div>
                      <div className="text-gray-400 text-sm">Open Interest</div>
                      <div className="text-xl font-bold">{formatNumber(coinData.derivatives.open_interest)}</div>
                    </div>
                  )}
                  {coinData.derivatives.volume_24h !== undefined && (
                    <div>
                      <div className="text-gray-400 text-sm">24h Volume</div>
                      <div className="text-xl font-bold">{formatNumber(coinData.derivatives.volume_24h)}</div>
                    </div>
                  )}
                </div>
                
                {/* Directional Intelligence Insights */}
                {(() => {
                  const fundingInsight = getFundingInsight(coinData.derivatives?.funding_rate);
                  const oiInsight = getOIPriceInsight(coinData.price_changes['24h'], coinData.price_changes['7d']);
                  const sentimentInsight = getSentimentPriceInsight(coinData.derivatives?.funding_sentiment, coinData.price_changes['7d']);
                  const insights = [fundingInsight, oiInsight, sentimentInsight].filter(Boolean);
                  
                  if (insights.length === 0) return null;
                  
                  return (
                    <div className="border-t border-purple-500/20 pt-4 mt-2">
                      <div className="text-xs text-purple-300 uppercase font-semibold mb-2">🎯 Directional Intelligence</div>
                      <div className="flex flex-wrap gap-2">
                        {insights.map((insight, idx) => (
                          <InsightBadge key={idx} insight={insight!} />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            
            {/* Community Sentiment */}
            {(coinData.sentiment.votes_up_percentage || coinData.sentiment.watchlist_users) && (
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">💬 Community Sentiment</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {coinData.sentiment.votes_up_percentage !== undefined && (
                    <div>
                      <div className="text-gray-400 text-sm">Bullish Votes</div>
                      <div className="text-xl font-bold text-green-400">
                        {coinData.sentiment.votes_up_percentage.toFixed(1)}%
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${coinData.sentiment.votes_up_percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {coinData.sentiment.watchlist_users && (
                    <div>
                      <div className="text-gray-400 text-sm">Watchlist Users</div>
                      <div className="text-xl font-bold">
                        {(coinData.sentiment.watchlist_users / 1000).toFixed(0)}K
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Developer Activity */}
            {coinData.developer && coinData.developer.github_stars && (
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">👨‍💻 Developer Activity</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm">GitHub Stars</div>
                    <div className="text-xl font-bold">{coinData.developer.github_stars?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm">Forks</div>
                    <div className="text-xl font-bold">{coinData.developer.github_forks?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm">Contributors</div>
                    <div className="text-xl font-bold">{coinData.developer.contributors?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm">Commits (4 weeks)</div>
                    <div className="text-xl font-bold">{coinData.developer.commits_4_weeks?.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Exchange Tickers */}
            {coinData.tickers && coinData.tickers.length > 0 && (
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">🏦 Exchange Tickers</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 text-sm border-b border-slate-600">
                        <th className="pb-3 pr-4">Exchange</th>
                        <th className="pb-3 pr-4">Pair</th>
                        <th className="pb-3 pr-4 text-right">Price</th>
                        <th className="pb-3 pr-4 text-right">24h Volume</th>
                        <th className="pb-3 pr-4 text-right">Spread</th>
                        <th className="pb-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {coinData.tickers.slice(0, 10).map((ticker, i) => (
                        <tr key={i} className="border-b border-slate-700/50">
                          <td className="py-3 pr-4 font-medium">{ticker.exchange}</td>
                          <td className="py-3 pr-4 text-gray-300">{ticker.pair}</td>
                          <td className="py-3 pr-4 text-right">{formatPrice(ticker.price)}</td>
                          <td className="py-3 pr-4 text-right">{formatNumber(ticker.volume_usd)}</td>
                          <td className="py-3 pr-4 text-right">
                            {ticker.spread ? `${ticker.spread.toFixed(3)}%` : '-'}
                          </td>
                          <td className="py-3">
                            {ticker.trade_url && (
                              <a 
                                href={ticker.trade_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 text-sm"
                              >
                                Trade →
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* Description */}
            {coinData.coin.description && (
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">📝 About {coinData.coin.name}</h3>
                <p className="text-gray-300 leading-relaxed">{coinData.coin.description}</p>
                <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-400">
                  {coinData.coin.genesis_date && (
                    <span>📅 Genesis: {new Date(coinData.coin.genesis_date).toLocaleDateString()}</span>
                  )}
                  {coinData.coin.hashing_algorithm && (
                    <span>🔐 Algorithm: {coinData.coin.hashing_algorithm}</span>
                  )}
                </div>
              </div>
            )}
            
            {/* Last Updated */}
            {coinData.last_updated && (
              <div className="text-center text-gray-500 text-sm">
                Last updated: {new Date(coinData.last_updated).toLocaleString()}
              </div>
            )}
          </div>
        )}
        
        {/* Empty State */}
        {!selectedCoin && !loading && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔎</div>
            <h3 className="text-xl font-semibold text-gray-300">Select a cryptocurrency to explore</h3>
            <p className="text-gray-500 mt-2">Search above or click a popular coin to get started</p>
          </div>
        )}
        
        {/* Footer Attribution */}
        <div className="text-center text-gray-500 text-sm mt-12 pb-8">
          📊 Data powered by <span className="text-emerald-400">CoinGecko</span>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
