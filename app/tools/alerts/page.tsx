'use client';

import { ToolsPageHeader } from "@/components/ToolsPageHeader";
import AlertsWidget from "@/components/AlertsWidget";
import { useUserTier } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";

export default function AlertsPage() {
  const { tier, isLoading } = useUserTier();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white">
        <ToolsPageHeader 
          badge="TOOLS"
          title="Price Alerts"
          subtitle="Get notified when prices hit your targets"
          icon="🔔"
        />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-slate-800 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <ToolsPageHeader 
        badge="TOOLS"
        title="Price Alerts"
        subtitle="Get notified when prices hit your targets"
        icon="🔔"
      />
      
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

        {/* Feature Explanation */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
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
    </div>
  );
}
