'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  Direction,
  EvaluateResult,
  Permission,
  PermissionMatrixSnapshot,
  StrategyTag,
} from '@/lib/risk-governor-hard';

type Candidate = {
  symbol: string;
  structure: string;
  strategy_tag: StrategyTag;
  direction: Direction;
  confidence: number;
  asset_class: 'equities' | 'crypto';
  entry_price: number;
  stop_price: number;
  atr: number;
  event_severity: 'none' | 'medium' | 'high';
};

const CANDIDATES: Candidate[] = [
  { symbol: 'BTCUSD', structure: 'Volatility Expansion', strategy_tag: 'BREAKOUT_CONTINUATION', direction: 'LONG', confidence: 77, asset_class: 'crypto', entry_price: 64420, stop_price: 63770, atr: 620, event_severity: 'none' },
  { symbol: 'NVDA', structure: 'Trend Pullback', strategy_tag: 'TREND_PULLBACK', direction: 'LONG', confidence: 74, asset_class: 'equities', entry_price: 937, stop_price: 928, atr: 14, event_severity: 'none' },
  { symbol: 'MSFT', structure: 'Range Reclaim', strategy_tag: 'MEAN_REVERSION', direction: 'LONG', confidence: 69, asset_class: 'equities', entry_price: 421, stop_price: 415.2, atr: 8.5, event_severity: 'none' },
  { symbol: 'AAPL', structure: 'Compression Resolve', strategy_tag: 'BREAKOUT_CONTINUATION', direction: 'LONG', confidence: 61, asset_class: 'equities', entry_price: 208.4, stop_price: 206.9, atr: 3.6, event_severity: 'medium' },
  { symbol: 'TSLA', structure: 'Range Fade', strategy_tag: 'RANGE_FADE', direction: 'SHORT', confidence: 58, asset_class: 'equities', entry_price: 231.8, stop_price: 235.4, atr: 6.1, event_severity: 'none' },
];

const STRATEGIES: StrategyTag[] = [
  'BREAKOUT_CONTINUATION',
  'TREND_PULLBACK',
  'RANGE_FADE',
  'MEAN_REVERSION',
  'MOMENTUM_REVERSAL',
];

const DIRECTIONS: Direction[] = ['LONG', 'SHORT'];

function permissionStyle(permission: Permission) {
  if (permission === 'ALLOW') return { border: '1px solid rgba(16,185,129,0.45)', background: 'rgba(16,185,129,0.14)', color: '#6ee7b7' };
  if (permission === 'ALLOW_REDUCED') return { border: '1px solid rgba(251,191,36,0.45)', background: 'rgba(251,191,36,0.14)', color: '#fde68a' };
  if (permission === 'ALLOW_TIGHTENED') return { border: '1px solid rgba(96,165,250,0.45)', background: 'rgba(96,165,250,0.14)', color: '#bfdbfe' };
  return { border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.14)', color: '#fca5a5' };
}

function permissionLabel(permission: Permission) {
  if (permission === 'ALLOW_REDUCED') return 'REDUCED';
  if (permission === 'ALLOW_TIGHTENED') return 'TIGHT';
  return permission;
}

function reasonCodeCopy(code: string): string {
  const map: Record<string, string> = {
    DAILY_LOSS_LIMIT: 'Daily loss limit hit (LOCKED).',
    OPEN_RISK_CAP: 'Open risk cap reached. Reduce exposure.',
    CORR_CLUSTER_HIGH: 'Correlation cluster cap breached.',
    REGIME_STRATEGY_BLOCK: 'Strategy not permitted in current regime.',
    EVENT_BLOCK: 'Event window blocks new trades.',
    DATA_STALE: 'Market data stale. Trading disabled.',
    STOP_TOO_TIGHT: 'Stop inside noise band (ATR floor).',
    RISK_MODE_LOCKED: 'Risk governor locked. Only reduce-risk actions.',
    CONFIDENCE_BELOW_THRESHOLD: 'Confidence below permission threshold.',
  };
  return map[code] || code;
}

