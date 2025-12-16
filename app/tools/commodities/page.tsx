"use client";

import React from "react";
import PageHero from "@/components/PageHero";

export default function CommoditiesPage() {
  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <PageHero
          badge="COMMODITIES"
          icon="🛢️"
          title="Commodities Dashboard"
          subtitle="Track commodity prices including crude oil, natural gas, gold, and more with Alpha Vantage data."
        />

        <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem", textAlign: "center" }}>
          <h2 style={{ color: "#10B981", fontSize: "1.5rem", marginBottom: "1rem" }}>
            Commodities Dashboard Coming Soon
          </h2>
          <p style={{ color: "#94A3B8", fontSize: "1rem" }}>
            We're working on bringing you real-time commodity pricing and charts powered by Alpha Vantage Premium API.
          </p>
        </div>
      </div>
    </main>
  );
}
