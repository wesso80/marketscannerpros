import Why from "../components/Why";
"use client";
import HowItWorks from "../components/HowItWorks";
import Hero from "../components/Hero";

import Image from 'next/image';
import { useState } from 'react';
import './pricing/styles.css';

export default function Home() {
  const [loading, setLoading] = useState<string | null>(null);

  // Get Streamlit URL from env or construct it
  const getStreamlitUrl = () => {
    // Use environment variable if set
    if (process.env.NEXT_PUBLIC_STREAMLIT_URL) {
      return process.env.NEXT_PUBLIC_STREAMLIT_URL;
    }
    
    // Fallback for local development
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
        return 'http://localhost:5000';
      }
    }
    
    // Default fallback
    return 'https://app.marketscannerpros.app';
  };

  const handleCheckout = async (plan: 'pro' | 'pro_trader') => {
    setLoading(plan);
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Hero />
      {/* removed legacy hero block */}
      <HowItWorks />
      {/* Pricing Section */}
      <div style={{marginTop:'4rem', maxWidth:'1200px', margin:'4rem auto 0'}}>
        <h2 style={{fontSize:"1.75rem", fontWeight:700, marginBottom:'0.5rem'}}>Pricing & Plans</h2>
        <p style={{opacity:.85, marginBottom:'2rem'}}>Start free. Upgrade any time. Cancel in your Stripe portal.</p>

        <div className="plans">
          {/* Free Plan */}
          <div className="plan">
            <h2>Free</h2>
            <p>$0</p>
            <ul>
              <li>Limited symbols</li>
              <li>Core scanner</li>
            </ul>
            <button
              className="btn"
              onClick={() => window.open(getStreamlitUrl(), '_blank')}
            >
              Launch App
            </button>
          </div>

          {/* Pro Plan */}
          <div className="plan">
            <h2>Pro <span className="badge">7-day free trial</span></h2>
            <p>$4.99 / month</p>
            <ul>
              <li>Multi-TF confluence</li>
              <li>Squeezes</li>
              <li>Exports</li>
            </ul>
            <button 
              className="btn" 
              onClick={() => handleCheckout('pro')}
              disabled={loading === 'pro'}
            >
              {loading === 'pro' ? 'Processing...' : 'Start Free Trial'}
            </button>
          </div>

          {/* Full Pro Trader Plan */}
          <div className="plan">
            <h2>Full Pro Trader <span className="badge">5-day free trial</span></h2>
            <p>$9.99 / month</p>
            <ul>
              <li>All Pro features</li>
              <li>Advanced alerts</li>
              <li>Priority support</li>
            </ul>
            <button 
              className="btn" 
              onClick={() => handleCheckout('pro_trader')}
              disabled={loading === 'pro_trader'}
            >
              {loading === 'pro_trader' ? 'Processing...' : 'Start Free Trial'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
