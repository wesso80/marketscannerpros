export default function Footer() {
  return (
    <footer style={{borderTop:"1px solid #27272a", marginTop:32}}>
      <div className="container" style={{display:"flex",gap:"1rem",padding:"1rem 0",opacity:.85}}>
        <a href="/blog">Blog</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="mailto:support@marketscannerpros.app">Contact</a>
      </div>
    </footer>
  );
}
