'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 3: GOLDEN EGG — Flagship Decision Page
   One symbol → full institutional-style analysis with verdict header.
   Replaces: v1 Golden Egg + Deep Analysis + AI Analyst + Options Confluence
   ═══════════════════════════════════════════════════════════════════════════ */

import { useV2 } from '../_lib/V2Context';
import { REGIME_COLORS, VERDICT_COLORS, VOL_COLORS, LIFECYCLE_COLORS } from '../_lib/constants';
import { Card, Badge, ScoreBar, StatBox, EmptyState } from '../_components/ui';

export default function GoldenEggPage() {
  const { data, selectedSymbol, selectSymbol, navigateTo } = useV2();
  const intel = data.find(d => d.symbol === selectedSymbol) || data[0];

  if (!intel) return <EmptyState message="No symbol selected. Choose from Scanner." icon="◆" />;

  return (
    <div className="space-y-4">
      {/* Symbol Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {data.slice(0, 10).map(d => (
          <button
            key={d.symbol}
            onClick={() => selectSymbol(d.symbol)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              d.symbol === intel.symbol
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800'
            }`}
          >
            {d.symbol}
          </button>
        ))}
      </div>

      {/* VERDICT HEADER — Critical Upgrade #2 */}
      <Card className="!p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-700/30" style={{ background: `linear-gradient(135deg, ${VERDICT_COLORS[intel.verdict]}08, transparent)` }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{intel.symbol}</h1>
                <span className="text-lg text-slate-400">{intel.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={intel.regimePriority} color={REGIME_COLORS[intel.regimePriority]} />
                <Badge label={intel.directionalBias} color={intel.directionalBias === 'bullish' ? '#2FB36E' : intel.directionalBias === 'bearish' ? '#E46767' : '#64748B'} />
                <Badge label={intel.volatilityState.regime} color={VOL_COLORS[intel.volatilityState.regime]} />
                <Badge label={intel.lifecycleState} color={LIFECYCLE_COLORS[intel.lifecycleState]} />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <StatBox label="MSP Score" value={intel.mspScore} color={VERDICT_COLORS[intel.verdict]} />
              <StatBox label="Confluence" value={intel.confluenceScore} />
              <StatBox label="Confidence" value={`${intel.confidence}%`} />
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Verdict</div>
                <div
                  className="text-xl font-black px-4 py-1 rounded-lg"
                  style={{ color: VERDICT_COLORS[intel.verdict], backgroundColor: VERDICT_COLORS[intel.verdict] + '15' }}
                >
                  {intel.verdict}
                </div>
              </div>
            </div>
          </div>

          {/* Trigger / Invalidation / Targets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-700/30">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Trigger</div>
              <div className="text-sm text-emerald-400 font-medium">{intel.triggerCondition}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Invalidation</div>
              <div className="text-sm text-red-400 font-medium">{intel.invalidation}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Targets</div>
              <div className="text-sm text-white font-medium">{intel.targets.join(' → ')}</div>
              <div className="text-[10px] text-slate-500">RR: {intel.riskReward}x</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section A: Market Context */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">A</span> Market Context
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Regime</div>
            <Badge label={intel.regimePriority} color={REGIME_COLORS[intel.regimePriority]} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">HTF Bias</div>
            <div className="text-sm text-white capitalize">{intel.directionalBias}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Cross-Market</div>
            <Badge label={intel.crossMarketInfluence.alignment} color={intel.crossMarketInfluence.alignment === 'supportive' ? '#10B981' : intel.crossMarketInfluence.alignment === 'headwind' ? '#EF4444' : '#64748B'} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Macro Factor</div>
            <div className="text-xs text-slate-300">{intel.crossMarketInfluence.factors[0] || 'None'}</div>
          </div>
        </div>
      </Card>

      {/* Section B: Structure */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">B</span> Structure
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Structure Quality</div>
            <div className="text-lg font-bold text-white">{intel.structureQuality}/100</div>
            <ScoreBar value={intel.structureQuality} color={intel.structureQuality > 75 ? '#10B981' : intel.structureQuality > 50 ? '#F59E0B' : '#EF4444'} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Compatible Setups</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {intel.regimeCompatibility.map(s => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">{s.replace('_', ' ')}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Price</div>
            <div className="text-lg font-bold text-white">${intel.price.toLocaleString()}</div>
            <div className={`text-xs ${intel.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {intel.change >= 0 ? '+' : ''}{intel.change}%
            </div>
          </div>
        </div>
      </Card>

      {/* Section C: Timing */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">C</span> Timing
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Time Alignment</div>
            <div className="text-lg font-bold text-white">{intel.timeAlignment}/100</div>
            <ScoreBar value={intel.timeAlignment} color="#A855F7" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Session</div>
            <div className="text-sm text-slate-300">US Regular Hours</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Event Risk</div>
            <div className="text-sm text-amber-400">CPI Tomorrow</div>
          </div>
        </div>
      </Card>

      {/* Section D: Volatility */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">D</span> Volatility (DVE)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">DVE Regime</div>
            <Badge label={intel.volatilityState.regime} color={VOL_COLORS[intel.volatilityState.regime]} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">BBWP</div>
            <div className="text-lg font-bold text-white">{intel.volatilityState.bbwp}</div>
            <ScoreBar value={intel.volatilityState.bbwp} color={VOL_COLORS[intel.volatilityState.regime]} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Persistence</div>
            <div className="text-sm text-slate-300">{intel.volatilityState.persistence}%</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Expected Move</div>
            <div className="text-sm text-slate-300">{intel.optionsInfluence.expectedMove}%</div>
          </div>
        </div>
      </Card>

      {/* Section E: Options */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">E</span> Options / Derivatives
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Flow Bias</div>
            <span style={{ color: intel.optionsInfluence.flowBias === 'bullish' ? '#2FB36E' : intel.optionsInfluence.flowBias === 'bearish' ? '#E46767' : '#64748B' }} className="text-sm font-medium capitalize">
              {intel.optionsInfluence.flowBias}
            </span>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Gamma</div>
            <div className="text-sm text-slate-300 capitalize">{intel.optionsInfluence.gammaContext}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">IV Regime</div>
            <div className="text-sm text-slate-300 capitalize">{intel.optionsInfluence.ivRegime}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Expected Move</div>
            <div className="text-sm text-slate-300">{intel.optionsInfluence.expectedMove}%</div>
          </div>
        </div>
      </Card>

      {/* Section F: Trade Plan */}
      <Card className="border-emerald-500/20">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">F</span> Trade Plan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">Entry Trigger</div>
              <div className="text-sm text-emerald-400 font-medium">{intel.triggerCondition}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">Stop / Invalidation</div>
              <div className="text-sm text-red-400 font-medium">{intel.invalidation}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">Target Ladder</div>
              <div className="text-sm text-white">{intel.targets.map((t, i) => `T${i + 1}: $${t.toLocaleString()}`).join(', ')}</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="R:R" value={`${intel.riskReward}x`} color="#10B981" />
              <StatBox label="Confidence" value={`${intel.confidence}%`} />
              <StatBox label="Score" value={intel.mspScore} color={VERDICT_COLORS[intel.verdict]} />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigateTo('terminal', intel.symbol)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                Open in Trade Terminal →
              </button>
              <button
                onClick={() => navigateTo('workspace')}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 transition-colors"
              >
                + Watchlist
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
