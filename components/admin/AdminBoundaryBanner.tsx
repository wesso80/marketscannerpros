"use client";

/**
 * AdminBoundaryBanner — persistent strip rendered on every admin route.
 * Reinforces the legal/operational boundary: this terminal is for private
 * research, analytics, alerting, and journaling only. There is no broker
 * connection, no order routing, no client trading authority, and no custody.
 *
 * Locked in by test/admin/boundaryLanguage.test.ts — do not remove.
 */
export default function AdminBoundaryBanner() {
  return (
    <div
      role="note"
      aria-label="Admin boundary notice"
      style={{
        background: "linear-gradient(90deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)",
        borderBottom: "1px solid rgba(16, 185, 129, 0.25)",
        padding: "0.4rem 1rem",
        textAlign: "center",
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "#10B981",
        userSelect: "none",
      }}
    >
      <span style={{ color: "#FBBF24", marginRight: "0.6rem" }}>●</span>
      Private Research Terminal — No Broker Execution · No Order Routing · No
      Client Trading Authority
    </div>
  );
}
