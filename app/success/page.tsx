'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    
    if (!sessionId) {
      setStatus('error');
      return;
    }

    fetch(`/api/payments/verify?session_id=${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.paid) {
          setStatus('success');
          setTimeout(() => {
            window.location.href = 'https://app.marketscannerpros.app';
          }, 2000);
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <main style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h1>Processing payment...</h1>
        <p>Please wait while we confirm your subscription.</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h1>⚠️ Payment Error</h1>
        <p>There was an issue with your payment. Please try again or contact support.</p>
        <a href="/pricing" style={{ color: '#10b981', textDecoration: 'underline' }}>
          Back to Pricing
        </a>
      </main>
    );
  }

  return (
    <main style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <h1>🎉 Welcome to Market Scanner Pro!</h1>
      <p style={{ fontSize: '1.2rem', marginTop: '1rem' }}>
        Your subscription is active. Redirecting to the app...
      </p>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
