"use client";

import Link from "next/link";

interface DataComingSoonProps {
  toolName: string;
  description?: string;
}

export default function DataComingSoon({ toolName, description }: DataComingSoonProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--msp-bg)', padding: '2rem', color: 'var(--msp-text)' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--msp-text)', marginBottom: '0.5rem' }}>
            {toolName}
          </h1>
          {description && (
            <p style={{ color: 'var(--msp-text-muted)', maxWidth: '600px', margin: '0 auto' }}>
              {description}
            </p>
          )}
        </div>

        <div className="msp-card" style={{ borderRadius: '24px', padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>🚀</div>
          <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--msp-accent)', marginBottom: '1rem' }}>
            Coming Soon
          </h2>
          <p style={{ 
            color: 'var(--msp-text-muted)', 
            fontSize: '1.1rem',
            maxWidth: '500px',
            margin: '0 auto 2rem',
            lineHeight: '1.6'
          }}>
            We&apos;re upgrading our data infrastructure to bring you commercially-licensed 
            real-time market data. This feature will be available soon with institutional-grade 
            data feeds.
          </p>
          
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: '2rem'
          }}>
            <Link 
              href="/tools"
              style={{
                padding: '12px 24px',
                background: 'var(--msp-accent)',
                color: '#061018',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              ← Back to Tools
            </Link>
            <Link 
              href="/pricing"
              style={{
                padding: '12px 24px',
                background: 'var(--msp-panel)',
                border: '1px solid var(--msp-border)',
                color: 'var(--msp-text)',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              View Pricing
            </Link>
          </div>
        </div>

        {/* Features Preview */}
        <div style={{ 
          marginTop: '3rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem'
        }}>
          <div style={{
            background: 'var(--msp-panel)',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '1px solid var(--msp-border)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
            <h3 style={{ color: 'var(--msp-text)', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Real-Time Data</h3>
            <p style={{ color: 'var(--msp-text-muted)', fontSize: '0.9rem' }}>
              Commercially-licensed market data with proper redistribution rights
            </p>
          </div>
          
          <div style={{
            background: 'var(--msp-panel)',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '1px solid var(--msp-border)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚡</div>
            <h3 style={{ color: 'var(--msp-text)', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Low Latency</h3>
            <p style={{ color: 'var(--msp-text-muted)', fontSize: '0.9rem' }}>
              Fast data delivery for timely trading decisions
            </p>
          </div>
          
          <div style={{
            background: 'var(--msp-panel)',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '1px solid var(--msp-border)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✅</div>
            <h3 style={{ color: 'var(--msp-text)', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Fully Compliant</h3>
            <p style={{ color: 'var(--msp-text-muted)', fontSize: '0.9rem' }}>
              Licensed for commercial use and redistribution
            </p>
          </div>
        </div>

        <p style={{ 
          textAlign: 'center', 
          color: 'var(--msp-text-faint)', 
          fontSize: '0.85rem',
          marginTop: '3rem'
        }}>
          💡 Crypto tools powered by CoinGecko are fully available now!
        </p>
      </div>
    </div>
  );
}
