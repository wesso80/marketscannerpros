'use client';

import { Suspense } from 'react';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import CryptoNewsWidget from '@/components/CryptoNewsWidget';
import PublicTreasuryWidget from '@/components/PublicTreasuryWidget';

export default function CryptoIntelPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      padding: '24px 16px',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: 700, margin: '0 0 4px' }}>
            Crypto Intelligence
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
            Real-time onchain data - token security, whale activity, DEX pressure, treasury holdings &amp; crypto news
          </p>
        </div>

        {/* Top row: News + Treasury */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: '20px',
          marginBottom: '20px',
          alignItems: 'start',
        }}
        className="responsive-grid-2col"
        >
          <Suspense fallback={<WidgetSkeleton />}>
            <CryptoNewsWidget title="Crypto News & Guides" />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton />}>
            <PublicTreasuryWidget />
          </Suspense>
        </div>

        <ComplianceDisclaimer />
      </div>

      <style>{`
        @media (max-width: 768px) {
          .responsive-grid-2col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div style={{
      background: '#1e293b',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
      minHeight: '200px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ color: '#334155', fontSize: '13px' }}>Loading...</div>
    </div>
  );
}
