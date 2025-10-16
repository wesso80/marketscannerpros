"use client";
import Pricing from "../components/Pricing";
import Testimonials from "../components/Testimonials";
import Hero from "../components/Hero";
import Why from "../components/Why";
import HowItWorks from "../components/HowItWorks";
import SocialProof from "../components/SocialProof";
import ReferralBanner from "../components/ReferralBanner";
import "./pricing/styles.css";

export default function Home() {
  // Get Streamlit URL - use production deployment
  const getStreamlitUrl = () => {
    return "https://app.marketscannerpros.app";
  };

  return (
    <>
      <Hero />
      <SocialProof />
      <Why />
      <HowItWorks />
      <Testimonials />
      
      {/* Pricing Section */}
      <section className="w-full border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Simple, Transparent Pricing
            </h2>
            <p className="text-neutral-400 text-lg">
              Start free. Upgrade when you're ready for advanced features.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Free Tier */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
              <h3 className="text-2xl font-bold mb-2">Free</h3>
              <div className="text-3xl font-bold mb-4">$0 <span className="text-base font-normal text-neutral-400">forever</span></div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Core market scanner</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Basic technical indicators</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Limited symbols (top 100)</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Trade journal</span></li>
              </ul>
              <button
                onClick={() => window.open(getStreamlitUrl(), "_blank")}
                className="w-full rounded-lg bg-neutral-700 px-4 py-3 font-medium hover:bg-neutral-600"
              >
                Get Started Free
              </button>
            </div>

            {/* Pro Tier */}
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-neutral-900/60 p-6 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-emerald-500 text-neutral-900 px-3 py-1 rounded-full text-xs font-bold">MOST POPULAR</span>
              </div>
              <h3 className="text-2xl font-bold mb-2">Pro</h3>
              <div className="mb-4">
                <div className="text-3xl font-bold">$4.99 <span className="text-base font-normal text-neutral-400">/ month</span></div>
                <div className="text-sm text-neutral-400 mt-1">or $39.99/year (save 33%)</div>
              </div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Everything in Free</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Unlimited symbols</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Advanced technical charts</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Price alerts & notifications</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>Strategy backtesting</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>TradingView integration</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span>CSV exports</span></li>
              </ul>
              <button
                onClick={() => window.location.href = "/pricing"}
                className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-medium text-neutral-900 hover:bg-emerald-400"
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
          
          <p className="text-center text-neutral-500 text-sm mt-6">
            All payments securely processed. Cancel anytime.
          </p>
        </div>
      </section>
      
      <ReferralBanner />
    </>
  );
}
