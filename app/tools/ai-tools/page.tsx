"use client";

import React, { useState } from "react";
import DailyAIMarketFocus from "@/components/DailyAIMarketFocus";
import ToolsPageHeader from "@/components/ToolsPageHeader";

export default function AIToolsPage() {
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenStatus(null);
    try {
      // Always force regenerate when clicking the button
      const res = await fetch("/api/market-focus/generate?force=true", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setGenStatus(`✅ Generated: ${data.status} - ${data.date || ""}`);
        // Reload page to show new data
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setGenStatus(`❌ Error: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setGenStatus(`❌ Error: ${err?.message || "Failed to generate"}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="AI LAB"
        title="AI & Machine Learning Tools"
        subtitle="AI-powered market analysis using multi-timeframe structure and phase logic."
        icon="🤖"
        backHref="/tools"
        actions={
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "10px 20px",
              background: generating ? "#475569" : "linear-gradient(135deg, #8B5CF6, #6366F1)",
              border: "none",
              borderRadius: "10px",
              color: "#fff",
              fontWeight: 600,
              fontSize: "13px",
              cursor: generating ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(139, 92, 246, 0.3)",
            }}
          >
            {generating ? "⏳ Generating..." : "🔄 Refresh AI Focus"}
          </button>
        }
      />
      <main style={{ minHeight: "100vh", background: "#0F172A", color: "#fff", padding: "24px 16px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          {/* Status Message */}
          {genStatus && (
            <div style={{
              padding: "12px 20px",
              background: genStatus.startsWith("✅") ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${genStatus.startsWith("✅") ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
              borderRadius: "10px",
              marginBottom: "20px",
              color: genStatus.startsWith("✅") ? "#34d399" : "#f87171",
              fontSize: "14px",
            }}>
              {genStatus}
            </div>
          )}

          {/* AI Market Focus - Main Feature */}
          <div style={{ marginBottom: 32 }}>
            <DailyAIMarketFocus />
          </div>

          {/* How It Works */}
          <div style={{
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
            borderRadius: "16px",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            padding: "28px",
            marginBottom: 24,
          }}>
            <h2 style={{ color: "#a78bfa", marginBottom: 16, fontSize: "1.35rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              <span>🧠</span> How AI Market Focus Works
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
              <div style={{ background: "rgba(139, 92, 246, 0.1)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
                <h3 style={{ color: "#c4b5fd", fontSize: "15px", fontWeight: 600, marginBottom: 8 }}>📊 1. Multi-Asset Scanning</h3>
                <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                  Our scanner analyzes equities, crypto, and commodities using RSI, MACD, EMA structure, and ATR volatility metrics.
                </p>
              </div>
              <div style={{ background: "rgba(139, 92, 246, 0.1)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
                <h3 style={{ color: "#c4b5fd", fontSize: "15px", fontWeight: 600, marginBottom: 8 }}>🎯 2. Phase Detection</h3>
                <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                  Each asset is classified into market phases: Bullish Expansion, Bearish Expansion, Consolidation, or Recovery.
                </p>
              </div>
              <div style={{ background: "rgba(139, 92, 246, 0.1)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
                <h3 style={{ color: "#c4b5fd", fontSize: "15px", fontWeight: 600, marginBottom: 8 }}>🤖 3. AI Explanation</h3>
                <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                  GPT-4o-mini generates institutional-style analysis with key levels, risks, and actionable context for each pick.
                </p>
              </div>
            </div>
          </div>

          {/* Planned Features */}
          <div style={{
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
            borderRadius: "16px",
            border: "1px solid rgba(51,65,85,0.8)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            padding: "24px",
          }}>
            <h2 style={{ color: "#8B5CF6", marginBottom: 12, fontSize: "1.25rem", fontWeight: 600 }}>🚀 Coming Soon</h2>
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
        </div>
      </main>
    </div>
  );
}
