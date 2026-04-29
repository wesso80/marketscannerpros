// components/Pricing.tsx
"use client";

import { PLAN_PRICES } from '@/lib/planPrices';

type Props = {
  loading: string | null;
  onLaunch: () => void;                           // Free plan action
  onCheckout: (plan: "pro" | "pro_trader") => void; // Stripe checkout
};

const baseCard =
  "rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 shadow-sm hover:shadow-md transition";
const featureItem = "flex items-start gap-2 text-neutral-300";

export default function Pricing({ loading, onLaunch, onCheckout }: Props) {
  return (
    <section className="border-t border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold md:text-4xl">Pricing & Plans</h2>
        <p className="mt-2 text-neutral-400">
          Start free. Upgrade any time. Cancel in your Stripe portal.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {/* Free */}
          <div className={baseCard}>
            <h3 className="text-xl font-semibold">Free</h3>
            <p className="mt-1 text-2xl font-bold">$0</p>
            <ul className="mt-6 space-y-3">
              <li className={featureItem}>• Top 10 equities + Top 10 crypto</li>
              <li className={featureItem}>• ARCA AI (10/day)</li>
              <li className={featureItem}>• Portfolio tracker (3 positions)</li>
              <li className={featureItem}>• Trade journal</li>
            </ul>
            <button
              onClick={onLaunch}
              className="mt-6 w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-neutral-900 hover:bg-emerald-400"
            >
              Start Free Now
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              No credit card required
            </p>
          </div>

          {/* Pro (Most Popular) */}
          <div className={`${baseCard} border-emerald-500/40 ring-1 ring-emerald-500/30`}>
            <div className="mb-2">
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-1 text-xs text-emerald-400 font-bold">
                Most Popular
              </span>
            </div>
            <h3 className="text-xl font-semibold">Pro</h3>
            <p className="mt-1 text-2xl font-bold">
              <span className="text-emerald-400">{PLAN_PRICES.pro.monthly}</span>
              <span className="text-sm font-normal text-neutral-400"> / month</span>
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              or <span className="text-emerald-400">{PLAN_PRICES.pro.yearly}/year</span> <span className="text-amber-400">({PLAN_PRICES.pro.yearlySavings})</span>
            </p>
            <ul className="mt-6 space-y-3">
              <li className={featureItem}>• Everything in Free</li>
              <li className={featureItem}>• Unlimited symbol scanning</li>
              <li className={featureItem}>• ARCA AI (50/day)</li>
              <li className={featureItem}>• Market Movers & News</li>
              <li className={featureItem}>• Company Overview</li>
              <li className={featureItem}>• AI Tools & Insights</li>
              <li className={featureItem}>• CSV exports across the research workflow</li>
            </ul>
            <button
              onClick={() => onCheckout("pro")}
              disabled={loading === "pro"}
              className="mt-6 w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-neutral-900 hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading === "pro" ? "Processing…" : "Upgrade to Pro"}
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              Cancel anytime
            </p>
          </div>

          {/* Full Pro Trader */}
          <div className={baseCard}>
            <div className="mb-2">
              <span className="rounded-full bg-blue-500/20 border border-blue-500/40 px-2 py-1 text-xs text-blue-400 font-bold">
                Full Access
              </span>
            </div>
            <h3 className="text-xl font-semibold text-blue-400">Pro Trader</h3>
            <p className="mt-1 text-2xl font-bold">
              <span className="text-blue-400">{PLAN_PRICES.pro_trader.monthly}</span>
              <span className="text-sm font-normal text-neutral-400"> / month</span>
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              or <span className="text-blue-400">{PLAN_PRICES.pro_trader.yearly}/year</span> <span className="text-amber-400">({PLAN_PRICES.pro_trader.yearlySavings})</span>
            </p>
            <ul className="mt-6 space-y-3">
              <li className={featureItem}>• Everything in Pro</li>
              <li className={featureItem}>• ARCA AI (200/day)</li>
              <li className={featureItem}>• Full backtesting engine</li>
              <li className={featureItem}>• Golden Egg Deep Analysis</li>
              <li className={featureItem}>• AI Confluence Scanner</li>
              <li className={featureItem}>• Options Confluence Scanner</li>
              <li className={featureItem}>• Premium support</li>
            </ul>
            <button
              onClick={() => onCheckout("pro_trader")}
              disabled={loading === "pro_trader"}
              className="mt-6 w-full rounded-lg bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-400 disabled:opacity-60"
            >
              {loading === "pro_trader" ? "Processing…" : "Upgrade to Pro Trader"}
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
