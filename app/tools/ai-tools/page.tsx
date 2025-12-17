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
          <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px", marginTop: 16 }}>
            <h2 style={{ color: "#8B5CF6", marginBottom: 12, fontSize: "1.25rem", fontWeight: 600 }}>Planned Features</h2>
            <ul style={{ color: "#e5e7eb", fontSize: "15px", lineHeight: 1.8, paddingLeft: "20px", margin: 0 }}>
              <li>Chart pattern recognition (AI/ML)</li>
              <li>Portfolio optimization (risk/reward, AI-driven)</li>
              <li>Trade signal generation (deep learning)</li>
              <li>Market anomaly detection</li>
              <li>Custom AI research tools</li>
            </ul>
            <p style={{ color: "#94A3B8", marginTop: 20, fontSize: "14px" }}>
              Have a feature request? Contact support@marketscannerpros.app
            </p>
          </div>
          <div style={{ marginTop: 32 }}>
            <DailyAIMarketFocus />
          </div>
        </div>
      </main>
    </div>
  );
}
