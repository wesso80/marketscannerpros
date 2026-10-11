'use client';

import { CROSS_MARKET, REGIME_COLORS } from '@/app/v2/_lib/constants';
import type { RegimePriority } from '@/app/v2/_lib/types';
import { Badge, Card } from '@/app/v2/_components/ui';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import { marketText } from '@/lib/marketsPresentation';
import { humanizeEnum } from '@/lib/presentation/labels';

export default function CrossMarketPanel({ regime }: { regime: { data: any; loading: boolean } }) {
  return (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence Map</h3>

          {/* Market regime comes from stored market data. Account context is the separate card below. */}
          {!regime.data && !regime.loading && (
            <div className="mb-4 rounded-lg bg-[var(--msp-panel-2)] p-3 text-[12px] text-slate-400">
              <div className="text-[11px] text-slate-500 uppercase mb-1">Market Regime Signals</div>
              Market context not collected · no stored VIX or SPY trend observation.
            </div>
          )}
          {regime.data?.signals && regime.data.signals.length > 0 && (() => {
            const countedWeight = regime.data.signals.filter((s: any) => s.counted !== false).reduce((sum: number, s: any) => sum + (Number(s.weight) || 0), 0);
            return (
            <div className="mb-4">
              <div className="text-[11px] text-slate-500 uppercase mb-2">
                Market Regime Signals

              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {regime.data.signals.map((sig: any, i: number) => {
                  const r = sig.regime?.toLowerCase() || '';
                  const isHeadwind = r === 'risk_off' || r === 'compression' || r.includes('stress') || r.includes('trend_down');
                  const isTailwind = r === 'trend' || r === 'expansion' || r === 'risk_on' || r.includes('trend_up');
                  const color = isHeadwind ? 'var(--msp-bear)' : isTailwind ? 'var(--msp-bull)' : 'var(--msp-flat)';
                  const counted = sig.counted !== false;
                  const share = counted && countedWeight > 0 ? Math.round(((Number(sig.weight) || 0) / countedWeight) * 100) : 0;
                  return (
                    <div key={i} className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{sig.kind === 'market' ? 'Market data' : humanizeEnum(sig.source)}</span>
                        <div className="flex items-center gap-1">
                          <Badge label={marketText(sig.regime)} color={REGIME_COLORS[r as RegimePriority] || 'var(--msp-text-muted)'} small />
                          {sig.stale && <span role="status" className="text-[11px] text-yellow-500 border border-yellow-500/30 px-1 rounded">stale</span>}
                        </div>
                      </div>
                      {sig.detail ? <div className="mt-1 text-[11px] text-slate-400">{sig.detail}</div> : null}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div
                          role="progressbar"
                          aria-valuenow={share}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${sig.source} share of the regime decision`}
                          className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden"
                        >
                          <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-[11px] font-semibold" style={{ color }}>{counted ? (isHeadwind ? 'Headwind' : isTailwind ? 'Tailwind' : 'Neutral') : 'Context only'}</span>
                      </div>
                      {sig.kind === 'workspace' ? <div className="mt-1 text-[10px] text-slate-500">Your account signal{counted ? '' : ' — not counted while market data is available'}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {regime.data?.operatorContext && (
            <div className="mb-4">
              <div className="text-[11px] text-slate-500 uppercase mb-2">Context only</div>
              <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Account context</span>
                  <span className="text-[11px] font-semibold text-slate-400">Context only</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Stored risk environment: {regime.data.operatorContext.riskEnvironment ?? 'not set'}
                  {regime.data.operatorContext.stale ? ' · stale' : ''}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">Not a market regime and not a setup signal.</div>
              </div>
            </div>
          )}

          <CollapsibleSection title="Known relationships" summary={`${CROSS_MARKET.length} educational references`}>
          {/* Static known relationships */}
          <div className="text-[11px] text-slate-500 uppercase mb-2">Known Relationships</div>
          <div className="space-y-3">
            {CROSS_MARKET.map(cm => (
              <div key={cm.from} className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-white">{cm.from}</span>
                    <span className="text-xs text-slate-400 ml-2">{cm.condition}</span>
                  </div>
                  <Badge label={cm.effect.length > 30 ? cm.effect.slice(0, 30) + '...' : cm.effect} color="#F59E0B" small />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-600">Static heuristics — not live readings. Educational context only.</p>
          </CollapsibleSection>
        </Card>
  );
}
