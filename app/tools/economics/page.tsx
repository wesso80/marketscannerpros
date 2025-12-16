'use client';

import { Suspense, useState, useEffect } from 'react';
import ToolsPageHeader from '@/components/ToolsPageHeader';

interface EconomicIndicator {
  key: string;
  label: string;
  suffix: string;
  value: number | null;
  date: string | null;
  loading: boolean;
}

const indicators = [
  { key: 'REAL_GDP', label: 'Real GDP', suffix: 'B USD' },
  { key: 'CPI', label: 'Consumer Price Index', suffix: '' },
  { key: 'UNEMPLOYMENT', label: 'Unemployment Rate', suffix: '%' },
  { key: 'INFLATION', label: 'Inflation Rate', suffix: '%' },
  { key: 'RETAIL_SALES', label: 'Retail Sales', suffix: 'M USD' },
  { key: 'TREASURY_YIELD', label: '10Y Treasury Yield', suffix: '%' },
];

function EconomicsContent() {
  const [data, setData] = useState<EconomicIndicator[]>(
    indicators.map(ind => ({ ...ind, value: null, date: null, loading: true }))
  );

  useEffect(() => {
    fetchAllIndicators();
  }, []);

  const fetchAllIndicators = async () => {
    const promises = indicators.map(async (indicator) => {
      try {
        const response = await fetch(`/api/economics?type=${indicator.key}`);
        const json = await response.json();
        return {
          ...indicator,
          value: json.value,
          date: json.date,
          loading: false
        };
      } catch (error) {
        return {
          ...indicator,
          value: null,
          date: null,
          loading: false
        };
      }
    });

    const results = await Promise.all(promises);
    setData(results);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      <ToolsPageHeader
        badge="ECONOMIC INDICATORS"
        title="Economic Data Dashboard"
        subtitle="Track key US economic indicators from official sources via Alpha Vantage."
        icon="📊"
        backHref="/tools"
        actions={
          <button
            onClick={fetchAllIndicators}
            style={{
              padding: '10px 16px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100())',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
            }}
          >
            🔄 Refresh
          </button>
        }
      />

      <div style={{ padding: '24px 16px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {data.map((indicator) => (
              <div
                key={indicator.key}
                style={{
                  background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(11,21,38,0.92))',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px', fontWeight: 600 }}>
                  {indicator.label}
                </div>
                {indicator.loading ? (
                  <div style={{ color: '#64748b', fontSize: '24px', fontWeight: 700 }}>
                    Loading...
                  </div>
                ) : indicator.value !== null ? (
                  <>
                    <div style={{ color: '#e2e8f0', fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>
                      {indicator.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {indicator.suffix && <span style={{ fontSize: '16px', color: '#94a3b8', marginLeft: '8px' }}>{indicator.suffix}</span>}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '12px' }}>
                      As of {indicator.date || 'N/A'}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#ef4444', fontSize: '14px' }}>
                    Data unavailable
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EconomicsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f172a' }} />}>
      <EconomicsContent />
    </Suspense>
  );
}
