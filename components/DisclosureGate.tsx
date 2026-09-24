'use client';

import { useCallback, useEffect, useState } from 'react';
import { DISCLOSURE_VERSION } from '@/lib/disclosure';

// Anonymous visitors have no server identity, so their acknowledgement lives
// only for this tab session and is synced to the workspace record on sign-in.
const ANON_SESSION_KEY = 'msp-disclosure-anon-accepted';
const STATUS_TIMEOUT_MS = 8000;

function readAnonAcceptance(): boolean {
  try { return sessionStorage.getItem(ANON_SESSION_KEY) === DISCLOSURE_VERSION; } catch { return false; }
}

function writeAnonAcceptance() {
  try { sessionStorage.setItem(ANON_SESSION_KEY, DISCLOSURE_VERSION); } catch {}
}

function clearAnonAcceptance() {
  try { sessionStorage.removeItem(ANON_SESSION_KEY); } catch {}
}

async function postAcceptance(): Promise<boolean> {
  const response = await fetch('/api/disclosure/accept', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: DISCLOSURE_VERSION }),
  });
  return response.ok;
}

export default function DisclosureGate({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
    try {
      // The authenticated server record is authoritative. A shared browser's
      // unscoped localStorage entry must not stand in for another user's consent.
      const response = await fetch('/api/disclosure/status', { cache: 'no-store', credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new Error('Status unavailable');
      const data = await response.json();
      const isAuthed = data.authenticated === true;
      setAuthenticated(isAuthed);

      if (!isAuthed) {
        setAccepted(readAnonAcceptance());
        return;
      }

      if (data.accepted === true && data.version === DISCLOSURE_VERSION) {
        clearAnonAcceptance();
        setAccepted(true);
        return;
      }

      // Acknowledged moments ago while signed out in this same tab: record it against the workspace now.
      if (readAnonAcceptance()) {
        const saved = await postAcceptance().catch(() => false);
        if (saved) {
          clearAnonAcceptance();
          setAccepted(true);
          return;
        }
      }
      setAccepted(false);
    } catch {
      setError('We could not check your disclosure acknowledgement. Please retry.');
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  const handleAccept = async () => {
    if (!checked || saving) return;
    setSaving(true);
    setError(null);

    if (!authenticated) {
      writeAnonAcceptance();
      setAccepted(true);
      setSaving(false);
      return;
    }

    try {
      if (!(await postAcceptance())) throw new Error('Save failed');
      clearAnonAcceptance();
      setAccepted(true);
    } catch {
      setError('Your acknowledgement was not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Still loading — show minimal spinner rather than blank page
  if (accepted === null) return (
    <div style={{ minHeight: '100vh', background: 'var(--msp-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {error ? <div role="alert"><p>{error}</p><button onClick={() => void checkStatus()}>Retry check</button></div> : <>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #10B981', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </>}
    </div>
  );

  // Already accepted
  if (accepted) return <>{children}</>;

  // Show gate. The overlay itself scrolls (not a nested box) so mobile browsers
  // with dynamic toolbars can always reach the checkbox and button.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="msp-disclosure-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        background: 'var(--msp-bg)',
        border: '1px solid rgba(234,179,8,0.25)',
        borderRadius: 16,
        maxWidth: 620,
        width: '100%',
        margin: 'auto 0',
        padding: '24px 18px',
        boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 40 }}>⚠️</span>
          <h2 id="msp-disclosure-title" style={{ fontSize: 22, fontWeight: 700, color: 'var(--msp-warn)', margin: '12px 0 4px' }}>
            Important Disclosure
          </h2>
          <p style={{ fontSize: 13, color: 'var(--msp-flat)', margin: 0 }}>
            Please read and acknowledge before continuing
          </p>
        </div>

        <div style={{
          background: 'rgba(234,179,8,0.06)',
          border: '1px solid rgba(234,179,8,0.12)',
          borderRadius: 10,
          padding: '16px 18px',
          fontSize: 13,
          color: 'var(--msp-text)',
          lineHeight: 1.7,
          marginBottom: 20,
        }}>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: 'var(--msp-warn)' }}>General Advice Warning:</strong>{' '}
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
            <a href="/terms" target="_blank" style={{ color: 'var(--msp-bull)', textDecoration: 'underline' }}>Terms of Service</a>,{' '}
            <a href="/disclaimer" target="_blank" style={{ color: 'var(--msp-bull)', textDecoration: 'underline' }}>Disclaimer</a>, and{' '}
            <a href="/privacy" target="_blank" style={{ color: 'var(--msp-bull)', textDecoration: 'underline' }}>Privacy Policy</a>, 
            and agree to be bound by them.
          </p>
        </div>

        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--msp-text)',
          lineHeight: 1.5,
          marginBottom: 20,
          padding: '0 4px',
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 1, accentColor: 'var(--msp-bull)', width: 22, height: 22, flexShrink: 0 }}
          />
          <span>
            I acknowledge that MarketScanner Pros provides general information only and does not 
            provide financial advice. I accept full responsibility for my own investment decisions 
            and agree to the{' '}
            <a href="/terms" target="_blank" style={{ color: 'var(--msp-bull)' }}>Terms of Service</a>.
          </span>
        </label>

        {error && <p role="alert" style={{ color: 'var(--msp-warn)' }}>{error}</p>}
        <button
          type="button"
          onClick={handleAccept}
          disabled={!checked || saving}
          style={{
            width: '100%',
            minHeight: 48,
            padding: '14px 24px',
            borderRadius: 10,
            border: 'none',
            fontSize: 15,
            fontWeight: 600,
            cursor: checked && !saving ? 'pointer' : 'not-allowed',
            background: checked ? 'var(--msp-bull)' : '#334155',
            color: checked ? '#061018' : 'var(--msp-text-muted)',
            transition: 'all 0.2s',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {saving ? 'Saving...' : 'I Understand & Accept'}
        </button>

        <p style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--msp-text-muted)',
          marginTop: 12,
          margin: '12px 0 0',
        }}>
          You must accept to access the platform tools.
        </p>
      </div>
    </div>
  );
}
