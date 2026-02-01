"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PortalButton from "@/components/PortalButton";
import { useUserTier } from "@/lib/useUserTier";

export default function AccountPage() {
  const { tier, isLoading, isLoggedIn } = useUserTier();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // Get user info
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.email) setEmail(data.email);
      })
      .catch(() => {});
  }, []);

  const tierDisplay = {
    free: { name: "Free", color: "#9ca3af", badge: "bg-gray-600" },
    pro: { name: "Pro", color: "#22c55e", badge: "bg-emerald-600" },
    pro_trader: { name: "Pro Trader", color: "#3b82f6", badge: "bg-blue-600" },
    anonymous: { name: "Not Signed In", color: "#6b7280", badge: "bg-gray-700" },
  };

  const currentTier = tierDisplay[tier] || tierDisplay.anonymous;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f9fafb" }}>
      {/* Header */}
      <div style={{ 
        borderBottom: "1px solid rgba(51,65,85,0.5)", 
        padding: "20px",
        background: "rgba(15,23,42,0.8)"
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/tools" style={{ color: "#94a3b8", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            ← Back to Tools
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Account Settings</h1>
          <div style={{ width: 100 }}></div>
        </div>
      </div>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 24 }}>Loading...</div>
          </div>
        ) : !isLoggedIn ? (
          <div style={{ 
            textAlign: "center", 
            padding: 60,
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
            borderRadius: 16,
            border: "1px solid rgba(51,65,85,0.8)"
          }}>
            <h2 style={{ fontSize: 24, marginBottom: 16 }}>Sign In Required</h2>
            <p style={{ color: "#94a3b8", marginBottom: 24 }}>
              Please sign in to view your account settings.
            </p>
            <Link 
              href="/auth"
              style={{
                display: "inline-block",
                padding: "12px 32px",
                background: "linear-gradient(135deg, #14b8a6, #22c55e)",
                color: "#0b1120",
                borderRadius: 999,
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              Sign In
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Subscription Status Card */}
            <div style={{ 
              background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
              borderRadius: 16,
              border: "1px solid rgba(51,65,85,0.8)",
              padding: 32,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <span>📊</span> Subscription Status
              </h2>
              
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div style={{
                  padding: "8px 20px",
                  background: currentTier.badge,
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#fff"
                }}>
                  {currentTier.name}
                </div>
                {tier === "pro" || tier === "pro_trader" ? (
                  <span style={{ color: "#22c55e", fontSize: 14 }}>✓ Active</span>
                ) : (
                  <span style={{ color: "#94a3b8", fontSize: 14 }}>Free tier</span>
                )}
              </div>

              {email && (
                <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>
                  Signed in as: <strong style={{ color: "#e5e7eb" }}>{email}</strong>
                </p>
              )}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(tier === "pro" || tier === "pro_trader") && (
                  <PortalButton />
                )}
                
                {tier === "free" && (
                  <Link
                    href="/pricing"
                    style={{
                      padding: "10px 20px",
                      background: "linear-gradient(135deg, #14b8a6, #22c55e)",
                      border: "none",
                      borderRadius: 10,
                      color: "#0b1120",
                      fontWeight: 600,
                      fontSize: 14,
                      textDecoration: "none",
                      boxShadow: "0 4px 14px rgba(20,184,166,0.4)"
                    }}
                  >
                    🚀 Upgrade to Pro
                  </Link>
                )}
              </div>
            </div>

            {/* Plan Features Card */}
            <div style={{ 
              background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
              borderRadius: 16,
              border: "1px solid rgba(51,65,85,0.8)",
              padding: 32
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <span>✨</span> Your Plan Features
              </h2>
              
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {tier === "free" && (
                  <>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Scanner (Top 10 equities + crypto)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> MSP Analyst AI (10/day)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Portfolio tracker (3 positions)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Trade journal
                    </li>
                  </>
                )}
                {tier === "pro" && (
                  <>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Unlimited symbol scanning
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> MSP Analyst AI (50/day)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Market Movers & News
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Company Overview
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> AI Tools & Insights
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> CSV exports
                    </li>
                  </>
                )}
                {tier === "pro_trader" && (
                  <>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#3b82f6" }}>✓</span> Everything in Pro
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#3b82f6" }}>✓</span> MSP Analyst AI (200/day)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#3b82f6" }}>✓</span> Full backtesting engine
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#3b82f6" }}>✓</span> Golden Egg Deep Analysis
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#3b82f6" }}>✓</span> Premium support
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Help Card */}
            <div style={{ 
              background: "rgba(15,23,42,0.5)",
              borderRadius: 16,
              border: "1px solid rgba(51,65,85,0.5)",
              padding: 24,
              textAlign: "center"
            }}>
              <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
                Need help? Contact us at{" "}
                <a href="mailto:support@marketscannerpros.app" style={{ color: "#22c55e" }}>
                  support@marketscannerpros.app
                </a>
              </p>
            </div>

            {/* Data Management Card */}
            <div style={{ 
              background: "rgba(239,68,68,0.05)",
              borderRadius: 16,
              border: "1px solid rgba(239,68,68,0.2)",
              padding: 24,
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, color: "#f87171" }}>
                <span>🗑️</span> Data Management
              </h2>
              <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
                Under GDPR and Australian Privacy laws, you have the right to request deletion of your personal data.
              </p>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to request deletion of all your data? This action cannot be undone. You will receive a confirmation email within 48 hours.")) {
                    // Send deletion request
                    fetch("/api/auth/delete-request", {
                      method: "POST",
                      credentials: "include"
                    }).then(res => {
                      if (res.ok) {
                        alert("Data deletion request submitted. You will receive a confirmation email within 48 hours.");
                      } else {
                        alert("Failed to submit request. Please email support@marketscannerpros.app directly.");
                      }
                    }).catch(() => {
                      alert("Failed to submit request. Please email support@marketscannerpros.app directly.");
                    });
                  }
                }}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                Request Data Deletion
              </button>
              <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12 }}>
                Or email <a href="mailto:support@marketscannerpros.app?subject=Data%20Deletion%20Request" style={{ color: "#94a3b8" }}>support@marketscannerpros.app</a> with subject "Data Deletion Request"
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
