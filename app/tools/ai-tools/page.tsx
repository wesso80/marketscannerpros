import React from "react";
import DailyAIMarketFocus from "@/components/DailyAIMarketFocus";
import PageHero from "@/components/PageHero";

export default function AIToolsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <PageHero
          badge="AI TOOLS"
          icon="🤖"
          title="AI & Machine Learning Tools"
          subtitle="Advanced AI-powered features for pattern recognition, signal explanation, and portfolio optimization."
        />
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginTop: 16 }}>
        <h2 style={{ color: "#10B981", marginBottom: 8, fontSize: "1.5rem" }}>Planned Features</h2>
        <ul style={{ color: "#e5e7eb", fontSize: 16, lineHeight: 1.7 }}>
          <li>Chart pattern recognition (AI/ML)</li>
          <li>Portfolio optimization (risk/reward, AI-driven)</li>
          <li>Trade signal generation (deep learning)</li>
          <li>Market anomaly detection</li>
          <li>Custom AI research tools</li>
        </ul>
        <p style={{ color: "#94A3B8", marginTop: 18 }}>
          Have a feature request? Contact support@marketscannerpros.app
        </p>
      </div>
      {/* Daily AI Market Focus Panel */}
      <div style={{ marginTop: 40 }}>
        <DailyAIMarketFocus />
      </div>
      </div>
    </main>
  );
}
