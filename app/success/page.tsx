'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const wid = searchParams.get('wid');
  const plan = searchParams.get('plan');
  const simulated = searchParams.get('simulated');

  useEffect(() => {
    // Redirect back to Streamlit app after 3 seconds
    if (wid) {
      const timer = setTimeout(() => {
        window.location.href = `https://app.marketscannerpros.app?wid=${wid}`;
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [wid]);

  return (
    <div style={{ 
      padding: '40px', 
      maxWidth: '600px', 
      margin: '100px auto',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ fontSize: '2.5em', marginBottom: '20px' }}>✅ Purchase Successful!</h1>
      
      {simulated && (
        <div style={{ 
          background: '#fef3c7', 
          padding: '15px', 
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#92400e'
        }}>
          <strong>Sandbox Mode:</strong> Your subscription is set to <b>trialing</b>
        </div>
      )}
      
      <p style={{ fontSize: '1.1em', marginBottom: '10px' }}>
        Your {plan === 'pro_trader' ? 'Pro Trader' : 'Pro'} subscription is now active!
      </p>
      
      <p style={{ opacity: 0.7, marginBottom: '30px' }}>
        Redirecting you back to the app...
      </p>

      {wid && (
        <a 
          href={`https://app.marketscannerpros.app?wid=${wid}`}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#10b981',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: '500'
          }}
        >
          Return to App →
        </a>
      )}
    </div>
  );
}
