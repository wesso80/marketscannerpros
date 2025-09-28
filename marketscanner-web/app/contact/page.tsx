export const metadata = {
  title: "Contact — MarketScanner Pros",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main>
      <h1>Contact</h1>
      <p>Questions, feedback, or privacy requests? We’d love to hear from you.</p>

      <ul style={{ lineHeight: 1.8, marginLeft: "1.2rem" }}>
        <li>Email: <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a></li>
        <li>Privacy requests: see <a href="/privacy">Privacy Policy</a></li>
        <li>Status/updates: see <a href="/guide">User Guide</a></li>
      </ul>

      <p style={{ marginTop: 16 }}>
        <a className="btn" href="mailto:support@marketscannerpros.app?subject=Support%20Request">Email Support</a>
      </p>
    </main>
  );
}
