"use client";

import { useState } from "react";

export default function PortalButton() {
  const [loading, setLoading] = useState(false);

  const openPortal = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Unable to open billing portal");
      }
    } catch (err) {
      alert("Failed to open billing portal. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={openPortal}
      disabled={loading}
      style={{
        padding: "10px 20px",
        background: loading ? "#475569" : "var(--msp-accent)",
        border: "none",
        borderRadius: "10px",
        color: "#fff",
        fontWeight: 600,
        fontSize: "14px",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: "0 4px 14px rgba(59, 130, 246, 0.3)",
      }}
    >
      {loading ? "Loading..." : "⚙️ Manage Subscription"}
    </button>
  );
}