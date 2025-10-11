'use client';

import { useSearchParams } from 'next/navigation';

export default function AccountPage() {
  const searchParams = useSearchParams();
  const wid = searchParams.get('wid');
  const portal = searchParams.get('portal');

  return (
    <div style={{ 
      padding: '40px', 
      maxWidth: '600px', 
      margin: '100px auto',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ fontSize: '2.5em', marginBottom: '20px' }}>💳 Account Management</h1>
      
      {portal === 'simulated' && (
        <div style={{ 
          background: '#fef3c7', 
          padding: '15px', 
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#92400e'
        }}>
          <strong>Sandbox Mode:</strong> Customer portal simulation
        </div>
      )}
      
      <p style={{ fontSize: '1.1em', marginBottom: '30px', opacity: 0.8 }}>
        Manage your subscription, billing, and payment methods.
      </p>

      {wid && (
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
      )}
    </div>
  );
}
