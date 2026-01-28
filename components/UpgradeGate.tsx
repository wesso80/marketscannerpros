"use client";

import Link from "next/link";

interface UpgradeGateProps {
  requiredTier: "pro" | "pro_trader";
  feature: string;
  children?: React.ReactNode;
}

export default function UpgradeGate({ requiredTier, feature, children }: UpgradeGateProps) {
  const tierName = requiredTier === "pro_trader" ? "Pro Trader" : "Pro";
  const price = requiredTier === "pro_trader" ? "$29.99" : "$14.99";
  
  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{
        maxWidth: "480px",
        textAlign: "center",
        background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.8))",
        border: "1px solid rgba(51,65,85,0.8)",
        borderRadius: "20px",
        padding: "48px 40px",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontSize: "56px", marginBottom: "20px" }}>🔒</div>
        
        <h2 style={{
          fontSize: "26px",
          fontWeight: "700",
          color: "#f1f5f9",
          marginBottom: "12px",
        }}>
          {tierName} Feature
        </h2>
        
        <p style={{
          color: "#94a3b8",
          fontSize: "16px",
          lineHeight: "1.6",
          marginBottom: "24px",
        }}>
          <strong style={{ color: "#e2e8f0" }}>{feature}</strong> is available 
          on the {tierName} plan.
        </p>

        {children}

        <div style={{
          background: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "24px",
        }}>
          <div style={{ color: "#22c55e", fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>
            Unlock {requiredTier === "pro_trader" ? "Pro Trader" : "Pro"}
          </div>
          <div style={{ color: "#86efac", fontSize: "24px", fontWeight: "700" }}>
            {price}<span style={{ fontSize: "14px", fontWeight: "400" }}>/month</span>
          </div>
        </div>

        <Link
          href="/pricing"
          style={{
            display: "inline-block",
            background: requiredTier === "pro_trader" 
              ? "linear-gradient(135deg, #3b82f6, #8b5cf6)"
              : "linear-gradient(135deg, #14b8a6, #22c55e)",
            color: requiredTier === "pro_trader" ? "#fff" : "#0b1120",
            padding: "14px 32px",
            borderRadius: "999px",
            fontSize: "16px",
            fontWeight: "600",
            textDecoration: "none",
            boxShadow: "0 4px 15px rgba(34,197,94,0.3)",
          }}
        >
          Upgrade to {tierName}
        </Link>

        <p style={{
          color: "#6b7280",
          fontSize: "13px",
          marginTop: "16px",
        }}>
          7-day money-back guarantee • Cancel anytime
        </p>
      </div>
    </div>
  );
}
