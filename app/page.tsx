"use client";
import Pricing from "../components/Pricing";
import Testimonials from "../components/Testimonials";
import Hero from "../components/Hero";
import Why from "../components/Why";
import HowItWorks from "../components/HowItWorks";
import SocialProof from "../components/SocialProof";
import ReferralBanner from "../components/ReferralBanner";
import { useState } from "react";
import "./pricing/styles.css";

export default function Home() {
  const [loading, setLoading] = useState<string | null>(null);

  // Get Streamlit URL - use production deployment
  const getStreamlitUrl = () => {
    return "https://app.marketscannerpros.app";
  };

  const handleCheckout = async (plan: "pro" | "pro_trader") => {
    setLoading(plan);
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-3">
                Pricing & Plans
              </h2>
              <p className="opacity-85 text-base md:text-lg">
                Start free. Upgrade any time. Cancel in your Stripe portal.
              </p>
            </div>
            <a
              href="/auth"
              className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Already subscribed? Login →
            </a>
          </div>

          <div className="plans">
          {/* Free Plan */}
          <div className="plan">
            <h2>Free</h2>
            <p>$0</p>
            <ul>
              <li>✅ Unlimited Market Scanner</li>
              <li>✅ Portfolio Tracking (3 symbols)</li>
              <li>✅ Real-time Market Data</li>
              <li>✅ Try Pro with 5-7 day trial</li>
            </ul>
            <button
              className="btn"
              onClick={() => window.open(getStreamlitUrl(), "_blank")}
            >
              Launch App
            </button>
          </div>

          {/* Pro Plan */}
          <div className="plan">
            <h2>
              Pro <span className="badge">7-day free trial</span>
            </h2>
            <p>$4.99 / month</p>
            <ul>
              <li>✅ Unlimited Symbol Scanner</li>
              <li>✅ Unlimited Price Alerts</li>
              <li>✅ Advanced Technical Charts</li>
              <li>✅ Unlimited Portfolio Tracking</li>
              <li>🔒 Trade Journal (Pro Trader)</li>
              <li>🔒 Backtesting (Pro Trader)</li>
            </ul>
            <button
              className="btn"
              onClick={() => handleCheckout("pro")}
              disabled={loading === "pro"}
            >
              {loading === "pro" ? "Processing..." : "Start Free Trial"}
            </button>
          </div>

          {/* Full Pro Trader Plan */}
          <div className="plan">
            <h2>
              Full Pro Trader <span className="badge">5-day free trial</span>
            </h2>
            <p>$9.99 / month</p>
            <ul>
              <li>✅ Everything in Pro</li>
              <li>✅ Trade Journal</li>
              <li>✅ Strategy Backtesting</li>
              <li>✅ Backtesting Signal Alerts</li>
              <li>✅ Email Buy/Sell Notifications</li>
              <li>✅ TradingView Integration</li>
              <li>✅ Full Site Access</li>
            </ul>
            <button
              className="btn"
              onClick={() => handleCheckout("pro_trader")}
              disabled={loading === "pro_trader"}
            >
              {loading === "pro_trader" ? "Processing..." : "Start Free Trial"}
            </button>
          </div>
        </div>
        </div>
      </section>
      
      <ReferralBanner />
    </>
  );
}
