"use client";
import Testimonials from "../components/Testimonials";
import Hero from "../components/Hero";
import Why from "../components/Why";
import HowItWorks from "../components/HowItWorks";
import SocialProof from "../components/SocialProof";
import ReferralBanner from "../components/ReferralBanner";
import Link from "next/link";

export default function Home() {
  const getStreamlitUrl = () => {
    return "https://market-scanner-pro.replit.app";
  };

  return (
    <>
      <Hero />
      
      {/* AI Features Spotlight */}
      <section style={{
        width: '100%',
        background: 'linear-gradient(180deg, #000 0%, #0a0e1a 50%, #000 100%)',
        color: '#f9fafb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        borderBottom: '1px solid #1f2933',
        padding: '60px 20px'
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#60a5fa',
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.3)',
              marginBottom: 20
            }}>
              <span>🤖</span>
              <span style={{ fontWeight: 600 }}>AI-POWERED</span>
            </div>
            
            <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, lineHeight: 1.2 }}>
              <span style={{ color: '#60a5fa' }}>MSP AI Analyst</span>
            </h2>
            <p style={{ fontSize: 20, fontWeight: 600, color: '#e5e7eb', marginBottom: 24 }}>
              Understand the Signal — Not Just the Alert
            </p>
            <p style={{ fontSize: 16, color: '#9ca3af', maxWidth: 700, margin: '0 auto', lineHeight: 1.6 }}>
              The MSP AI Analyst is an AI-powered market interpretation engine built into MarketScanner Pros.
            </p>
          </div>

          {/* Key Points */}
          <div style={{ 
            maxWidth: 800, 
            margin: '0 auto 48px',
            padding: '32px',
            background: 'rgba(59,130,246,0.05)',
            border: '1px solid rgba(59,130,246,0.15)',
            borderRadius: 16
          }}>
            <p style={{ fontSize: 15, color: '#e5e7eb', lineHeight: 1.8, marginBottom: 16 }}>
              It does <strong style={{ color: '#60a5fa' }}>not</strong> tell you what to trade.<br/>
              It explains <strong style={{ color: '#22c55e' }}>why</strong> a signal appeared, what conditions align, and what risks exist — using professional market structure logic.
            </p>
            <p style={{ fontSize: 15, color: '#9ca3af', margin: 0, fontStyle: 'italic' }}>
              Think of it as a market analyst, not a signal bot.
            </p>
          </div>

          {/* The Problem */}
          <div style={{ marginBottom: 56 }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b', marginBottom: 16 }}>
              Why Most Signals Fail
            </h3>
            <p style={{ fontSize: 16, color: '#9ca3af', lineHeight: 1.7, marginBottom: 20, maxWidth: 800 }}>
              Most trading tools do one thing: They highlight <em>what happened</em>.
            </p>
            <p style={{ fontSize: 15, color: '#9ca3af', marginBottom: 16 }}>
              They do <strong>not</strong> explain:
            </p>
            <ul style={{ 
              fontSize: 15, 
              color: '#e5e7eb', 
              lineHeight: 1.8,
              maxWidth: 700,
              listStyle: 'none',
              padding: 0
            }}>
              <li style={{ marginBottom: 8, paddingLeft: 24, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#ef4444' }}>✗</span>
                Which timeframe is in control
              </li>
              <li style={{ marginBottom: 8, paddingLeft: 24, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#ef4444' }}>✗</span>
                Whether conditions are trending or consolidating
              </li>
              <li style={{ marginBottom: 8, paddingLeft: 24, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#ef4444' }}>✗</span>
                If the move is early, late, or vulnerable
              </li>
              <li style={{ paddingLeft: 24, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#ef4444' }}>✗</span>
                Where liquidity and invalidation zones sit
              </li>
            </ul>
            <p style={{ fontSize: 16, color: '#f59e0b', marginTop: 24, fontWeight: 600 }}>
              Without context, even good signals fail.
            </p>
          </div>

          {/* What It Does */}
          <div style={{ marginBottom: 56 }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#22c55e', marginBottom: 24 }}>
              What the AI Analyst Actually Does
            </h3>
            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 32, maxWidth: 800 }}>
              When a scanner triggers, the MSP AI Analyst evaluates:
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 20,
              marginBottom: 32
            }}>
              {[
                {
                  title: 'Market Phase',
                  items: ['Bullish Phase', 'Bearish Phase', 'Consolidation (Neutral)']
                },
                {
                  title: 'Multi-Timeframe Alignment',
                  items: ['Which timeframes support the move', 'Which timeframes conflict']
                },
                {
                  title: 'Structure & Liquidity Context',
                  items: ['Key support and resistance zones', 'Areas where price may stall, reverse, or accelerate']
                },
                {
                  title: 'Risk Awareness',
                  items: ['Potential fakeouts', 'Late-stage moves', 'Volatility compression or expansion']
                }
              ].map((section, i) => (
                <div key={i} style={{
                  background: 'linear-gradient(145deg, #0f172a, #020617)',
                  borderRadius: 12,
                  border: '1px solid rgba(34,197,94,0.2)',
                  padding: '20px'
                }}>
                  <h4 style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', marginBottom: 12 }}>
                    {section.title}
                  </h4>
                  <ul style={{ 
                    fontSize: 14, 
                    color: '#9ca3af', 
                    lineHeight: 1.6,
                    listStyle: 'none',
                    padding: 0,
                    margin: 0
                  }}>
                    {section.items.map((item, j) => (
                      <li key={j} style={{ marginBottom: j < section.items.length - 1 ? 8 : 0 }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p style={{ 
              fontSize: 16, 
              color: '#e5e7eb', 
              fontWeight: 600, 
              textAlign: 'center',
              padding: '16px',
              background: 'rgba(34,197,94,0.1)',
              borderRadius: 8,
              border: '1px solid rgba(34,197,94,0.2)'
            }}>
              The output is explanation, not instruction.
            </p>
          </div>

          {/* How It Thinks */}
          <div style={{ 
            marginBottom: 56,
            maxWidth: 900,
            margin: '0 auto 56px'
          }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', marginBottom: 24 }}>
              How It Thinks
            </h3>
            <div style={{ 
              background: 'rgba(59,130,246,0.05)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 12,
              padding: '28px'
            }}>
              {[
                { num: '1', title: 'Identify the Phase', desc: 'Is the market trending or consolidating?' },
                { num: '2', title: 'Check Timeframe Alignment', desc: 'Are higher and lower timeframes aligned or fighting each other?' },
                { num: '3', title: 'Assess Structure & Liquidity', desc: 'Where is price likely to react?' },
                { num: '4', title: 'Highlight Risks & Invalidation', desc: 'What would invalidate the current scenario?' }
              ].map((step, i) => (
                <div key={i} style={{ 
                  marginBottom: i < 3 ? 20 : 0,
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start'
                }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0
                  }}>
                    {step.num}
                  </div>
                  <div>
                    <h4 style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginBottom: 6 }}>
                      {step.title}
                    </h4>
                    <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 14, color: '#9ca3af', marginTop: 16, textAlign: 'center', fontStyle: 'italic' }}>
              This mirrors how professional analysts reason — step by step.
            </p>
          </div>

          {/* Example Output */}
          <div style={{ marginBottom: 56 }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#f9fafb', marginBottom: 24 }}>
              What You See as a User
            </h3>
            <div style={{
              background: 'linear-gradient(145deg, #1e293b, #0f172a)',
              border: '2px solid rgba(34,197,94,0.3)',
              borderRadius: 12,
              padding: '28px',
              maxWidth: 800,
              margin: '0 auto'
            }}>
              <p style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 1.8,
                margin: 0,
                fontFamily: 'ui-monospace, monospace'
              }}>
                "This signal triggered after consolidation resolved bullishly on the 1H, with higher-timeframe structure still supportive. Lower timeframes are aligned, but price is approaching a prior liquidity zone."
              </p>
            </div>
            <p style={{ fontSize: 14, color: '#22c55e', marginTop: 20, textAlign: 'center', fontWeight: 600 }}>
              Clear. Structured. Actionable for decision-making.
            </p>
          </div>

          {/* What It's NOT */}
          <div style={{ 
            marginBottom: 56,
            padding: '32px',
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12,
            maxWidth: 800,
            margin: '0 auto 56px'
          }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#ef4444', marginBottom: 20 }}>
              What the AI Analyst Is NOT
            </h3>
            <ul style={{ 
              fontSize: 15, 
              color: '#e5e7eb', 
              lineHeight: 1.8,
              listStyle: 'none',
              padding: 0,
              margin: 0
            }}>
              <li style={{ marginBottom: 10 }}>❌ Not a buy/sell signal generator</li>
              <li style={{ marginBottom: 10 }}>❌ Not a prediction engine</li>
              <li style={{ marginBottom: 10 }}>❌ Not a guarantee of outcomes</li>
              <li>❌ Not financial advice</li>
            </ul>
            <p style={{ fontSize: 16, color: '#9ca3af', marginTop: 20, fontWeight: 600 }}>
              It is a decision-support and education tool.
            </p>
          </div>

          {/* Who It's For */}
          <div style={{ marginBottom: 56, maxWidth: 800, margin: '0 auto 56px' }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#f9fafb', marginBottom: 24, textAlign: 'center' }}>
              Who It's Designed For
            </h3>
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20
            }}>
              <div>
                <ul style={{ 
                  fontSize: 15, 
                  color: '#22c55e', 
                  lineHeight: 1.8,
                  listStyle: 'none',
                  padding: 0
                }}>
                  <li style={{ marginBottom: 10 }}>✔ Traders who want to understand why setups work</li>
                  <li style={{ marginBottom: 10 }}>✔ Users tired of black-box signals</li>
                  <li style={{ marginBottom: 10 }}>✔ Traders learning multi-timeframe structure</li>
                  <li style={{ marginBottom: 10 }}>✔ Crypto and stock traders using TradingView</li>
                  <li>✔ Educators and communities who value explanation</li>
                </ul>
              </div>
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                padding: '20px'
              }}>
                <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.7, margin: 0 }}>
                  <strong style={{ color: '#ef4444' }}>Not for:</strong><br/>
                  ❌ Copy trading<br/>
                  ❌ Pump signals<br/>
                  ❌ "Guaranteed profits"
                </p>
              </div>
            </div>
            <p style={{ fontSize: 16, color: '#60a5fa', marginTop: 24, textAlign: 'center', fontWeight: 600 }}>
              If you want blind alerts — this is not for you.<br/>
              If you want clarity — this is.
            </p>
          </div>

          {/* Why Different */}
          <div style={{ 
            marginBottom: 48,
            textAlign: 'center',
            padding: '40px',
            background: 'rgba(34,197,94,0.05)',
            borderRadius: 16,
            border: '1px solid rgba(34,197,94,0.2)'
          }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#22c55e', marginBottom: 16 }}>
              Why This Is Different
            </h3>
            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 24, maxWidth: 600, margin: '0 auto 24px' }}>
              Most platforms stop at detection.
            </p>
            <p style={{ fontSize: 18, color: '#e5e7eb', fontWeight: 600, marginBottom: 16 }}>
              MarketScanner Pros goes further:
            </p>
            <p style={{ fontSize: 20, color: '#22c55e', fontWeight: 700 }}>
              Scan → Explain → Learn → Decide
            </p>
            <p style={{ fontSize: 15, color: '#9ca3af', marginTop: 16, fontStyle: 'italic' }}>
              The AI Analyst is the bridge between data and understanding.
            </p>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 16 }}>
              See the Market With Context
            </h3>
            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 32, maxWidth: 600, margin: '0 auto 32px' }}>
              Use MarketScanner Pros for free and experience AI-assisted market interpretation — without hype or pressure.
            </p>
            <Link
              href="/launch"
              style={{
                display: 'inline-block',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                color: '#0b1120',
                padding: '16px 40px',
                fontSize: 17,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'none',
                boxShadow: '0 4px 15px rgba(20,184,166,0.4)'
              }}
            >
              Get Started Free
            </Link>
            <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 20 }}>
              Educational use only. Not financial advice.
            </p>
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
