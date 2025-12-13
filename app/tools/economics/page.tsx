
"use client";
import React, { useEffect, useState } from "react";

interface EconData {
  name: string;
  value: number | null;
  date: string | null;
}

const econList = [
  { key: "REAL_GDP", label: "Real GDP" },
  { key: "CPI", label: "Consumer Price Index (CPI)" },
  { key: "UNEMPLOYMENT", label: "Unemployment Rate" },
  { key: "INFLATION", label: "Inflation Rate" },
  { key: "RETAIL_SALES", label: "Retail Sales" },
  { key: "TREASURY_YIELD", label: "Treasury Yield" },
  // Add more indicators as needed
];

export default function EconomicsDashboard() {
  const [data, setData] = useState<EconData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEcon() {
      setLoading(true);
      setError(null);
      try {
        const results: EconData[] = [];
        for (const econ of econList) {
          const res = await fetch(`/api/economics?type=${econ.key}`);
          if (res.ok) {
            const json = await res.json();
            results.push({
              name: econ.label,
              value: json.value ?? null,
              date: json.date ?? null,
            });
          } else {
            results.push({ name: econ.label, value: null, date: null });
          }
        }
        setData(results);
      } catch (err) {
        setError("Failed to fetch economic data.");
      } finally {
        setLoading(false);
      }
    }
    fetchEcon();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#0F172A", color: "#fff", padding: "2rem" }}>
      <h1 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "1.5rem", color: "#3B82F6" }}>
        Economic Indicators
      </h1>
      <p style={{ color: "#94A3B8", marginBottom: "2rem" }}>
        Live macroeconomic data. Updated daily from premium sources.
      </p>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: "#EF4444" }}>{error}</div>
      ) : (
        <div style={{ width: "100%", overflowX: "auto", borderRadius: 12, background: "#1e293b" }}>
          <table style={{ minWidth: 360, width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#3B82F622" }}>
                <th style={{ padding: 12, textAlign: "left", fontWeight: 600, fontSize: 15 }}>Indicator</th>
                <th style={{ padding: 12, textAlign: "right", fontWeight: 600, fontSize: 15 }}>Latest Value</th>
                <th style={{ padding: 12, textAlign: "right", fontWeight: 600, fontSize: 15 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.name} style={{ borderBottom: "1px solid #334155" }}>
                  <td style={{ padding: 12, fontSize: 15 }}>{row.name}</td>
                  <td style={{ padding: 12, textAlign: "right", fontFamily: "monospace", fontSize: 15 }}>
                    {row.value !== null ? row.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                  </td>
                  <td style={{ padding: 12, textAlign: "right", fontSize: 15 }}>{row.date || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
