"use client";
import { useState } from "react";

export default function UpgradeButton({ plan = "pro" }: { plan?: "pro" | "pro_trader" }) {
  const [loading, setLoading] = useState(false);
  const enabled = process.env.NEXT_PUBLIC_ENABLE_PAYMENTS === "true";

  if (!enabled) return null;

  return (
    <button
      onClick={async () => {
        setLoading(true);
        const res = await fetch("/api/payments/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = await res.json();
        if (data?.url) window.location.href = data.url;
        else alert(data?.error ?? "Checkout failed");
        setLoading(false);
      }}
      className="rounded-lg px-4 py-2 font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
      disabled={loading}
    >
      {loading ? "Redirecting…" : plan === "pro_trader" ? "Upgrade to Pro Trader" : "Upgrade to Pro"}
    </button>
  );
}
