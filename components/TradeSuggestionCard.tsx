'use client';

import { useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────────── */

export interface TradeSuggestion {
  id: number;
  symbol: string;
  asset_class: string | null;
  direction: 'bullish' | 'bearish';
  strategy: string | null;
  setup: string | null;
  scanner_score: number;
  edge_match_score: number;
  confidence_score: number;
  suggested_entry: number | null;
  suggested_stop: number | null;
  suggested_target: number | null;
  risk_reward: number | null;
  reasoning: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}

interface TradeSuggestionCardProps {
  suggestion: TradeSuggestion;
  onAccept: (id: number) => Promise<void>;
  onReject: (id: number) => Promise<void>;
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function TradeSuggestionCard({ suggestion, onAccept, onReject }: TradeSuggestionCardProps) {
  const [acting, setActing] = useState<'accept' | 'reject' | null>(null);
  const [done, setDone] = useState(false);

  const s = suggestion;
  const isBull = s.direction === 'bullish';
  const dirColor = isBull ? '#10B981' : '#EF4444';
  const dirLabel = isBull ? 'LONG' : 'SHORT';
  const confidence = Math.round(s.confidence_score * 100);
  const edgeMatch = Math.round(s.edge_match_score * 100);

  const confColor = confidence >= 70 ? '#10B981' : confidence >= 50 ? '#F59E0B' : '#94A3B8';

  const expiresIn = getTimeRemaining(s.expires_at);

  async function handleAction(action: 'accept' | 'reject') {
    setActing(action);
    try {
      if (action === 'accept') await onAccept(s.id);
      else await onReject(s.id);
      setDone(true);
    } catch {
      setActing(null);
    }
  }

  if (done) {
    const label = acting === 'accept' ? 'Accepted — journal entry created' : 'Rejected';
    const color = acting === 'accept' ? '#10B981' : '#94A3B8';
    return (
      <div className="msp-card" style={{ padding: '0.7rem 0.9rem', opacity: 0.7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>{acting === 'accept' ? '✔' : '✖'}</span>
          <span style={{ color, fontWeight: 700, fontSize: '0.8rem' }}>{s.symbol} — {label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="msp-card" style={{ padding: '0.8rem 0.95rem', marginBottom: '0.75rem' }}>
      {/* ── Header: Symbol + Direction + Confidence ─────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span style={{ color: '#F1F5F9', fontWeight: 800, fontSize: '1.05rem' }}>{s.symbol}</span>
          <span style={{
            background: dirColor,
            color: '#0F172A',
            padding: '0.1rem 0.4rem',
            borderRadius: '0.25rem',
            fontWeight: 800,
            fontSize: '0.65rem',
            letterSpacing: '0.03em',
          }}>
            {dirLabel}
          </span>
          {s.asset_class && (
            <span style={{
              background: 'rgba(148,163,184,0.15)',
              color: '#94A3B8',
              padding: '0.1rem 0.35rem',
              borderRadius: '0.2rem',
              fontSize: '0.62rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              {s.asset_class}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: confColor, fontWeight: 800, fontSize: '0.78rem' }}>
            {confidence}% confidence
          </span>
          <span style={{ color: '#64748B', fontSize: '0.65rem' }}>{expiresIn}</span>
        </div>
      </div>

      {/* ── Setup description ──────────────────────────────────────── */}
      {s.setup && (
        <div style={{ color: '#CBD5E1', fontSize: '0.78rem', marginTop: '0.4rem', lineHeight: 1.4 }}>
          {s.setup}
        </div>
      )}

      {/* ── Levels grid ────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))',
        gap: '0.35rem',
        marginTop: '0.5rem',
      }}>
        {s.suggested_entry != null && (
          <LevelBox label="Entry" value={fmtPrice(s.suggested_entry)} color="#E2E8F0" />
        )}
        {s.suggested_stop != null && (
          <LevelBox label="Stop" value={fmtPrice(s.suggested_stop)} color="#EF4444" />
        )}
        {s.suggested_target != null && (
          <LevelBox label="Target" value={fmtPrice(s.suggested_target)} color="#10B981" />
        )}
        {s.risk_reward != null && (
          <LevelBox label="R:R" value={`${s.risk_reward.toFixed(1)}:1`} color="#60A5FA" />
        )}
      </div>

      {/* ── Scores strip ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginTop: '0.45rem',
        color: '#94A3B8',
        fontSize: '0.7rem',
        flexWrap: 'wrap',
      }}>
        <span>Scanner: <strong style={{ color: '#CBD5E1' }}>{s.scanner_score}</strong>/100</span>
        <span>Edge Match: <strong style={{ color: '#CBD5E1' }}>{edgeMatch}%</strong></span>
        {s.strategy && <span>Strategy: <strong style={{ color: '#CBD5E1' }}>{s.strategy.replace(/_/g, ' ')}</strong></span>}
      </div>

      {/* ── Action buttons ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button
          onClick={() => handleAction('accept')}
          disabled={acting !== null}
          style={{
            background: '#10B981',
            color: '#0F172A',
            border: 'none',
            borderRadius: '0.35rem',
            padding: '0.4rem 0.9rem',
            fontWeight: 800,
            fontSize: '0.75rem',
            cursor: acting ? 'wait' : 'pointer',
            opacity: acting && acting !== 'accept' ? 0.4 : 1,
          }}
        >
          {acting === 'accept' ? 'Accepting…' : 'Accept'}
        </button>
        <button
          onClick={() => handleAction('reject')}
          disabled={acting !== null}
          style={{
            background: 'transparent',
            color: '#94A3B8',
            border: '1px solid rgba(148,163,184,0.3)',
            borderRadius: '0.35rem',
            padding: '0.4rem 0.9rem',
            fontWeight: 700,
            fontSize: '0.75rem',
            cursor: acting ? 'wait' : 'pointer',
            opacity: acting && acting !== 'reject' ? 0.4 : 1,
          }}
        >
          {acting === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function LevelBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.6)',
      borderRadius: '0.3rem',
      padding: '0.35rem 0.5rem',
      textAlign: 'center',
    }}>
      <div style={{ color: '#64748B', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color, fontWeight: 800, fontSize: '0.82rem', marginTop: '0.1rem' }}>
        {value}
      </div>
    </div>
  );
}

function fmtPrice(n: number): string {
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(8);
}

function getTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}
