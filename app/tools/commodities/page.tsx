// Commodities Dashboard removed

// The entire CommoditiesDashboard component has been removed.
// The following code was previously present:
// "use client";
// import React, { useEffect, useState } from "react";
// 
// interface CommodityData {
//   name: string;
//   value: number | null;
//   date: string | null;
// }
// 
// const commoditiesList = [
//   { key: "WTI", label: "Crude Oil (WTI)" },
//   { key: "BRENT", label: "Crude Oil (Brent)" },
//   { key: "NATGAS", label: "Natural Gas" },
// ];
// 
// export default function CommoditiesDashboard() {
//   const [data, setData] = useState<CommodityData[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
// 
//   useEffect(() => {
//     async function fetchCommodities() {
//       setLoading(true);
//       setError(null);
//       try {
//         const results: CommodityData[] = [];
//         for (const commodity of commoditiesList) {
//           const res = await fetch(`/api/commodities?type=${commodity.key}`);
//           if (res.ok) {
//             const json = await res.json();
//             results.push({
//               name: commodity.label,
//               value: json.value ?? null,
//               date: json.date ?? null,
//             });
//           } else {
//             results.push({ name: commodity.label, value: null, date: null });
//           }
//         }
//         setData(results);
//       } catch (err) {
//         setError("Failed to fetch commodity data.");
//       } finally {
//         setLoading(false);
//       }
//     }
//     fetchCommodities();
//   }, []);
// 
//   return (
//     <main style={{ minHeight: "100vh", background: "#0F172A", color: "#fff", padding: "2rem" }}>
//       <h1 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "1.5rem", color: "#10B981" }}>
//         Commodities Dashboard
//       </h1>
//       <p style={{ color: "#94A3B8", marginBottom: "2rem" }}>
//         Live prices for major commodities.
//       </p>
//       {loading ? (
//         <div>Loading...</div>
//       ) : error ? (
//         <div style={{ color: "#EF4444" }}>{error}</div>
//       ) : (
//         <div style={{ overflowX: "auto", marginTop: 12 }}>
//           <table style={{ minWidth: 400, width: "100%", background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
//             <thead>
//               <tr style={{ background: "#10B98122" }}>
//                 <th style={{ padding: 12, textAlign: "left" }}>Commodity</th>
//                 <th style={{ padding: 12, textAlign: "right" }}>Latest Value</th>
//                 <th style={{ padding: 12, textAlign: "right" }}>Date</th>
//               </tr>
//             </thead>
//             <tbody>
//               {data.map((row) => (
//                 <tr key={row.name}>
//                   <td style={{ padding: 12 }}>{row.name}</td>
//                   <td style={{ padding: 12, textAlign: "right" }}>
//                     {row.value !== null ? row.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
//                   </td>
//                   <td style={{ padding: 12, textAlign: "right" }}>{row.date || "-"}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       )}
//     </main>
//   );
// }

"use client";
import React, { useEffect, useState } from "react";

interface CommodityData {
  name: string;
  value: number | null;
  date: string | null;
}

import ToolsPageHeader from "@/components/ToolsPageHeader";

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
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="COMMODITIES"
        title="Commodities Dashboard"
        subtitle="Live prices for major commodities including oil and natural gas."
        icon="🛢️"
        backHref="/tools"
      />
      <main style={{ padding: "24px 16px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "48px", color: "#94A3B8" }}>Loading commodity data...</div>
          ) : error ? (
            <div style={{ padding: "14px 16px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "12px", color: "#FCA5A5" }}>{error}</div>
          ) : (
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(30, 41, 59, 0.5)", borderBottom: "1px solid rgba(51,65,85,0.8)" }}>
                    <th style={{ padding: "16px", textAlign: "left", color: "#94A3B8", fontWeight: "600", fontSize: "14px" }}>Commodity</th>
                    <th style={{ padding: "16px", textAlign: "right", color: "#94A3B8", fontWeight: "600", fontSize: "14px" }}>Latest Value</th>
                    <th style={{ padding: "16px", textAlign: "right", color: "#94A3B8", fontWeight: "600", fontSize: "14px" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.name} style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                      <td style={{ padding: "16px", color: "#fff", fontWeight: "500" }}>{row.name}</td>
                      <td style={{ padding: "16px", textAlign: "right", color: "#10B981", fontWeight: "600", fontFamily: "monospace" }}>
                        {row.value !== null ? `$${row.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td style={{ padding: "16px", textAlign: "right", color: "#94A3B8" }}>{row.date || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
