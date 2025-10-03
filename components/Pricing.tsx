// components/Pricing.tsx
"use client";

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
              <li className={featureItem}>• Limited symbols</li>
              <li className={featureItem}>• Core scanner</li>
            </ul>
            <button
              onClick={onLaunch}
              className="mt-6 w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-neutral-900 hover:bg-emerald-400"
            >
              Start Free Now
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              Powered by Stripe • Cancel anytime
            </p>
          </div>

          {/* Pro (Most Popular) */}
          <div className={`${baseCard} border-emerald-500/40 ring-1 ring-emerald-500/30`}>
            <div className="mb-2">
              <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs text-white">
                Most Popular
              </span>
            </div>
            <h3 className="text-xl font-semibold">Pro</h3>
            <p className="mt-1 text-2xl font-bold">
              $4.99 <span className="text-sm font-normal text-neutral-400">/ month</span>
            </p>
            <ul className="mt-6 space-y-3">
              <li className={featureItem}>• Unlimited symbols</li>
              <li className={featureItem}>• Multi-TF confluence scoring</li>
              <li className={featureItem}>• Squeeze detection</li>
              <li className={featureItem}>• CSV exports</li>
              <li className={featureItem}>• Basic alerts</li>
            </ul>
            <button
              onClick={() => onCheckout("pro")}
              disabled={loading === "pro"}
              className="mt-6 w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-neutral-900 hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading === "pro" ? "Processing…" : "Start 7-Day Free Trial"}
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              Payments secured by Stripe • Cancel anytime
            </p>
          </div>

          {/* Full Pro Trader */}
          <div className={baseCard}>
            <h3 className="text-xl font-semibold">Full Pro Trader</h3>
            <p className="mt-1 text-2xl font-bold">
              $9.99 <span className="text-sm font-normal text-neutral-400">/ month</span>
            </p>
            <ul className="mt-6 space-y-3">
              <li className={featureItem}>• Everything in Pro</li>
              <li className={featureItem}>• Advanced/priority alerts</li>
              <li className={featureItem}>• Priority support</li>
            </ul>
            <button
              onClick={() => onCheckout("pro_trader")}
              disabled={loading === "pro_trader"}
              className="mt-6 w-full rounded-lg bg-emerald-500 px-4 py-2 font-medium text-neutral-900 hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading === "pro_trader" ? "Processing…" : "Start 5-Day Free Trial"}
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              Payments secured by Stripe • Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
