import React from "react";

export interface DeskStripItem {
  label: string;
  value: string;
  color: string;
}

export interface FocusSummaryField {
  label: string;
  value: string;
  color?: string;
  spanFull?: boolean;
}

export function DeskTopStrip({ items }: { items: DeskStripItem[] }) {
  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(2,6,23,0.95), rgba(15,23,42,0.90))",
      border: "1px solid rgba(56,189,248,0.3)",
      borderRadius: "10px",
      padding: "0.48rem 0.6rem",
      marginBottom: "0.65rem",
      display: "flex",
      flexWrap: "wrap",
      gap: "0.5rem",
      alignItems: "center",
    }}>
      {items.map((item) => (
        <div
          key={`${item.label}:${item.value}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            background: "rgba(15,23,42,0.55)",
            border: "1px solid rgba(148,163,184,0.24)",
            borderRadius: "999px",
            padding: "0.2rem 0.55rem",
            fontSize: "0.67rem",
          }}
        >
          <span style={{ color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>{item.label}</span>
          <span style={{ color: item.color, fontWeight: 800 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function AIDeskFeedStrip({ message }: { message: string }) {
  return (
    <div style={{
      marginTop: "-0.45rem",
      marginBottom: "0.8rem",
      background: "linear-gradient(145deg, rgba(2,6,23,0.92), rgba(15,23,42,0.88))",
      border: "1px solid rgba(59,130,246,0.28)",
      borderRadius: "10px",
      padding: "0.5rem 0.65rem",
      display: "flex",
      alignItems: "center",
      gap: "0.55rem",
      flexWrap: "wrap",
    }}>
      <div style={{ color: "#93C5FD", fontSize: "0.69rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        🧠 AI Desk Feed
      </div>
      <div style={{ color: "#CBD5E1", fontSize: "0.74rem", flex: 1 }}>{message}</div>
    </div>
  );
}

export function FocusSummaryCard({ fields }: { fields: FocusSummaryField[] }) {
  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(2,6,23,0.95), rgba(15,23,42,0.9))",
      border: "1px solid rgba(16,185,129,0.32)",
      borderRadius: "10px",
      padding: "0.72rem 0.82rem",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: "0.45rem",
    }}>
      {fields.map((field) => (
        <div key={`${field.label}:${field.value}`} style={field.spanFull ? { gridColumn: "1 / -1" } : undefined}>
          <div style={{ color: "#64748B", fontSize: "0.64rem", textTransform: "uppercase", fontWeight: 700 }}>{field.label}</div>
          <div style={{ color: field.color || "#E2E8F0", fontWeight: 800 }}>{field.value}</div>
        </div>
      ))}
    </div>
  );
}
