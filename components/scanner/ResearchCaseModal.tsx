'use client';

import React, { useCallback, useMemo } from 'react';

/* ─── Types ─── */

/** Anything the bulk scanner returns per pick — loosely typed since the API shape varies by scan mode */
export interface ScanPick {
  symbol: string;
  score: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  signals?: { bullish: number; bearish: number; neutral: number };
  change24h?: number;
  indicators?: Record<string, any>;
  derivatives?: {
    openInterest?: number;
    fundingRate?: number;
    longShortRatio?: number;
    oiChangePercent?: number;
    basisPercent?: number;
  };
  enhancements?: Record<string, any>;
}

interface ResearchCaseModalProps {
  pick: ScanPick;
  assetType: string;
  timeframe: string;
  onClose: () => void;
}

/* ─── Helpers ─── */

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function fmtPrice(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1) return `$${n.toFixed(6)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function dirLabel(d?: string): string {
  if (d === 'bullish') return 'LONG';
  if (d === 'bearish') return 'SHORT';
  return 'NEUTRAL';
}

function qualityLabel(score: number): string {
  if (score >= 70) return 'HIGH';
  if (score >= 55) return 'MEDIUM';
  return 'LOW';
}

function regimeFromADX(adx?: number): string {
  if (adx == null || !Number.isFinite(adx)) return 'Unknown';
  if (adx >= 30) return 'Strong Trend';
  if (adx >= 20) return 'Trending';
  return 'Range / Consolidation';
}

function setupType(ind: Record<string, any>, changePct: number): string {
  const adx = Number(ind.adx);
  const rsi = Number(ind.rsi);
  if (rsi > 70 || rsi < 30) return 'Mean Reversion';
  if (adx >= 30 && Math.abs(changePct) > 2) return 'Breakout';
  if (adx >= 20) return 'Trend Continuation';
  return 'Range Play';
}

function computeEntry(price: number, dir: string, atr: number): number {
  return dir === 'bearish' ? price + atr * 0.3 : price - atr * 0.3;
}

function computeStop(price: number, dir: string, atr: number): number {
  return dir === 'bearish' ? price + atr * 1.5 : price - atr * 1.5;
}

function computeTargets(price: number, dir: string, atr: number): number[] {
  const sign = dir === 'bearish' ? -1 : 1;
  return [price + sign * atr, price + sign * atr * 2, price + sign * atr * 3];
}

/* ─── Component ─── */

export default function ResearchCaseModal({ pick, assetType, timeframe, onClose }: ResearchCaseModalProps) {
  const ind = pick.indicators || {};
  const price = Number(ind.price) || 0;
  const atr = Number(ind.atr) || price * 0.02;
  const dir = pick.direction || 'neutral';
  const changePct = Number(pick.change24h) || 0;
  const quality = qualityLabel(pick.score);

  const setup = useMemo(() => setupType(ind, changePct), [ind, changePct]);
  const entry = useMemo(() => computeEntry(price, dir, atr), [price, dir, atr]);
  const stop = useMemo(() => computeStop(price, dir, atr), [price, dir, atr]);
  const targets = useMemo(() => computeTargets(price, dir, atr), [price, dir, atr]);
  const rr = useMemo(() => {
    const risk = Math.abs(price - stop);
    const reward = Math.abs(targets[1] - price);
    return risk > 0 ? reward / risk : 0;
  }, [price, stop, targets]);

  const thesis = useMemo(() => {
    const dirWord = dir === 'bullish' ? 'bullish' : dir === 'bearish' ? 'bearish' : 'neutral';
    let t = `${pick.symbol} shows a ${dirWord} ${setup.toLowerCase()} setup on the ${timeframe} timeframe.`;
    const rsi = Number(ind.rsi);
    const adx = Number(ind.adx);
    if (Number.isFinite(rsi)) t += ` RSI at ${rsi.toFixed(0)} ${rsi > 55 ? 'supports momentum' : rsi < 45 ? 'indicates weakness' : 'is neutral'}.`;
    if (Number.isFinite(adx) && adx > 25) t += ` ADX at ${adx.toFixed(0)} confirms trending conditions.`;
    if (pick.derivatives?.fundingRate != null) {
      t += ` Funding rate at ${pick.derivatives.fundingRate.toFixed(4)}% ${pick.derivatives.fundingRate > 0.03 ? '(crowd long — contrarian lean)' : pick.derivatives.fundingRate < -0.03 ? '(crowd short — contrarian lean)' : '(neutral)'}.`;
    }
    return t;
  }, [pick, ind, dir, setup, timeframe]);

  const invalidation = useMemo(() => {
    return `Thesis invalid if price ${dir === 'bearish' ? 'closes above' : 'closes below'} ${fmtPrice(stop)} with volume confirmation.`;
  }, [dir, stop]);

  // ── Confluence evidence ──
  const evidence = useMemo(() => {
    const items: { label: string; value: string; verdict: 'bull' | 'bear' | 'neutral' }[] = [];
    const rsi = Number(ind.rsi);
    if (Number.isFinite(rsi)) items.push({ label: 'RSI (14)', value: rsi.toFixed(0), verdict: rsi > 55 ? 'bull' : rsi < 45 ? 'bear' : 'neutral' });
    const adx = Number(ind.adx);
    if (Number.isFinite(adx)) items.push({ label: 'ADX', value: adx.toFixed(0), verdict: adx > 25 ? 'bull' : 'neutral' });
    const macd = Number(ind.macd);
    if (Number.isFinite(macd)) items.push({ label: 'MACD', value: macd.toFixed(3), verdict: macd > 0 ? 'bull' : 'bear' });
    const stoch = Number(ind.stochK);
    if (Number.isFinite(stoch)) items.push({ label: 'Stochastic K', value: stoch.toFixed(0), verdict: stoch > 80 ? 'bear' : stoch < 20 ? 'bull' : 'neutral' });
    const cci = Number(ind.cci);
    if (Number.isFinite(cci)) items.push({ label: 'CCI', value: cci.toFixed(0), verdict: cci > 100 ? 'bull' : cci < -100 ? 'bear' : 'neutral' });
    if (pick.signals) {
      const total = pick.signals.bullish + pick.signals.bearish + pick.signals.neutral;
      if (total > 0) {
        const pctBull = ((pick.signals.bullish / total) * 100).toFixed(0);
        const pctBear = ((pick.signals.bearish / total) * 100).toFixed(0);
        items.push({ label: 'Signal Split', value: `↑${pctBull}% ↓${pctBear}%`, verdict: pick.signals.bullish > pick.signals.bearish ? 'bull' : pick.signals.bearish > pick.signals.bullish ? 'bear' : 'neutral' });
      }
    }
    if (pick.derivatives?.fundingRate != null) {
      items.push({ label: 'Funding Rate', value: `${pick.derivatives.fundingRate.toFixed(4)}%`, verdict: pick.derivatives.fundingRate > 0.03 ? 'bear' : pick.derivatives.fundingRate < -0.03 ? 'bull' : 'neutral' });
    }
    if (pick.derivatives?.openInterest) {
      const oi = pick.derivatives.openInterest;
      items.push({ label: 'Open Interest', value: oi >= 1e9 ? `$${(oi / 1e9).toFixed(2)}B` : `$${(oi / 1e6).toFixed(1)}M`, verdict: 'neutral' });
    }
    return items;
  }, [ind, pick]);

  const bullCount = evidence.filter(e => e.verdict === 'bull').length;
  const bearCount = evidence.filter(e => e.verdict === 'bear').length;
  const confluenceVerdict = bullCount > bearCount ? 'Supportive' : bearCount > bullCount ? 'Opposing' : 'Mixed';

  // ── CSV export ──
  const exportCSV = useCallback(() => {
    const rows: string[][] = [
      ['RESEARCH CASE', pick.symbol, new Date().toISOString()],
      [],
      ['THESIS'],
      [thesis],
      [],
      ['SETUP'],
      ['Type', setup],
      ['Direction', dirLabel(dir)],
      ['Score', String(pick.score)],
      ['Quality', quality],
      ['Timeframe', timeframe],
      ['Asset Type', assetType],
      [],
      ['RISK PARAMETERS'],
      ['Current Price', fmtPrice(price)],
      ['Entry', fmtPrice(entry)],
      ['Stop Loss', fmtPrice(stop)],
      ['Target 1', fmtPrice(targets[0])],
      ['Target 2', fmtPrice(targets[1])],
      ['Target 3', fmtPrice(targets[2])],
      ['Risk:Reward', `${rr.toFixed(1)}:1`],
      ['ATR', fmt(atr)],
      [],
      ['CONFLUENCE EVIDENCE'],
      ['Indicator', 'Value', 'Verdict'],
      ...evidence.map(e => [e.label, e.value, e.verdict]),
      [],
      ['CONFLUENCE SUMMARY'],
      ['Verdict', confluenceVerdict],
      ['Bullish Factors', String(bullCount)],
      ['Bearish Factors', String(bearCount)],
      [],
      ['MARKET CONTEXT'],
      ['Regime', regimeFromADX(Number(ind.adx))],
      ['24h Change', `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`],
      [],
      ['INVALIDATION'],
      [invalidation],
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-case-${pick.symbol}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pick, thesis, setup, dir, quality, timeframe, assetType, price, entry, stop, targets, rr, atr, evidence, confluenceVerdict, bullCount, bearCount, ind, changePct, invalidation]);

  // ── Verdict color ──
  const verdictColor = (v: 'bull' | 'bear' | 'neutral') =>
    v === 'bull' ? 'var(--msp-bull)' : v === 'bear' ? 'var(--msp-bear)' : 'var(--msp-text-muted)';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '16px' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--msp-bg)',
          border: '1px solid var(--msp-border)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px 16px', borderBottom: '1px solid var(--msp-border)',
          position: 'sticky', top: 0, background: 'var(--msp-bg)', zIndex: 1, borderRadius: '16px 16px 0 0',
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--msp-text)' }}>
              📋 Research Case — {pick.symbol}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--msp-text-faint)', marginTop: '2px' }}>
              Generated {new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={exportCSV}
              style={{
                padding: '6px 14px', fontSize: '12px', fontWeight: '600',
                background: 'var(--msp-accent-tint)', color: 'var(--msp-accent)',
                border: '1px solid var(--msp-accent)', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 10px', fontSize: '14px', fontWeight: '600',
                background: 'transparent', color: 'var(--msp-text-muted)',
                border: '1px solid var(--msp-border)', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* ── Permission Badge ── */}
          <div style={{
            display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px',
            padding: '14px 16px', borderRadius: '12px',
            background: pick.score >= 70 ? 'rgba(16,185,129,0.08)' : pick.score >= 55 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${pick.score >= 70 ? 'var(--msp-bull)' : pick.score >= 55 ? 'var(--msp-warn)' : 'var(--msp-bear)'}`,
          }}>
            <div style={{
              fontSize: '28px', fontWeight: '800',
              color: pick.score >= 70 ? 'var(--msp-bull)' : pick.score >= 55 ? 'var(--msp-warn)' : 'var(--msp-bear)',
            }}>
              {pick.score}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--msp-text)' }}>
                {dirLabel(dir)} — {quality} Quality — {setup}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--msp-text-muted)', marginTop: '2px' }}>
                {pick.score >= 70 ? 'TRADE — conditions support entry' : pick.score >= 55 ? 'WATCH — monitor for strengthening' : 'NO TRADE — insufficient confluence'}
              </div>
            </div>
          </div>

          {/* ── Thesis ── */}
          <Section title="Setup Thesis">
            <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--msp-text)', margin: 0 }}>
              {thesis}
            </p>
          </Section>

          {/* ── Risk Parameters ── */}
          <Section title="Risk Parameters">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <KV label="Reference Level" value={fmtPrice(entry)} />
              <KV label="Invalidation Level" value={fmtPrice(stop)} accent="var(--msp-bear)" />
              <KV label="Key Level 1 (1R)" value={fmtPrice(targets[0])} accent="var(--msp-bull)" />
              <KV label="Key Level 2 (2R)" value={fmtPrice(targets[1])} accent="var(--msp-bull)" />
              <KV label="Key Level 3 (3R)" value={fmtPrice(targets[2])} accent="var(--msp-bull)" />
              <KV label="Risk : Reward" value={`${rr.toFixed(1)} : 1`} accent={rr >= 2 ? 'var(--msp-bull)' : rr >= 1 ? 'var(--msp-warn)' : 'var(--msp-bear)'} />
            </div>
          </Section>

          {/* ── Confluence Evidence ── */}
          <Section title={`Confluence Evidence — ${confluenceVerdict}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {evidence.map((e, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', borderRadius: '6px',
                  background: 'var(--msp-panel)',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--msp-text-muted)' }}>{e.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: verdictColor(e.verdict) }}>{e.value}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Market Context ── */}
          <Section title="Market Context">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <KV label="Regime" value={regimeFromADX(Number(ind.adx))} />
              <KV label="Timeframe" value={timeframe} />
              <KV label="Asset Type" value={assetType} />
              <KV label="24h Change" value={`${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`} accent={changePct > 0 ? 'var(--msp-bull)' : changePct < 0 ? 'var(--msp-bear)' : undefined} />
              {Number.isFinite(Number(ind.atr_percent)) && <KV label="ATR %" value={`${Number(ind.atr_percent).toFixed(1)}%`} />}
              <KV label="Volume" value={Number.isFinite(Number(ind.volume)) ? (Number(ind.volume) >= 1e6 ? `$${(Number(ind.volume) / 1e6).toFixed(1)}M` : `$${Number(ind.volume).toLocaleString()}`) : '—'} />
            </div>
          </Section>

          {/* ── Derivatives (crypto only) ── */}
          {pick.derivatives && (
            <Section title="Derivatives Data">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {pick.derivatives.openInterest != null && <KV label="Open Interest" value={pick.derivatives.openInterest >= 1e9 ? `$${(pick.derivatives.openInterest / 1e9).toFixed(2)}B` : `$${(pick.derivatives.openInterest / 1e6).toFixed(1)}M`} />}
                {pick.derivatives.fundingRate != null && <KV label="Funding Rate" value={`${pick.derivatives.fundingRate.toFixed(4)}%`} accent={pick.derivatives.fundingRate > 0.03 ? 'var(--msp-bear)' : pick.derivatives.fundingRate < -0.03 ? 'var(--msp-bull)' : undefined} />}
                {pick.derivatives.longShortRatio != null && <KV label="Long/Short Ratio" value={pick.derivatives.longShortRatio.toFixed(2)} />}
                {pick.derivatives.basisPercent != null && <KV label="Basis" value={`${pick.derivatives.basisPercent.toFixed(3)}%`} />}
              </div>
            </Section>
          )}

          {/* ── Invalidation ── */}
          <Section title="Invalidation Conditions">
            <div style={{
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--msp-text)',
            }}>
              ⚠️ {invalidation}
            </div>
          </Section>

          {/* ── Disclaimer ── */}
          <div style={{
            fontSize: '10px', color: 'var(--msp-text-faint)', textAlign: 'center',
            padding: '12px 0 0', borderTop: '1px solid var(--msp-border)', marginTop: '16px',
          }}>
            This research case is for informational purposes only. Not financial advice.
            Past performance does not guarantee future results.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Reusable sub-components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em',
        color: 'var(--msp-text-faint)', marginBottom: '8px',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px', background: 'var(--msp-panel)',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--msp-text-faint)', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: '600', color: accent || 'var(--msp-text)' }}>{value}</div>
    </div>
  );
}
