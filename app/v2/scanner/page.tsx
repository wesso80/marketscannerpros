'use client';

/* ---------------------------------------------------------------------------
   UNIFIED SCANNER HUB — V2 Ranked + V1 Pro Scanner on one page
   Toggle between auto-loading regime-aware ranking and manual pro scan.
   Click any symbol for inline analysis with Backtest / Alert / Watchlist.
   --------------------------------------------------------------------------- */

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useV2 } from '../_lib/V2Context';
import { useScannerResults, useRegime, type ScanResult, type ScanTimeframe, SCAN_TIMEFRAMES } from '../_lib/api';
import { Card, SectionHeader, Badge } from '../_components/ui';
import { REGIME_COLORS, REGIME_WEIGHTS, LIFECYCLE_COLORS } from '../_lib/constants';
import type { RegimePriority, LifecycleState } from '../_lib/types';
import { useUserTier, FREE_DAILY_SCAN_LIMIT, canAccessUnlimitedScanning } from '@/lib/useUserTier';
import ScreenerTable, { type ScreenerRow } from '@/components/scanner/ScreenerTable';
import ScanTemplatesBar, { type ScanTemplate, SCAN_TEMPLATES } from '@/components/scanner/ScanTemplatesBar';

/* ─── Helpers ─── */
function dirColor(d?: string) {
  if (d === 'bullish') return '#10B981';
  if (d === 'bearish') return '#EF4444';
  return '#94A3B8';
}
function formatPrice(p: number | undefined | null) {
  if (p == null) return '—';
  return p < 1 ? `$${p.toFixed(4)}` : `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TABS = ['All', 'Equities', 'Crypto', 'Bullish', 'Bearish', 'High Score', 'DVE Signals', 'Regime Match'] as const;
type SortKey = 'symbol' | 'score' | 'direction' | 'confidence' | 'rsi' | 'price' | 'dveBbwp' | 'mspScore';
type SortDir = 'asc' | 'desc';

/* ─── Phase 2: Regime-Weighted MSP Score ─── */
function computeMspScore(r: ScanResult, regime: string): number {
  const w = REGIME_WEIGHTS[regime] || REGIME_WEIGHTS.trend;
  // Normalize each component to 0-100 scale
  const structure = Math.min(100, Math.max(0, Math.abs(r.score ?? 0) * 10));
  const momentum = Math.min(100, Math.max(0, r.confidence ?? (Math.abs(r.score ?? 0) * 8)));
  const volatility = r.dveBbwp != null
    ? (r.dveBbwp < 20 ? 80 + (20 - r.dveBbwp) : r.dveBbwp > 80 ? 70 + (r.dveBbwp - 80) : 30 + r.dveBbwp * 0.3)
    : 40;
  const options = r.derivatives ? Math.min(100, 50 + Math.abs(r.derivatives.fundingRate ?? 0) * 500) : 30;
  const time = r.scoreV2?.acl?.confidence ?? 50;
  const raw = (structure * w.structure + momentum * w.momentum + volatility * w.volatility + options * w.options + time * w.time) / 100;
  // Apply regime gating penalty
  if (r.scoreV2?.regimeScore?.gated) return Math.max(0, raw * 0.4);
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/* ─── Phase 6: Trade Lifecycle State ─── */
function deriveLifecycleState(r: ScanResult, regime: string): LifecycleState {
  const msp = computeMspScore(r, regime);
  const conf = r.confidence ?? 0;
  const gated = r.scoreV2?.regimeScore?.gated;
  if (gated) return 'INVALIDATED';
  if (msp >= 75 && conf >= 65) return 'READY';
  if (msp >= 55 && conf >= 45) return 'SETTING_UP';
  if (msp >= 35) return 'WATCHING';
  return 'DISCOVERED';
}
type ScannerMode = 'ranked' | 'pro';
type AssetClass = 'crypto' | 'equity' | 'forex';
type ScanDepth = 'light' | 'deep';

/* ─── Detail data from /api/scanner/run ─── */
interface SymbolDetail {
  symbol: string;
  score: number;
  direction?: string;
  price?: number;
  rsi?: number;
  adx?: number;
  atr?: number;
  ema200?: number;
  stoch_k?: number;
  stoch_d?: number;
  cci?: number;
  macd_hist?: number;
  volume?: number;
  confidence?: number;
  setup?: string;
  signals?: { bullish: number; bearish: number; neutral: number };
  institutionalFilter?: {
    recommendation?: string;
    noTrade?: boolean;
    finalGrade?: string;
    finalScore?: number;
    filters?: { label: string; status: string }[];
  };
  capitalFlow?: any;
}

/* ─── Watchlist add helper ─── */
async function addToWatchlist(symbol: string, assetType: string, price?: number): Promise<string> {
  const wlRes = await fetch('/api/watchlists');
  const wlData = await wlRes.json();
  if (!wlRes.ok) throw new Error(wlData?.error || 'Failed to load watchlists');
  let target = wlData?.watchlists?.find((l: any) => l.is_default) || wlData?.watchlists?.[0];
  if (!target) {
    const createRes = await fetch('/api/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Watchlist', description: 'Auto-created from scanner', color: 'emerald', icon: 'star' }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData?.error || 'Failed to create watchlist');
    target = createData?.watchlist;
  }
  const addRes = await fetch('/api/watchlists/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlistId: target.id, symbol, assetType, addedPrice: price }),
  });
  const addData = await addRes.json();
  if (!addRes.ok) throw new Error(addData?.error || 'Failed to add to watchlist');
  return target.name;
}

/* ─── Inline Detail Panel ─── */
function SymbolDetailPanel({ detail, timeframeLabel, onClose, assetType }: {
  detail: SymbolDetail;
  timeframeLabel: string;
  onClose: () => void;
  assetType: string;
}) {
  const [flashMsg, setFlashMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const direction = detail.direction || 'neutral';
  const confidence = detail.confidence ?? Math.min(99, Math.max(10, Math.round(detail.score)));
  const quality = confidence >= 70 ? 'HIGH' : confidence >= 50 ? 'MEDIUM' : 'LOW';
  const adx = detail.adx ?? 0;
  const atrPercent = detail.atr && detail.price ? (detail.atr / detail.price) * 100 : 0;
  const regime = adx >= 30 ? 'Trending' : adx < 20 ? 'Range' : 'Transitional';

  const trendAligned = (detail.signals?.bullish ?? 0) > (detail.signals?.bearish ?? 0) && direction === 'bullish'
    || (detail.signals?.bearish ?? 0) > (detail.signals?.bullish ?? 0) && direction === 'bearish';
  const momentumAligned = detail.rsi != null && ((direction === 'bullish' && detail.rsi > 45) || (direction === 'bearish' && detail.rsi < 55));
  const flowAligned = direction === 'bullish'
    ? (detail.signals?.bullish ?? 0) >= (detail.signals?.neutral ?? 0)
    : direction === 'bearish'
      ? (detail.signals?.bearish ?? 0) >= (detail.signals?.neutral ?? 0)
      : false;
  const tfAlignment = [trendAligned, momentumAligned, flowAligned, direction !== 'neutral'].filter(Boolean).length;

  const entry = detail.price != null
    ? (direction === 'bullish' ? detail.price + (detail.atr ?? 0) * 0.2 : direction === 'bearish' ? detail.price - (detail.atr ?? 0) * 0.2 : detail.price) : null;
  const stop = detail.price != null
    ? (direction === 'bullish' ? detail.price - (detail.atr ?? 0) * 0.8 : direction === 'bearish' ? detail.price + (detail.atr ?? 0) * 0.8 : detail.price) : null;
  const target1 = detail.price != null
    ? (direction === 'bullish' ? detail.price + (detail.atr ?? 0) * 1.2 : direction === 'bearish' ? detail.price - (detail.atr ?? 0) * 1.2 : detail.price) : null;
  const target2 = detail.price != null
    ? (direction === 'bullish' ? detail.price + (detail.atr ?? 0) * 2.0 : direction === 'bearish' ? detail.price - (detail.atr ?? 0) * 2.0 : detail.price) : null;
  const rr = entry != null && stop != null && target1 != null
    ? Math.max(0, Math.abs(target1 - entry) / Math.max(0.0001, Math.abs(entry - stop))) : null;

  const recommendation = detail.institutionalFilter?.recommendation;
  const tradeReady = recommendation === 'TRADE_READY' && quality !== 'LOW' && direction !== 'neutral';
  const executionStatus = tradeReady ? 'HIGH CONVICTION' : quality === 'MEDIUM' && direction !== 'neutral' ? 'MODERATE SETUP' : 'LOW SETUP — REVIEW';
  const statusColor = tradeReady ? '#10B981' : quality === 'MEDIUM' && direction !== 'neutral' ? '#F59E0B' : '#EF4444';
  const confBarColor = confidence >= 70 ? '#10B981' : confidence >= 55 ? '#F59E0B' : '#EF4444';

  const blockReasons = tradeReady
    ? ['Structure aligned', direction === 'bullish' ? 'Bias: Long' : direction === 'bearish' ? 'Bias: Short' : 'Bias: Neutral']
    : [quality === 'LOW' ? 'Quality below threshold' : null, !trendAligned ? 'Structure incomplete' : null, atrPercent >= 3 ? 'Volatility mismatch' : null].filter(Boolean) as string[];

  const handleAddToWatchlist = async () => {
    try {
      const name = await addToWatchlist(detail.symbol, assetType, detail.price);
      setFlashMsg({ text: `${detail.symbol} added to ${name}`, type: 'success' });
    } catch (e: any) {
      setFlashMsg({ text: e?.message || 'Failed', type: 'error' });
    }
    setTimeout(() => setFlashMsg(null), 3000);
  };

  return (
    <div className="space-y-4 mt-4">
      {flashMsg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${flashMsg.type === 'success' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-300 border' : 'border-rose-500/40 bg-rose-950/90 text-rose-300 border'}`}>
          {flashMsg.text}
          <button type="button" onClick={() => setFlashMsg(null)} className="ml-3 text-xs opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <Link href={`/tools/scanner/backtest?symbol=${encodeURIComponent(detail.symbol)}`}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-emerald-400 no-underline hover:bg-emerald-500/20 transition-colors">
          Backtest This Symbol
        </Link>
        <button type="button" onClick={onClose}
          className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">
          Back to Rank
        </button>
      </div>

      {/* Header row */}
      <div className="grid gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:grid-cols-12 md:p-4">
        <div className="md:col-span-6">
          <div className="text-[1.05rem] font-black tracking-tight text-white md:text-[1.25rem]">{detail.symbol} — {timeframeLabel}</div>
          <div className={`mt-1 text-[0.82rem] font-extrabold uppercase ${direction === 'bullish' ? 'text-emerald-400' : direction === 'bearish' ? 'text-red-400' : 'text-amber-400'}`}>
            Edge: {direction.toUpperCase()}
          </div>
          <div className="mt-1 text-[0.76rem] font-bold uppercase tracking-[0.06em] text-slate-400">
            Mode: {direction === 'bullish' ? 'Trend Continuation' : direction === 'bearish' ? 'Trend Reversal Watch' : 'Wait for Structure'}
          </div>
          <div className="mt-2 text-[0.74rem] text-slate-400">
            Regime: <span className="font-bold text-white">{regime}</span> · Timeframe Alignment: <span className="font-bold text-white">{tfAlignment} / 4</span>
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Setup Quality</div>
          <div className="mt-1 text-[1.25rem] font-black text-white md:text-[1.45rem]">{confidence >= 75 ? 'A' : confidence >= 60 ? 'B' : confidence >= 45 ? 'C' : 'D'} Setup</div>
          <div className="text-[0.72rem] font-semibold text-slate-400">{confidence}% · {quality}</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div style={{ width: `${confidence}%`, background: confBarColor, height: '100%' }} />
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="rounded-lg border p-3" style={{ borderColor: statusColor + '66', background: 'var(--msp-panel-2)' }}>
            <div className="text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Trade Readiness</div>
            <div className="mt-1 text-[0.88rem] font-black uppercase" style={{ color: statusColor }}>{executionStatus}</div>
            <div className="mt-2 grid gap-1 text-[0.72rem] text-slate-400">
              {blockReasons.map(r => <div key={r}>• {r}</div>)}
            </div>
            {!tradeReady && (
              <div className="mt-2 text-[0.72rem] font-extrabold uppercase" style={{ color: statusColor }}>
                ADVISORY: QUALITY {quality} — REVIEW STRUCTURE
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analysis grid */}
      <div className="grid gap-3 md:grid-cols-12">
        {/* Structure Analysis */}
        <div className="md:col-span-7 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:p-4">
          <div className="mb-3 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Structure Analysis</div>
          <div className="grid gap-3">
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Trend Alignment</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Higher TF: <span className={`font-bold ${trendAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{trendAligned ? direction.toUpperCase() : 'NEUTRAL'}</span></div>
                <div>Mid TF: <span className={`font-bold ${momentumAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{momentumAligned ? direction.toUpperCase() : 'NEUTRAL'}</span></div>
                <div>Lower TF: <span className={`font-bold ${flowAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{flowAligned ? direction.toUpperCase() : 'MIXED'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Momentum State</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>RSI: <span className="font-bold text-white">{detail.rsi != null ? detail.rsi.toFixed(1) : 'N/A'}</span></div>
                <div>ADX: <span className={`font-bold ${adx >= 25 ? 'text-emerald-400' : adx >= 20 ? 'text-amber-400' : 'text-red-400'}`}>{adx.toFixed(1)}</span></div>
                <div>Flow: <span className={`font-bold ${flowAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{flowAligned ? 'Aligned' : 'Divergent'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Volatility &amp; Liquidity</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Volatility: <span className={`font-bold ${atrPercent >= 3 ? 'text-red-400' : atrPercent >= 1.5 ? 'text-amber-400' : 'text-emerald-400'}`}>{atrPercent >= 3 ? 'High' : atrPercent >= 1.5 ? 'Medium' : 'Controlled'}</span></div>
                <div>Range Compression: <span className={`font-bold ${atrPercent <= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>{atrPercent <= 1.5 ? 'Yes' : 'No'}</span></div>
                <div>Liquidity: <span className="font-bold text-white">{detail.volume ? 'Building' : 'Normal'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Structure Integrity</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Break Level: <span className="font-bold text-white">{entry != null ? entry.toFixed(2) : 'N/A'}</span></div>
                <div>Pullback Depth: <span className="font-bold text-white">{detail.atr != null && detail.price ? `${Math.min(99, Math.round((detail.atr / detail.price) * 100 * 18))}%` : 'N/A'}</span></div>
                <div>Pattern: <span className="font-bold text-white">{trendAligned ? 'Trend continuation' : 'Structure forming'}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Execution Plan */}
        <div className="md:col-span-5 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:p-4">
          <div className="mb-3 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Execution Plan</div>
          <div className="grid gap-3">
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Entry Trigger</div>
              <div>Entry: <span className="font-bold text-white">{entry != null ? entry.toFixed(2) : 'N/A'}</span></div>
              <div>Trigger: <span className="font-bold text-white">{direction === 'bullish' ? 'Close above trigger' : direction === 'bearish' ? 'Close below trigger' : 'Await directional break'}</span></div>
              <div>Confirmation: <span className="font-bold text-white">Volume expansion</span></div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Risk Parameters</div>
              <div>Stop: <span className="font-bold text-red-400">{stop != null ? stop.toFixed(2) : 'N/A'}</span></div>
              <div>Target 1: <span className="font-bold text-emerald-400">{target1 != null ? target1.toFixed(2) : 'N/A'}</span></div>
              <div>Target 2: <span className="font-bold text-emerald-400">{target2 != null ? target2.toFixed(2) : 'N/A'}</span></div>
              <div>R:R: <span className={`font-bold ${rr != null && rr >= 1.8 ? 'text-emerald-400' : 'text-amber-400'}`}>{rr != null ? rr.toFixed(1) : 'N/A'}</span></div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Risk Governor</div>
              <div>Capital Allocation: <span className={`font-bold ${tradeReady ? 'text-emerald-400' : 'text-amber-400'}`}>{tradeReady ? '0.5% risk' : 'Review sizing'}</span></div>
              <div>Active Constraint: <span className="font-bold text-white">{tradeReady ? 'Tactical sizing' : 'Risk constraints active'}</span></div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Link href={`/tools/alerts?symbol=${encodeURIComponent(detail.symbol)}&price=${detail.price || ''}&direction=${direction}`}
                className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-slate-400 no-underline hover:bg-slate-700/50 transition-colors">
                Set Alert
              </Link>
              <button type="button" onClick={handleAddToWatchlist}
                className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-slate-400 hover:bg-slate-700/50 transition-colors">
                Add to Watchlist
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function ScannerPage() {
  const { navigateTo, selectSymbol } = useV2();
  const { tier } = useUserTier();
  const regime = useRegime();

  /* ─── Scanner mode toggle ─── */
  const [mode, setMode] = useState<ScannerMode>('ranked');

  /* ─── V2 Ranked Scan state ─── */
  const [v2Timeframe, setV2Timeframe] = useState<ScanTimeframe>('daily');
  const equity = useScannerResults('equity', v2Timeframe);
  const crypto = useScannerResults('crypto', v2Timeframe);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('All');
  const [sortKey, setSortKey] = useState<SortKey>('mspScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* ─── Pro Scan state ─── */
  const [proAsset, setProAsset] = useState<AssetClass>('crypto');
  const [proTimeframe, setProTimeframe] = useState<'15m' | '30m' | '1h' | '1d'>('1d');
  const [proDepth, setProDepth] = useState<ScanDepth>('light');
  const [proUniverseSize, setProUniverseSize] = useState(500);
  const [proMinConfidence, setProMinConfidence] = useState<number>(50);
  const [proMtfAlignment, setProMtfAlignment] = useState<number>(2);
  const [proVolState, setProVolState] = useState<string>('all');
  const [proSqueeze, setProSqueeze] = useState<'all' | 'squeeze'>('all');
  const [proIntent, setProIntent] = useState<'observe' | 'decide'>('observe');
  const [proScanLoading, setProScanLoading] = useState(false);
  const [proScanResults, setProScanResults] = useState<any>(null);
  const [proScanError, setProScanError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(undefined);
  const [proDirection, setProDirection] = useState<'all' | 'long' | 'short'>('all');
  const [proQuality, setProQuality] = useState<'all' | 'high' | 'medium'>('all');
  const [proSort, setProSort] = useState<'rank' | 'confidence' | 'volatility' | 'trend'>('rank');
  const [proBulkViewMode, setProBulkViewMode] = useState<'table' | 'cards'>('table');

  /* ─── Shared detail state ─── */
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [symbolDetail, setSymbolDetail] = useState<SymbolDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const currentRegime = regime.data?.regime?.toLowerCase() || 'trend';

  /* ─── Regime compatibility ─── */
  const regimeSetupMap: Record<string, string[]> = {
    trend: ['breakout', 'trend_continuation', 'pullback'],
    range: ['mean_reversion', 'range_fade', 'liquidity_sweep'],
    compression: ['volatility_expansion', 'squeeze', 'gamma_trap'],
    transition: ['breakout', 'gamma_squeeze', 'volatility_expansion'],
    expansion: ['breakout', 'trend_continuation', 'gamma_squeeze'],
    risk_off: ['mean_reversion', 'hedge', 'range_fade'],
    risk_on: ['breakout', 'trend_continuation', 'pullback'],
  };

  function isRegimeCompatible(r: ScanResult): boolean {
    const setupType = (r.setup || r.dveSignalType || '').toLowerCase().replace(/\s+/g, '_');
    const compatible = regimeSetupMap[currentRegime] || [];
    if (!setupType || setupType === 'none') {
      if (currentRegime === 'risk_off') return r.direction === 'bearish';
      if (currentRegime === 'risk_on' || currentRegime === 'trend' || currentRegime === 'expansion') return r.direction === 'bullish';
      return true;
    }
    return compatible.some(c => setupType.includes(c));
  }

  /* ─── V2 Ranked data ─── */
  const allResults: ScanResult[] = useMemo(() => {
    const eq = (equity.data?.results || []).map(r => ({ ...r, _assetClass: 'equity' as const }));
    const cr = (crypto.data?.results || []).map(r => ({ ...r, _assetClass: 'crypto' as const }));
    return [...eq, ...cr];
  }, [equity.data, crypto.data]);

  const filtered = useMemo(() => {
    let items = allResults;
    switch (activeTab) {
      case 'Equities': items = items.filter(r => (r as any)._assetClass === 'equity'); break;
      case 'Crypto': items = items.filter(r => (r as any)._assetClass === 'crypto'); break;
      case 'Bullish': items = items.filter(r => r.direction === 'bullish'); break;
      case 'Bearish': items = items.filter(r => r.direction === 'bearish'); break;
      case 'High Score': items = items.filter(r => Math.abs(r.score) >= 5); break;
      case 'DVE Signals': items = items.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)); break;
      case 'Regime Match': items = items.filter(r => isRegimeCompatible(r)); break;
    }
    items.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'symbol': av = a.symbol; bv = b.symbol; break;
        case 'score': av = a.score ?? 0; bv = b.score ?? 0; break;
        case 'mspScore': av = computeMspScore(a, currentRegime); bv = computeMspScore(b, currentRegime); break;
        case 'direction': av = a.direction ?? ''; bv = b.direction ?? ''; break;
        case 'confidence': av = a.confidence ?? 0; bv = b.confidence ?? 0; break;
        case 'rsi': av = a.rsi ?? 0; bv = b.rsi ?? 0; break;
        case 'price': av = a.price ?? 0; bv = b.price ?? 0; break;
        case 'dveBbwp': av = a.dveBbwp ?? 0; bv = b.dveBbwp ?? 0; break;
        default: av = 0; bv = 0;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return items;
  }, [allResults, activeTab, sortKey, sortDir]);

  const v2Loading = equity.loading || crypto.loading;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  /* ─── Fetch single symbol detail ─── */
  const loadSymbolDetail = useCallback(async (symbol: string, tf: string, asset: string) => {
    setSelectedSymbol(symbol);
    setDetailLoading(true);
    setSymbolDetail(null);
    try {
      const res = await fetch('/api/scanner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: asset, timeframe: tf, minScore: 0, symbols: [symbol] }),
      });
      const data = await res.json();
      if (data.success && data.results?.length > 0) {
        setSymbolDetail(data.results[0]);
      } else {
        setSymbolDetail({ symbol, score: 0, direction: 'neutral' });
      }
    } catch {
      setSymbolDetail({ symbol, score: 0, direction: 'neutral' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ─── V2 row click ─── */
  const handleV2RowClick = useCallback((r: ScanResult) => {
    const asset = (r as any)._assetClass === 'crypto' ? 'crypto' : 'equity';
    const tfMap: Record<string, string> = { daily: '1d', weekly: '1d', '1h': '1h', '15m': '15m' };
    loadSymbolDetail(r.symbol, tfMap[v2Timeframe] || '1d', asset);
  }, [v2Timeframe, loadSymbolDetail]);

  /* ─── Pro Scan: run bulk scan ─── */
  const runProScan = useCallback(async () => {
    setProScanLoading(true);
    setProScanError(null);
    setProScanResults(null);
    setSelectedSymbol(null);
    setSymbolDetail(null);
    try {
      const payload: any = { type: proAsset, timeframe: proTimeframe };
      if (proAsset === 'crypto') {
        payload.mode = proDepth;
        if (proDepth === 'light') payload.universeSize = proUniverseSize;
      } else {
        payload.mode = 'hybrid';
      }
      const res = await fetch('/api/scanner/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { setProScanError('Please log in to use the scanner'); return; }
        setProScanError(data?.error || `Server returned ${res.status}`);
        return;
      }
      setProScanResults(data);
    } catch (e: any) {
      setProScanError(e?.message || 'Network error');
    } finally {
      setProScanLoading(false);
    }
  }, [proAsset, proTimeframe, proDepth, proUniverseSize]);

  /* ─── Pro Scan: template apply ─── */
  const applyTemplate = useCallback((tmpl: ScanTemplate) => {
    setActiveTemplateId(tmpl.id);
    setProMinConfidence(tmpl.config.minConfidence);
    setProMtfAlignment(tmpl.config.mtfAlignment);
    setProVolState(tmpl.config.volatilityState);
    if (tmpl.config.direction) setProDirection(tmpl.config.direction as 'all' | 'long' | 'short');
    if (tmpl.config.quality) setProQuality(tmpl.config.quality as 'all' | 'high' | 'medium');
  }, []);

  /* ─── Pro scan filtered results → ScreenerRow[] ─── */
  const proScreenerRows: ScreenerRow[] = useMemo(() => {
    if (!proScanResults?.topPicks) return [];
    return proScanResults.topPicks
      .map((pick: any, idx: number) => {
        const conf = pick.confidence ?? Math.min(99, Math.max(10, Math.round(pick.score ?? 50)));
        const dir = (pick.direction === 'bullish' ? 'LONG' : pick.direction === 'bearish' ? 'SHORT' : 'NEUTRAL') as 'LONG' | 'SHORT' | 'NEUTRAL';
        const qual = conf >= 70 ? 'high' : conf >= 50 ? 'medium' : 'low';
        const adxVal = pick.adx ?? 0;
        const atr = pick.atr ?? 0;
        const priceVal = pick.price ?? 0;
        const atrPct = priceVal > 0 ? (atr / priceVal) * 100 : 0;
        const trendOk = dir === 'LONG' ? (pick.signals?.bullish ?? 0) > (pick.signals?.bearish ?? 0) : dir === 'SHORT' ? (pick.signals?.bearish ?? 0) > (pick.signals?.bullish ?? 0) : false;
        const momOk = pick.rsi != null && ((dir === 'LONG' && pick.rsi > 45) || (dir === 'SHORT' && pick.rsi < 55));
        const flowOk = dir === 'LONG' ? (pick.signals?.bullish ?? 0) >= (pick.signals?.neutral ?? 0) : dir === 'SHORT' ? (pick.signals?.bearish ?? 0) >= (pick.signals?.neutral ?? 0) : false;
        const tfA = [trendOk, momOk, flowOk, dir !== 'NEUTRAL'].filter(Boolean).length;
        const strat = pick.setup || (pick.macd_hist != null && pick.macd_hist > 0 ? 'MOM REV' : pick.rsi != null && pick.rsi < 35 ? 'MEAN REV' : atrPct < 1.5 ? 'BREAKOUT' : 'RANGE');
        const rec = pick.institutionalFilter?.recommendation;
        const perm = rec === 'TRADE_READY' && qual !== 'low' ? 'COMPLIANT' : (rec === 'NO_TRADE' || qual === 'low') ? 'BLOCKED' : 'TIGHT';
        return {
          rank: idx + 1, symbol: pick.symbol, direction: dir, confidence: conf, quality: qual,
          strategy: strat, rsi: pick.rsi, adx: adxVal, atrPct, tfAlignment: tfA,
          volume24h: pick.volume, price: priceVal, permission: perm,
        } as ScreenerRow;
      })
      .filter((row: ScreenerRow) => {
        if (proDirection !== 'all' && ((proDirection === 'long' && row.direction !== 'LONG') || (proDirection === 'short' && row.direction !== 'SHORT'))) return false;
        if (proQuality !== 'all' && row.quality !== proQuality) return false;
        if (row.confidence < proMinConfidence) return false;
        if (row.tfAlignment != null && row.tfAlignment < proMtfAlignment) return false;
        if (proVolState !== 'all') {
          const atr = row.atrPct ?? 0;
          if (proVolState === 'low' && atr > 1.5) return false;
          if (proVolState === 'moderate' && (atr < 1.5 || atr > 3)) return false;
          if (proVolState === 'high' && atr < 3) return false;
        }
        return true;
      });
  }, [proScanResults, proDirection, proQuality, proMinConfidence, proMtfAlignment, proVolState]);

  /* ─── Pro scan row click ─── */
  const handleProRowClick = useCallback((row: ScreenerRow) => {
    loadSymbolDetail(row.symbol, proTimeframe, proAsset);
  }, [proTimeframe, proAsset, loadSymbolDetail]);

  /* ─── Detail section (shared between both modes) ─── */
  const detailTimeframeLabel = mode === 'ranked'
    ? (v2Timeframe === '15m' ? '15M' : v2Timeframe === '1h' ? '1H' : v2Timeframe === 'weekly' ? 'W' : 'D')
    : proTimeframe.toUpperCase();
  const detailAssetType = mode === 'ranked' ? 'crypto' : proAsset;

  function SortHeader({ k, label, w }: { k: SortKey; label: string; w: string }) {
    return (
      <th className={`${w} text-left text-[10px] uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-300 py-2 px-2 select-none whitespace-nowrap`} onClick={() => toggleSort(k)}>
        {label} {sortKey === k ? (sortDir === 'desc' ? '▼' : '▲') : ''}
      </th>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <SectionHeader title="Scanner" subtitle="Ranked opportunity engine — live scan results" />

      {/* ─── Mode Toggle ─── */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-1 w-fit">
        <button onClick={() => { setMode('ranked'); setSelectedSymbol(null); setSymbolDetail(null); }}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.06em] transition-all ${mode === 'ranked' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}>
          Ranked Scan
        </button>
        <button onClick={() => { setMode('pro'); setSelectedSymbol(null); setSymbolDetail(null); }}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.06em] transition-all ${mode === 'pro' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}>
          Pro Scanner
        </button>
      </div>

      {/* ─── Active Regime Context ─── */}
      {regime.data && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Active Regime</span>
          <Badge label={regime.data.regime} color={REGIME_COLORS[currentRegime as RegimePriority] || '#64748B'} small />
          <span className="text-[10px] text-slate-500">Risk: <span className="text-white">{regime.data.riskLevel}</span></span>
          <span className="text-[10px] text-slate-500">Permission: <span className={regime.data.permission === 'full' ? 'text-emerald-400' : regime.data.permission === 'reduced' ? 'text-yellow-400' : 'text-red-400'}>{regime.data.permission}</span></span>
          <div className="h-3 w-px bg-slate-700 mx-1" />
          <span className="text-[10px] text-slate-600">Weights: {Object.entries(REGIME_WEIGHTS[currentRegime] || {}).map(([k, v]) => `${k}:${v}`).join(' · ')}</span>
        </div>
      )}

      {/* ═══════════════════════════════ V2 RANKED SCAN ═══════════════════════════════ */}
      {mode === 'ranked' && !selectedSymbol && (
        <>
          {/* Timeframe selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500 mr-1 uppercase">Timeframe</span>
            {SCAN_TIMEFRAMES.map(tf => (
              <button key={tf.value} onClick={() => setV2Timeframe(tf.value)}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${v2Timeframe === tf.value ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-[var(--msp-border)]'}`}>
                {tf.label}
              </button>
            ))}
          </div>

          {/* Tabs — dropdown on mobile, pills on desktop */}
          <div className="md:hidden">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as typeof activeTab)}
              className="w-full rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {TABS.map(tab => {
                const count = tab === 'All' ? allResults.length
                  : tab === 'Equities' ? allResults.filter(r => (r as any)._assetClass === 'equity').length
                  : tab === 'Crypto' ? allResults.filter(r => (r as any)._assetClass === 'crypto').length
                  : tab === 'Bullish' ? allResults.filter(r => r.direction === 'bullish').length
                  : tab === 'Bearish' ? allResults.filter(r => r.direction === 'bearish').length
                  : tab === 'High Score' ? allResults.filter(r => Math.abs(r.score) >= 5).length
                  : tab === 'DVE Signals' ? allResults.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)).length
                  : tab === 'Regime Match' ? allResults.filter(r => isRegimeCompatible(r)).length
                  : 0;
                return <option key={tab} value={tab}>{tab} ({count})</option>;
              })}
            </select>
          </div>
          <div className="hidden md:flex items-center gap-1 overflow-x-auto pb-1">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${activeTab === tab ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}>
                {tab}
                <span className="ml-1 text-[10px] text-slate-600">
                  {tab === 'All' ? allResults.length
                    : tab === 'Equities' ? allResults.filter(r => (r as any)._assetClass === 'equity').length
                    : tab === 'Crypto' ? allResults.filter(r => (r as any)._assetClass === 'crypto').length
                    : tab === 'Bullish' ? allResults.filter(r => r.direction === 'bullish').length
                    : tab === 'Bearish' ? allResults.filter(r => r.direction === 'bearish').length
                    : tab === 'High Score' ? allResults.filter(r => Math.abs(r.score) >= 5).length
                    : tab === 'DVE Signals' ? allResults.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)).length
                    : tab === 'Regime Match' ? allResults.filter(r => isRegimeCompatible(r)).length
                    : 0}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <Card>
            {!canAccessUnlimitedScanning(tier) && (
              <div className="mb-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
                <span className="text-xs text-amber-300">Free tier: {FREE_DAILY_SCAN_LIMIT} scans/day. Upgrade for unlimited scanning.</span>
                <a href="/v2/pricing" className="text-[10px] px-2 py-1 bg-amber-500/20 text-amber-400 rounded border border-amber-500/30 hover:bg-amber-500/30 transition-colors">Upgrade</a>
              </div>
            )}
            {v2Loading ? (
              <div className="space-y-3 py-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-xs text-slate-500 py-12 text-center">No results match this filter.</div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs" style={{ minWidth: 900 }}>
                  <thead>
                    <tr className="border-b border-[var(--msp-border)]">
                      <SortHeader k="symbol" label="Symbol" w="w-20" />
                      <SortHeader k="mspScore" label="MSP" w="w-14" />
                      <SortHeader k="price" label="Price" w="w-20" />
                      <SortHeader k="direction" label="Direction" w="w-16" />
                      <SortHeader k="score" label="Raw" w="w-12" />
                      <SortHeader k="confidence" label="Conf" w="w-12" />
                      <SortHeader k="dveBbwp" label="BBWP" w="w-12" />
                      <th className="w-20 text-left text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">DVE</th>
                      <th className="w-16 text-left text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Regime</th>
                      <th className="w-16 text-left text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Lifecycle</th>
                      <th className="w-16 text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const regimeLabel = r.scoreV2?.regime?.label || r.type || '';
                      const msp = computeMspScore(r, currentRegime);
                      const lifecycle = deriveLifecycleState(r, currentRegime);
                      const mspColor = msp >= 70 ? '#10B981' : msp >= 50 ? '#F59E0B' : msp >= 30 ? '#94A3B8' : '#EF4444';
                      return (
                        <tr key={r.symbol} className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors" onClick={() => handleV2RowClick(r)}>
                          <td className="py-2.5 px-2 whitespace-nowrap"><div className="font-bold text-white">{r.symbol}</div><div className="text-[10px] text-slate-600">{regimeLabel}</div></td>
                          <td className="py-2.5 px-2 text-center whitespace-nowrap"><span className="text-sm font-black" style={{ color: mspColor }}>{msp}</span></td>
                          <td className="py-2.5 px-2 text-slate-300 font-mono whitespace-nowrap">{formatPrice(r.price)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap"><Badge label={r.direction || 'neutral'} color={dirColor(r.direction)} small /></td>
                          <td className="py-2.5 px-2 text-slate-400 text-[10px] whitespace-nowrap">{r.score}</td>
                          <td className="py-2.5 px-2 text-slate-400 text-[10px] whitespace-nowrap">{r.confidence != null ? `${r.confidence}%` : '—'}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className={r.dveBbwp != null ? (r.dveBbwp < 20 ? 'text-cyan-400' : r.dveBbwp > 80 ? 'text-orange-400' : 'text-slate-300') : 'text-slate-600'}>
                              {r.dveBbwp != null ? r.dveBbwp.toFixed(0) : '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-[10px] whitespace-nowrap max-w-[80px] truncate">
                            {(() => {
                              if (r.dveSignalType && r.dveSignalType !== 'none') return <span className="text-yellow-400 font-semibold">{r.dveSignalType.replace(/_/g, ' ')}</span>;
                              if (r.dveFlags && r.dveFlags.length > 0) {
                                const fc: Record<string, string> = { SQUEEZE_FIRE: 'text-yellow-400', COMPRESSED: 'text-cyan-400', EXPANDING: 'text-amber-400', CLIMAX: 'text-red-400', BREAKOUT: 'text-emerald-400', HIGH_BREAKOUT: 'text-emerald-300', VOL_TRAP: 'text-red-300', EXHAUSTION_RISK: 'text-orange-400', DIR_BULL: 'text-emerald-400', DIR_BEAR: 'text-red-400', EXTENDED_PHASE: 'text-slate-400', CONTINUATION: 'text-amber-300' };
                                const top = r.dveFlags[0];
                                return <span className={fc[top] || 'text-slate-400'}>{top.replace(/_/g, ' ')}{r.dveFlags.length > 1 ? ` +${r.dveFlags.length - 1}` : ''}</span>;
                              }
                              return <span className="text-slate-600">—</span>;
                            })()}
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            {isRegimeCompatible(r)
                              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">✓ Match</span>
                              : r.scoreV2?.regimeScore?.gated
                                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">Gated</span>
                                : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-500 border border-slate-500/20">Neutral</span>}
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ color: LIFECYCLE_COLORS[lifecycle], borderColor: LIFECYCLE_COLORS[lifecycle] + '40', backgroundColor: LIFECYCLE_COLORS[lifecycle] + '15' }}>
                              {lifecycle.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            <button onClick={(e) => { e.stopPropagation(); handleV2RowClick(r); }} className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-[10px] hover:bg-emerald-500/20 transition-colors">Analyze</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/40">
              <span className="text-[10px] text-slate-600">{filtered.length} symbols</span>
              <button onClick={() => { equity.refetch(); crypto.refetch(); }} className="text-[10px] text-emerald-400 hover:underline">↻ Rescan</button>
            </div>
          </Card>
        </>
      )}

      {/* ═══════════════════════════════ PRO SCANNER ═══════════════════════════════ */}
      {mode === 'pro' && !selectedSymbol && (
        <>
          {/* Scan Configuration Form */}
          <div className="rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-4">
            <div className="grid gap-4 md:grid-cols-12">
              {/* Universe */}
              <div className="md:col-span-5 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Universe</div>
                <div className="mb-3">
                  <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Asset Class</div>
                  <div className="flex gap-1.5">
                    {(['crypto', 'equity', 'forex'] as const).map(ac => (
                      <button key={ac} onClick={() => setProAsset(ac)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase ${proAsset === ac ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
                        {ac}
                      </button>
                    ))}
                  </div>
                </div>
                {proAsset === 'crypto' && proDepth === 'light' && (
                  <div className="mb-3">
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Universe</label>
                    <select value={proUniverseSize} onChange={e => setProUniverseSize(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                      <option value={1000}>1000</option>
                      <option value={5000}>5000</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Sector Filter</label>
                  <select className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                    <option value="all">All</option>
                  </select>
                </div>
              </div>

              {/* Structure */}
              <div className="md:col-span-7 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Structure</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Timeframe</label>
                    <select value={proTimeframe} onChange={e => setProTimeframe(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value="1d">1d</option><option value="1h">1h</option><option value="30m">30m</option><option value="15m">15m</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">MTF Alignment</label>
                    <select value={proMtfAlignment} onChange={e => setProMtfAlignment(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={2}>2/4+</option><option value={3}>3/4+</option><option value={4}>4/4</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Min Confidence</label>
                    <select value={proMinConfidence} onChange={e => setProMinConfidence(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={50}>50</option><option value={60}>60</option><option value={70}>70</option><option value={80}>80</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Vol State</label>
                    <select value={proVolState} onChange={e => setProVolState(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value="all">All</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Squeeze</label>
                  <select value={proSqueeze} onChange={e => setProSqueeze(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                    <option value="all">All</option><option value="squeeze">In Squeeze</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Mode + Intent */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Mode</div>
                <div className="flex gap-1.5">
                  {(['light', 'deep'] as const).map(d => (
                    <button key={d} onClick={() => setProDepth(d)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase ${proDepth === d ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
                      {d === 'light' ? 'Fast' : 'Deep'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5">
                {(['observe', 'decide'] as const).map(i => (
                  <button key={i} onClick={() => setProIntent(i)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase ${proIntent === i ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Button */}
            <button type="button" onClick={runProScan} disabled={proScanLoading}
              className="mt-4 w-full rounded-lg py-3.5 text-sm font-bold uppercase tracking-[0.1em] transition-all"
              style={{
                background: proScanLoading ? 'rgba(16, 185, 129, 0.25)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: proScanLoading ? 'rgba(255,255,255,0.6)' : '#0F172A',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                boxShadow: proScanLoading ? 'none' : '0 0 20px rgba(16, 185, 129, 0.25), 0 4px 12px rgba(0, 0, 0, 0.3)',
                cursor: proScanLoading ? 'not-allowed' : 'pointer',
              }}>
              {proScanLoading ? '⏳ Scanning...' : '🔎 Scan For Setups'}
            </button>
          </div>

          {/* Strategy Templates */}
          <ScanTemplatesBar onSelect={applyTemplate} activeId={activeTemplateId} />

          {/* Filters bar */}
          {proScanResults && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase text-slate-500">Direction:</label>
                <select value={proDirection} onChange={e => setProDirection(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="all">All</option><option value="long">Long</option><option value="short">Short</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase text-slate-500">Quality:</label>
                <select value={proQuality} onChange={e => setProQuality(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="all">All</option><option value="high">High</option><option value="medium">Medium</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase text-slate-500">Sort:</label>
                <select value={proSort} onChange={e => setProSort(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="rank">Rank</option><option value="confidence">Confidence</option><option value="volatility">Volatility</option><option value="trend">Trend</option>
                </select>
              </div>
              <div className="ml-auto flex gap-1">
                <button onClick={() => setProBulkViewMode('table')} className={`rounded px-2 py-1 text-[10px] font-bold ${proBulkViewMode === 'table' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}>Table</button>
                <button onClick={() => setProBulkViewMode('cards')} className={`rounded px-2 py-1 text-[10px] font-bold ${proBulkViewMode === 'cards' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}>Cards</button>
              </div>
            </div>
          )}

          {/* Pro Scan Error */}
          {proScanError && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{proScanError}</div>
          )}

          {/* Pro Scan Results */}
          {proScanResults && (
            <div>
              <div className="mb-2 flex items-center gap-3 text-[10px] text-slate-500">
                <span>Scanned: {proScanResults.scanned ?? '—'}</span>
                <span>Duration: {proScanResults.duration ?? '—'}</span>
                <span>Mode: {proScanResults.mode ?? proDepth}</span>
                {proScanResults.effectiveUniverseSize && <span>Universe: {proScanResults.effectiveUniverseSize}</span>}
              </div>
              <ScreenerTable rows={proScreenerRows} onRowClick={handleProRowClick} selectedSymbol={selectedSymbol ?? undefined} />
              <div className="mt-2 text-[10px] text-slate-600">
                Market Bias Context · Regime: {currentRegime.toUpperCase()} · Most setups: {proScreenerRows.filter(r => r.direction === 'LONG').length > proScreenerRows.filter(r => r.direction === 'SHORT').length ? 'Long' : 'Short'}
              </div>
            </div>
          )}

          {proScanLoading && (
            <div className="space-y-3 py-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}</div>
          )}
        </>
      )}

      {/* ═══════════════════════════════ INLINE DETAIL PANEL ═══════════════════════════════ */}
      {selectedSymbol && (
        <>
          {detailLoading ? (
            <Card>
              <div className="flex items-center gap-3 py-8 justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <span className="text-sm text-slate-400">Loading analysis for {selectedSymbol}...</span>
              </div>
            </Card>
          ) : symbolDetail ? (
            <SymbolDetailPanel
              detail={symbolDetail}
              timeframeLabel={detailTimeframeLabel}
              onClose={() => { setSelectedSymbol(null); setSymbolDetail(null); }}
              assetType={detailAssetType}
            />
          ) : null}
        </>
      )}

      {/* Errors */}
      {mode === 'ranked' && (equity.error || crypto.error) && (
        <div className="text-[10px] text-red-400/60 border border-red-900/30 rounded-lg p-3">
          {equity.error && <div>Equity scan: {equity.error}</div>}
          {crypto.error && <div>Crypto scan: {crypto.error}</div>}
        </div>
      )}
    </div>
  );
}
