'use client';

import React from 'react';
import type { OptionsContract, TerminalMode } from '@/types/optionsTerminal';

interface Props {
  contract: OptionsContract | null;
  spot: number;
  mode: TerminalMode;
}

/* ── Liquidity score (simple) ────────────────────────────────── */
function liquidityScore(c: OptionsContract): { label: string; color: string; score: number } {
  let s = 0;
  if (c.volume > 500) s += 30;
  else if (c.volume > 100) s += 20;
  else if (c.volume > 10) s += 10;

  if (c.openInterest > 5000) s += 30;
  else if (c.openInterest > 1000) s += 20;
  else if (c.openInterest > 100) s += 10;

  if (c.spreadPct < 2) s += 30;
  else if (c.spreadPct < 5) s += 20;
  else if (c.spreadPct < 10) s += 10;

  s += c.bid > 0 ? 10 : 0;

  if (s >= 80) return { label: 'Excellent', color: 'var(--msp-bull)', score: s };
  if (s >= 60) return { label: 'Good', color: 'var(--msp-accent)', score: s };
  if (s >= 40) return { label: 'Fair', color: 'var(--msp-warn)', score: s };
  return { label: 'Poor', color: 'var(--msp-bear)', score: s };
}

export default function ContractInspectorPanel({ contract, spot, mode }: Props) {
  if (!contract) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full rounded-xl border p-6 text-center"
        style={{ background: 'var(--msp-card)', borderColor: 'var(--msp-border)' }}
      >
        <div className="text-3xl mb-3">📋</div>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--msp-text-muted)' }}>
          No contract selected
        </p>
        <p className="text-xs" style={{ color: 'var(--msp-text-faint)' }}>
          Click any cell in the chain to inspect
        </p>
      </div>
    );
  }

  const c = contract;
  const liq = liquidityScore(c);
  const typeColor = c.type === 'call' ? 'var(--msp-bull)' : 'var(--msp-bear)';
  const moneyness = c.itm ? 'ITM' : 'OTM';

  return (
    <div
      className="flex flex-col gap-3 h-full overflow-y-auto rounded-xl border p-4"
      style={{ background: 'var(--msp-card)', borderColor: 'var(--msp-border)' }}
    >
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-black uppercase px-2 py-0.5 rounded"
            style={{ background: c.type === 'call' ? 'var(--msp-bull-tint)' : 'var(--msp-bear-tint)', color: typeColor }}
          >
            {c.type}
          </span>
          <span className="text-xs font-mono font-bold" style={{ color: 'var(--msp-text)' }}>
            ${c.strike.toFixed(2)}
          </span>
        </div>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: c.itm ? 'var(--msp-accent-glow)' : 'rgba(255,255,255,0.06)',
            color: c.itm ? 'var(--msp-accent)' : 'var(--msp-text-faint)',
          }}
        >
          {moneyness}
        </span>
      </div>

      {/* ── Contract Summary ─────────────────────────────── */}
      <div className="rounded-lg p-3" style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)' }}>
        <h4 className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--msp-text-faint)' }}>
          Contract Summary
        </h4>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
          <Row label="Expiry" value={c.expiration} />
          <Row label="Mark" value={`$${c.mark.toFixed(2)}`} />
          <Row label="Bid" value={`$${c.bid.toFixed(2)}`} />
          <Row label="Ask" value={`$${c.ask.toFixed(2)}`} />
          <Row label="Spread" value={`$${c.spread.toFixed(2)} (${c.spreadPct.toFixed(1)}%)`} />
          <Row label="Volume" value={c.volume.toLocaleString()} />
          <Row label="Open Interest" value={c.openInterest.toLocaleString()} />
          <Row label="IV" value={`${(c.iv * 100).toFixed(1)}%`} />
        </div>
      </div>

      {/* ── Greeks ────────────────────────────────────────── */}
      <div className="rounded-lg p-3" style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)' }}>
        <h4 className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--msp-text-faint)' }}>
          Greeks
        </h4>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
          <GreekRow label="Delta (Δ)" value={c.delta} decimals={4} />
          <GreekRow label="Theta (Θ)" value={c.theta} decimals={4} />
          <GreekRow label="Gamma (Γ)" value={c.gamma} decimals={5} show={mode === 'institutional'} />
          <GreekRow label="Vega" value={c.vega} decimals={4} show={mode === 'institutional'} />
          <GreekRow label="Rho" value={c.rho} decimals={4} show={mode === 'institutional'} />
        </div>
        {mode === 'retail' && (
          <p className="text-[9px] mt-2 italic" style={{ color: 'var(--msp-text-faint)' }}>
            Switch to Institutional mode for Γ, Vega, Rho
          </p>
        )}
      </div>

      {/* ── Liquidity ────────────────────────────────────── */}
      <div className="rounded-lg p-3" style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)' }}>
        <h4 className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--msp-text-faint)' }}>
          Liquidity Score
        </h4>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${liq.score}%`, background: liq.color }}
            />
          </div>
          <span className="text-xs font-bold" style={{ color: liq.color }}>{liq.label}</span>
        </div>
        {mode === 'institutional' && (
          <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-center">
            <div>
              <div style={{ color: 'var(--msp-text-faint)' }}>Spread%</div>
              <div className="font-mono font-bold" style={{ color: c.spreadPct < 3 ? 'var(--msp-bull)' : c.spreadPct < 8 ? 'var(--msp-warn)' : 'var(--msp-bear)' }}>
                {c.spreadPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--msp-text-faint)' }}>Vol/OI</div>
              <div className="font-mono font-bold" style={{ color: 'var(--msp-text)' }}>
                {c.openInterest > 0 ? (c.volume / c.openInterest).toFixed(2) : '—'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--msp-text-faint)' }}>Bid Size</div>
              <div className="font-mono font-bold" style={{ color: 'var(--msp-text)' }}>—</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Actions ────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 mt-auto">
        <button
          className="w-full text-xs font-bold rounded-lg py-2 transition-all"
          style={{ background: 'var(--msp-accent-glow)', color: 'var(--msp-accent)', border: '1px solid var(--msp-accent)' }}
        >
          + Add to Watchlist
        </button>
        <button
          className="w-full text-xs font-bold rounded-lg py-2 transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--msp-text-muted)', border: '1px solid var(--msp-border)' }}
        >
          💾 Save Play
        </button>
        <button
          className="w-full text-xs font-bold rounded-lg py-2 transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--msp-text-muted)', border: '1px solid var(--msp-border)' }}
        >
          📝 Create Trade Plan
        </button>
      </div>
    </div>
  );
}

/* ── Small helper components ─────────────────────────────────── */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: 'var(--msp-text-faint)' }}>{label}</span>
      <span className="font-mono text-right" style={{ color: 'var(--msp-text)' }}>{value}</span>
    </>
  );
}

function GreekRow({ label, value, decimals = 4, show = true }: { label: string; value: number; decimals?: number; show?: boolean }) {
  if (!show) return null;
  const color = value > 0 ? 'var(--msp-bull)' : value < 0 ? 'var(--msp-bear)' : 'var(--msp-text)';
  return (
    <>
      <span style={{ color: 'var(--msp-text-faint)' }}>{label}</span>
      <span className="font-mono text-right" style={{ color }}>{value.toFixed(decimals)}</span>
    </>
  );
}
