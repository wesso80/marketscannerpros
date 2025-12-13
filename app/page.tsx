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
        <div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>
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
            Meet <span style={{ color: '#60a5fa' }}>MSP Analyst</span> - Your AI Trading Assistant
          </h2>
          <p style={{ fontSize: 16, color: '#9ca3af', maxWidth: 700, margin: '0 auto 40px', lineHeight: 1.6 }}>
            Ask questions about any signal, get instant technical analysis explanations, request trade ideas, 
            and receive personalized insights. MSP Analyst understands your scans and helps you make better decisions.
          </p>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            marginTop: 40
          }}>
            {[
              { icon: '💬', title: 'Ask Anything', desc: 'Natural language questions about any symbol, signal, or strategy' },
              { icon: '📊', title: 'Instant Analysis', desc: 'Get technical breakdowns, support/resistance levels, and trade ideas' },
              { icon: '🎯', title: 'Context-Aware', desc: 'AI knows your scan results and provides personalized recommendations' },
              { icon: '⚡', title: 'Real-Time Insights', desc: 'AI-powered with market data integration for accurate answers' }
            ].map((feature, i) => (
              <div key={i} style={{
                background: 'linear-gradient(145deg, #0f172a, #020617)',
                borderRadius: 16,
                border: '1px solid rgba(59,130,246,0.2)',
                padding: '24px',
                textAlign: 'left'
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{feature.icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#f9fafb' }}>{feature.title}</h3>
                <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
          
          <div style={{
            marginTop: 40,
            padding: '24px',
            borderRadius: 16,
            background: 'rgba(59,130,246,0.05)',
            border: '1px solid rgba(59,130,246,0.2)'
          }}>
            <p style={{ fontSize: 15, color: '#9ca3af', margin: 0 }}>
              <strong style={{ color: '#60a5fa' }}>Free tier:</strong> 5 questions/day  •  
              <strong style={{ color: '#22c55e', marginLeft: 8 }}>Pro:</strong> 50/day  •  
              <strong style={{ color: '#f59e0b', marginLeft: 8 }}>Pro Trader:</strong> Unlimited
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
