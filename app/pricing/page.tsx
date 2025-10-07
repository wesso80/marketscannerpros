'use client';
import "./styles.css";
import { useState } from "react";

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  
  const getStreamlitUrl = () => {
    if (process.env.NEXT_PUBLIC_STREAMLIT_URL) {
      return process.env.NEXT_PUBLIC_STREAMLIT_URL;
    }
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
        return 'http://localhost:5000';
      }
    }
    return 'https://app.marketscannerpros.app';
  };

  const handleCheckout = async (plan: 'pro' | 'pro_trader') => {
    setLoading(plan);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: plan })
      });
      
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };
  return (
    <main>
      <h1>Pricing</h1>
      <p>Start free. Upgrade any time. Cancel in your Stripe portal.</p>

      <div className="plans">
        {/* Free Plan */}
        <div className="plan">
          <h2>Free</h2>
          <p>$0</p>
          <ul>
            <li>✅ Unlimited Market Scanner</li>
            <li>✅ Portfolio Tracking (3 symbols)</li>
            <li>✅ Real-time Market Data</li>
            <li>✅ Try Pro with 5-7 day trial</li>
          </ul>
          <button className="btn" onClick={(e) => {
            e.preventDefault();
            window.open(getStreamlitUrl(), '_blank');
          }}>Launch App</button>
        </div>

        {/* Pro Plan */}
        <div className="plan">
          <h2>Pro <span className="badge">7-day free trial</span></h2>
          <p>$4.99 / month</p>
          <ul>
            <li>✅ Unlimited Symbol Scanner</li>
            <li>✅ Unlimited Price Alerts</li>
            <li>✅ Advanced Technical Charts</li>
            <li>✅ Unlimited Portfolio Tracking</li>
            <li>🔒 Trade Journal (Pro Trader)</li>
            <li>🔒 Backtesting (Pro Trader)</li>
          </ul>
          <button 
            className="btn" 
            onClick={() => handleCheckout('pro')}
            disabled={loading === 'pro'}
          >
            {loading === 'pro' ? 'Processing...' : 'Start Free Trial'}
          </button>
        </div>

        {/* Full Pro Trader Plan */}
        <div className="plan">
          <h2>Full Pro Trader <span className="badge">5-day free trial</span></h2>
          <p>$9.99 / month</p>
          <ul>
            <li>✅ Everything in Pro</li>
            <li>✅ Trade Journal</li>
            <li>✅ Strategy Backtesting</li>
            <li>✅ Backtesting Signal Alerts</li>
            <li>✅ Email Buy/Sell Notifications</li>
            <li>✅ TradingView Integration</li>
            <li>✅ Full Site Access</li>
          </ul>
          <button 
            className="btn" 
            onClick={() => handleCheckout('pro_trader')}
            disabled={loading === 'pro_trader'}
          >
            {loading === 'pro_trader' ? 'Processing...' : 'Start Free Trial'}
          </button>
        </div>
      </div>

      {/* TradingView Access Instructions - Pro Trader Only */}
      <div style={{ 
        marginTop: '3rem', 
        padding: '2rem', 
        background: 'linear-gradient(135deg, #1a472a 0%, #0f2e1a 100%)',
        borderRadius: '12px',
        border: '1px solid #10b981'
      }}>
        <h3 style={{ color: '#10b981', marginBottom: '1rem', fontSize: '1.5rem' }}>
          🎯 Pro Trader Exclusive: TradingView Invite-Only Scripts
        </h3>
        <p style={{ color: '#d1fae5', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
          Access our advanced strategy and live-signal indicators on TradingView (Pro Trader members only)
        </p>
        
        {/* TradingView Chart Preview */}
        <div style={{ marginBottom: '2rem', borderRadius: '8px', overflow: 'hidden', border: '2px solid #10b981' }}>
          <img 
            src="/attached_assets/image_1759816221506.png" 
            alt="MarketScanner Pros Confluence Strategy on TradingView" 
            style={{ width: '100%', display: 'block' }}
          />
        </div>
        
        <div style={{ 
          background: 'rgba(0,0,0,0.3)', 
          padding: '1.5rem', 
          borderRadius: '8px',
          borderLeft: '4px solid #10b981'
        }}>
          <h4 style={{ color: '#10b981', marginBottom: '1rem' }}>🔑 To Activate Your Invite-Only Scripts:</h4>
          <ol style={{ color: '#d1fae5', lineHeight: '1.8', paddingLeft: '1.5rem' }}>
            <li>Log in to your TradingView account</li>
            <li>Copy your <strong>TradingView username</strong> (exactly as it appears — it's case-sensitive)</li>
            <li>Submit it here → <a href="https://marketscannerpros.app/tradingview-access" style={{ color: '#10b981', textDecoration: 'underline' }}>marketscannerpros.app/tradingview-access</a><br/>
                or reply to your welcome email with your username</li>
          </ol>
          
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '6px'
          }}>
            <p style={{ color: '#d1fae5', marginBottom: '0.5rem' }}><strong>Once verified, you'll get access to:</strong></p>
            <ul style={{ color: '#d1fae5', paddingLeft: '1.5rem', marginBottom: '0' }}>
              <li>✅ MarketScanner Pros — Confluence Strategy</li>
              <li>✅ MarketScanner Pros — Live Signals</li>
            </ul>
          </div>
          
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '1rem', marginBottom: '0' }}>
            ⏱️ Access is usually activated within <strong>24 hours</strong> — you'll receive a TradingView notification once added.
          </p>
        </div>
        
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '1rem', fontStyle: 'italic' }}>
          💡 Can't find the scripts after 24 hours? Check <strong>Indicators → Invite-only scripts</strong> tab in TradingView and make sure you're logged into the correct account.
        </p>
      </div>
          {/* MSP ANCHORS (auto-insert) */}
      <div id="pro" className="scroll-mt-24"></div>
      <div id="protrader" className="scroll-mt-24"></div>
    </main>
  );
}

