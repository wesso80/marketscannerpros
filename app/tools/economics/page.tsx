
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
        Live macroeconomic data powered by Alpha Vantage Premium API.
      </p>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: "#EF4444" }}>{error}</div>
      ) : (
        <table style={{ width: "100%", background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#3B82F622" }}>
              <th style={{ padding: 12, textAlign: "left" }}>Indicator</th>
              <th style={{ padding: 12, textAlign: "right" }}>Latest Value</th>
              <th style={{ padding: 12, textAlign: "right" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name}>
                <td style={{ padding: 12 }}>{row.name}</td>
                <td style={{ padding: 12, textAlign: "right" }}>
                  {row.value !== null ? row.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                </td>
                <td style={{ padding: 12, textAlign: "right" }}>{row.date || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
