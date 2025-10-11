'use client';
import "./styles.css";

export default function PricingPage() {
  
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

  // Check if payments are enabled (set via build-time env var for test deployments)
  const paymentsEnabled = process.env.NEXT_PUBLIC_ENABLE_PAYMENTS === 'true';

  // Production view (Free for Everyone)
  if (!paymentsEnabled) {
    return (
      <main>
        <h1>🎉 Free for Everyone!</h1>
        <p style={{ fontSize: '1.2rem', marginTop: '1rem', marginBottom: '2rem' }}>
          All Pro Trader features are now <strong>completely free</strong> while we improve our platform.
        </p>

        <div className="plans">
          <div className="plan" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2>Pro Trader - FREE</h2>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>$0</p>
            <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem' }}>All features unlocked. No credit card required.</p>
            <ul>
              <li>✅ Unlimited Market Scanner</li>
              <li>✅ Unlimited Price Alerts</li>
              <li>✅ Advanced Technical Charts</li>
              <li>✅ Unlimited Portfolio Tracking</li>
              <li>✅ Trade Journal</li>
              <li>✅ Strategy Backtesting</li>
              <li>✅ Backtesting Signal Alerts</li>
              <li>✅ Email Buy/Sell Notifications</li>
              <li>✅ TradingView Integration</li>
              <li>✅ Full Site Access</li>
            </ul>
            <button 
              className="btn" 
              style={{ 
                background: 'linear-gradient(135deg, #10b981, #059669)',
                fontSize: '1.1rem',
                padding: '1rem 2rem'
              }}
              onClick={(e) => {
                e.preventDefault();
                window.open(getStreamlitUrl(), '_blank');
              }}
            >
              🚀 Launch Free App
            </button>
          </div>
        </div>

        <div style={{ 
          marginTop: '3rem', 
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(16, 185, 129, 0.1)',
          borderRadius: '12px',
          maxWidth: '800px',
          margin: '3rem auto'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Why Free?</h3>
          <p style={{ opacity: 0.9 }}>
            We're improving our subscription system to provide a better experience. 
            During this time, all premium features are free for everyone. Enjoy unlimited access!
          </p>
        </div>
      </main>
    );
  }

  // Test/Paid view (Payments Enabled)
  const handleUpgrade = async (plan: 'pro' | 'pro_trader') => {
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, workspaceId: 'test-user-123' })
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert(data?.error || 'Checkout failed');
      }
    } catch (err) {
      alert('Failed to start checkout');
    }
  };

  return (
    <main>
      <h1>Choose Your Plan</h1>
      <p style={{ fontSize: '1.2rem', marginTop: '1rem', marginBottom: '2rem' }}>
        Unlock premium market scanning tools with <strong>Pro or Pro Trader</strong>
      </p>

      <div className="plans">
        {/* Pro Plan */}
        <div className="plan">
          <h2>Pro</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>$4.99<span style={{ fontSize: '1rem', opacity: 0.7 }}>/mo</span></p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem' }}>7-day free trial</p>
          <ul>
            <li>✅ Multi-Timeframe Confluence</li>
            <li>✅ Squeeze Detection</li>
            <li>✅ Advanced Charting</li>
            <li>✅ Price Alerts</li>
            <li>✅ CSV Exports</li>
            <li>✅ Email Notifications</li>
          </ul>
          <button 
            className="btn" 
            onClick={() => handleUpgrade('pro')}
          >
            Upgrade to Pro
          </button>
        </div>

        {/* Pro Trader Plan */}
        <div className="plan" style={{ borderColor: '#10b981' }}>
          <div style={{ 
            background: '#10b981', 
            color: 'white', 
            padding: '0.25rem 0.75rem', 
            borderRadius: '1rem', 
            fontSize: '0.85rem', 
            fontWeight: 'bold',
            display: 'inline-block',
            marginBottom: '0.5rem'
          }}>
            MOST POPULAR
          </div>
          <h2>Pro Trader</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>$9.99<span style={{ fontSize: '1rem', opacity: 0.7 }}>/mo</span></p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem' }}>5-day free trial</p>
          <ul>
            <li>✅ Everything in Pro</li>
            <li>✅ Unlimited Alerts</li>
            <li>✅ Trade Journal</li>
            <li>✅ Strategy Backtesting</li>
            <li>✅ TradingView Integration</li>
            <li>✅ Priority Support</li>
          </ul>
          <button 
            className="btn" 
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            onClick={() => handleUpgrade('pro_trader')}
          >
            Upgrade to Pro Trader
          </button>
        </div>
      </div>
    </main>
  );
}
