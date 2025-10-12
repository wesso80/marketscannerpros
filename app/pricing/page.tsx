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

  const paymentsEnabled = process.env.NEXT_PUBLIC_ENABLE_PAYMENTS === 'true';

  if (!paymentsEnabled) {
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

  return (
    <main>
      <h1>Choose Your Plan</h1>
      <p style={{ fontSize: '1.2rem', marginTop: '1rem', marginBottom: '2rem' }}>
        Start with the free scanner or upgrade for full access
      </p>

      <div className="plans">
        <div className="plan">
          <h2>Free</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>$0<span style={{ fontSize: '1rem', opacity: 0.7 }}>/mo</span></p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem' }}>Perfect for getting started</p>
          <ul>
            <li>✅ Basic Market Scanner</li>
            <li>✅ Advanced Technical Charts</li>
            <li>✅ Real-time Data</li>
            <li>❌ Price Alerts</li>
            <li>❌ Trade Journal</li>
            <li>❌ Email Notifications</li>
          </ul>
          <button 
            className="btn" 
            style={{ background: '#374151' }}
            onClick={() => window.open(getStreamlitUrl(), '_blank')}
          >
            Start Free
          </button>
        </div>

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
            BEST VALUE
          </div>
          <h2>Pro</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>$4.99<span style={{ fontSize: '1rem', opacity: 0.7 }}>/mo</span></p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem' }}>Everything included</p>
          <ul>
            <li>✅ Everything in Free</li>
            <li>✅ Unlimited Price Alerts</li>
            <li>✅ Trade Journal</li>
            <li>✅ Strategy Backtesting</li>
            <li>✅ Backtesting Alerts</li>
            <li>✅ Email Notifications</li>
            <li>✅ Priority Support</li>
          </ul>
          <a 
            href="https://buy.stripe.com/test_aFacN6dl0c1peEg8iX9sk00"
            target="_blank"
            rel="noopener noreferrer"
            className="btn" 
            style={{ 
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'inline-block',
              textDecoration: 'none'
            }}
          >
            Upgrade to Pro
          </a>
        </div>
      </div>
    </main>
  );
}
