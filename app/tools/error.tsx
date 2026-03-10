'use client';

import { useEffect } from 'react';

export default function ToolsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ToolsError]', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#E2E8F0',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, color: '#F87171' }}>
          Tool Error
        </h2>
        <p style={{ fontSize: 15, color: '#94A3B8', marginBottom: 24 }}>
          This tool encountered an error. Your data is safe — try reloading.
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
            Retry
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
            Back to Tools
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
