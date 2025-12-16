import React from "react";
import DailyAIMarketFocus from "@/components/DailyAIMarketFocus";
import ToolsPageHeader from "@/components/ToolsPageHeader";

export default function AIToolsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="AI LAB"
        title="AI & Machine Learning Tools"
        subtitle="Planned AI features for pattern detection and portfolio insights."
        icon="🤖"
        backHref="/tools"
      />
      <main style={{ minHeight: "100vh", background: "#0F172A", color: "#fff", padding: "24px 16px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginTop: 16 }}>
            <h2 style={{ color: "#8B5CF6", marginBottom: 8 }}>Planned Features</h2>
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
          <div style={{ marginTop: 40 }}>
            <DailyAIMarketFocus />
          </div>
        </div>
      </main>
    </div>
  );
}