export default function TradePermissionDashboard() {
  const [snapshot, setSnapshot] = useState<PermissionMatrixSnapshot | null>(null);
  const [evalBySymbol, setEvalBySymbol] = useState<Record<string, EvaluateResult>>({});
  const [permissionFilter, setPermissionFilter] = useState<'ALL' | Permission>('ALL');
  const [matrixMessage, setMatrixMessage] = useState<string>('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch('/api/risk/governor/permission-snapshot', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as PermissionMatrixSnapshot;
        if (active) setSnapshot(data);
      } catch {
      }
    };

    load();
    const id = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;

    const eligible = CANDIDATES.filter((candidate) => {
      const local = snapshot.matrix[candidate.strategy_tag]?.[candidate.direction] || 'BLOCK';
      return local !== 'BLOCK' && snapshot.risk_mode !== 'LOCKED';
    });

    if (eligible.length === 0) {
      setEvalBySymbol({});
      return;
    }

    let cancelled = false;

    const evaluateAll = async () => {
      const results = await Promise.all(
        eligible.map(async (candidate) => {
          try {
            const res = await fetch('/api/risk/governor/evaluate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trade_intent: candidate }),
            });
            if (!res.ok) return [candidate.symbol, null] as const;
            const data = (await res.json()) as EvaluateResult;
            return [candidate.symbol, data] as const;
          } catch {
            return [candidate.symbol, null] as const;
          }
        })
      );

      if (cancelled) return;

      const next: Record<string, EvaluateResult> = {};
      for (const [symbol, evaluation] of results) {
        if (evaluation) next[symbol] = evaluation;
      }
      setEvalBySymbol(next);
    };

    evaluateAll();
    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  const globalLocked = !!snapshot && (
    snapshot.risk_mode === 'LOCKED' ||
    snapshot.data_health.status === 'DOWN' ||
    snapshot.session.remaining_daily_R <= 0
  );

  const candidates = useMemo(() => {
    if (!snapshot) return [];

    return CANDIDATES
      .map((candidate) => {
        const localPermission = snapshot.matrix[candidate.strategy_tag]?.[candidate.direction] || 'BLOCK';
        const evaluated = evalBySymbol[candidate.symbol];
        const permission = evaluated?.permission || localPermission;
        return { ...candidate, permission, evaluated };
      })
      .filter((row) => permissionFilter === 'ALL' || row.permission === permissionFilter)
      .sort((a, b) => {
        const rank: Record<Permission, number> = { ALLOW: 3, ALLOW_REDUCED: 2, ALLOW_TIGHTENED: 1, BLOCK: 0 };
        return rank[b.permission] - rank[a.permission] || b.confidence - a.confidence;
      });
  }, [snapshot, evalBySymbol, permissionFilter]);

  const onMatrixCellClick = (strategy: StrategyTag, direction: Direction) => {
    if (!snapshot) return;
    const permission = snapshot.matrix[strategy][direction];
    if (permission === 'BLOCK') {
      setMatrixMessage('Blocked by global policy for current regime.');
      return;
    }
    setMatrixMessage('');
    setPermissionFilter(permission);
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--msp-bg)', color: 'var(--msp-text)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0.9rem 1rem 2rem' }}>
        <div className="grid grid-cols-12 gap-4">
          <section className="col-span-12" style={{ borderRadius: 14, border: '1px solid var(--msp-border-strong)', background: 'var(--msp-panel)', padding: '0.9rem', display: 'grid', gap: '0.7rem' }}>
            <div style={{ fontSize: '0.78rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>
              Risk Governor
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
              <div style={{ border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.45rem 0.55rem' }}><strong>Mode:</strong> {snapshot?.risk_mode || '...'}</div>
              <div style={{ border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.45rem 0.55rem' }}><strong>Daily Risk:</strong> {snapshot ? `${snapshot.session.remaining_daily_R}R / ${snapshot.session.max_daily_R}R` : '...'}</div>
              <div style={{ border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.45rem 0.55rem' }}><strong>Open Risk:</strong> {snapshot ? `${snapshot.session.open_risk_R}R / ${snapshot.session.max_open_risk_R}R` : '...'}</div>
              <div style={{ border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.45rem 0.55rem' }}><strong>Data:</strong> {snapshot?.data_health.status || '...'}</div>
              <div style={{ border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.45rem 0.55rem' }}><strong>Add-ons:</strong> {snapshot?.caps.add_ons_allowed ? 'Enabled' : 'Disabled'}</div>
              <div style={{ border: '1px solid var(--msp-border)', borderRadius: 10, padding: '0.45rem 0.55rem' }}><strong>Risk/Trade:</strong> {snapshot ? `${(snapshot.caps.risk_per_trade * 100).toFixed(2)}%` : '...'}</div>
            </div>
            {snapshot?.global_blocks?.length ? (
              <div style={{ color: '#fca5a5', fontSize: '0.78rem' }}>⚠ {snapshot.global_blocks[0].msg}</div>
            ) : null}
            {globalLocked ? (
              <div style={{ border: '1px solid rgba(239,68,68,0.45)', borderRadius: 10, background: 'rgba(239,68,68,0.12)', color: '#fecaca', padding: '0.5rem 0.6rem', fontSize: '0.8rem', fontWeight: 800 }}>
                Execution Locked — only reduce-risk actions are available.
              </div>
            ) : null}
          </section>

          <section className="col-span-12 xl:col-span-4" style={{ borderRadius: 14, border: '1px solid var(--msp-border)', background: 'var(--msp-card)', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.65rem' }}>
              Trade Permission Matrix
            </div>
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {STRATEGIES.map((strategy) => (
                <div key={strategy} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.45rem', alignItems: 'center' }}>
                  <div style={{ color: '#cbd5e1', fontSize: '0.74rem', fontWeight: 700 }}>{strategy.replaceAll('_', ' ')}</div>
                  {DIRECTIONS.map((direction) => {
                    const permission = snapshot?.matrix?.[strategy]?.[direction] || 'BLOCK';
                    return (
                      <button
                        key={`${strategy}-${direction}`}
                        onClick={() => onMatrixCellClick(strategy, direction)}
                        style={{ ...permissionStyle(permission), borderRadius: 999, padding: '0.14rem 0.45rem', fontSize: '0.66rem', fontWeight: 800 }}
                      >
                        {direction} {permissionLabel(permission)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {matrixMessage ? <div style={{ marginTop: '0.6rem', color: '#fca5a5', fontSize: '0.74rem' }}>{matrixMessage}</div> : null}
          </section>

          <section className="col-span-12 xl:col-span-8" style={{ borderRadius: 14, border: '1px solid var(--msp-border)', background: 'var(--msp-card)', padding: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
              <div style={{ fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>
                Permission-Filtered Candidates
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {(['ALL', 'ALLOW', 'ALLOW_REDUCED', 'ALLOW_TIGHTENED', 'BLOCK'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setPermissionFilter(filter)}
                    style={{
                      border: '1px solid var(--msp-border)',
                      borderRadius: 999,
                      padding: '0.16rem 0.52rem',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: permissionFilter === filter ? '#e2e8f0' : '#94a3b8',
                      background: permissionFilter === filter ? 'rgba(30,41,59,0.95)' : 'transparent',
                    }}
                  >
                    {filter === 'ALL' ? 'ALL' : permissionLabel(filter)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {candidates.map((candidate) => {
                const p = candidate.permission;
                const blocked = globalLocked || p === 'BLOCK';
                const cta = p === 'ALLOW' ? 'Enter' : p === 'ALLOW_REDUCED' ? 'Enter (Reduced Size)' : p === 'ALLOW_TIGHTENED' ? 'Enter (Trigger Only)' : 'View Analysis';

                return (
                  <div key={candidate.symbol} style={{ border: '1px solid var(--msp-border)', borderRadius: 12, background: 'var(--msp-panel)', padding: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 800 }}>{candidate.symbol} · {candidate.structure}</div>
                      <div style={{ ...permissionStyle(p), borderRadius: 999, padding: '0.14rem 0.44rem', fontSize: '0.66rem', fontWeight: 800 }}>{permissionLabel(p)}</div>
                    </div>

                    <div style={{ marginTop: '0.35rem', color: '#94a3b8', fontSize: '0.74rem' }}>
                      {candidate.strategy_tag.replaceAll('_', ' ')} · {candidate.direction} · Confidence {candidate.confidence}%
                    </div>

                    {candidate.evaluated?.reason_codes?.length ? (
                      <div style={{ marginTop: '0.35rem', color: '#cbd5e1', fontSize: '0.72rem' }}>
                        Why: {reasonCodeCopy(candidate.evaluated.reason_codes[0])}
                      </div>
                    ) : null}

                    {candidate.evaluated ? (
                      <div style={{ marginTop: '0.28rem', color: '#94a3b8', fontSize: '0.72rem' }}>
                        Size cap: {candidate.evaluated.max_position_size} · Stop floor: {candidate.evaluated.required_stop_min_distance.toFixed(2)}
                      </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.48rem', flexWrap: 'wrap' }}>
                      <button
                        disabled={blocked}
                        style={{
                          borderRadius: 8,
                          border: blocked ? '1px solid var(--msp-border)' : '1px solid rgba(16,185,129,0.45)',
                          background: blocked ? 'rgba(30,41,59,0.45)' : 'rgba(16,185,129,0.16)',
                          color: blocked ? '#64748b' : '#6ee7b7',
                          padding: '0.32rem 0.56rem',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                        }}
                      >
                        {cta}
                      </button>
                      <button
                        disabled={globalLocked}
                        style={{
                          borderRadius: 8,
                          border: '1px solid var(--msp-border)',
                          background: 'transparent',
                          color: globalLocked ? '#64748b' : '#cbd5e1',
                          padding: '0.32rem 0.56rem',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                        }}
                      >
                        Set Alert
                      </button>
                      <Link
                        href={`/tools/markets?symbol=${candidate.symbol}`}
                        style={{
                          textDecoration: 'none',
                          borderRadius: 8,
                          border: '1px solid var(--msp-border)',
                          color: '#cbd5e1',
                          padding: '0.32rem 0.56rem',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                        }}
                      >
                        View Analysis
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
