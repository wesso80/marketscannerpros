"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PromoStatus = { active: boolean; endsAt: string | null };

const DISMISS_KEY = "msp-promo-dismissed";

function formatDaysLeft(endsAt: string | null): string {
  if (!endsAt) return "for a limited time";
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return "for a limited time";
  const msLeft = end - Date.now();
  if (msLeft <= 0) return "ending soon";
  const days = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  if (days <= 1) return "ends today";
  return `${days} days left`;
}

export default function PromoBanner() {
  const [promo, setPromo] = useState<PromoStatus | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch("/api/promo", { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as PromoStatus;
        if (!data.active) return;
        setPromo(data);
        // Re-show the banner for each distinct promo window (keyed by end date).
        const dismissedFor = localStorage.getItem(DISMISS_KEY);
        setDismissed(dismissedFor === (data.endsAt ?? "active"));
      } catch {
        /* network/abort — silently skip banner */
      }
    }
    load();
    return () => controller.abort();
  }, []);

  if (!promo || !promo.active || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, promo.endsAt ?? "active");
    } catch {
      /* ignore storage errors */
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Promotion"
      style={{
        background: "linear-gradient(90deg, #065f46 0%, #047857 50%, #0f766e 100%)",
        color: "#ecfdf5",
        borderBottom: "1px solid rgba(16,185,129,0.35)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.6rem 1rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: "rgba(255,255,255,0.16)",
            borderRadius: 999,
            padding: "0.15rem 0.6rem",
          }}
        >
          Limited offer
        </span>
        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          Every Pro Trader tool is <strong>free for everyone</strong> — no sign-up required.
        </span>
        <span style={{ fontSize: "0.8rem", opacity: 0.9 }}>({formatDaysLeft(promo.endsAt)})</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Link
            href="/tools/golden-egg"
            className="no-underline"
            style={{
              background: "#ecfdf5",
              color: "#065f46",
              fontSize: "0.82rem",
              fontWeight: 700,
              borderRadius: 8,
              padding: "0.4rem 0.9rem",
            }}
          >
            Explore free →
          </Link>
          <button
            onClick={dismiss}
            aria-label="Dismiss promotion banner"
            style={{
              background: "transparent",
              border: "none",
              color: "#ecfdf5",
              fontSize: "1.1rem",
              lineHeight: 1,
              cursor: "pointer",
              padding: "0.2rem 0.4rem",
              opacity: 0.85,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
