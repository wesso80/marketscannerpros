import CryptoTimeConfluenceWidget from '@/components/CryptoTimeConfluenceWidget';

export const metadata = {
  title: 'Crypto Time Confluence - MarketScannerPros',
  description: 'Track crypto market cycles from 1-365 days. Detect high-probability volatility expansion windows with institutional-grade time confluence analysis.',
};

export default function CryptoTimeConfluencePage() {
  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-2xl"><img src="/assets/scanners/time-confluence.png" alt="Time Confluence" className="h-full w-full object-contain p-1" /></div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Crypto Time Confluence Engine
          </h1>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto">
            Track crypto market cycles from 1 to 365 days, all anchored to the UTC daily close.
            Detect when multiple important time cycles align for high-probability setups.
          </p>
        </div>

        {/* Main Widget */}
        <div className="max-w-2xl mx-auto mb-12">
          <CryptoTimeConfluenceWidget />
        </div>

        {/* Info Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* 1-7 Day Micro */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">1-7 Day Micro Cycle</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>3D</span>
                <span className="text-yellow-400">Short-term reversals</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>5D</span>
                <span className="text-yellow-400">Breakout continuation</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>7D</span>
                <span className="text-orange-400">Weekly structural reset</span>
              </div>
            </div>
          </div>

          {/* 8-30 Day Monthly */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">8-30 Day Monthly Cycle</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>14D</span>
                <span className="text-yellow-400">Mid-cycle reset</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>21D</span>
                <span className="text-orange-400">3-week cycle</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>30D</span>
                <span className="text-red-400">Monthly close</span>
              </div>
            </div>
          </div>

          {/* 31-90 Day Macro */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">31-90 Day Macro Rotation</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>45D</span>
                <span className="text-orange-400">Momentum expansion</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>60D</span>
                <span className="text-orange-400">2-month reset</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>90D</span>
                <span className="text-red-400">Quarterly close</span>
              </div>
            </div>
          </div>

          {/* 91-365 Day Institutional */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">91-365 Day Institutional</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>180D</span>
                <span className="text-red-400">Half-year pivot</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>270D</span>
                <span className="text-orange-400">Expansion window</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>365D</span>
                <span className="text-red-400">Yearly close</span>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Daily Close Anchor</h3>
              <p className="text-gray-400">
                For TradingView crypto, every higher timeframe derives from the <strong className="text-white">daily close at 00:00 UTC</strong>.
                In Sydney (UTC+11), this is <strong className="text-white">11:00 AM local time</strong>.
                All higher timeframe cycles (3D, 7D, 30D, 90D, 365D) are multiples of this daily close.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Confluence Scoring</h3>
              <p className="text-gray-400 mb-3">
                The engine calculates a confluence score by summing the scores of all cycles closing within the next 48 hours:
              </p>
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-1 text-sm font-mono">
                <div className="text-gray-400">3D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-gray-400">5D close = <span className="text-yellow-400">+1</span></div>
                <div className="text-gray-400">7D close = <span className="text-orange-400">+2</span></div>
                <div className="text-gray-400">21D close = <span className="text-orange-400">+2</span></div>
                <div className="text-gray-400">30D close = <span className="text-red-400">+3</span></div>
                <div className="text-gray-400">90D close = <span className="text-red-400">+4</span></div>
                <div className="text-gray-400">180D close = <span className="text-red-400">+4</span></div>
                <div className="text-gray-400">365D close = <span className="text-red-400">+5</span></div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Alert Threshold</h3>
              <p className="text-gray-400 mb-3">
                When the confluence score reaches <strong className="text-orange-400">≥ 6</strong>, expect high-probability volatility expansion windows.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-gray-800/30 rounded px-3 py-2">
                  <div className="text-gray-500 text-xs mb-1">LOW (0-2)</div>
                  <div className="text-gray-400">Minimal confluence</div>
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
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Example: High Confluence</h3>
              <div className="bg-orange-900/20 border border-orange-500/50 rounded-lg p-4">
                <p className="text-orange-300 mb-3">
                  ⚠️ <strong>21D + 30D + 45D</strong> closing within 24 hours
                </p>
                <div className="space-y-1 text-sm text-gray-400">
                  <div>• 21D cycle (3-week) = +2</div>
                  <div>• 30D cycle (monthly) = +3</div>
                  <div>• 45D cycle (momentum) = +2</div>
                  <div className="pt-2 border-t border-orange-500/30 text-orange-400 font-semibold">
                    → Total Score: 7 (HIGH CONFLUENCE)
                  </div>
                </div>
                <p className="text-gray-400 mt-3 text-sm">
                  This is exactly what the Time Decompression model detects. Expect a massive breakout window.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trading Strategy */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Trading Strategy Integration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">Pre-Entry Checklist</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>✓ Check confluence score before entering</li>
                <li>✓ If score ≥ 6, prepare for volatility</li>
                <li>✓ Consider wider stops near high confluence</li>
                <li>✓ Wait for price confirmation</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">Position Sizing</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>• Low (0-2): Standard size</li>
                <li>• Medium (3-5): Standard size</li>
                <li>• High (6-9): Reduce size or wait</li>
                <li>• Extreme (≥10): Reduce or wait for breakout</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">Best Setups</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>⭐ High time confluence (≥6)</li>
                <li>⭐ Price at key level (S/R, Fib)</li>
                <li>⭐ Momentum confirmation</li>
                <li className="text-orange-400 font-semibold">→ 3-factor institutional edge</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>Time confluence is a timing accelerator, not a directional signal.</p>
          <p className="mt-2">Always combine with price action, volume, and fundamental analysis.</p>
        </div>
      </div>
    </div>
  );
}
