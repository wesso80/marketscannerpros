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
        All features are now <strong>completely free</strong> while we improve our platform.
      </p>

      <div className="plans">
        <div className="plan" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2>Market Scanner - FREE</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>$0</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem' }}>All features unlocked. No credit card required.</p>
          <ul>
            <li>✅ Unlimited Market Scanner</li>
            <li>✅ Advanced Technical Charts</li>
            <li>✅ Price Alerts</li>
            <li>✅ Portfolio Tracking</li>
            <li>✅ Trade Journal</li>
            <li>✅ Strategy Backtesting</li>
            <li>✅ Email Notifications</li>
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
    </main>
  );
}
