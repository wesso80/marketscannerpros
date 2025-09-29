"use client";

import { useEffect } from 'react';

export default function Launch() {
  useEffect(() => {
    // Auto-redirect to Streamlit app
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    const streamlitUrl = `${protocol}//${hostname.replace('marketscannerapp', 'marketscannerapp-8080')}`;
    console.log('Redirecting to Streamlit app:', streamlitUrl);
    
    // Redirect after a short delay
    setTimeout(() => {
      window.location.href = streamlitUrl;
    }, 1000);
  }, []);

  return (
    <main style={{textAlign: 'center', padding: '2rem'}}>
      <h1>Launching Market Scanner...</h1>
      <p>Redirecting you to the trading dashboard...</p>
      <div style={{margin: '2rem 0'}}>
        <div style={{display: 'inline-block', width: '20px', height: '20px', border: '2px solid #f3f3f3', borderTop: '2px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite'}} />
      </div>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
