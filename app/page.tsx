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
            <h2 style={{ fontSize: 28, fontWeight: 650, marginBottom: 10 }}>Simple, Transparent Pricing</h2>
            <p style={{ fontSize: 15, color: '#9ca3af', maxWidth: 450, margin: '0 auto' }}>
              Everything you need is free. Upgrade when you're ready for advanced features.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
            maxWidth: 800,
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
                  "Core market scanner",
                  "Multi-timeframe analysis",
                  "Portfolio tracker",
                  "Trade journal",
                  "CSV exports"
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
                onClick={() => window.open(getStreamlitUrl(), "_blank")}
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
                <span style={{ fontSize: 36, fontWeight: 700 }}>$4.99</span>
                <span style={{ fontSize: 15, color: '#9ca3af', marginLeft: 6 }}>/ month</span>
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
                or $39.99/year <span style={{ color: '#22c55e' }}>(save 33%)</span>
              </div>
              
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 14 }}>
                {[
                  "Everything in Free",
                  "Unlimited symbols",
                  "Advanced technical charts",
                  "Price alerts & notifications",
                  "Strategy backtesting",
                  "TradingView integration"
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
