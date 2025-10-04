'use client';

import { useState } from 'react';
import Hero from '@/components/Hero';

export default function HomePage() {
  const [loading, setLoading] = useState<'pro' | 'pro_trader' | null>(null);

  const getStreamlitUrl = () => '/'; // update if you have a specific app URL

  const handleCheckout = async (plan: 'pro' | 'pro_trader') => {
    try {
      setLoading(plan);
      // TODO: integrate Stripe
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Hero />

      {/* Pricing Section */}
      <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <h2 className="text-2xl md:text-3xl font-bold mb-2">Pricing &amp; Plans</h2>
        <p className="opacity-85 mb-8 text-sm md:text-base">
          Start free. Upgrade any time. Cancel in your Stripe portal.
        </p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Free */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 shadow">
            <h3 className="text-xl font-semibold mb-2">Free</h3>
            <p className="mb-4">$0</p>
            <ul className="mb-4 list-disc pl-5 text-sm text-neutral-300">
              <li>Limited symbols</li>
              <li>Core scanner</li>
            </ul>
            <button
              className="rounded-md border border-emerald-500 px-4 py-2 hover:bg-emerald-500/10"
              onClick={() => window.open(getStreamlitUrl(), '_blank')}
            >
              Launch App
            </button>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 shadow">
            <h3 className="text-xl font-semibold mb-2">
              Pro <span className="ml-2 text-xs rounded bg-emerald-600/20 px-2 py-0.5">7-day free trial</span>
            </h3>
            <p className="mb-4">$4.99 / month</p>
            <ul className="mb-4 list-disc pl-5 text-sm text-neutral-300">
              <li>Multi-TF confluence</li>
              <li>Squeezes</li>
              <li>Exports</li>
            </ul>
            <button
              className="rounded-md border border-emerald-500 px-4 py-2 hover:bg-emerald-500/10"
              onClick={() => handleCheckout('pro')}
              disabled={loading === 'pro'}
            >
              {loading === 'pro' ? 'Processing…' : 'Start Free Trial'}
            </button>
          </div>

          {/* Full Pro Trader */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 shadow">
            <h3 className="text-xl font-semibold mb-2">
              Full Pro Trader{' '}
              <span className="ml-2 text-xs rounded bg-emerald-600/20 px-2 py-0.5">5-day free trial</span>
            </h3>
            <p className="mb-4">$9.99 / month</p>
            <ul className="mb-4 list-disc pl-5 text-sm text-neutral-300">
              <li>All Pro features</li>
              <li>Advanced alerts</li>
              <li>Priority support</li>
            </ul>
            <button
              className="rounded-md border border-emerald-500 px-4 py-2 hover:bg-emerald-500/10"
              onClick={() => handleCheckout('pro_trader')}
              disabled={loading === 'pro_trader'}
            >
              {loading === 'pro_trader' ? 'Processing…' : 'Start Free Trial'}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
