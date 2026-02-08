'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  marketCapRank: number | null;
}

export default function CryptoSearchWidget() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<SearchResult | null>(null);
  const [coinData, setCoinData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crypto/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.coins || []);
        setShowResults(true);
      } catch (e) {
        console.error('Search failed:', e);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch coin detail when selected
  useEffect(() => {
    if (!selectedCoin) {
      setCoinData(null);
      return;
    }

    const coinId = selectedCoin.id;

    async function fetchCoinDetail() {
      setLoadingDetail(true);
      setCoinData(null);
      try {
        const res = await fetch(`/api/crypto/detail?id=${coinId}`);
        const data = await res.json();
        if (res.ok && data && !data.error) {
          setCoinData(data);
        } else {
          console.error('Coin detail API error:', data?.error || res.status);
          setCoinData(null);
        }
      } catch (e) {
        console.error('Failed to fetch coin:', e);
        setCoinData(null);
      } finally {
        setLoadingDetail(false);
      }
    }
    fetchCoinDetail();
  }, [selectedCoin]);

  const handleSelect = (coin: SearchResult) => {
    setSelectedCoin(coin);
    setQuery('');
    setShowResults(false);
  };

  const formatNumber = (num: number) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPrice = (price: number) => {
    if (price < 0.00001) return `$${price.toExponential(2)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    if (price < 1000) return `$${price.toFixed(2)}`;
    return `$${price.toLocaleString()}`;
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        marginBottom: '16px'
      }}>
        <span style={{ fontSize: '20px' }}>🔍</span>
        <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, margin: 0 }}>
          Coin Search
        </h3>
      </div>

      {/* Search Input */}
      <div ref={searchRef} style={{ position: 'relative', marginBottom: selectedCoin ? '16px' : 0 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search any coin (BTC, Ethereum, etc.)"
          style={{
            width: '100%',
            padding: '12px 16px',
            paddingLeft: '40px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <span style={{
          position: 'absolute',
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#64748b',
          fontSize: '16px'
        }}>
          {loading ? '⏳' : '🔍'}
        </span>

        {/* Search Results Dropdown */}
        {showResults && results.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
          }}>
            {results.map((coin) => (
              <button
                key={coin.id}
                onClick={() => handleSelect(coin)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderBottom: '1px solid #334155',
                  textAlign: 'left',
                }}
                className="hover:bg-slate-700/50"
              >
                <img 
                  src={coin.thumb} 
                  alt={coin.symbol}
                  style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: 600 }}>
                    {coin.name}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>
                    {coin.symbol}
                  </div>
                </div>
                {coin.marketCapRank && (
                  <span style={{
                    color: '#64748b',
                    fontSize: '10px',
                    background: 'rgba(0,0,0,0.3)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    #{coin.marketCapRank}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Coin Detail */}
      {selectedCoin && (
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #334155',
        }}>
          {loadingDetail ? (
            <div className="animate-pulse space-y-3">
              <div className="h-6 bg-slate-700 rounded w-32"></div>
              <div className="h-8 bg-slate-700/50 rounded w-24"></div>
            </div>
          ) : coinData ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <img 
                  src={coinData.image?.small || selectedCoin.thumb} 
                  alt={coinData.symbol}
                  style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                />
                <div>
                  <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700 }}>
                    {coinData.name}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '12px' }}>
                    {coinData.symbol?.toUpperCase()} • Rank #{coinData.market_cap_rank}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCoin(null)}
                  style={{
                    marginLeft: 'auto',
                    color: '#64748b',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px'
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px' 
              }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>PRICE</div>
                  <div style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700 }}>
                    {formatPrice(coinData.market_data?.current_price?.usd || 0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>24H CHANGE</div>
                  <div style={{ 
                    color: (coinData.market_data?.price_change_percentage_24h ?? 0) >= 0 ? '#10b981' : '#ef4444',
                    fontSize: '18px', 
                    fontWeight: 700 
                  }}>
                    {(coinData.market_data?.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}
                    {(coinData.market_data?.price_change_percentage_24h ?? 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>MARKET CAP</div>
                  <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600 }}>
                    {formatNumber(coinData.market_data?.market_cap?.usd || 0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>24H VOLUME</div>
                  <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600 }}>
                    {formatNumber(coinData.market_data?.total_volume?.usd || 0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>24H HIGH</div>
                  <div style={{ color: '#10b981', fontSize: '12px', fontWeight: 500 }}>
                    {formatPrice(coinData.market_data?.high_24h?.usd || 0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '2px' }}>24H LOW</div>
                  <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: 500 }}>
                    {formatPrice(coinData.market_data?.low_24h?.usd || 0)}
                  </div>
                </div>
              </div>

              {/* Additional Stats */}
              <div style={{ 
                marginTop: '12px', 
                paddingTop: '12px',
                borderTop: '1px solid #334155',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>7d Change</span>
                  <span style={{ 
                    color: (coinData.market_data?.price_change_percentage_7d ?? 0) >= 0 ? '#10b981' : '#ef4444',
                    fontSize: '11px',
                    fontWeight: 600
                  }}>
                    {(coinData.market_data?.price_change_percentage_7d ?? 0).toFixed(2)}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>30d Change</span>
                  <span style={{ 
                    color: (coinData.market_data?.price_change_percentage_30d ?? 0) >= 0 ? '#10b981' : '#ef4444',
                    fontSize: '11px',
                    fontWeight: 600
                  }}>
                    {(coinData.market_data?.price_change_percentage_30d ?? 0).toFixed(2)}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>ATH</span>
                  <span style={{ color: '#f1f5f9', fontSize: '11px' }}>
                    {formatPrice(coinData.market_data?.ath?.usd || 0)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>From ATH</span>
                  <span style={{ 
                    color: '#ef4444',
                    fontSize: '11px',
                    fontWeight: 600
                  }}>
                    {(coinData.market_data?.ath_change_percentage?.usd ?? 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              <a
                href={`/tools/crypto-explorer?coin=${coinData.id}`}
                style={{
                  display: 'block',
                  marginTop: '12px',
                  padding: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '6px',
                  color: '#10b981',
                  textDecoration: 'none',
                  textAlign: 'center',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                View Full Details →
              </a>
            </>
          ) : (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
              <div style={{ marginBottom: '12px' }}>Failed to load coin data</div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    // Trigger re-fetch by resetting selectedCoin then setting it again
                    const coin = selectedCoin;
                    setSelectedCoin(null);
                    setTimeout(() => setSelectedCoin(coin), 100);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '6px',
                    color: '#10b981',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Retry
                </button>
                <button
                  onClick={() => setSelectedCoin(null)}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(100, 116, 139, 0.2)',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#94a3b8',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Access Chips */}
      {!selectedCoin && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '8px' }}>
            POPULAR SEARCHES
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {['Bitcoin', 'Ethereum', 'Solana', 'XRP', 'Dogecoin'].map((name) => (
              <button
                key={name}
                onClick={() => setQuery(name)}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid #334155',
                  borderRadius: '16px',
                  color: '#94a3b8',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
                className="hover:bg-slate-700/50 hover:text-white"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
