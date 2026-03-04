'use client';

import React, { useState, useEffect } from 'react';
import TimeGravityMapWidget from '@/components/TimeGravityMapWidget';
import type { MidpointRecord } from '@/lib/time/midpointDebt';

export default function TimeScannerPage() {
  const [symbol, setSymbol] = useState('BTCUSD');
  const [currentPrice, setCurrentPrice] = useState(68075);
  const [midpoints, setMidpoints] = useState<MidpointRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Load demo data on mount
  useEffect(() => {
    loadDemoData();
  }, []);
  
  const loadDemoData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/time-gravity-map?symbol=${symbol}&price=${currentPrice}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        // Extract midpoints from the response
        // In real usage, this would come from your database/API
        const demoMidpoints = generateDemoMidpoints(currentPrice);
        setMidpoints(demoMidpoints);
      }
    } catch (error) {
      console.error('Failed to load demo data:', error);
      // Fallback to local demo data
      setMidpoints(generateDemoMidpoints(currentPrice));
    } finally {
      setLoading(false);
    }
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
                <label className="block text-sm text-gray-400 mb-2">Symbol</label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="BTCUSD"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">Current Price</label>
                <input
                  type="number"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(parseFloat(e.target.value))}
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="68075"
                />
              </div>
              
              <div className="flex items-end">
                <button
                  onClick={loadDemoData}
                  disabled={loading}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  {loading ? 'Loading...' : 'Refresh Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Time Gravity Map Widget */}
        {midpoints.length > 0 ? (
          <div className="max-w-7xl mx-auto">
            <TimeGravityMapWidget
              symbol={symbol}
              currentPrice={currentPrice}
              midpoints={midpoints}
              autoRefresh={true}
              refreshInterval={30000}
              variant="full"
            />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
            <div className="text-gray-500 mb-4">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg">No midpoint data available</p>
              <p className="text-sm mt-2">Click "Refresh Data" to load demo data or connect your data source</p>
            </div>
          </div>
        )}
        
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
                Unresolved midpoints that haven't been tagged create "debt" that price 
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
        
        {/* API Example */}
        <div className="max-w-7xl mx-auto mt-8 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-3">🔌 API Usage</h3>
          <div className="bg-black rounded p-4 overflow-x-auto">
            <pre className="text-xs text-green-400 font-mono">
{`// GET request with demo data
fetch('/api/time-gravity-map?symbol=BTCUSD&price=68000')
  .then(res => res.json())
  .then(data => console.log(data));

// POST request with custom midpoints
fetch('/api/time-gravity-map', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'BTCUSD',
    currentPrice: 68000,
    midpoints: [
      {
        timeframe: '1H',
        midpoint: 68500,
        high: 68550,
        low: 68450,
        // ... other fields
      }
    ]
  })
});`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Generate demo midpoints for testing
 */
function generateDemoMidpoints(currentPrice: number): MidpointRecord[] {
  const now = new Date();
  
  const configs = [
    { tf: '1H', offset: 0.005, hoursAgo: 1, weight: 2 },
    { tf: '1H', offset: 0.0052, hoursAgo: 2, weight: 2 },
    { tf: '4H', offset: 0.007, hoursAgo: 4, weight: 3.5 },
    { tf: '4H', offset: 0.0068, hoursAgo: 8, weight: 3.5 },
    { tf: '1D', offset: 0.01, hoursAgo: 24, weight: 6 },
    { tf: '1D', offset: 0.0098, hoursAgo: 48, weight: 6 },
    { tf: '1W', offset: 0.015, hoursAgo: 168, weight: 10 },
    { tf: '1M', offset: 0.02, hoursAgo: 720, weight: 12 },
  ];
  
  const midpoints: MidpointRecord[] = [];
  
  for (const { tf, offset, hoursAgo, weight } of configs) {
    const midpoint = currentPrice * (1 + offset);
    const high = midpoint * 1.001;
    const low = midpoint * 0.999;
    
    const candleOpenTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    const candleCloseTime = new Date(candleOpenTime.getTime() + hoursAgo * 60 * 60 * 1000);
    
    midpoints.push({
      timeframe: tf,
      midpoint,
      high,
      low,
      createdAt: candleOpenTime,
      candleOpenTime,
      candleCloseTime,
      tagged: Math.random() > 0.7, // 30% tagged
      taggedAt: Math.random() > 0.7 ? new Date() : null,
      distanceFromPrice: ((midpoint - currentPrice) / currentPrice) * 100,
      ageMinutes: hoursAgo * 60,
      weight,
      isAbovePrice: true,
    });
  }
  
  return midpoints;
}
