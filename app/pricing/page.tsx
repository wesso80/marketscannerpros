'use client';

import { useState } from "react";
import Link from "next/link";

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  
  const getStreamlitUrl = () => {
    return process.env.NEXT_PUBLIC_STREAMLIT_URL || 'https://www.marketscannerpros.app';
  };

  const handleFreeLaunch = () => {
    window.open(getStreamlitUrl(), '_blank');
  };

  const handleProCheckout = async () => {
    setLoading('pro');
    window.location.href = '/auth?plan=pro';
  };

  const handleProTraderCheckout = async () => {
    setLoading('pro_trader');
    window.location.href = '/auth?plan=pro_trader';
  };

  const freeFeatures = [
    { text: "Top 10 equities + Top 10 crypto", highlight: false },
    { text: "Multi-timeframe scanning", highlight: false },
    { text: "🤖 MSP Analyst AI (10/day)", highlight: true },
    { text: "AI market insights & explanations", highlight: false },
    { text: "Basic portfolio tracker", highlight: false },
    { text: "Trade journal", highlight: false },
    { text: "Community support", highlight: false }
  ];

  const proFeatures = [
    { text: "Everything in Free", highlight: false },
    { text: "Unlimited symbols scanning", highlight: false },
    { text: "🤖 MSP Analyst AI (50/day)", highlight: true },
    { text: "AI-powered trade recommendations", highlight: false },
    { text: "AI technical analysis explanations", highlight: false },
    { text: "Multi-timeframe confluence", highlight: false },
    { text: "Advanced technical charts", highlight: false },
    { text: "Portfolio tracker with P&L", highlight: false },
    { text: "CSV exports (all tools)", highlight: false },
    { text: "Priority support", highlight: false }
  ];

  const proTraderFeatures = [
    { text: "Everything in Pro", highlight: false },
    { text: "🤖 MSP Analyst AI (200/day)", highlight: true },
    { text: "AI-powered backtest analysis", highlight: false },
    { text: "AI strategy optimization suggestions", highlight: false },
    { text: "Real Alpha Vantage backtesting", highlight: false },
    { text: "Advanced strategy testing", highlight: false },
    { text: "TradingView script access", highlight: false },
    { text: "Priority email alerts", highlight: false },
    { text: "Advanced chart indicators", highlight: false },
    { text: "Psychology tracking in journal", highlight: false },
    { text: "Premium support", highlight: false }
  ];

  const faqs = [
    {
      q: "What is MSP Analyst AI?",
      a: "MSP Analyst is your personal AI trading assistant powered by OpenAI GPT-4. Ask questions about market conditions, get technical analysis explanations, request trade ideas, and receive personalized insights based on your scans. Free tier gets 10 questions/day, Pro gets 50/day, Pro Trader gets 200/day."
    },
    {
      q: "What's the difference between Pro and Pro Trader?",
      a: "Pro gives you unlimited scanning, 50 AI questions/day, portfolio tracking, and CSV exports. Pro Trader adds 200 AI questions/day, real Alpha Vantage backtesting with actual market data, TradingView script access, and advanced indicators - essential tools for serious technical traders."
    },
    {
      q: "How do I upgrade?",
      a: "Click \"Upgrade to Pro\" or \"Upgrade to Pro Trader\" above. You'll create an account with your email, then complete secure payment through Stripe. Access is instant across all devices."
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes! Cancel anytime from your account settings. You'll keep access until the end of your billing period. No questions asked."
    },
    {
      q: "Why did pricing increase?",
      a: "We now use real Alpha Vantage premium data for backtesting (not simulated), professional hosting infrastructure, and added features like the trade journal with psychology tracking. The new pricing reflects these real costs while keeping it affordable."
    },
    {
      q: "Do you offer refunds?",
      a: "We offer a 7-day money-back guarantee. If you're not satisfied with Pro or Pro Trader, contact support for a full refund - no questions asked."
    }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
    }}>
      <div style={{ maxWidth: 1000, padding: '48px 20px 60px', margin: '0 auto' }}>
        {/* Free Banner */}
        <div style={{
          marginBottom: 32,
          padding: '16px 20px',
          borderRadius: 12,
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, color: '#bbf7d0', fontSize: 15, fontWeight: 600 }}>
            🎉 Early Access — Full Pro features unlocked for a limited time
          </p>
          <p style={{ margin: '6px 0 0 0', color: '#86efac', fontSize: 13, fontWeight: 400 }}>
            We're onboarding early users and partners before public launch.
          </p>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
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
            marginBottom: 16
          }}>
            <span style={{ color: '#22c55e' }}>Simple pricing</span>
            <span>Start free, upgrade anytime</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>Simple, Transparent Pricing</h1>
          <p style={{ fontSize: 16, color: '#9ca3af', maxWidth: 450, margin: '0 auto' }}>
            Start free. Upgrade when you're ready for advanced features.
          </p>
        </div>

        {/* Pricing Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          maxWidth: 1000,
          margin: '0 auto 60px'
        }}>
          {/* Free Tier */}
          <div style={{
            background: 'linear-gradient(145deg, #020617, #0f172a)',
            borderRadius: 18,
            border: '1px solid #1f2933',
            boxShadow: '0 18px 45px rgba(0,0,0,0.75)',
            padding: '32px 28px'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 650, marginBottom: 10 }}>Free</h2>
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 42, fontWeight: 700 }}>$0</span>
              <span style={{ fontSize: 16, color: '#9ca3af', marginLeft: 8 }}>forever</span>
            </div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
              {freeFeatures.map((item, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < freeFeatures.length - 1 ? '1px solid rgba(15,23,42,0.85)' : 'none',
                  fontSize: 15,
                  background: item.highlight ? 'rgba(34,197,94,0.08)' : 'transparent',
                  borderRadius: item.highlight ? 6 : 0,
                  marginLeft: item.highlight ? -10 : 0,
                  paddingLeft: item.highlight ? 10 : 0,
                  marginRight: item.highlight ? -10 : 0,
                  paddingRight: item.highlight ? 10 : 0
                }}>
                  <span style={{ color: '#22c55e', fontSize: 18 }}>✓</span>
                  <span style={{ color: item.highlight ? '#34d399' : '#e5e7eb', fontWeight: item.highlight ? 600 : 400 }}>{item.text}</span>
                </li>
              ))}
            </ul>
            
            <button
              onClick={handleFreeLaunch}
              style={{
                width: '100%',
                borderRadius: 999,
                border: '1px solid #1f2933',
                background: 'rgba(15,23,42,0.8)',
                color: '#e5e7eb',
                padding: '16px 24px',
                fontSize: 16,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Get Started Free
            </button>
            <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, marginTop: 12 }}>
              No credit card required
            </p>
          </div>

          {/* Pro Tier */}
          <div style={{
            background: 'radial-gradient(circle at top, #111827, #020617 60%)',
            borderRadius: 18,
            border: '2px solid rgba(34,197,94,0.4)',
            boxShadow: '0 18px 45px rgba(0,0,0,0.75), 0 0 40px rgba(34,197,94,0.1)',
            padding: '32px 28px',
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
              padding: '5px 12px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
              color: '#0b1120',
              fontWeight: 600,
              textTransform: 'uppercase'
            }}>Most Popular</div>
            
            <h2 style={{ fontSize: 24, fontWeight: 650, marginBottom: 10 }}>Pro</h2>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 700 }}>$9.99</span>
              <span style={{ fontSize: 16, color: '#9ca3af', marginLeft: 8 }}>/ month</span>
            </div>
            <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 24 }}>
              or $99.99/year <span style={{ color: '#22c55e' }}>(save 17%)</span>
            </div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
              {proFeatures.map((item, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < proFeatures.length - 1 ? '1px solid rgba(15,23,42,0.85)' : 'none',
                  fontSize: 15,
                  background: item.highlight ? 'rgba(34,197,94,0.08)' : 'transparent',
                  borderRadius: item.highlight ? 6 : 0,
                  marginLeft: item.highlight ? -10 : 0,
                  paddingLeft: item.highlight ? 10 : 0,
                  marginRight: item.highlight ? -10 : 0,
                  paddingRight: item.highlight ? 10 : 0
                }}>
                  <span style={{ color: '#22c55e', fontSize: 18 }}>✓</span>
                  <span style={{ color: item.highlight ? '#34d399' : '#e5e7eb', fontWeight: item.highlight ? 600 : 400 }}>{item.text}</span>
                </li>
              ))}
            </ul>
            
            <button
              onClick={handleProCheckout}
              disabled={loading === 'pro'}
              style={{
                width: '100%',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
                color: '#0b1120',
                padding: '16px 24px',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(20,184,166,0.4)',
                opacity: loading === 'pro' ? 0.6 : 1
              }}
            >
              {loading === 'pro' ? 'Processing...' : 'Upgrade to Pro'}
            </button>
            <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, marginTop: 12 }}>
              Secure payment • Cancel anytime
            </p>
          </div>

          {/* Pro Trader Tier */}
          <div style={{
            background: 'linear-gradient(145deg, #0f172a, #020617)',
            borderRadius: 18,
            border: '1px solid rgba(59,130,246,0.3)',
            boxShadow: '0 18px 45px rgba(0,0,0,0.75), 0 0 30px rgba(59,130,246,0.08)',
            padding: '32px 28px'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 650, marginBottom: 10, color: '#60a5fa' }}>Pro Trader</h2>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 700 }}>$19.99</span>
              <span style={{ fontSize: 16, color: '#9ca3af', marginLeft: 8 }}>/ month</span>
            </div>
            <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 24 }}>
              or $199.99/year <span style={{ color: '#22c55e' }}>(save 17%)</span>
            </div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
              {proTraderFeatures.map((item, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < proTraderFeatures.length - 1 ? '1px solid rgba(15,23,42,0.85)' : 'none',
                  fontSize: 15,
                  background: item.highlight ? 'rgba(96,165,250,0.1)' : 'transparent',
                  borderRadius: item.highlight ? 6 : 0,
                  marginLeft: item.highlight ? -10 : 0,
                  paddingLeft: item.highlight ? 10 : 0,
                  marginRight: item.highlight ? -10 : 0,
                  paddingRight: item.highlight ? 10 : 0
                }}>
                  <span style={{ color: '#60a5fa', fontSize: 18 }}>✓</span>
                  <span style={{ color: item.highlight ? '#93c5fd' : '#e5e7eb', fontWeight: item.highlight ? 600 : 400 }}>{item.text}</span>
                </li>
              ))}
            </ul>
            
            <button
              onClick={handleProTraderCheckout}
              disabled={loading === 'pro_trader'}
              style={{
                width: '100%',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff',
                padding: '16px 24px',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(59,130,246,0.3)',
                opacity: loading === 'pro_trader' ? 0.6 : 1
              }}
            >
              {loading === 'pro_trader' ? 'Processing...' : 'Upgrade to Pro Trader'}
            </button>
            <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, marginTop: 12 }}>
              For serious traders • Cancel anytime
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 650, marginBottom: 24, textAlign: 'center' }}>Frequently Asked Questions</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{
                background: 'linear-gradient(145deg, #020617, #0f172a)',
                borderRadius: 12,
                border: '1px solid #1f2933',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                padding: '20px 24px'
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#f9fafb' }}>{faq.q}</h3>
                <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
