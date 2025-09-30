"use client";

import Image from 'next/image';

export default function Home() {
  return (
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
  );
}
// Force redeploy
// Fix Stripe API version
