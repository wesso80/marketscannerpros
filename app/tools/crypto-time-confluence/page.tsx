import CryptoTimeConfluenceWidget from '@/components/CryptoTimeConfluenceWidget';

export const metadata = {
  title: 'Crypto Time Confluence - MarketScannerPros',
  description: 'Track crypto market cycles from 1-365 days. Detect high-probability volatility expansion windows with institutional-grade time confluence analysis.',
};

export default function CryptoTimeConfluencePage() {
  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-2xl"><img src="/assets/scanners/time-confluence.png" alt="Time Confluence" className="h-full w-full object-contain p-1" /></div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Crypto Time Confluence Engine
          </h1>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto">
            Track crypto market cycles from 1 to 365 days, all anchored to the UTC daily close.
            Detect when multiple important time cycles align for high-probability setups.
          </p>
        </div>

        {/* Main Widget */}
        <div className="max-w-2xl mx-auto mb-12">
          <CryptoTimeConfluenceWidget />
        </div>

        {/* Cycle Reference — all tracked cycles from the engine */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* 1-7 Day Micro */}
          <div className="bg-[var(--msp-card)] border border-[var(--msp-border)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">1-7 Day Micro Cycle</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>1D</span><span className="text-slate-600">+0</span></div>
              <div className="flex justify-between text-slate-400"><span>2D</span><span className="text-slate-600">+0</span></div>
              <div className="flex justify-between text-slate-400"><span>3D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>4D</span><span className="text-slate-600">+0</span></div>
              <div className="flex justify-between text-slate-400"><span>5D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>6D</span><span className="text-slate-600">+0</span></div>
              <div className="flex justify-between text-slate-400"><span>7D</span><span className="text-orange-400">+2</span></div>
            </div>
          </div>

          {/* 8-30 Day Monthly */}
          <div className="bg-[var(--msp-card)] border border-[var(--msp-border)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">8-30 Day Monthly Cycle</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>9D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>10D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>14D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>15D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>20D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>21D</span><span className="text-orange-400">+2</span></div>
              <div className="flex justify-between text-slate-400"><span>30D</span><span className="text-red-400">+3</span></div>
            </div>
          </div>

          {/* 31-90 Day Macro */}
          <div className="bg-[var(--msp-card)] border border-[var(--msp-border)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">31-90 Day Macro Rotation</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>45D</span><span className="text-orange-400">+2</span></div>
              <div className="flex justify-between text-slate-400"><span>60D</span><span className="text-orange-400">+2</span></div>
              <div className="flex justify-between text-slate-400"><span>72D</span><span className="text-yellow-400">+1</span></div>
              <div className="flex justify-between text-slate-400"><span>90D</span><span className="text-red-400">+4</span></div>
            </div>
          </div>

          {/* 91-365 Day Institutional */}
          <div className="bg-[var(--msp-card)] border border-[var(--msp-border)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">91-365 Day Institutional</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>120D</span><span className="text-orange-400">+2</span></div>
              <div className="flex justify-between text-slate-400"><span>180D</span><span className="text-red-400">+4</span></div>
              <div className="flex justify-between text-slate-400"><span>240D</span><span className="text-orange-400">+2</span></div>
              <div className="flex justify-between text-slate-400"><span>270D</span><span className="text-orange-400">+2</span></div>
              <div className="flex justify-between text-slate-400"><span>300D</span><span className="text-orange-400">+2</span></div>
              <div className="flex justify-between text-slate-400"><span>365D</span><span className="text-red-400">+5</span></div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-[var(--msp-card)] border border-[var(--msp-border)] rounded-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Daily Close Anchor</h3>
              <p className="text-slate-400">
                For TradingView crypto, every higher timeframe derives from the <strong className="text-white">daily close at 00:00 UTC</strong>.
                In Sydney (UTC+11), this is <strong className="text-white">11:00 AM local time</strong>.
                All higher timeframe cycles (3D, 7D, 30D, 90D, 365D) are multiples of this daily close.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Confluence Scoring</h3>
              <p className="text-slate-400 mb-3">
                The engine calculates a confluence score by summing the scores of all cycles closing within the next 48 hours:
              </p>
              <div className="bg-[var(--msp-panel)] rounded-lg p-4 space-y-1 text-sm font-mono">
                <div className="text-slate-400">3D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">5D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">7D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">9D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">10D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">14D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">15D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">20D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">21D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">30D close = <span className="text-red-400">+3</span></div>
                <div className="text-slate-400">45D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">60D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">72D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-slate-400">90D close = <span className="text-red-400">+4</span></div>
                <div className="text-slate-400">120D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">180D close = <span className="text-red-400">+4</span></div>
                <div className="text-slate-400">240D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">270D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">300D close = <span className="text-orange-400">+2</span></div>
                <div className="text-slate-400">365D close = <span className="text-red-400">+5</span></div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Alert Threshold</h3>
              <p className="text-slate-400 mb-3">
                When the confluence score reaches <strong className="text-orange-400">≥ 6</strong>, expect high-probability volatility expansion windows.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-slate-800/30 rounded px-3 py-2">
                  <div className="text-slate-500 text-xs mb-1">LOW (0-2)</div>
                  <div className="text-slate-400">Minimal confluence</div>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded px-3 py-2">
                  <div className="text-yellow-500 text-xs mb-1">MEDIUM (3-5)</div>
                  <div className="text-yellow-400">Moderate edge</div>
                </div>
                <div className="bg-orange-900/20 border border-orange-500/30 rounded px-3 py-2">
                  <div className="text-orange-500 text-xs mb-1">HIGH (6-9)</div>
                  <div className="text-orange-400">Watch for moves</div>
                </div>
                <div className="bg-red-900/20 border border-red-500/30 rounded px-3 py-2">
                  <div className="text-red-500 text-xs mb-1">EXTREME (≥10)</div>
                  <div className="text-red-400">Major window</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Example: High Confluence</h3>
              <div className="bg-orange-900/20 border border-orange-500/50 rounded-lg p-4">
                <p className="text-orange-300 mb-3">
                  ⚠️ <strong>21D + 30D + 45D</strong> closing within 24 hours
                </p>
                <div className="space-y-1 text-sm text-slate-400">
                  <div>• 21D cycle (3-week) = +2</div>
                  <div>• 30D cycle (monthly) = +3</div>
                  <div>• 45D cycle (momentum) = +2</div>
                  <div className="pt-2 border-t border-orange-500/30 text-orange-400 font-semibold">
                    → Total Score: 7 (HIGH CONFLUENCE)
                  </div>
                </div>
                <p className="text-slate-400 mt-3 text-sm">
                  This is exactly what the Time Decompression model detects. Expect a massive breakout window.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trading Strategy */}
        <div className="bg-[var(--msp-card)] border border-[var(--msp-border)] rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Trading Strategy Integration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-3">Pre-Entry Checklist</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>✓ Check confluence score before entering</li>
                <li>✓ If score ≥ 6, prepare for volatility</li>
                <li>✓ Consider wider stops near high confluence</li>
                <li>✓ Wait for price confirmation</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-3">Position Sizing</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>• Low (0-2): Standard size</li>
                <li>• Medium (3-5): Standard size</li>
                <li>• High (6-9): Reduce size or wait</li>
                <li>• Extreme (≥10): Reduce or wait for breakout</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-3">Best Setups</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>⭐ High time confluence (≥6)</li>
                <li>⭐ Price at key level (S/R, Fib)</li>
                <li>⭐ Momentum confirmation</li>
                <li className="text-orange-400 font-semibold">→ 3-factor institutional edge</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-slate-500 text-sm">
          <p>Time confluence is a timing accelerator, not a directional signal.</p>
          <p className="mt-2">Always combine with price action, volume, and fundamental analysis.</p>
        </div>
      </div>
    </div>
  );
}
