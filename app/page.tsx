"use client";
import Testimonials from "../components/Testimonials";
import Hero from "../components/Hero";
import Why from "../components/Why";
import HowItWorks from "../components/HowItWorks";
import SocialProof from "../components/SocialProof";
import ReferralBanner from "../components/ReferralBanner";
import Link from "next/link";

import { useState } from "react";
import { FaRobot, FaChartLine, FaSearch, FaBrain, FaBolt, FaCogs, FaComments } from "react-icons/fa";

const features = [
  {
    icon: <FaRobot size={32} color="#60a5fa" />, title: "MSP AI Analyst", desc: "Understand the Signal — Not Just the Alert. The MSP AI Analyst is an AI-powered market interpretation engine built into MarketScanner Pros."
  },
  {
    icon: <FaChartLine size={32} color="#22c55e" />, title: "Multi-Timeframe Scanning", desc: "Scan across multiple timeframes and get context, not just signals."
  },
  {
    icon: <FaSearch size={32} color="#f59e0b" />, title: "Market Structure Logic", desc: "Explains why a signal appeared, what conditions align, and what risks exist — using professional market structure logic."
  },
  {
    icon: <FaBrain size={32} color="#8b5cf6" />, title: "AI-Powered Insights", desc: "Think of it as a market analyst, not a signal bot."
  },
  {
    icon: <FaBolt size={32} color="#ef4444" />, title: "Risk Awareness", desc: "Highlights potential fakeouts, late-stage moves, and volatility changes."
  },
  {
    icon: <FaCogs size={32} color="#3b82f6" />, title: "Structure & Liquidity Context", desc: "Shows key support/resistance, liquidity, and invalidation zones."
  },
  {
    icon: <FaComments size={32} color="#22c55e" />, title: "Decision Support", desc: "Clear, structured, actionable explanations for decision-making." 
  }
];

