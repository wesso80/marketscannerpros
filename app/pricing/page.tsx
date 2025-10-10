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

  return (
    <main>
      <h1>🎉 Free for Everyone!</h1>
      <p style={{ fontSize: '1.2rem', marginTop: '1rem', marginBottom: '2rem' }}>
        All Pro Trader features are now <strong>completely free</strong> while we improve our platform.
      </p>

      <div className="plans">
        {/* Single Free Plan with All Features */}
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
