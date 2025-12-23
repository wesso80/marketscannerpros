'use client';

import Link from 'next/link';

export default function Footer() {
  // Helper to open cookie settings - reloads to show cookie banner again
  const openCookieSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('msp-consent');
      window.location.reload();
    }
  };

  return (
    <footer style={{borderTop:"1px solid #27272a", marginTop:32}}>
      {/* Legal Disclaimer */}
      <div style={{
        background: 'rgba(239,68,68,0.05)',
        borderBottom: '1px solid rgba(239,68,68,0.2)',
        padding: '16px 20px',
        textAlign: 'center'
      }}>
        <p style={{
          fontSize: 13,
          color: '#9ca3af',
          margin: 0,
          lineHeight: 1.6,
          maxWidth: 900,
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          ⚠️ <strong style={{ color: '#f87171' }}>Disclaimer:</strong> MarketScanner Pros is an educational and informational tool. 
          It is not investment advice and should not be construed as such. Past performance does not guarantee future results. 
          Trading involves substantial risk of loss. Consult a licensed financial advisor before making investment decisions.
        </p>
      </div>
      
      <div className="container" style={{display:"flex",gap:"1.5rem",padding:"1rem 0",opacity:.85,flexWrap:"wrap",justifyContent:"center",alignItems:"center"}}>
        <Link href="/blog">Blog</Link>
        <Link href="/guide">Guide</Link>
        <Link href="/disclaimer">Disclaimer</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/cookie-policy">Cookies</Link>
        <button 
          onClick={openCookieSettings}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'inherit', 
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
            textDecoration: 'underline',
            opacity: 0.7
          }}
        >
          Cookie Settings
        </button>
        <a href="mailto:support@marketscannerpros.app">Contact</a>
        <span style={{ opacity: 0.3 }}>|</span>
        <a 
          href="https://x.com/Marketscans1980" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          title="Follow us on X"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>
        <a 
          href="https://www.instagram.com/marketscannerpros" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          title="Follow us on Instagram"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
        </a>
        <a 
          href="https://www.youtube.com/@MarketScannerPros" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          title="Subscribe on YouTube"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </a>
      </div>
      
      {/* CCPA Do Not Sell Link */}
      <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem', opacity: 0.6, fontSize: 12 }}>
        <Link href="/privacy#ccpa" style={{ color: '#9ca3af' }}>Do Not Sell My Personal Information</Link>
      </div>
    </footer>
  );
}
