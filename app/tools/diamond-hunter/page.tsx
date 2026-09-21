'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Stage = 'REJECT' | 'WATCH' | 'EMERGING' | 'DIAMOND' | 'RARE_DIAMOND';

interface Candidate {
  id: string;
  poolAddress: string;
  tokenAddress: string | null;
  name: string;
  symbol: string;
  pairName: string;
  network: string;
  dex: string;
  priceUsd: number;
  score: number;
  prePenaltyScore: number;
  penalty: number;
  stage: Stage;
  confidence: 'PRELIMINARY' | 'DEEP_CHECKED';
  attention: 'EARLY' | 'POOL_TRENDING' | 'COINGECKO_TRENDING' | 'QUIET';
  scoreDelta: number;
  firstDetectedAt: string | null;
  createdAt: string | null;
  reasons: string[];
  riskFlags: string[];
  metrics: {
    ageMinutes: number | null;
    liquidityUsd: number;
    fdvUsd: number;
    marketCapUsd: number;
    volume5mUsd: number;
    volume15mUsd: number;
    volume1hUsd: number;
    volumeVelocity5m: number;
    buyerVelocity5m: number;
    buyers5m: number;
    sellers5m: number;
    buySellRatio5m: number;
    change5m: number;
    change15m: number;
    change1h: number;
    top10HolderPct: number | null;
    holderCount: number | null;
    gtScore: number | null;
    developerHoldingPct: number | null;
  };
}

interface DiamondResponse {
  candidates: Candidate[];
  stats: {
    poolsScanned: number;
    candidatesShown: number;
    watchOrBetter: number;
    diamondOrBetter: number;
    deepChecked: number;
    pagesScanned: number;
    refreshSeconds: number;
  };
  timestamp: string;
  freshnessStatus: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  REJECT: 'Below watch',
  WATCH: 'Watch',
  EMERGING: 'Emerging',
  DIAMOND: 'Diamond',
  RARE_DIAMOND: 'Rare Diamond',
};

