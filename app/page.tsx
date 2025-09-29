"use client";

export default function Home() {
  return (
    <div>
      <h1 style={{fontSize:"2rem", fontWeight:700, letterSpacing:"-0.02em"}}>MarketScanner Pros</h1>
      <p style={{opacity:.85, marginTop:8}}>Run smart scans, interpret scores, and manage alerts.</p>
      <p style={{marginTop:16}}>
        <button className="btn" onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Try multiple possible Streamlit URLs
          const hostname = window.location.hostname;
          const protocol = window.location.protocol;
          
          const possibleUrls = [
            // Published Replit app on different port
            `${protocol}//${hostname.replace('marketscannerapp', 'marketscannerapp-8080')}`,
            // Different port format
            `${protocol}//${hostname}:8080`,
            // Try with port in hostname format
            `${protocol}//${hostname.replace('-5000-', '-8080-')}`,
            `${protocol}//${hostname.replace('-3000-', '-8080-')}`,
            // Direct localhost for development
            `${protocol}//localhost:8080`
          ];
          
          // Try the first URL that might work
          const streamlitUrl = possibleUrls[0];
          console.log('Trying to open Streamlit at:', streamlitUrl);
          console.log('All possible URLs:', possibleUrls);
          
          // Force external navigation
          window.location.href = streamlitUrl;
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
  );
}
