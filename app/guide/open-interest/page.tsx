'use client';

import Link from 'next/link';
import { useState } from 'react';

const oiScenarios = [
  {
    scenario: "Rising OI + Rising Price",
    emoji: "📈",
    interpretation: "New money entering the market",
    meaning: "Strong bullish trend - new longs are opening positions, confirming the uptrend with fresh capital.",
    action: "Trend following. Look for pullback entries in the direction of the trend.",
    color: "green"
  },
  {
    scenario: "Rising OI + Falling Price",
    emoji: "📉",
    interpretation: "New shorts entering the market",
    meaning: "Strong bearish trend - new shorts are opening, confirming selling pressure with fresh capital.",
    action: "Avoid longs. Consider short opportunities on bounces.",
    color: "red"
  },
  {
    scenario: "Falling OI + Rising Price",
    emoji: "⚠️",
    interpretation: "Short squeeze / weak rally",
    meaning: "Shorts are closing (covering) causing price to rise. No new buyers entering - rally may be unsustainable.",
    action: "Be cautious with longs. This rally may exhaust quickly.",
    color: "amber"
  },
  {
    scenario: "Falling OI + Falling Price",
    emoji: "💨",
    interpretation: "Long liquidation / capitulation",
    meaning: "Longs are closing (selling) causing price to fall. Deleveraging event - could signal a bottom forming.",
    action: "Watch for capitulation exhaustion. Potential reversal setup.",
    color: "amber"
  }
];

const fundingExplainer = [
  {
    rate: "Positive (> 0%)",
    meaning: "Longs pay shorts",
    interpretation: "Bullish sentiment - traders are willing to pay a premium to stay long.",
    warning: "High positive funding (> 0.05%) suggests overheating - correction risk increases."
  },
  {
    rate: "Negative (< 0%)",
    meaning: "Shorts pay longs",
    interpretation: "Bearish sentiment - traders are willing to pay to stay short.",
    warning: "Deep negative funding (< -0.05%) suggests oversold conditions - bounce potential."
  },
  {
    rate: "Near Zero (±0.01%)",
    meaning: "Balanced market",
    interpretation: "No extreme positioning. Market is in equilibrium.",
    warning: "Breakout in either direction more likely to be genuine."
  }
];

const longShortExplainer = [
  {
    ratio: "> 1.5",
    meaning: "Crowded Long",
    interpretation: "More traders are long than short. Market is bullish but vulnerable.",
    contrarian: "Potential long squeeze if price drops. Consider reducing long exposure at extremes."
  },
  {
    ratio: "< 0.7",
    meaning: "Crowded Short",
    interpretation: "More traders are short than long. Market is bearish but vulnerable.",
    contrarian: "Potential short squeeze if price rises. Consider reducing short exposure at extremes."
  },
  {
    ratio: "0.9 - 1.1",
    meaning: "Balanced",
    interpretation: "Relatively equal long/short positioning.",
    contrarian: "No extreme to fade. Follow technical signals."
  }
];

