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
          
          // Navigate to current Streamlit app in Replit
          const streamlitUrl = 'https://marketscannerpros-8080.wesso80.repl.co';
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
  );
}
