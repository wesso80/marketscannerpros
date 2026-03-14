'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 4: TRADE TERMINAL — Execution Cockpit
   Chart + Options + Volatility + Risk Calculator + Execution Notes
   Replaces: v1 Intraday Charts + Options Terminal + Derivatives + Crypto Terminal
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { useV2 } from '../_lib/V2Context';
import { REGIME_COLORS, VERDICT_COLORS, VOL_COLORS } from '../_lib/constants';
import { Card, Badge, TabBar, StatBox, EmptyState } from '../_components/ui';

export default function TerminalPage() {
  const { data, selectedSymbol, selectSymbol } = useV2();
  const [tab, setTab] = useState('Chart');
  const tabs = ['Chart', 'Options', 'Volatility', 'Risk', 'Execution Notes'];
  const intel = data.find(d => d.symbol === selectedSymbol) || data[0];

  const [accountSize, setAccountSize] = useState('50000');
  const [riskPct, setRiskPct] = useState('1');

  if (!intel) return <EmptyState message="No symbol selected" icon="▤" />;

  const riskDollars = (parseFloat(accountSize) * parseFloat(riskPct) / 100) || 0;
  const stopDist = Math.abs(intel.price - intel.targets[0]) * 0.3;
  const posSize = stopDist > 0 ? Math.floor(riskDollars / stopDist) : 0;

  return (
    <div className="space-y-4">
      {/* Symbol bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{intel.symbol}</h2>
          <span className="text-lg text-slate-400">${intel.price.toLocaleString()}</span>
          <span className={`text-sm ${intel.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {intel.change >= 0 ? '+' : ''}{intel.change}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge label={intel.verdict} color={VERDICT_COLORS[intel.verdict]} small />
          <Badge label={intel.regimePriority} color={REGIME_COLORS[intel.regimePriority]} small />
        </div>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Chart' && (
        <Card>
          <div className="aspect-[16/9] bg-[#0A101C] rounded-lg border border-slate-800/50 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <div className="text-4xl mb-3">📊</div>
              <div className="text-sm">Multi-timeframe chart</div>
              <div className="text-xs text-slate-600 mt-1">TradingView widget integration point</div>
              <div className="flex gap-2 justify-center mt-3">
                {['15m', '1H', '4H', 'D', 'W'].map(tf => (
                  <span key={tf} className="px-2 py-1 rounded text-[10px] bg-slate-800 text-slate-400">{tf}</span>
                ))}
              </div>
            </div>
          </div>
          {/* Key Levels Overlay */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-[10px] text-emerald-400 uppercase">Entry</div>
              <div className="text-sm font-bold text-white">{intel.triggerCondition}</div>
            </div>
            <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
              <div className="text-[10px] text-red-400 uppercase">Stop</div>
              <div className="text-sm font-bold text-white">{intel.invalidation}</div>
            </div>
            <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
              <div className="text-[10px] text-blue-400 uppercase">Targets</div>
              <div className="text-sm font-bold text-white">{intel.targets.join(' → ')}</div>
            </div>
          </div>
        </Card>
      )}

      {tab === 'Options' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Options Chain</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatBox label="Flow Bias" value={intel.optionsInfluence.flowBias} color={intel.optionsInfluence.flowBias === 'bullish' ? '#2FB36E' : '#E46767'} />
            <StatBox label="IV Regime" value={intel.optionsInfluence.ivRegime} />
            <StatBox label="Gamma" value={intel.optionsInfluence.gammaContext} />
            <StatBox label="Expected Move" value={`${intel.optionsInfluence.expectedMove}%`} color="#F59E0B" />
          </div>
          <div className="bg-[#0A101C] rounded-lg border border-slate-800/50 p-8 text-center text-slate-500">
            <div className="text-2xl mb-2">⛓</div>
            <div className="text-sm">Options chain integration point</div>
            <div className="text-xs text-slate-600 mt-1">Strikes, IV, Greeks, OI visualization</div>
          </div>
        </Card>
      )}

      {tab === 'Volatility' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Volatility Dashboard</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">DVE Regime</div>
              <Badge label={intel.volatilityState.regime} color={VOL_COLORS[intel.volatilityState.regime]} />
            </div>
            <StatBox label="BBWP" value={intel.volatilityState.bbwp} />
            <StatBox label="Persistence" value={`${intel.volatilityState.persistence}%`} />
            <StatBox label="Expected Move" value={`${intel.optionsInfluence.expectedMove}%`} color="#F59E0B" />
          </div>
          <div className="bg-[#0A101C] rounded-lg border border-slate-800/50 p-8 text-center text-slate-500">
            <div className="text-2xl mb-2">📈</div>
            <div className="text-sm">GEX, OI, dealer positioning visualization</div>
          </div>
        </Card>
      )}

      {tab === 'Risk' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Position Size Calculator</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Account Size ($)</label>
                <input
                  type="number"
                  value={accountSize}
                  onChange={e => setAccountSize(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#0A101C] border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Risk Per Trade (%)</label>
                <input
                  type="number"
                  value={riskPct}
                  onChange={e => setRiskPct(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#0A101C] border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatBox label="Risk ($)" value={`$${riskDollars.toFixed(0)}`} color="#EF4444" />
              <StatBox label="Position Size" value={`${posSize} shares`} color="#10B981" />
              <StatBox label="R:R Ratio" value={`${intel.riskReward}x`} color="#F59E0B" />
              <StatBox label="Max Gain" value={`$${(riskDollars * intel.riskReward).toFixed(0)}`} color="#10B981" />
            </div>
          </div>
        </Card>
      )}

      {tab === 'Execution Notes' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Setup Checklist</h3>
          <div className="space-y-3">
            {[
              { label: 'Regime compatible', check: true, detail: `${intel.regimePriority} regime — ${intel.regimeCompatibility.join(', ')} setups valid` },
              { label: 'Structure quality > 60', check: intel.structureQuality > 60, detail: `Structure: ${intel.structureQuality}` },
              { label: 'Confluence score > 70', check: intel.confluenceScore > 70, detail: `Confluence: ${intel.confluenceScore}` },
              { label: 'Time alignment > 50', check: intel.timeAlignment > 50, detail: `Time: ${intel.timeAlignment}` },
              { label: 'Cross-market alignment', check: intel.crossMarketInfluence.alignment !== 'headwind', detail: `${intel.crossMarketInfluence.alignment}: ${intel.crossMarketInfluence.factors[0]}` },
              { label: 'Options flow supportive', check: intel.optionsInfluence.flowBias === intel.directionalBias, detail: `Flow: ${intel.optionsInfluence.flowBias}` },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#0A101C]/50">
                <span className={`text-lg ${item.check ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.check ? '✓' : '✗'}
                </span>
                <div>
                  <div className="text-sm text-white">{item.label}</div>
                  <div className="text-[10px] text-slate-500">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-slate-800/30">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Notes</div>
            <textarea
              className="w-full bg-transparent text-sm text-white border-none focus:outline-none resize-none"
              rows={3}
              placeholder="Execution notes..."
            />
          </div>
        </Card>
      )}
    </div>
  );
}
