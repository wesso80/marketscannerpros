'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function WorkflowHero() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const features = [
    { icon: '📊', text: 'Top 10 market scans' },
    { icon: '🎯', text: 'Fear & Greed + macro context' },
    { icon: '🤖', text: 'AI-assisted trade analysis' },
    { icon: '🔔', text: 'Alerts, backtesting & journal' },
  ];

  return (
    <section style={{
      width: '100%',
      background: 'linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0f172a 100%)',
      position: 'relative',
      overflow: 'hidden',
      borderBottom: '1px solid rgba(34,197,94,0.2)'
    }}>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {/* Subtle floating orbs background */}
      <div style={{
        position: 'absolute',
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)',
        top: -150,
        right: -150,
        animation: 'float 12s ease-in-out infinite',
        filter: 'blur(80px)'
      }} />
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
        bottom: -100,
        left: -100,
        animation: 'float 15s ease-in-out infinite reverse',
        filter: 'blur(80px)'
      }} />

      <div style={{
        maxWidth: 1000,
        margin: '0 auto',
        padding: '80px 20px 70px',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Main headline */}
        <div style={{
          textAlign: 'center',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease'
        }}>
          <h1 style={{
            fontSize: 'clamp(32px, 5.5vw, 56px)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: 24,
            color: '#f9fafb',
            letterSpacing: '-0.02em'
          }}>
            From Market Scan to Trade Log —
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #14b8a6 50%, #3b82f6 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'gradientShift 6s ease infinite'
            }}>
              Everything Serious Traders Need in One Platform
            </span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: '#94a3b8',
            maxWidth: 780,
            margin: '0 auto 40px',
            lineHeight: 1.7
          }}>
            Scan stocks and crypto, read market sentiment, validate setups with AI, 
            backtest ideas, set alerts, and track performance — <strong style={{ color: '#e5e7eb' }}>without switching tools.</strong>
          </p>
        </div>

        {/* Proof Strip - Feature grid */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 48,
          flexWrap: 'wrap',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease 0.2s'
        }}>
          {features.map((feature, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 12,
                padding: '14px 20px',
                fontSize: 14,
                color: '#e5e7eb',
                fontWeight: 500
              }}
            >
              <span style={{ fontSize: 18 }}>{feature.icon}</span>
              <span>{feature.text}</span>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 28,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease 0.4s'
        }}>
          <Link
            href="/tools/scanner"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
              color: '#0b1120',
              padding: '18px 36px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 17,
              textDecoration: 'none',
              boxShadow: '0 4px 25px rgba(34,197,94,0.35)',
              transition: 'all 0.3s ease'
            }}
          >
            <span style={{ fontSize: 18 }}>⚡</span>
            <span>Start Scanning Free — Right Now</span>
          </Link>
          
          <Link
            href="/guide"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              color: '#e5e7eb',
              padding: '18px 32px',
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 16,
              textDecoration: 'none',
              border: '1px solid rgba(148,163,184,0.3)',
              transition: 'all 0.3s ease'
            }}
          >
            <span>Watch How It Works</span>
            <span>→</span>
          </Link>
        </div>

        {/* Trust line */}
        <div style={{
          textAlign: 'center',
          opacity: isVisible ? 1 : 0,
          transition: 'all 0.8s ease 0.6s'
        }}>
          <p style={{
            color: '#64748b',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.02em'
          }}>
            Educational tools only • No financial advice • No auto-trading
          </p>
        </div>
      </div>
    </section>
  );
}
