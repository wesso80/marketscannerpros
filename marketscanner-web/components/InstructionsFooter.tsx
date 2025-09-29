export default function InstructionsFooter() {
  return (
    <section style={{borderTop:"1px solid #27272a", marginTop:24}}>
      <div className="container" style={{padding:"1rem 0", lineHeight:1.7}}>
        <strong>User Guide:</strong>
        <ul style={{margin:"6px 0 0 1.2rem"}}>
          <li>Use the nav to open <a href="/privacy">Privacy</a>, <a href="/terms">Terms</a>, or <a href="/pricing">Pricing</a>.</li>
          <li>Cookie banner: click <em>Accept</em> to enable analytics; <em>Decline</em> to disable.</li>
          <li>To re-show the banner: open DevTools Console and run <code>localStorage.removeItem('msp-consent')</code>.</li>
        </ul>
      </div>
    </section>
  );
}
