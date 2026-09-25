'use client';

/**
 * CanonicalVerdict — the canonical engine's verdict for one symbol (lib/scoring/canonical): permission, setup type,
 * direction, grade, score, the bar it was computed on, factor pass/fail with RAW values, structural levels, and the
 * reasons for any block/watch. Primary everywhere; the legacy composite may be shown underneath as a secondary label.
 * Phase 3: no setup has a validated edge, so the card shows a "factors only" banner plus the calibrated probability of
 * target-before-invalidation and expected R (daily equity/crypto) or an "uncalibrated" label (other contexts).
 */
import type { CanonicalResult } from '@/lib/scoring/canonical/types';
import { NO_EDGE_BANNER, calibrationSummary, scoreLabel } from '@/lib/scoring/canonical/display';
import { canonicalRowStatus } from '@/lib/scoring/canonical/scannerAdapter';

const SETUP_LABEL: Record<string, string> = {
  TREND_CONTINUATION: 'Trend continuation', PULLBACK: 'Pullback', SQUEEZE: 'Squeeze', EXHAUSTION_FADE: 'Exhaustion fade', NONE: 'No setup',
};
const FACTOR_LABEL: Record<string, string> = {
  trendQuality: 'Trend quality', entryLocation: 'Entry location', volatilityRegime: 'Volatility regime', volume: 'Volume',
  momentum: 'Momentum', structureRoom: 'Structure room', pullbackLocation: 'Pullback location', momentumReset: 'Momentum reset',
  volumeDryUp: 'Volume dry-up', compression: 'Compression', directionalBias: 'Directional bias', catalystPending: 'Catalyst pending',
  quietVolume: 'Quiet volume', stretch: 'Stretch', rsiRollover: 'RSI rollover', climax: 'Climax volume', atOpposingLevel: 'At opposing level',
  trendNotAccelerating: 'Trend not accelerating',
};
export const PERMISSION_COLOR: Record<string, string> = { PASS: '#34d399', WATCH: '#fbbf24', BLOCK: '#f87171' };

function fmt(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(Number(v.toFixed(4)));
  return v;
}

export function canonicalHeadline(c: CanonicalResult): string {
  const side = c.direction === 'long' ? 'Long' : c.direction === 'short' ? 'Short' : 'No side';
  return `${c.permission} · ${SETUP_LABEL[c.setupType] ?? c.setupType} · ${side} · Grade ${c.grade} · ${scoreLabel(c)}`;
}

export default function CanonicalVerdict({ c, compact = false, legacyScore }: { c: CanonicalResult; compact?: boolean; legacyScore?: number | null }) {
  // "No setup" is the engine finding nothing tradeable on this bar, not a data block — label it as such.
  const noSetup = canonicalRowStatus(c) === 'NO_SETUP';
  const badge = noSetup ? 'NO SETUP' : c.permission;
  const color = noSetup ? '#94a3b8' : PERMISSION_COLOR[c.permission] ?? '#94a3b8';
  const reasons = [...c.blockReasons, ...c.watchReasons];
  const calib = calibrationSummary(c);
  const noEdge = !!c.scoreBasis && c.permission !== 'PASS' && c.permission !== 'BLOCK';
  return (
    <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-950/40 p-2 text-[11px] text-slate-300" data-testid="canonical-verdict">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border px-1.5 py-0.5 font-black" style={{ color, borderColor: color + '66', backgroundColor: color + '14' }} data-testid="canonical-permission">{badge}</span>
        <span className="font-bold text-white">{SETUP_LABEL[c.setupType] ?? c.setupType}</span>
        <span>{c.direction === 'long' ? 'Long' : c.direction === 'short' ? 'Short' : 'No side'}</span>
        <span className="font-black text-white">Grade {c.grade}</span>
        <span title={c.scoreBasis === 'calibrated_expectancy_percentile' ? 'Percentile of calibrated expected R among same-direction setups (display only)' : 'Factor alignment, not a probability'}>{scoreLabel(c)}</span>
        {c.sizeMultiplier < 1 && c.permission !== 'BLOCK' ? <span className="text-amber-300">size ×{c.sizeMultiplier}</span> : null}
        <span className="text-slate-500">bar {c.barDate ? c.barDate.slice(0, 10) : 'unknown'} · coverage {Math.round(c.coverage * 100)}%</span>
      </div>
      {noEdge ? <div className="mt-1 font-semibold text-amber-300/90" data-testid="canonical-no-edge">{NO_EDGE_BANNER}</div> : null}
      {calib ? <div className="mt-0.5 text-slate-400" data-testid="canonical-calibration">{calib}</div> : null}
      {reasons.length ? (
        <ul className="mt-1 list-disc pl-4 text-slate-400">
          {reasons.slice(0, compact ? 2 : 6).map((r) => <li key={r.code + r.message}><span className="font-mono text-slate-500">{r.code}</span> {r.message}</li>)}
        </ul>
      ) : null}
      {c.levels && !compact ? (
        <div className="mt-1 text-slate-400">
          Entry {fmt(c.levels.entry)} · Invalidation {fmt(c.levels.invalidation)} ({c.levels.invalidationBasis.replace('_', ' ')}) · Target {fmt(c.levels.target)} ({c.levels.targetBasis.replace('_', ' ')}) · R:R {c.levels.riskReward}
        </div>
      ) : null}
      {!compact && c.factors.length ? (
        <table className="mt-1 w-full text-left">
          <tbody>
            {c.factors.map((f) => (
              <tr key={f.name} className="border-t border-slate-800/60">
                <td className="py-0.5 pr-2">{FACTOR_LABEL[f.name] ?? f.name}</td>
                <td className="py-0.5 pr-2 font-bold" style={{ color: f.pass === null ? '#64748b' : f.pass ? '#34d399' : '#f87171' }}>{f.pass === null ? 'n/a' : f.pass ? 'pass' : 'fail'}</td>
                <td className="py-0.5 text-slate-500">{Object.entries(f.raw).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}{f.note ? ` — ${f.note}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {legacyScore != null ? <div className="mt-1 text-[10px] text-slate-500">Legacy composite (secondary): {legacyScore}</div> : null}
    </div>
  );
}
