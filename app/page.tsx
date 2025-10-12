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
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              🚀 Full Access Beta
            </h2>
            <p className="opacity-85 text-base md:text-lg">
              All features are free while we fine-tune based on trader feedback.
            </p>
          </div>

          <div className="plans" style={{ justifyContent: 'center' }}>
          {/* Full Access Beta */}
          <div className="plan" style={{ maxWidth: '400px' }}>
            <h2>Beta Access</h2>
            <p>$0</p>
            <p style={{ fontSize: '0.9em', opacity: 0.8, marginTop: '0.5em' }}>
              Beta access — All features unlocked while we improve!
            </p>
            <ul>
              <li>✅ Unlimited Market Scanner</li>
              <li>✅ Unlimited Price Alerts</li>
              <li>✅ Advanced Technical Charts</li>
              <li>✅ Unlimited Portfolio Tracking</li>
              <li>✅ Trade Journal</li>
              <li>✅ Strategy Backtesting</li>
              <li>✅ Backtesting Signal Alerts</li>
              <li>✅ Email Buy/Sell Notifications</li>
              <li>✅ TradingView Integration</li>
              <li>✅ Full Site Access</li>
            </ul>
            <button
              className="btn"
              onClick={() => window.open(getStreamlitUrl(), "_blank")}
            >
              🚀 Launch Free App
            </button>
          </div>
        </div>
        </div>
      </section>
      
      <ReferralBanner />
    </>
  );
}
