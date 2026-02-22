'use client';

import { useCallback, useRef, useState } from 'react';
import type { AssetClass } from './types';

const ASSET_CLASSES: { key: AssetClass; label: string }[] = [
  { key: 'equities', label: 'Equities' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'macro', label: 'Macro' },
  { key: 'commodities', label: 'Commodities' },
];

const QUICK_TICKERS: Record<AssetClass, string[]> = {
  equities: ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META'],
  crypto: ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'BNB', 'AVAX'],
  macro: ['DXY', 'TNX', 'VIX', 'GLD', 'TLT', 'UUP'],
  commodities: ['GLD', 'SLV', 'USO', 'WEAT', 'UNG', 'CPER'],
};

interface MarketsToolbarProps {
  assetClass: AssetClass;
  onAssetClassChange: (ac: AssetClass) => void;
  symbol: string;
  onSymbolChange: (sym: string) => void;
}

/**
 * MarketsToolbar — Asset class toggle + unified ticker search + quick picks.
 */
export default function MarketsToolbar({
  assetClass,
  onAssetClassChange,
  symbol,
  onSymbolChange,
}: MarketsToolbarProps) {
  const [searchInput, setSearchInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(() => {
    const cleaned = searchInput.trim().toUpperCase();
    if (cleaned.length > 0) {
      onSymbolChange(cleaned);
      setSearchInput('');
    }
  }, [searchInput, onSymbolChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-2">
      {/* Row 1: Asset class toggle + search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Asset class pills */}
        <div className="flex items-center gap-1">
          {ASSET_CLASSES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onAssetClassChange(key)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                assetClass === key
                  ? 'border-[rgba(16,185,129,0.5)] bg-[rgba(16,185,129,0.12)] text-[var(--msp-accent)]'
                  : 'border-[var(--msp-border)] text-[var(--msp-text-muted)] hover:text-[var(--msp-text)] hover:border-[var(--msp-border-strong)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1 min-w-[180px]">
          <svg className="h-3.5 w-3.5 text-[var(--msp-text-faint)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ticker symbol (e.g. AAPL, BTC, SPY)"
            className="flex-1 border-none bg-transparent text-[11px] text-[var(--msp-text)] placeholder-[var(--msp-text-faint)] outline-none"
          />
          <button
            onClick={handleSearch}
            className="rounded-md bg-[var(--msp-accent)] px-2 py-0.5 text-[10px] font-bold text-black hover:bg-[var(--msp-accent-hover)] transition-colors"
          >
            Go
          </button>
        </div>
      </div>

      {/* Row 2: Quick picks for current asset class */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)] mr-1">Quick:</span>
        {QUICK_TICKERS[assetClass].map(ticker => (
          <button
            key={ticker}
            onClick={() => onSymbolChange(ticker)}
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              symbol === ticker
                ? 'border-[rgba(16,185,129,0.5)] bg-[rgba(16,185,129,0.12)] text-[var(--msp-accent)]'
                : 'border-[var(--msp-border)] text-[var(--msp-text-muted)] hover:text-[var(--msp-text)]'
            }`}
          >
            {ticker}
          </button>
        ))}
      </div>
    </div>
  );
}
