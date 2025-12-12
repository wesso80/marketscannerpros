"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type TimeframeOption = "15m" | "1h" | "4h" | "1d";
type ScannerTab = "equity" | "crypto";

interface ScanResult {
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  volume: number;
  score: number;
  signal: string;
  direction: "LONG" | "SHORT";
  ema200_phase: string;
  rsi: number;
  macd_histogram: number;
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ScannerTab>("equity");
  const [timeframe, setTimeframe] = useState<TimeframeOption>("1h");
  const [minScore, setMinScore] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams?.get("tab") as ScannerTab;
    if (tab && ["equity", "crypto"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    
    try {
      // Call the scanner API with premium Alpha Vantage
      const response = await fetch("https://marketscannerpros-scanner-api.onrender.com/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: activeTab,
          timeframe: timeframe,
          minScore: minScore
        }),
        signal: AbortSignal.timeout(90000), // 90 second timeout for scanning
      });

      if (!response.ok) {
        throw new Error(`Scanner failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.results && Array.isArray(data.results)) {
        setResults(data.results);
      } else {
        setError("No results returned from scanner");
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scanner unavailable - please try again");
    } finally {
      setLoading(false);
    }
  };

  const generateAILink = (result: ScanResult) => {
    const params = new URLSearchParams({
      mode: "scanner-explain",
      from: "scanner",
      symbol: result.symbol,
      tf: timeframe,
      price: result.price.toString(),
      direction: result.direction,
      score: result.score.toString(),
      signal: result.signal,
    });
    return `/tools/ai-analyst?${params.toString()}`;
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)",
      padding: "2rem 1rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{ maxWidth: "800px", textAlign: "center", padding: "3rem" }}>
        <h1 style={{
          fontSize: "3rem",
          fontWeight: "bold",
          background: "linear-gradient(to right, #10B981, #3B82F6)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "2rem"
        }}>
          Market Scanner Pro
        </h1>
        
        <p style={{ fontSize: "1.25rem", color: "#94A3B8", marginBottom: "3rem" }}>
          The scanner is available in the full app with live market data.
        </p>
        
        <a 
          href="https://marketscannerpros-vwx5.onrender.com"
          style={{
            display: "inline-block",
            padding: "1rem 2rem",
            fontSize: "1.125rem",
            fontWeight: "600",
            color: "#0F172A",
            background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
            borderRadius: "12px",
            textDecoration: "none",
            transition: "transform 0.2s",
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.05)"}
          onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
        >
          Open Scanner App 
        </a>
        
        <div style={{ 
          marginTop: "3rem", 
          padding: "1.5rem",
          background: "rgba(16, 185, 129, 0.1)",
          borderRadius: "12px",
          border: "1px solid rgba(16, 185, 129, 0.2)"
        }}>
          <p style={{ color: "#10B981", margin: 0 }}>
             Live market data<br/>
             Real-time scanning<br/>
             Technical indicators<br/>
             Portfolio tracking
          </p>
        </div>
      </div>
    </main>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0F172A" }} />}>
      <ScannerContent />
    </Suspense>
  );
}