export default function OpenInterestGuidePage() {
  const [activeTab, setActiveTab] = useState<'basics' | 'scenarios' | 'funding' | 'longshort' | 'tips'>('basics');

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-900/50 to-blue-900/50 border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Link href="/guide" className="text-emerald-400 hover:text-emerald-300 text-sm mb-4 inline-block">
            ← Back to User Guide
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            📊 How to Read Open Interest
          </h1>
          <p className="text-slate-300 text-lg">
            Master derivatives data to gain an edge in your crypto trading
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-700 sticky top-0 bg-[#0F172A] z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: 'basics', label: '📚 Basics' },
              { id: 'scenarios', label: '🎯 OI + Price' },
              { id: 'funding', label: '💰 Funding Rates' },
              { id: 'longshort', label: '⚖️ Long/Short' },
              { id: 'tips', label: '💡 Pro Tips' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-emerald-400 border-b-2 border-emerald-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Basics Tab */}
        {activeTab === 'basics' && (
          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold mb-4">What is Open Interest?</h2>
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <p className="text-lg text-slate-300 mb-4">
                  <strong className="text-white">Open Interest (OI)</strong> is the total number of outstanding 
                  derivative contracts (futures/perpetuals) that have not been settled.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-emerald-400 mb-2">OI Increases When:</h4>
                    <ul className="text-slate-300 space-y-1 text-sm">
                      <li>• A new buyer opens a long AND a new seller opens a short</li>
                      <li>• Fresh money enters the market</li>
                      <li>• Conviction is building in a direction</li>
                    </ul>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-red-400 mb-2">OI Decreases When:</h4>
                    <ul className="text-slate-300 space-y-1 text-sm">
                      <li>• An existing long closes AND an existing short closes</li>
                      <li>• Money exits the market (deleveraging)</li>
                      <li>• Positions are liquidated or profit-taken</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4">Why Does OI Matter?</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                  <div className="text-3xl mb-3">🔍</div>
                  <h3 className="font-semibold mb-2">Trend Confirmation</h3>
                  <p className="text-slate-400 text-sm">
                    Rising OI confirms that the current trend has conviction. Falling OI suggests the move may be exhausting.
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                  <div className="text-3xl mb-3">⚡</div>
                  <h3 className="font-semibold mb-2">Squeeze Detection</h3>
                  <p className="text-slate-400 text-sm">
                    Falling OI during price moves often indicates forced liquidations - short squeezes or long liquidations.
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                  <div className="text-3xl mb-3">📊</div>
                  <h3 className="font-semibold mb-2">Market Positioning</h3>
                  <p className="text-slate-400 text-sm">
                    High OI at certain price levels indicates where liquidations may cluster - potential support/resistance.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4">Reading the MSP Open Interest Widget</h2>
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-white mb-3">Widget Elements:</h4>
                    <ul className="space-y-3 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">Total OI:</span>
                        <span className="text-slate-300">Sum of all open contracts across top 20 coins (in USD value)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">24h Change:</span>
                        <span className="text-slate-300">Percentage change in OI over the last 24 hours. Green = increasing, Red = decreasing</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">BTC/ETH Dominance:</span>
                        <span className="text-slate-300">What % of total OI is in BTC vs ETH vs Altcoins</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">Contracts:</span>
                        <span className="text-slate-300">Number of coin units in open positions (not USD value)</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-3">Quick Signals:</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 bg-green-500/10 p-2 rounded">
                        <span className="text-green-400">↑ +5% OI</span>
                        <span className="text-slate-300">= Strong new positioning, expect volatility</span>
                      </div>
                      <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded">
                        <span className="text-red-400">↓ -5% OI</span>
                        <span className="text-slate-300">= Deleveraging event, reduced conviction</span>
                      </div>
                      <div className="flex items-center gap-2 bg-amber-500/10 p-2 rounded">
                        <span className="text-amber-400">Alt Dom &gt; 30%</span>
                        <span className="text-slate-300">= Risk-on sentiment, altseason potential</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* OI + Price Scenarios Tab */}
        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">OI + Price Action Matrix</h2>
            <p className="text-slate-400 mb-6">
              The relationship between OI changes and price movement tells you the <em>quality</em> of a trend.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              {oiScenarios.map((item, i) => (
                <div 
                  key={i} 
                  className={`bg-slate-800/50 rounded-xl p-5 border ${
                    item.color === 'green' ? 'border-green-500/30' :
                    item.color === 'red' ? 'border-red-500/30' :
                    'border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{item.emoji}</span>
                    <div>
                      <h3 className="font-bold text-white">{item.scenario}</h3>
                      <p className={`text-sm ${
                        item.color === 'green' ? 'text-green-400' :
                        item.color === 'red' ? 'text-red-400' :
                        'text-amber-400'
                      }`}>
                        {item.interpretation}
                      </p>
                    </div>
                  </div>
                  <p className="text-slate-300 text-sm mb-3">{item.meaning}</p>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <span className="text-xs text-slate-500 uppercase">Trading Action:</span>
                    <p className="text-emerald-400 text-sm font-medium">{item.action}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5 mt-6">
              <h4 className="font-semibold text-blue-400 mb-2">💡 Key Insight</h4>
              <p className="text-slate-300 text-sm">
                The <strong>strongest trends</strong> have rising OI + price moving in the trend direction.
                When OI falls during a price move, it's often shorts/longs being <strong>forced out</strong>, 
                not new conviction entering - these moves tend to reverse.
              </p>
            </div>
          </div>
        )}

        {/* Funding Rates Tab */}
        {activeTab === 'funding' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Understanding Funding Rates</h2>
            <p className="text-slate-400 mb-6">
              Funding rates are periodic payments between long and short traders to keep perpetual futures 
              prices anchored to spot prices. They reveal market sentiment.
            </p>

            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 mb-6">
              <h3 className="font-semibold mb-4">How Funding Works</h3>
              <div className="flex items-center justify-center gap-4 text-center mb-4">
                <div className="bg-green-500/20 rounded-lg p-4 flex-1">
                  <div className="text-2xl mb-2">🐂</div>
                  <div className="text-green-400 font-semibold">Longs</div>
                </div>
                <div className="text-2xl">↔️</div>
                <div className="bg-red-500/20 rounded-lg p-4 flex-1">
                  <div className="text-2xl mb-2">🐻</div>
                  <div className="text-red-400 font-semibold">Shorts</div>
                </div>
              </div>
              <p className="text-slate-300 text-sm text-center">
                Every 8 hours, one side pays the other based on the funding rate.
                <br />
                <strong>Positive funding</strong> = Longs pay shorts | <strong>Negative funding</strong> = Shorts pay longs
              </p>
            </div>

            <div className="space-y-4">
              {fundingExplainer.map((item, i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white">{item.rate}</h3>
                    <span className="text-sm text-slate-400">{item.meaning}</span>
                  </div>
                  <p className="text-slate-300 text-sm mb-2">{item.interpretation}</p>
                  <p className="text-amber-400 text-sm">⚠️ {item.warning}</p>
                </div>
              ))}
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mt-6">
              <h4 className="font-semibold text-emerald-400 mb-2">📊 Annualized Funding</h4>
              <p className="text-slate-300 text-sm">
                MSP shows funding as annualized percentage. <strong>Annualized &gt; 50%</strong> is extremely high 
                and historically unsustainable - often precedes mean reversion. This is the "cost" of holding 
                a leveraged position for a year at current rates.
              </p>
            </div>
          </div>
        )}

        {/* Long/Short Tab */}
        {activeTab === 'longshort' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Long/Short Ratio Analysis</h2>
            <p className="text-slate-400 mb-6">
              The Long/Short ratio shows the proportion of traders positioned long vs short. 
              It's a powerful <strong>contrarian indicator</strong> at extremes.
            </p>

            <div className="space-y-4">
              {longShortExplainer.map((item, i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="text-3xl font-bold text-white bg-slate-900 rounded-lg px-4 py-2">
                      {item.ratio}
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{item.meaning}</h3>
                      <p className="text-slate-400 text-sm">{item.interpretation}</p>
                    </div>
                  </div>
                  <div className="bg-amber-500/10 rounded-lg p-3">
                    <span className="text-xs text-amber-400 uppercase">Contrarian Signal:</span>
                    <p className="text-slate-300 text-sm">{item.contrarian}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 mt-6">
              <h4 className="font-semibold text-red-400 mb-2">⚠️ Important Caveat</h4>
              <p className="text-slate-300 text-sm">
                L/S ratio alone is NOT a trading signal. Extreme readings can persist during strong trends. 
                Use it to <strong>adjust position sizing</strong> and <strong>set tighter stops</strong> 
                when the crowd is heavily positioned in your direction.
              </p>
            </div>
          </div>
        )}

        {/* Pro Tips Tab */}
        {activeTab === 'tips' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Pro Trading Tips</h2>
            
            <div className="grid gap-4">
              <div className="bg-gradient-to-r from-emerald-900/30 to-emerald-800/10 rounded-xl p-5 border border-emerald-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">1️⃣</span>
                  <div>
                    <h3 className="font-bold text-white mb-2">Combine All Three Metrics</h3>
                    <p className="text-slate-300 text-sm">
                      The most powerful signals come when OI, funding, and L/S ratio align:
                    </p>
                    <ul className="text-sm text-slate-400 mt-2 space-y-1">
                      <li>• <strong className="text-green-400">Bullish setup:</strong> Rising OI + slightly positive funding + balanced L/S</li>
                      <li>• <strong className="text-red-400">Bearish setup:</strong> Rising OI + negative funding + L/S &lt; 1</li>
                      <li>• <strong className="text-amber-400">Reversal setup:</strong> Extreme funding + crowded positioning + OI starting to fall</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-900/30 to-blue-800/10 rounded-xl p-5 border border-blue-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">2️⃣</span>
                  <div>
                    <h3 className="font-bold text-white mb-2">Watch for OI Divergences</h3>
                    <p className="text-slate-300 text-sm">
                      When price makes new highs but OI is falling, the rally is losing steam. 
                      When price makes new lows but OI is falling, sellers are exhausted.
                      These divergences often precede reversals.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-900/30 to-purple-800/10 rounded-xl p-5 border border-purple-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">3️⃣</span>
                  <div>
                    <h3 className="font-bold text-white mb-2">Use 24h OI Change for Timing</h3>
                    <p className="text-slate-300 text-sm">
                      A sudden spike in OI (&gt;5% in 24h) often precedes major moves. 
                      This shows traders are aggressively positioning - volatility is coming.
                      Combine with technical levels for entry timing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-amber-900/30 to-amber-800/10 rounded-xl p-5 border border-amber-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">4️⃣</span>
                  <div>
                    <h3 className="font-bold text-white mb-2">Monitor BTC Dominance</h3>
                    <p className="text-slate-300 text-sm">
                      When BTC OI dominance rises, capital is concentrating in BTC (risk-off within crypto). 
                      When alt OI rises relative to BTC, traders are speculating on alts (risk-on, altseason vibes).
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-pink-900/30 to-pink-800/10 rounded-xl p-5 border border-pink-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">5️⃣</span>
                  <div>
                    <h3 className="font-bold text-white mb-2">Funding as a Carry Trade</h3>
                    <p className="text-slate-300 text-sm">
                      When funding is extremely positive, some traders short perps and buy spot to collect funding.
                      This can provide a floor under prices. When funding flips negative during a downtrend, 
                      this support disappears.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 mt-8">
              <h3 className="font-bold text-white mb-4">🎓 Summary Cheat Sheet</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 text-slate-400">Signal</th>
                      <th className="text-left py-2 text-slate-400">Meaning</th>
                      <th className="text-left py-2 text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr className="border-b border-slate-700">
                      <td className="py-2">OI ↑ + Price ↑</td>
                      <td>Strong bull trend</td>
                      <td className="text-green-400">Buy dips</td>
                    </tr>
                    <tr className="border-b border-slate-700">
                      <td className="py-2">OI ↑ + Price ↓</td>
                      <td>Strong bear trend</td>
                      <td className="text-red-400">Sell rallies</td>
                    </tr>
                    <tr className="border-b border-slate-700">
                      <td className="py-2">OI ↓ + Price ↑</td>
                      <td>Short squeeze</td>
                      <td className="text-amber-400">Caution on longs</td>
                    </tr>
                    <tr className="border-b border-slate-700">
                      <td className="py-2">OI ↓ + Price ↓</td>
                      <td>Capitulation</td>
                      <td className="text-amber-400">Watch for bottom</td>
                    </tr>
                    <tr className="border-b border-slate-700">
                      <td className="py-2">Funding &gt; 0.05%</td>
                      <td>Overheated longs</td>
                      <td className="text-amber-400">Reduce long size</td>
                    </tr>
                    <tr className="border-b border-slate-700">
                      <td className="py-2">Funding &lt; -0.05%</td>
                      <td>Oversold</td>
                      <td className="text-green-400">Look for longs</td>
                    </tr>
                    <tr>
                      <td className="py-2">L/S &gt; 1.5</td>
                      <td>Crowded long</td>
                      <td className="text-amber-400">Tighten stops</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Back to Scanner CTA */}
        <div className="mt-12 text-center">
          <Link 
            href="/tools/scanner" 
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            📊 View Live OI Data in Scanner
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 mt-12 py-6 text-center text-slate-500 text-sm">
        <p>Data sourced from Binance Futures. Updated every 5 minutes.</p>
        <p className="mt-1">This is educational content, not financial advice.</p>
      </div>
    </div>
  );
}
