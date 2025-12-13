
"use client";
import React, { useEffect, useState } from "react";

interface CommodityData {
  name: string;
  value: number | null;
  date: string | null;
}

const commoditiesList = [
  { key: "WTI", label: "Crude Oil (WTI)" },
  { key: "BRENT", label: "Crude Oil (Brent)" },
  { key: "NATGAS", label: "Natural Gas" },
];

export default function CommoditiesDashboard() {
  const [data, setData] = useState<CommodityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCommodities() {
      setLoading(true);
      setError(null);
      try {
        const results: CommodityData[] = [];
        for (const commodity of commoditiesList) {
          const res = await fetch(`/api/commodities?type=${commodity.key}`);
          if (res.ok) {
            const json = await res.json();
            results.push({
              name: commodity.label,
              value: json.value ?? null,
              date: json.date ?? null,
            });
          } else {
            results.push({ name: commodity.label, value: null, date: null });
          }
        }
        setData(results);
      } catch (err) {
        setError("Failed to fetch commodity data.");
      } finally {
        setLoading(false);
      }
    }
    fetchCommodities();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#0F172A", color: "#fff", padding: "2rem" }}>
      <h1 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "1.5rem", color: "#10B981" }}>
        Commodities Dashboard
      </h1>
      <p style={{ color: "#94A3B8", marginBottom: "2rem" }}>
        Live prices for major commodities.
      </p>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: "#EF4444" }}>{error}</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ minWidth: 400, width: "100%", background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
            <thead>
              <tr style={{ background: "#10B98122" }}>
                <th style={{ padding: 12, textAlign: "left" }}>Commodity</th>
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
        </div>
      )}
    </main>
  );
}
