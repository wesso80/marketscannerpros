'use client';

import { Suspense } from 'react';
import Link from 'next/link';

function BacktestContent() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#f9fafb', marginBottom: '8px' }}>
              Strategy Backtester
            </h1>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Test your trading strategies with historical data</p>
          </div>
          <Link href="/tools/scanner" style={{
            padding: '10px 18px',
            background: 'rgba(31,41,55,0.8)',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            ← Back to Scanner
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '2px', marginBottom: '30px' }}>
          <Link href="/tools/portfolio" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Portfolio
          </Link>

          <Link href="/tools/backtest" style={{
            padding: '10px 20px',
            color: '#10b981',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            borderBottom: '2px solid #10b981'
          }}>
            Backtest
          </Link>
          <Link href="/tools/journal" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Trade Journal
          </Link>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
          border: '1px solid #374151',
          borderRadius: '12px',
          padding: '60px 24px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>📈</div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#f9fafb', marginBottom: '12px' }}>
            Backtesting Engine Coming Soon
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '16px', maxWidth: '500px', margin: '0 auto' }}>
            Test your trading strategies against historical data and see how they would have performed. This feature is currently in development.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0f172a'
      }}>
        <div style={{ color: '#9ca3af' }}>Loading backtest...</div>
      </div>
    }>
      <BacktestContent />
    </Suspense>
  );
}
