'use client';

import { ToolsPageHeader } from "@/components/ToolsPageHeader";
import AlertsWidget from "@/components/AlertsWidget";
import { useUserTier } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import { Suspense } from "react";

function AlertsContent() {
  const { tier, isLoading } = useUserTier();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          🔔 Price Alerts
        </h1>
        <p className="text-slate-400">
          Get notified when prices hit your targets. Set alerts for crypto, stocks, and forex.
        </p>
      </div>

      {/* Alerts Widget */}
      <AlertsWidget />

      {/* How It Works */}
      <div className="mt-8 bg-gradient-to-r from-slate-800/50 to-slate-900/50 rounded-xl p-6 border border-slate-700">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <span>📖</span> How Alerts Work
        </h3>
        <div className="space-y-4 text-sm text-slate-300">
          <div className="flex gap-3">
            <span className="text-emerald-400 font-bold">1.</span>
            <p><strong>Set your target</strong> — Choose a symbol, condition (above/below/% change), and price level</p>
          </div>
          <div className="flex gap-3">
            <span className="text-emerald-400 font-bold">2.</span>
            <p><strong>We monitor 24/7</strong> — Our system checks prices every 5 minutes against your alerts</p>
          </div>
          <div className="flex gap-3">
            <span className="text-emerald-400 font-bold">3.</span>
            <p><strong>Get notified instantly</strong> — When conditions are met, you receive push notifications and/or email</p>
          </div>
          <div className="flex gap-3">
            <span className="text-emerald-400 font-bold">4.</span>
            <p><strong>Take action</strong> — Click the alert to jump straight to the scanner with that symbol loaded</p>
          </div>
        </div>
      </div>

      {/* Alert Types Explainer */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
          <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span>💰</span> Price Alerts
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">All Tiers</span>
          </h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><strong className="text-slate-300">Price Above:</strong> Triggers when price exceeds your target (breakout alerts)</li>
            <li><strong className="text-slate-300">Price Below:</strong> Triggers when price drops below target (dip buying)</li>
            <li><strong className="text-slate-300">% Change Up:</strong> Triggers on X% gain (momentum alerts)</li>
            <li><strong className="text-slate-300">% Change Down:</strong> Triggers on X% drop (stop loss alerts)</li>
            <li><strong className="text-slate-300">Volume Spike:</strong> Triggers on unusual volume (activity alerts)</li>
          </ul>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-xl p-5 border border-purple-500/30">
          <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span>🔗</span> Multi-Condition Alerts
            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Pro</span>
          </h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><strong className="text-purple-300">AND Logic:</strong> Trigger when ALL conditions are met (e.g., RSI &lt; 30 AND Price &lt; $45K)</li>
            <li><strong className="text-purple-300">OR Logic:</strong> Trigger when ANY condition is met (e.g., Volume spike OR Price drop)</li>
            <li><strong className="text-purple-300">Technical Indicators:</strong> RSI, MACD, SMA, EMA cross conditions</li>
            <li><strong className="text-purple-300">Derivatives:</strong> Open Interest levels, funding rate thresholds</li>
            <li><strong className="text-purple-300">Up to 5 conditions:</strong> Combine multiple signals for precision alerts</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 grid md:grid-cols-1 gap-4">
        <div className="bg-gradient-to-br from-indigo-500/10 to-blue-500/10 rounded-xl p-5 border border-indigo-500/30">
          <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span>🧠</span> Smart Alerts
            <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">Pro Trader</span>
          </h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><strong className="text-indigo-300">OI Surge/Drop:</strong> Open Interest spikes or crashes (liquidation events)</li>
            <li><strong className="text-indigo-300">Funding Extremes:</strong> Overleveraged longs or shorts (squeeze setups)</li>
            <li><strong className="text-indigo-300">L/S Ratio:</strong> Crowded trades warning (reversal signals)</li>
            <li><strong className="text-indigo-300">Fear & Greed:</strong> Extreme sentiment (contrarian opportunities)</li>
            <li><strong className="text-indigo-300">OI Divergence:</strong> Smart money accumulation/distribution</li>
          </ul>
        </div>

      {/* Feature Cards */}
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
          <div className="text-2xl mb-2">⚡</div>
          <h3 className="font-semibold text-white mb-2">Instant Notifications</h3>
          <p className="text-sm text-slate-400">
            Get push notifications the moment your price target is hit.
          </p>
        </div>
        
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
          <div className="text-2xl mb-2">🔄</div>
          <h3 className="font-semibold text-white mb-2">Recurring Alerts</h3>
          <p className="text-sm text-slate-400">
            Set alerts to automatically re-arm after triggering for continuous monitoring.
          </p>
        </div>
        
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-semibold text-white mb-2">Multi-Asset</h3>
          <p className="text-sm text-slate-400">
            Create alerts for crypto, stocks, forex, and commodities all in one place.
          </p>
        </div>
      </div>

      {/* Tier limits */}
      <div className="mt-8 bg-slate-800/30 rounded-xl p-6 border border-slate-700">
        <h3 className="font-semibold text-white mb-4">Alert Limits by Plan</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className={`p-4 rounded-lg ${tier === 'free' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'}`}>
            <div className="text-sm text-slate-400 mb-1">Free</div>
            <div className="text-2xl font-bold text-white">3</div>
            <div className="text-xs text-slate-500">active alerts</div>
          </div>
          <div className={`p-4 rounded-lg ${tier === 'pro' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'}`}>
            <div className="text-sm text-slate-400 mb-1">Pro</div>
            <div className="text-2xl font-bold text-white">25</div>
            <div className="text-xs text-slate-500">active alerts</div>
          </div>
          <div className={`p-4 rounded-lg ${tier === 'pro_trader' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'}`}>
            <div className="text-sm text-slate-400 mb-1">Pro Trader</div>
            <div className="text-2xl font-bold text-white">∞</div>
            <div className="text-xs text-slate-500">unlimited alerts</div>
          </div>
        </div>
      </div>

      {/* Pro upsell */}
      {tier === 'free' && (
        <div className="mt-6">
          <UpgradeGate 
            requiredTier="pro" 
            feature="more price alerts"
          />
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <ToolsPageHeader 
        badge="TOOLS"
        title="Price Alerts"
        subtitle="Get notified when prices hit your targets"
        icon="🔔"
      />
      <Suspense fallback={
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-slate-800 rounded"></div>
          </div>
        </div>
      }>
        <AlertsContent />
      </Suspense>
    </div>
  );
}
