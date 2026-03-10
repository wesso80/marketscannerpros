'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0F172A',
      color: '#E2E8F0',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: '#F87171' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 16, color: '#94A3B8', marginBottom: 24 }}>
          An unexpected error occurred. Please try again or return to the dashboard.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px',
              background: '#10B981',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
          <a
            href="/tools"
            style={{
              padding: '10px 24px',
              background: '#1E293B',
              color: '#E2E8F0',
              border: '1px solid #334155',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Dashboard
          </a>
        </div>
        {error.digest && (
          <p style={{ fontSize: 12, color: '#475569', marginTop: 16 }}>
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
