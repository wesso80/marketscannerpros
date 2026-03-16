'use client';

import React, { useState, useEffect } from 'react';
import TimeGravityMapWidget from '@/components/TimeGravityMapWidget';

export default function TimeScannerPage() {
  const [symbol, setSymbol] = useState('BTCUSD');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [symInput, setSymInput] = useState('BTCUSD');

  // Fetch live price on mount and when symbol changes
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const isCrypto = symbol.endsWith('USD') && !['AUDUSD','EURUSD','NZDUSD','GBPUSD'].includes(symbol);
        const type = isCrypto ? 'crypto' : 'stock';
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`);
        const data = await res.json();
        if (!cancelled && data.price) setCurrentPrice(data.price);
      } catch { /* keep existing price */ }
    };
    fetchPrice();
    return () => { cancelled = true; };
  }, [symbol]);

  const handleSubmit = () => {
    const s = symInput.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            ⏰ Time Scanner
            <span className="ml-3 text-2xl text-cyan-400">ELITE</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto">
            Advanced Time Gravity Analysis - Track decompression windows, midpoint debt,
            and multi-timeframe confluence zones with institutional-grade precision.
          </p>
        </div>

        {/* Controls */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="ts-symbol" className="block text-sm text-gray-400 mb-2">Symbol</label>
                <input
                  id="ts-symbol"
                  type="text"
                  value={symInput}
                  onChange={(e) => setSymInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="BTCUSD"
                />
              </div>

              <div>
                <label htmlFor="ts-price" className="block text-sm text-gray-400 mb-2">Current Price</label>
                <input
                  id="ts-price"
                  type="number"
                  value={currentPrice || ''}
                  onChange={(e) => setCurrentPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="73950"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  Load Symbol
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Time Gravity Map Widget — handles its own data fetching */}
        <div className="max-w-7xl mx-auto">
          <TimeGravityMapWidget
            symbol={symbol}
            currentPrice={currentPrice}
            autoRefresh={true}
            refreshInterval={30000}
            variant="full"
          />
        </div>

        {/* Documentation Section */}
        <div className="max-w-7xl mx-auto mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* What is Time Gravity Map? */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-3">🎯 What is Time Gravity Map?</h3>
            <div className="text-sm text-gray-400 space-y-2">
              <p>
                Time Gravity Map models price movement as a gravitational field where each timeframe
                midpoint acts as a mass that pulls price toward it.
              </p>
              <p className="font-mono text-cyan-400">
                gravity = (tf_weight × decompression) / distance
              </p>
              <p>
                When multiple timeframes cluster near the same price level, they create a powerful
                gravity zone (AOI) that acts as a magnet for price.
              </p>
            </div>
          </div>

          {/* Decompression Windows */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-3">⏱️ Decompression Windows</h3>
            <div className="text-sm text-gray-400 space-y-2">
              <p>
                Each timeframe has a specific window near candle close where price is most
                likely to tag the midpoint:
              </p>
              <ul className="space-y-1 font-mono text-xs">
                <li>• <span className="text-cyan-400">1H</span>: 7-9 min from open</li>
                <li>• <span className="text-cyan-400">4H</span>: 9-12 min from open</li>
                <li>• <span className="text-cyan-400">1D</span>: ~1 hour before close</li>
                <li>• <span className="text-cyan-400">1W</span>: 2 hours before close</li>
                <li>• <span className="text-cyan-400">1M</span>: 18 hours before close</li>
              </ul>
              <p className="text-purple-400">
                💡 Active windows get 5x gravity multiplier
              </p>
            </div>
          </div>

          {/* Midpoint Debt */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-3">🔴 Midpoint Debt</h3>
            <div className="text-sm text-gray-400 space-y-2">
              <p>
                Unresolved midpoints that haven&apos;t been tagged create &quot;debt&quot; that price
                tends to repay later.
              </p>
              <p>
                When multiple unresolved midpoints cluster together (within 0.5%), they
                form a high-priority AOI zone.
              </p>
              <p className="text-red-400">
                🔴 Debt midpoints get 2x gravity multiplier
              </p>
              <p className="text-green-400">
                🟢 Tagged midpoints have reduced pull
              </p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="max-w-7xl mx-auto mt-8 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">📊 Status Indicators</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-xl">🔴</span>
              <span className="text-gray-300">Debt (Unresolved)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-400 text-xl">🔵</span>
              <span className="text-gray-300">Active Decompression</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-xl">🟡</span>
              <span className="text-gray-300">Pre-Window</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xl">🟢</span>
              <span className="text-gray-300">Tagged</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xl">⚪</span>
              <span className="text-gray-300">Compression</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
