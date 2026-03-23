'use client';

import { useEffect, useState } from 'react';

const LOCAL_KEY = 'msp-disclosure-accepted';
const DISCLOSURE_VERSION = '1'; // bump to force re-acceptance

export default function DisclosureGate({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Check localStorage first for instant UI
    try {
      const stored = localStorage.getItem(LOCAL_KEY);
      if (stored === DISCLOSURE_VERSION) {
        setAccepted(true);
        return;
      }
    } catch {}

    // Check database (covers cross-device)
    fetch('/api/disclosure/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.accepted) {
          try { localStorage.setItem(LOCAL_KEY, DISCLOSURE_VERSION); } catch {}
          setAccepted(true);
        } else {
          setAccepted(false);
        }
      })
      .catch(() => setAccepted(false));
  }, []);

  const handleAccept = async () => {
    setSaving(true);
    try {
      await fetch('/api/disclosure/accept', { method: 'POST' });
      localStorage.setItem(LOCAL_KEY, DISCLOSURE_VERSION);
    } catch {}
    setAccepted(true);
    setSaving(false);
  };

  // Still loading
  if (accepted === null) return null;

  // Already accepted
  if (accepted) return <>{children}</>;

  // Show gate
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: '#0F172A',
        border: '1px solid rgba(234,179,8,0.25)',
        borderRadius: 16,
        maxWidth: 620,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '32px 28px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 40 }}>⚠️</span>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#EAB308', margin: '12px 0 4px' }}>
            Important Disclosure
          </h2>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            Please read and acknowledge before continuing
          </p>
        </div>

        <div style={{
          background: 'rgba(234,179,8,0.06)',
          border: '1px solid rgba(234,179,8,0.12)',
          borderRadius: 10,
          padding: '16px 18px',
          fontSize: 13,
          color: '#CBD5E1',
          lineHeight: 1.7,
          marginBottom: 20,
        }}>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: '#EAB308' }}>General Advice Warning:</strong>{' '}
            MarketScanner Pros (&quot;MSP&quot;) provides <strong>general information only</strong>. 
            It does not consider your personal objectives, financial situation, or needs.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            MSP <strong>does not hold an Australian Financial Services Licence (AFSL)</strong> and 
            is not a licensed financial adviser, broker, dealer, or fund manager.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Nothing on this platform constitutes financial, investment, or trading advice, 
            nor a recommendation to acquire or dispose of any financial product. All scanner outputs, 
            confluence scores, scenario analyses, AI-generated commentary, and analytical tools 
            are for <strong>educational and informational purposes only</strong>.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            This platform is a <strong>paper trade simulation system</strong>. It does not execute 
            real trades, connect to brokerage accounts, hold funds, or place orders on any exchange.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong>Past performance does not guarantee future results.</strong> Trading and investing 
            involve substantial risk of loss. You are solely responsible for your own investment 
            decisions. Always consult a licensed financial professional before making investment decisions.
          </p>
          <p style={{ margin: 0 }}>
            By proceeding, you acknowledge that you have read and understood the full{' '}
            <a href="/terms" target="_blank" style={{ color: '#10B981', textDecoration: 'underline' }}>Terms of Service</a>,{' '}
            <a href="/disclaimer" target="_blank" style={{ color: '#10B981', textDecoration: 'underline' }}>Disclaimer</a>, and{' '}
            <a href="/privacy" target="_blank" style={{ color: '#10B981', textDecoration: 'underline' }}>Privacy Policy</a>, 
            and agree to be bound by them.
          </p>
        </div>

        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          cursor: 'pointer',
          fontSize: 13,
          color: '#E2E8F0',
          lineHeight: 1.5,
          marginBottom: 20,
          padding: '0 4px',
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 3, accentColor: '#10B981', width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            I acknowledge that MarketScanner Pros provides general information only and does not 
            provide financial advice. I accept full responsibility for my own investment decisions 
            and agree to the{' '}
            <a href="/terms" target="_blank" style={{ color: '#10B981' }}>Terms of Service</a>.
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked || saving}
          style={{
            width: '100%',
            padding: '14px 24px',
            borderRadius: 10,
            border: 'none',
            fontSize: 15,
            fontWeight: 600,
            cursor: checked && !saving ? 'pointer' : 'not-allowed',
            background: checked ? '#10B981' : '#334155',
            color: checked ? '#061018' : '#64748B',
            transition: 'all 0.2s',
          }}
        >
          {saving ? 'Saving...' : 'I Understand & Accept'}
        </button>

        <p style={{
          textAlign: 'center',
          fontSize: 11,
          color: '#64748B',
          marginTop: 12,
          margin: '12px 0 0',
        }}>
          You must accept to access the platform tools.
        </p>
      </div>
    </div>
  );
}
