'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function UrgencyHero() {
  const [missedSignals, setMissedSignals] = useState(147);
  const [profitMissed, setProfitMissed] = useState(12450);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    
    // Increment counters to create FOMO
    const signalInterval = setInterval(() => {
      setMissedSignals(prev => prev + Math.floor(Math.random() * 2) + 1);
    }, 8000);

    const profitInterval = setInterval(() => {
      setProfitMissed(prev => prev + Math.floor(Math.random() * 500) + 100);
    }, 5000);

    return () => {
      clearInterval(signalInterval);
      clearInterval(profitInterval);
    };
  }, []);

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
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes countUp {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(34,197,94,0.3); box-shadow: 0 0 20px rgba(34,197,94,0.1); }
          50% { border-color: rgba(34,197,94,0.6); box-shadow: 0 0 40px rgba(34,197,94,0.2); }
        }
      `}</style>

      {/* Floating orbs background */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)',
        top: -100,
        right: -100,
        animation: 'float 8s ease-in-out infinite',
        filter: 'blur(60px)'
      }} />
      <div style={{
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)',
        bottom: -50,
        left: -50,
        animation: 'float 10s ease-in-out infinite reverse',
        filter: 'blur(60px)'
      }} />

      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '60px 20px 70px',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Alert banner */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 28,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'all 0.6s ease'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 999,
            padding: '10px 20px',
            animation: 'borderGlow 3s ease-in-out infinite'
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ef4444',
              animation: 'pulse 1.5s ease-in-out infinite',
              boxShadow: '0 0 10px #ef4444'
            }} />
            <span style={{ color: '#fca5a5', fontSize: 14, fontWeight: 500 }}>
              While you read this, <strong style={{ color: '#f87171' }}>{missedSignals} traders</strong> just found signals you're missing
            </span>
          </div>
        </div>

        {/* Main headline */}
        <div style={{
          textAlign: 'center',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease 0.2s'
        }}>
          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 60px)',
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 20,
            color: '#f9fafb',
            letterSpacing: '-0.02em'
          }}>
            The Market Speaks.
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #14b8a6 50%, #3b82f6 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'gradientShift 5s ease infinite'
            }}>
              Are You Listening?
            </span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: '#9ca3af',
            maxWidth: 700,
            margin: '0 auto 32px',
            lineHeight: 1.6
          }}>
            Every minute, <strong style={{ color: '#e5e7eb' }}>AI-powered signals</strong> reveal breakouts, 
            reversals, and momentum shifts across 500+ assets. 
            <strong style={{ color: '#22c55e' }}> Most traders see them too late.</strong>
          </p>
        </div>

        {/* The hook - missed opportunity counter */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          marginBottom: 40,
          flexWrap: 'wrap',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease 0.4s'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05))',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 16,
            padding: '20px 28px',
            textAlign: 'center',
            minWidth: 180
          }}>
            <div style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
              Signals You Missed Today
            </div>
            <div style={{
              fontSize: 36,
              fontWeight: 800,
              color: '#f87171',
              animation: 'countUp 0.5s ease'
            }}>
              {missedSignals}+
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(145deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 16,
            padding: '20px 28px',
            textAlign: 'center',
            minWidth: 180
          }}>
            <div style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
              Signals Found Today
            </div>
            <div style={{
              fontSize: 36,
              fontWeight: 800,
              color: '#22c55e'
            }}>
              2,847
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(145deg, rgba(59,130,246,0.1), rgba(59,130,246,0.05))',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 16,
            padding: '20px 28px',
            textAlign: 'center',
            minWidth: 180
          }}>
            <div style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
              Active Traders Now
            </div>
            <div style={{
              fontSize: 36,
              fontWeight: 800,
              color: '#60a5fa'
            }}>
              1,247
            </div>
          </div>
        </div>

        {/* CTA buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 24,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease 0.6s'
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
              fontSize: 18,
              textDecoration: 'none',
              boxShadow: '0 4px 25px rgba(34,197,94,0.4), 0 0 50px rgba(34,197,94,0.15)',
              transition: 'all 0.3s ease'
            }}
          >
            <span style={{ fontSize: 20 }}>⚡</span>
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
              border: '1px solid rgba(148,163,184,0.3)'
            }}
          >
            <span>Watch How It Works</span>
            <span>→</span>
          </Link>
        </div>

        {/* Trust badges */}
        <div style={{
          textAlign: 'center',
          opacity: isVisible ? 1 : 0,
          transition: 'all 0.8s ease 0.8s'
        }}>
          <p style={{
            color: '#6b7280',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            flexWrap: 'wrap'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#22c55e' }}>✓</span> No credit card required
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#22c55e' }}>✓</span> Instant access
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#22c55e' }}>✓</span> Real-time market data
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
