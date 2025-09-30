"use client";

import Image from 'next/image';
import { useState } from 'react';
import './pricing/styles.css';

export default function Home() {
  const [loading, setLoading] = useState<string | null>(null);

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
      <div style={{display:'flex', gap:'3rem', alignItems:'flex-start', maxWidth:'1200px', margin:'0 auto'}}>
        <div style={{flex:1}}>
          <h1 style={{fontSize:"2rem", fontWeight:700, letterSpacing:"-0.02em"}}>MarketScanner Pros</h1>
          <p style={{opacity:.85, marginTop:8}}>Run smart scans, interpret scores, and manage alerts.</p>
          <p style={{marginTop:16}}>
            <button className="btn" onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              // Navigate to production app
              const streamlitUrl = 'https://app.marketscannerpros.app';
              console.log('Opening Market Scanner at:', streamlitUrl);
              
              // Open in new tab for better user experience
              window.open(streamlitUrl, '_blank');
            }}>Launch App</button>
          </p>

          <div style={{marginTop:32, opacity:.9}}>
            <h2>Why MarketScanner?</h2>
            <ul style={{lineHeight:1.7, marginLeft:"1.2rem"}}>
              <li>Multi-timeframe confluence scoring</li>
              <li>Squeeze detection and momentum context</li>
              <li>CSV exports and alert hooks</li>
            </ul>
          </div>
        </div>
        
        <div style={{flex:1, maxWidth:'500px'}}>
          <img 
            src="/dashboard-screenshot.png" 
            alt="MarketScanner Dashboard Preview" 
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
          />
        </div>
      </div>

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
            <a href="https://app.marketscannerpros.app" target="_blank" className="btn">Launch App</a>
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
// Force redeploy
// Fix Stripe API version