export default function Home() {
  const [activeFeature, setActiveFeature] = useState(0);
  return (
    <>

      {/* Modern SaaS Hero Section (TrendSpider-style layout, user text) */}
      <section style={{
        width: '100%',
        background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
        color: '#f9fafb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        borderBottom: '1px solid #1f2933',
        padding: '64px 0 0 0',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 520,
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 20px', width: '100%' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
            {/* Left: Hero Text */}
            <div style={{ flex: 1, minWidth: 320, textAlign: 'left', maxWidth: 600 }}>
              <div style={{ marginBottom: 24 }}>
                <img src="/logos/msp.logo.png" alt="MarketScanner Pro" style={{ width: 48, height: 48, marginBottom: 12 }} />
                <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8, lineHeight: 1.2, color: '#f9fafb' }}>
                  MarketScanner Pro
                </h1>
                <p style={{ fontSize: 16, color: '#22c55e', fontWeight: 500, marginBottom: 0 }}>
                  Phase-Based Market Intelligence
                </p>
              </div>
              <h2 style={{ fontSize: 38, fontWeight: 800, marginBottom: 18, lineHeight: 1.2, color: '#f9fafb' }}>
                Stop Guessing the Market.<br />
                <span style={{ color: '#22c55e' }}>Start Understanding It.</span>
              </h2>
              <p style={{ fontSize: 16, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
                MarketScanner Pros is a phase-based market intelligence platform that scans markets, explains signals with AI, and teaches traders how to interpret structure using institutional logic.
              </p>
              <p style={{ fontSize: 16, color: '#f9fafb', fontWeight: 600, marginBottom: 16 }}>
                Reduce noise, understand market context, and make decisions with structure — not emotion.
              </p>
              <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
                No hype. No black boxes. Just clarity across multiple timeframes.
              </p>
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>USED DAILY BY ACTIVE TRADERS ANALYSING:</p>
                <p style={{ fontSize: 14, color: '#e5e7eb', marginBottom: 16 }}>Crypto • Stocks • Indices • FX</p>
                <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>POWERED BY:</p>
                <p style={{ fontSize: 14, color: '#e5e7eb' }}>Multi-Timeframe Analysis • Phase Logic • AI Signal Interpretation</p>
              </div>
              <div style={{ marginTop: 32 }}>
                <Link
                  href="/tools/scanner"
                  style={{
                    display: 'inline-block',
                    borderRadius: 999,
                    border: 'none',
                    background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                    color: '#0b1120',
                    padding: '16px 32px',
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    boxShadow: '0 4px 15px rgba(20,184,166,0.4)',
                    marginRight: 12,
                    marginBottom: 12
                  }}
                >
                  Start Free Scanner (No Card)
                </Link>
                <Link
                  href="/guide"
                  style={{
                    display: 'inline-block',
                    borderRadius: 999,
                    border: '1px solid #334155',
                    background: 'transparent',
                    color: '#e5e7eb',
                    padding: '16px 32px',
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    marginLeft: 8,
                    marginBottom: 12
                  }}
                >
                  See How the AI Analyst Works
                </Link>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 16 }}>Trusted by 1,000+ traders · Educational use only</p>
            </div>
            {/* Right: Feature Tabs (TrendSpider-style) */}
            <div style={{ flex: 1, minWidth: 320, maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 12,
                marginBottom: 24,
                flexWrap: 'wrap',
                marginTop: 12
              }}>
                {features.map((f, i) => (
                  <button
                    key={f.title}
                    onClick={() => setActiveFeature(i)}
                    style={{
                      background: activeFeature === i ? 'linear-gradient(135deg, #14b8a6 0%, #22c55e 100%)' : 'rgba(30,41,59,0.7)',
                      color: activeFeature === i ? '#0b1120' : '#e5e7eb',
                      border: activeFeature === i ? '2px solid #22c55e' : '1px solid #334155',
                      borderRadius: 999,
                      padding: '10px 22px',
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: 'pointer',
                      transition: 'all 0.18s',
                      outline: 'none',
                      marginBottom: 8
                    }}
                  >
                    <span style={{ marginRight: 8, verticalAlign: 'middle' }}>{f.icon}</span>
                    {f.title}
                  </button>
                ))}
              </div>
              <div style={{
                maxWidth: 420,
                margin: '0 auto',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                border: '1.5px solid #334155',
                borderRadius: 18,
                boxShadow: '0 8px 32px rgba(16,185,129,0.08)',
                padding: '28px 24px',
                minHeight: 120,
                color: '#e5e7eb',
                fontSize: 17,
                fontWeight: 500,
                textAlign: 'center',
                marginBottom: 0
              }}>
                {features[activeFeature].desc}
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Scan the Market Section (TrendSpider-style, user text) */}
      <section style={{
        width: '100%',
        background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
        color: '#f9fafb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        borderBottom: '1px solid #1f2933',
        padding: '48px 0 32px 0',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 10, color: '#f9fafb' }}>Scan the Market Instantly</h2>
            <p style={{ fontSize: 17, color: '#9ca3af', maxWidth: 600, margin: '0 auto', lineHeight: 1.5 }}>
              Enter a symbol or keyword to scan stocks, crypto, or ETFs. Or, jump to a quick scan below.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="e.g. TSLA, BTC, S&P 500, AI stocks..."
              style={{
                width: 320,
                maxWidth: '90vw',
                padding: '16px 20px',
                borderRadius: 999,
                border: '1.5px solid #334155',
                background: '#0f172a',
                color: '#f9fafb',
                fontSize: 17,
                fontWeight: 500,
                outline: 'none',
                marginRight: 8,
                marginBottom: 8
              }}
            />
            <Link
              href="/tools/scanner"
              style={{
                display: 'inline-block',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                color: '#0b1120',
                padding: '16px 36px',
                fontSize: 17,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(20,184,166,0.2)',
                marginBottom: 8,
                textDecoration: 'none'
              }}
            >
              Scan Now
            </Link>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            {[
              { label: 'Top Gainers', href: '/tools/scanner?scan=gainers' },
              { label: 'Crypto', href: '/tools/scanner?scan=crypto' },
              { label: 'AI Stocks', href: '/tools/scanner?scan=ai' },
              { label: 'ETFs', href: '/tools/scanner?scan=etf' },
            ].map((q) => (
              <Link
                key={q.label}
                href={q.href}
                style={{
                  display: 'inline-block',
                  borderRadius: 999,
                  border: '1px solid #334155',
                  background: 'rgba(30,41,59,0.7)',
                  color: '#e5e7eb',
                  padding: '10px 22px',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  marginBottom: 8,
                  marginRight: 4
                }}
              >
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
      
      <SocialProof />
      <Why />
      <HowItWorks />
      <Testimonials />
      
      {/* Pricing Section */}
      <section style={{
        width: '100%',
        background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
        color: '#f9fafb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 1120, padding: '60px 20px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#9ca3af',
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(148,163,184,0.25)',
              marginBottom: 14
            }}>
              <span style={{ color: '#22c55e' }}>Simple pricing</span>
              <span>Start free, upgrade anytime</span>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>Professional Tools, Accessible Pricing</h2>
            <p style={{ fontSize: 15, color: '#9ca3af', maxWidth: 520, margin: '0 auto' }}>
              Start free with AI assistance. Upgrade for unlimited scanning, real backtesting, and professional features.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            maxWidth: 1000,
            margin: '0 auto'
          }}>
            {/* Free Tier */}
            <div style={{
              background: 'linear-gradient(145deg, #020617, #0f172a)',
              borderRadius: 18,
              border: '1px solid #1f2933',
              boxShadow: '0 18px 45px rgba(0,0,0,0.75)',
              padding: '28px 26px',
              position: 'relative'
            }}>
              <h3 style={{ fontSize: 22, fontWeight: 650, marginBottom: 8 }}>Free</h3>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 36, fontWeight: 700 }}>$0</span>
                <span style={{ fontSize: 15, color: '#9ca3af', marginLeft: 6 }}>forever</span>
              </div>
              
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 14 }}>
                {[
                  "Top 10 equities + Top 10 crypto",
                  "MSP Analyst AI (5 questions/day)",
                  "Multi-timeframe scanning",
                  "Trade journal + Portfolio",
                  "Real-time market data"
                ].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: i < 4 ? '1px solid rgba(15,23,42,0.85)' : 'none'
                  }}>
                    <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>
                    <span style={{ color: '#e5e7eb' }}>{item}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => window.location.href = '/tools/scanner'}
                style={{
                  width: '100%',
                  borderRadius: 999,
                  border: '1px solid #1f2933',
                  background: 'rgba(15,23,42,0.8)',
                  color: '#e5e7eb',
                  padding: '14px 20px',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Get Started Free
              </button>
            </div>

            {/* Pro Tier */}
            <div style={{
              background: 'radial-gradient(circle at top, #111827, #020617 60%)',
              borderRadius: 18,
              border: '2px solid rgba(34,197,94,0.4)',
              boxShadow: '0 18px 45px rgba(0,0,0,0.75), 0 0 40px rgba(34,197,94,0.1)',
              padding: '28px 26px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                right: -30,
                top: -30,
                width: 150,
                height: 150,
                background: 'radial-gradient(circle, rgba(34,197,94,0.2), transparent 60%)',
                filter: 'blur(1px)'
              }} aria-hidden="true"></div>
              
              <div style={{
                position: 'absolute',
                top: 16,
                right: 16,
                fontSize: 10,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                color: '#0b1120',
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>Most Popular</div>
              
              <h3 style={{ fontSize: 22, fontWeight: 650, marginBottom: 8 }}>Pro</h3>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 36, fontWeight: 700 }}>$9.99</span>
                <span style={{ fontSize: 15, color: '#9ca3af', marginLeft: 6 }}>/ month</span>
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
                or $99.99/year <span style={{ color: '#22c55e' }}>(save 17%)</span>
              </div>
              
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 14 }}>
                {[
                  "Everything in Free",
                  "Unlimited symbol scanning",
                  "MSP Analyst AI (50 questions/day)",
                  "Advanced technical charts",
                  "CSV exports (all tools)",
                  "Priority support"
                ].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: i < 5 ? '1px solid rgba(15,23,42,0.85)' : 'none'
                  }}>
                    <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>
                    <span style={{ color: '#e5e7eb' }}>{item}</span>
                  </li>
                ))}
              </ul>
              
              <Link
                href="/pricing"
                style={{
                  display: 'block',
                  width: '100%',
                  borderRadius: 999,
                  border: 'none',
                  background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                  color: '#0b1120',
                  padding: '14px 20px',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxShadow: '0 4px 15px rgba(20,184,166,0.4)'
                }}
              >
                Upgrade to Pro
              </Link>
            </div>

            {/* Pro Trader Tier */}
            <div style={{
              background: 'linear-gradient(145deg, #0f172a, #020617)',
              borderRadius: 18,
              border: '1px solid rgba(59,130,246,0.3)',
              boxShadow: '0 18px 45px rgba(0,0,0,0.75)',
              padding: '28px 26px',
              position: 'relative'
            }}>
              <h3 style={{ fontSize: 22, fontWeight: 650, marginBottom: 8, color: '#60a5fa' }}>Pro Trader</h3>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 36, fontWeight: 700 }}>$19.99</span>
                <span style={{ fontSize: 15, color: '#9ca3af', marginLeft: 6 }}>/ month</span>
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
                or $199.99/year <span style={{ color: '#22c55e' }}>(save 17%)</span>
              </div>
              
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 14 }}>
                {[
                  "Everything in Pro",
                  "MSP Analyst AI (Unlimited)",
                  "Real Alpha Vantage backtesting",
                  "TradingView script access",
                  "Advanced indicators",
                  "Premium support"
                ].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: i < 5 ? '1px solid rgba(15,23,42,0.85)' : 'none'
                  }}>
                    <span style={{ color: '#60a5fa', fontSize: 16 }}>✓</span>
                    <span style={{ color: '#e5e7eb' }}>{item}</span>
                  </li>
                ))}
              </ul>
              
              <Link
                href="/pricing"
                style={{
                  display: 'block',
                  width: '100%',
                  borderRadius: 999,
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff',
                  padding: '14px 20px',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxShadow: '0 4px 15px rgba(59,130,246,0.3)'
                }}
              >
                Upgrade to Pro Trader
              </Link>
            </div>
          </div>
          
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, marginTop: 24 }}>
            All payments securely processed. Cancel anytime.
          </p>
        </div>
      </section>
      
      <ReferralBanner />
    </>
  );
}
