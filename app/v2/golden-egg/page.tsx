'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 3: GOLDEN EGG — Flagship Decision Page
   Real API data: /api/golden-egg + /api/dve + /api/quote
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from 'react';
import { useV2 } from '../_lib/V2Context';
import { useGoldenEgg, useDVE, useQuote, useScannerResults, type ScanResult } from '../_lib/api';
import { Card, SectionHeader, Badge, ScoreBar } from '../_components/ui';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

function verdictColor(v: string) {
  if (v === 'TRADE' || v === 'YES') return '#10B981';
  if (v === 'NO_TRADE' || v === 'NO') return '#EF4444';
  return '#F59E0B';
}

function dirColor(d?: string) {
  if (!d) return '#94A3B8';
  const l = d.toLowerCase();
  if (l === 'bullish' || l === 'long' || l === 'bull') return '#10B981';
  if (l === 'bearish' || l === 'short' || l === 'bear') return '#EF4444';
  return '#F59E0B';
}

function gradeColor(g: string) {
  if (g === 'A') return '#10B981';
  if (g === 'B') return '#3B82F6';
  if (g === 'C') return '#F59E0B';
  return '#EF4444';
}

export default function GoldenEggPage() {
  const { selectedSymbol, selectSymbol, navigateTo } = useV2();
  const [symbolInput, setSymbolInput] = useState('');

  // Get scanner results for symbol picker
  const equity = useScannerResults('equity');
  const crypto = useScannerResults('crypto');
  const allScanned = useMemo(() => {
    const eq = equity.data?.results || [];
    const cr = crypto.data?.results || [];
    return [...eq, ...cr].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 12);
  }, [equity.data, crypto.data]);

  const sym = selectedSymbol || 'AAPL';

  // Core data
  const goldenEgg = useGoldenEgg(sym);
  const dve = useDVE(sym);
  const quote = useQuote(sym);

  const ge = goldenEgg.data?.data;
  const d = dve.data?.data;
  const loading = goldenEgg.loading;

  function handleSymbolSubmit() {
    if (symbolInput.trim()) {
      selectSymbol(symbolInput.trim().toUpperCase());
      setSymbolInput('');
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Golden Egg" subtitle="Flagship decision page — full symbol intelligence" />

      {/* Symbol picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleSymbolSubmit()}
            placeholder="Enter symbol..."
            className="px-3 py-1.5 bg-[#0D1520] border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 w-32 focus:border-emerald-500 focus:outline-none"
          />
          <button onClick={handleSymbolSubmit} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors">Go</button>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {allScanned.map((s: ScanResult) => (
            <button
              key={s.symbol}
              onClick={() => selectSymbol(s.symbol)}
              className={`px-2 py-1 rounded text-[10px] whitespace-nowrap transition-colors ${
                s.symbol === sym ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              {s.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <Card>
          <div className="space-y-4 py-8">
            <Skel h="h-8" w="w-48" />
            <Skel h="h-6" w="w-64" />
            <div className="grid grid-cols-4 gap-4 mt-4">
              {[1,2,3,4].map(i => <Skel key={i} h="h-20" />)}
            </div>
          </div>
        </Card>
      )}

      {/* Auth error state */}
      {goldenEgg.isAuthError && !loading && (
        <Card>
          <div className="py-8 text-center">
            <div className="text-amber-400 text-sm mb-2">Sign in required</div>
            <div className="text-[10px] text-slate-500 mb-4">Please sign in to access Golden Egg analysis</div>
            <a href="/auth/login" className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 inline-block">Sign In</a>
          </div>
        </Card>
      )}

      {/* Error state */}
      {goldenEgg.error && !loading && (
        <Card>
          <div className="py-8 text-center">
            <div className="text-red-400 text-sm mb-2">Failed to load Golden Egg for {sym}</div>
            <div className="text-[10px] text-slate-500 mb-4">{goldenEgg.error}</div>
            <button onClick={() => goldenEgg.refetch()} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30">Retry</button>
          </div>
        </Card>
      )}

      {/* Main content */}
      {ge && !loading && (
        <>
          {/* ── VERDICT HEADER ───────────────────────────────────────── */}
          <Card>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-black text-white">{ge.meta.symbol}</h2>
                  <Badge label={ge.layer1.permission} color={verdictColor(ge.layer1.permission)} />
                  <Badge label={ge.layer1.direction} color={dirColor(ge.layer1.direction)} />
                  <Badge label={`Grade ${ge.layer1.grade}`} color={gradeColor(ge.layer1.grade)} small />
                </div>
                <div className="text-lg font-bold text-white">
                  ${ge.meta.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {quote.data?.changePercent != null && (
                    <span className={`ml-2 text-sm ${quote.data.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {quote.data.changePercent >= 0 ? '+' : ''}{quote.data.changePercent.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">{ge.meta.assetClass} · {ge.meta.timeframe} · {new Date(ge.meta.asOfTs).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-black" style={{ color: verdictColor(ge.layer1.permission) }}>{ge.layer1.confidence}%</div>
                  <div className="text-[9px] text-slate-500 uppercase">Confidence</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-slate-300">{ge.layer1.primaryDriver}</div>
                  <div className="text-[9px] text-slate-500 uppercase">Primary Driver</div>
                </div>
                {ge.layer1.primaryBlocker && (
                  <div className="text-center">
                    <div className="text-sm text-red-400">{ge.layer1.primaryBlocker}</div>
                    <div className="text-[9px] text-slate-500 uppercase">Blocker</div>
                  </div>
                )}
              </div>
            </div>

            {/* Score Breakdown */}
            {ge.layer1.scoreBreakdown && ge.layer1.scoreBreakdown.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-800/50">
                <div className="text-[10px] text-slate-500 mb-2 uppercase">Score Breakdown</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {ge.layer1.scoreBreakdown.map((sb: any) => (
                    <div key={sb.key} className="bg-[#0A101C]/50 rounded-lg p-2">
                      <div className="text-[9px] text-slate-500">{sb.key} (w:{sb.weight})</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{sb.value.toFixed(1)}</span>
                        <ScoreBar value={Math.min(sb.value * 10, 100)} color="#10B981" />
                      </div>
                      {sb.note && <div className="text-[9px] text-slate-600 mt-0.5">{sb.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── A: SETUP & THESIS ──────────────────────────────────── */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">A — Setup & Market Context</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Setup Type</div>
                  <div className="text-sm text-white font-semibold capitalize">{ge.layer2.setup.setupType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Thesis</div>
                  <div className="text-xs text-slate-300">{ge.layer2.setup.thesis}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Timeframe Alignment</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{ge.layer2.setup.timeframeAlignment.score}/{ge.layer2.setup.timeframeAlignment.max}</span>
                    <ScoreBar value={(ge.layer2.setup.timeframeAlignment.score / ge.layer2.setup.timeframeAlignment.max) * 100} color="#10B981" />
                  </div>
                  {ge.layer2.setup.timeframeAlignment.details.map((d: any, i: number) => (
                    <div key={i} className="text-[10px] text-slate-500 mt-0.5">• {d}</div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Invalidation</div>
                  <div className="text-xs text-red-400">{ge.layer2.setup.invalidation}</div>
                </div>
              </div>
            </Card>

            {/* ── B: STRUCTURE ────────────────────────────────────────── */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">B — Structure Analysis</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 uppercase">Structure Verdict:</span>
                  <Badge label={ge.layer3.structure.verdict} color={ge.layer3.structure.verdict === 'agree' ? '#10B981' : ge.layer3.structure.verdict === 'disagree' ? '#EF4444' : '#F59E0B'} small />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['htf', 'mtf', 'ltf'].map((tf) => (
                    <div key={tf} className="bg-[#0A101C]/50 rounded p-2">
                      <div className="text-[9px] text-slate-500 uppercase">{tf}</div>
                      <div className="text-xs text-white">{(ge.layer3.structure.trend as any)[tf]}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Key Levels</div>
                  <div className="space-y-1 mt-1">
                    {ge.layer2.setup.keyLevels.map((lv: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{lv.label} <span className="text-[9px] text-slate-600">({lv.kind})</span></span>
                        <span className="font-mono text-white">${lv.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Momentum indicators */}
                {ge.layer3.momentum?.indicators && (
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Momentum</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ge.layer3.momentum.indicators.map((ind: any, i: number) => (
                        <Badge key={i} label={`${ind.name}: ${ind.value}`} color={ind.state === 'bull' ? '#10B981' : ind.state === 'bear' ? '#EF4444' : '#94A3B8'} small />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* ── C: VOLATILITY (DVE) ────────────────────────────────── */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">C — Volatility (DVE)</h3>
              {dve.loading ? (
                <div className="space-y-3"><Skel /><Skel /><Skel /></div>
              ) : d ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge label={d.volatility.regime} color={
                      d.volatility.regime === 'compression' ? '#06B6D4' : d.volatility.regime === 'expansion' ? '#F59E0B' : d.volatility.regime === 'climax' ? '#EF4444' : '#94A3B8'
                    } />
                    <span className="text-xs text-slate-400">Confidence: {(d.volatility.regimeConfidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#0A101C]/50 rounded p-2">
                      <div className="text-[9px] text-slate-500">BBWP</div>
                      <div className="text-sm font-bold text-white">{d.volatility.bbwp.toFixed(1)}</div>
                      <ScoreBar value={d.volatility.bbwp} color={d.volatility.bbwp < 20 ? '#06B6D4' : d.volatility.bbwp > 80 ? '#EF4444' : '#F59E0B'} />
                    </div>
                    <div className="bg-[#0A101C]/50 rounded p-2">
                      <div className="text-[9px] text-slate-500">Direction</div>
                      <div className="text-sm font-bold" style={{ color: dirColor(d.direction.bias) }}>{d.direction.bias}</div>
                      <div className="text-[9px] text-slate-500">Score: {d.direction.score.toFixed(1)}</div>
                    </div>
                  </div>
                  {d.signal.active && d.signal.type !== 'none' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                      <div className="text-[10px] text-emerald-400 font-semibold">Active Signal: {d.signal.type.replace(/_/g, ' ')}</div>
                      <div className="text-[9px] text-slate-400">Strength: {(d.signal.strength * 100).toFixed(0)}%</div>
                    </div>
                  )}
                  {d.projection.expectedMovePct > 0 && (
                    <div className="text-xs text-slate-400">
                      Expected move: <span className="text-white font-semibold">{d.projection.expectedMovePct.toFixed(1)}%</span>
                      <span className="text-slate-600 ml-1">(hit rate: {(d.projection.hitRate * 100).toFixed(0)}%, n={d.projection.sampleSize})</span>
                    </div>
                  )}
                  {d.breakout.score > 40 && (
                    <div className="text-xs"><span className="text-yellow-400">Breakout Score: {d.breakout.score.toFixed(0)}</span> — {d.breakout.label}</div>
                  )}
                  {d.trap.detected && <div className="text-xs text-red-400">⚠ Trap Detected (score: {d.trap.score.toFixed(0)})</div>}
                  <div className="text-[10px] text-slate-500">{d.summary}</div>
                </div>
              ) : ge.layer3.structure.volatility ? (
                <div className="space-y-2">
                  <Badge label={ge.layer3.structure.volatility.regime || 'unknown'} color="#94A3B8" />
                  {ge.layer3.structure.volatility.bbwp != null && <div className="text-xs text-slate-400">BBWP: {ge.layer3.structure.volatility.bbwp.toFixed(1)}</div>}
                  <div className="text-[10px] text-slate-600">DVE endpoint unavailable — showing Golden Egg volatility data</div>
                </div>
              ) : <div className="text-xs text-slate-500">No volatility data available</div>}
            </Card>

            {/* ── D: OPTIONS ──────────────────────────────────────────── */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">D — Options / Derivatives</h3>
              {ge.layer3.options?.enabled ? (
                <div className="space-y-2">
                  <Badge label={ge.layer3.options.verdict} color={ge.layer3.options.verdict === 'agree' ? '#10B981' : ge.layer3.options.verdict === 'disagree' ? '#EF4444' : '#F59E0B'} />
                  <div className="space-y-1">
                    {ge.layer3.options.highlights.map((h: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-slate-400">{h.label}</span>
                        <span className="text-white">{h.value}</span>
                      </div>
                    ))}
                  </div>
                  {ge.layer3.options.notes?.map((n: any, i: number) => (
                    <div key={i} className="text-[10px] text-slate-500">• {n}</div>
                  ))}
                  <button
                    onClick={() => navigateTo('terminal', sym)}
                    className="mt-2 text-[10px] text-emerald-400 hover:underline"
                  >
                    Open Options Terminal →
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-4 text-center">Options data not available for {sym}</div>
              )}
            </Card>
          </div>

          {/* ── E: TRADE PLAN ─────────────────────────────────────────── */}
          <Card>
            <h3 className="text-xs font-semibold text-emerald-400 mb-3">E — Trade Plan</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Entry</div>
                <div className="text-sm text-white">{ge.layer2.execution.entryTrigger}</div>
                {ge.layer2.execution.entry.price && (
                  <div className="text-xs font-mono text-emerald-400">${ge.layer2.execution.entry.price.toFixed(2)} ({ge.layer2.execution.entry.type})</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Stop</div>
                <div className="text-sm font-mono text-red-400">${ge.layer2.execution.stop.price.toFixed(2)}</div>
                <div className="text-[10px] text-slate-500">{ge.layer2.execution.stop.logic}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Targets</div>
                {ge.layer2.execution.targets.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400 font-mono">${t.price.toFixed(2)}</span>
                    {t.rMultiple && <span className="text-slate-500">{t.rMultiple.toFixed(1)}R</span>}
                    {t.note && <span className="text-slate-600">{t.note}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800/50">
              <div>
                <span className="text-[10px] text-slate-500">Expected R:R</span>
                <span className="text-sm font-bold text-white ml-2">{ge.layer2.execution.rr.expectedR.toFixed(1)}R</span>
              </div>
              <button onClick={() => navigateTo('terminal', sym)} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors">
                Open in Terminal →
              </button>
            </div>
          </Card>

          {/* ── F: NARRATIVE ──────────────────────────────────────────── */}
          {ge.layer3.narrative?.enabled && (
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">F — AI Narrative</h3>
              <div className="text-sm text-slate-300 mb-3">{ge.layer3.narrative.summary}</div>
              <ul className="space-y-1">
                {ge.layer3.narrative.bullets.map((b: any, i: number) => (
                  <li key={i} className="text-xs text-slate-400">• {b}</li>
                ))}
              </ul>
              {ge.layer3.narrative.risks.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-800/50">
                  <div className="text-[10px] text-red-400 uppercase mb-1">Risks</div>
                  {ge.layer3.narrative.risks.map((r: any, i: number) => (
                    <div key={i} className="text-xs text-red-400/80">⚠ {r}</div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
