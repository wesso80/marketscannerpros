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
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
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
          {/* MSP ANCHORS (auto-insert) */}
      <div id="pro" className="scroll-mt-24"></div>
      <div id="protrader" className="scroll-mt-24"></div>
    </main>
  );
}

