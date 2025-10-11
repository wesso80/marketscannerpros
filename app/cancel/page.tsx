'use client';

import { useSearchParams } from 'next/navigation';

export default function CancelPage() {
  const searchParams = useSearchParams();
  const wid = searchParams.get('wid');

  return (
    <div style={{ 
      padding: '40px', 
      maxWidth: '600px', 
      margin: '100px auto',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ fontSize: '2.5em', marginBottom: '20px' }}>❕ Checkout Cancelled</h1>
      
      <p style={{ fontSize: '1.1em', marginBottom: '10px', opacity: 0.8 }}>
        No changes were made to your account.
      </p>
      
      <p style={{ fontSize: '1.1em', marginBottom: '30px', opacity: 0.8 }}>
        You can try again anytime you're ready.
      </p>

      {wid ? (
        <a 
          href={`https://app.marketscannerpros.app?wid=${wid}`}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: '500'
          }}
        >
          Return to App →
        </a>
      ) : (
        <a 
          href="https://marketscannerpros.app"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: '500'
          }}
        >
          Go to Homepage →
        </a>
      )}
    </div>
  );
}