function money(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function age(minutes: number | null) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function scoreClass(score: number) {
  if (score >= 90) return 'border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200';
  if (score >= 80) return 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200';
  if (score >= 70) return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200';
  if (score >= 60) return 'border-amber-400/50 bg-amber-500/10 text-amber-200';
  return 'border-slate-600 bg-slate-800/40 text-slate-300';
}

export default function DiamondHunterPage() {
  const [data, setData] = useState<DiamondResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<'ALL' | Stage>('ALL');
  const [network, setNetwork] = useState('ALL');
  const [minScore, setMinScore] = useState(60);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const res = await fetch('/api/crypto/diamond-hunter', { cache: 'no-store' });
      if (res.status === 401) {
        setError('Sign in to run Diamond Hunter.');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      console.error(e);
      setError('Diamond Hunter could not refresh. Existing results are left on screen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 120_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const networks = useMemo(
    () => Array.from(new Set((data?.candidates ?? []).map((c) => c.network))).sort(),
    [data]
  );

  const filtered = useMemo(() => (data?.candidates ?? []).filter((candidate) => {
    if (candidate.score < minScore) return false;
    if (stage !== 'ALL' && candidate.stage !== stage) return false;
    if (network !== 'ALL' && candidate.network !== network) return false;
    return true;
  }), [data, minScore, network, stage]);

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] px-3 py-5 text-[var(--msp-text)] md:px-6">
      <div className="mx-auto max-w-[1500px]">
        <section className="mb-5 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-950 to-cyan-950/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">CoinGecko Onchain Discovery</div>
              <h1 className="text-2xl font-bold text-white md:text-3xl">Diamond Hunter</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Ranks brand-new DEX pools by acceleration, buyer quality, liquidity, price structure, valuation and early attention.
                The strongest candidates are automatically deep-checked for holder concentration and token security.
              </p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {loading ? 'Scanning…' : 'Refresh scan'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              ['Pools scanned', data?.stats.poolsScanned ?? 0],
              ['Watch+', data?.stats.watchOrBetter ?? 0],
              ['Diamond+', data?.stats.diamondOrBetter ?? 0],
              ['Deep checked', data?.stats.deepChecked ?? 0],
              ['Refresh', data ? `${data.stats.refreshSeconds}s` : '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-lg font-bold text-white">{value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <select value={stage} onChange={(e) => setStage(e.target.value as 'ALL' | Stage)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
            <option value="ALL">All stages</option>
            <option value="RARE_DIAMOND">Rare Diamond</option>
            <option value="DIAMOND">Diamond</option>
            <option value="EMERGING">Emerging</option>
            <option value="WATCH">Watch</option>
          </select>
          <select value={network} onChange={(e) => setNetwork(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
            <option value="ALL">All networks</option>
            {networks.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            Min score
            <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value) || 0)} className="w-14 bg-transparent text-right text-white outline-none" />
          </label>
          <span className="ml-auto text-[11px] text-slate-500">
            {data?.timestamp ? `Updated ${new Date(data.timestamp).toLocaleTimeString()}` : ''}
          </span>
        </section>

        {error && <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{error}</div>}

        <div className="space-y-3">
          {filtered.map((candidate) => (
            <article key={candidate.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-white">{candidate.symbol}</h2>
                    <span className="text-sm text-slate-400">{candidate.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${scoreClass(candidate.score)}`}>
                      {STAGE_LABEL[candidate.stage]} · {candidate.score}
                    </span>
                    {candidate.attention === 'EARLY' && (
                      <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-200">EARLY ATTENTION</span>
                    )}
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
                      {candidate.confidence === 'DEEP_CHECKED' ? 'Deep checked' : 'Preliminary'}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {candidate.network} · {candidate.dex} · age {age(candidate.metrics.ageMinutes)}
                    {candidate.scoreDelta !== 0 ? ` · score velocity ${candidate.scoreDelta > 0 ? '+' : ''}${candidate.scoreDelta}/5m` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-slate-500">Penalty</div>
                  <div className={candidate.penalty > 0 ? 'font-bold text-rose-300' : 'font-bold text-emerald-300'}>-{candidate.penalty}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                {[
                  ['Liquidity', money(candidate.metrics.liquidityUsd)],
                  ['FDV', money(candidate.metrics.fdvUsd)],
                  ['Vol 5m', money(candidate.metrics.volume5mUsd)],
                  ['Vol velocity', `${candidate.metrics.volumeVelocity5m.toFixed(1)}x`],
                  ['Buyers 5m', candidate.metrics.buyers5m],
                  ['B/S ratio', `${candidate.metrics.buySellRatio5m.toFixed(1)}x`],
                  ['15m', `${candidate.metrics.change15m >= 0 ? '+' : ''}${candidate.metrics.change15m.toFixed(1)}%`],
                  ['1h', `${candidate.metrics.change1h >= 0 ? '+' : ''}${candidate.metrics.change1h.toFixed(1)}%`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-slate-800 bg-black/20 p-2">
                    <div className="text-[9px] uppercase text-slate-600">{label}</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-200">{value}</div>
                  </div>
                ))}
              </div>

              {(candidate.metrics.top10HolderPct != null || candidate.metrics.gtScore != null) && (
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
                  {candidate.metrics.gtScore != null && <span>GT score {candidate.metrics.gtScore.toFixed(0)}</span>}
                  {candidate.metrics.holderCount != null && <span>· holders {candidate.metrics.holderCount.toLocaleString()}</span>}
                  {candidate.metrics.top10HolderPct != null && <span>· top 10 {candidate.metrics.top10HolderPct.toFixed(1)}%</span>}
                  {candidate.metrics.developerHoldingPct != null && <span>· developer {candidate.metrics.developerHoldingPct.toFixed(1)}%</span>}
                </div>
              )}

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400">Why it surfaced</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(candidate.reasons.length ? candidate.reasons : ['No strong confirmation yet']).map((reason) => (
                      <span key={reason} className="rounded-md border border-emerald-500/15 bg-emerald-500/5 px-2 py-1 text-[10px] text-emerald-200/80">{reason}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-rose-400">Risk flags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(candidate.riskFlags.length ? candidate.riskFlags : ['No configured rule triggered — unknown risks remain']).map((flag) => (
                      <span key={flag} className="rounded-md border border-rose-500/15 bg-rose-500/5 px-2 py-1 text-[10px] text-rose-200/80">{flag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}

          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-10 text-center text-sm text-slate-500">
              No pools currently meet these filters. That is a valid result — Diamond Hunter does not force a candidate.
            </div>
          )}
        </div>

        <p className="mt-5 text-[10px] leading-relaxed text-slate-600">
          Educational research only. New DEX pools can be manipulated, illiquid or malicious. CoinGecko holder-distribution data is beta where available. Diamond Hunter is a discovery/risk-ranking engine, not a recommendation or execution signal.
        </p>
      </div>
    </main>
  );
}
