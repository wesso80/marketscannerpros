export default function Footer() {
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
      
      <div className="container" style={{display:"flex",gap:"1rem",padding:"1rem 0",opacity:.85}}>
        <a href="/blog">Blog</a>
        <a href="/disclaimer">Disclaimer</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="mailto:support@marketscannerpros.app">Contact</a>
      </div>
    </footer>
  );
}
