import "./styles.css";
import "./styles.css";
export default function PricingPage() {
  return (
    <main>
      <h1>Pricing</h1>
      <p>Start free. Upgrade any time. Cancel in your Stripe portal.</p>

      <div className="plans">
        {/* Free Plan */}
        <div className="plan">
          <h2>Free</h2>
          <p>$0</p>
          <ul>
            <li>Limited symbols</li>
            <li>Core scanner</li>
          </ul>
          <a href="/launch" className="btn">Launch App</a>
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
          <span className="btn" style={{opacity: 0.6}}>
            Coming Soon
          </span>
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
          <span className="btn" style={{opacity: 0.6}}>
            Coming Soon
          </span>
        </div>
      </div>
    </main>
  );
}
