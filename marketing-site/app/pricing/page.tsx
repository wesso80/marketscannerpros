'use client';
import { useState } from "react";
import "./styles.css";

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  
  const getStreamlitUrl = () => {
    return process.env.NEXT_PUBLIC_STREAMLIT_URL || 'https://app.marketscannerpros.app';
  };

  const handleFreeLaunch = () => {
    window.open(getStreamlitUrl(), '_blank');
  };

  const handleProCheckout = async () => {
    setLoading('pro');
    // TODO: This will call the checkout API endpoint once authentication is set up
    // For now, redirect to login/signup
    window.location.href = '/auth/login?plan=pro';
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {/* Temporary Free Banner */}
        <div className="mb-8 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
          <p className="text-emerald-400 font-medium">
            🎉 Currently FREE for everyone while we finalize our platform. Enjoy Pro features at no cost!
          </p>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-neutral-400">
            Start free. Upgrade when you're ready for advanced features.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8">
            <h2 className="text-2xl font-bold mb-2">Free</h2>
            <div className="text-4xl font-bold mb-6">
              $0 <span className="text-lg font-normal text-neutral-400">forever</span>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Core market scanner</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Basic technical indicators</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Limited symbols (top 100)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Trade journal</span>
              </li>
            </ul>

            <button
              onClick={handleFreeLaunch}
              className="w-full rounded-lg bg-neutral-700 px-6 py-3 font-medium text-lg hover:bg-neutral-600 transition"
            >
              Get Started Free
            </button>
            
            <p className="text-center text-neutral-500 text-sm mt-4">
              No credit card required
            </p>
          </div>

          {/* Pro Tier */}
          <div className="rounded-2xl border-2 border-emerald-500/40 bg-neutral-900/60 p-8 relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-emerald-500 text-neutral-900 px-4 py-1 rounded-full text-sm font-bold">
                MOST POPULAR
              </span>
            </div>
            
            <h2 className="text-2xl font-bold mb-2">Pro</h2>
            <div className="mb-6">
              <div className="text-4xl font-bold">
                $4.99 <span className="text-lg font-normal text-neutral-400">/ month</span>
              </div>
              <div className="text-lg text-neutral-300 mt-2">
                or $39.99/year <span className="text-emerald-400 font-medium">(save 33%)</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span className="font-medium">Everything in Free</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Unlimited symbols</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Advanced technical charts</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Price alerts & notifications</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>Strategy backtesting</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>TradingView integration</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <span>CSV exports & data analysis</span>
              </li>
            </ul>

            <button
              onClick={handleProCheckout}
              disabled={loading === 'pro'}
              className="w-full rounded-lg bg-emerald-500 px-6 py-3 font-medium text-lg text-neutral-900 hover:bg-emerald-400 transition disabled:opacity-60"
            >
              {loading === 'pro' ? 'Processing...' : 'Upgrade to Pro'}
            </button>
            
            <p className="text-center text-neutral-500 text-sm mt-4">
              Secure payment • Cancel anytime
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div className="border border-neutral-800 rounded-lg p-6 bg-neutral-900/40">
              <h3 className="font-bold mb-2">How do I upgrade to Pro?</h3>
              <p className="text-neutral-400">
                Click "Upgrade to Pro" above. You'll create an account with your email, then complete secure payment.
                Access is instant across web and mobile apps.
              </p>
            </div>
            
            <div className="border border-neutral-800 rounded-lg p-6 bg-neutral-900/40">
              <h3 className="font-bold mb-2">Can I cancel anytime?</h3>
              <p className="text-neutral-400">
                Yes! Cancel anytime from your account settings. You'll keep Pro access until the end of your billing period.
              </p>
            </div>
            
            <div className="border border-neutral-800 rounded-lg p-6 bg-neutral-900/40">
              <h3 className="font-bold mb-2">Do you offer refunds?</h3>
              <p className="text-neutral-400">
                We offer a 7-day money-back guarantee. If you're not satisfied, contact support for a full refund.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
