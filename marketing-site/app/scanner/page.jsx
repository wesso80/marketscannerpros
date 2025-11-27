"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_SCANNER_API_BASE_URL || "http://127.0.0.1:5000";

// ------------- Symbol Universes (expandable) ----------------
const DEFAULT_EQUITY_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "TSLA",
  "META",
  "AMZN",
  "GOOGL",
  "NFLX",
  "AMD",
  "BABA",
  "BRK-B",
];

const DEFAULT_CRYPTO_SYMBOLS = [
  "BTC-USD",
  "ETH-USD",
  "XRP-USD",
  "SOL-USD",
  "BNB-USD",
  "DOGE-USD",
  "ADA-USD",
  "AVAX-USD",
  "DOT-USD",
];

const TOP100_EQUITIES_URL = "/api/symbols/equities_top100";
const TOP100_CRYPTO_URL = "/api/symbols/crypto_top100";

export default function ScannerPage() {
  // UI State
  const [universe, setUniverse] = useState("both"); // "equities" | "crypto" | "both"
  const [customSymbols, setCustomSymbols] = useState("");
  const [useTop100, setUseTop100] = useState(false);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTf, setActiveTf] = useState("1h");
  const [profile, setProfile] = useState("balanced"); // "balanced" | "trend" | "squeeze"
  const [sortMode, setSortMode] = useState("score"); // "score" | "symbol" | "atr" | "emaStretch"

  // Top-100 lists loaded from backend when needed
  const [topEq, setTopEq] = useState(null);
  const [topCrypto, setTopCrypto] = useState(null);

  const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

  // Load top-100 lists when toggle is on
  useEffect(() => {
    if (!useTop100) return;

    const load = async () => {
      try {
        // equities list
        if (universe === "equities" || universe === "both") {
          const resEq = await fetch(`${API_BASE_URL}${TOP100_EQUITIES_URL}`);
          if (resEq.ok) {
            const json = await resEq.json();
            const list = Array.isArray(json) ? json : json.symbols || [];
            setTopEq(list);
          }
        }

        // crypto list
        if (universe === "crypto" || universe === "both") {
          const resCr = await fetch(`${API_BASE_URL}${TOP100_CRYPTO_URL}`);
          if (resCr.ok) {
            const json = await resCr.json();
            const list = Array.isArray(json) ? json : json.symbols || [];
            setTopCrypto(list);
          }
        }
      } catch (err) {
        console.error("Error loading top-100 lists", err);
      }
    };

    load();
  }, [useTop100, universe]);

  // Build final symbol list synchronously
  const symbolsForUniverse = useMemo(() => {
    // 1) If user pasted a list, override everything
    if (customSymbols.trim().length > 0) {
      return customSymbols
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // 2) If "scan extended list" toggle is on, use top-100 lists
    if (useTop100) {
      const eqList = topEq || [];
      const crList = topCrypto || [];

      if (universe === "equities") return eqList;
      if (universe === "crypto") return crList;
      return [...eqList, ...crList];
    }

    // 3) Otherwise: defaults
    if (universe === "equities") return DEFAULT_EQUITY_SYMBOLS;
    if (universe === "crypto") return DEFAULT_CRYPTO_SYMBOLS;
    return [...DEFAULT_EQUITY_SYMBOLS, ...DEFAULT_CRYPTO_SYMBOLS];
  }, [universe, customSymbols, useTop100, topEq, topCrypto]);

  // ---------- Fetch from Flask API ---------- //
  const fetchScanner = useCallback(async () => {
    try {
      if (symbolsForUniverse.length === 0) return;

      setLoading(true);
      setError(null);

      const symbolsParam = encodeURIComponent(symbolsForUniverse.join(","));
      const tfParam = encodeURIComponent(activeTf);

      const url = `${API_BASE_URL}/api/multi_scan?symbols=${symbolsParam}&tf=${tfParam}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();

      if (json && Array.isArray(json.results)) {
        setData(json.results);
      } else if (Array.isArray(json)) {
        setData(json);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (e) {
      console.error("Scanner fetch error:", e);
      setError(e?.message || "Failed to load scanner data");
    } finally {
      setLoading(false);
    }
  }, [activeTf, symbolsForUniverse]);

  useEffect(() => {
    fetchScanner();
  }, [fetchScanner]);

  // ---------- scoring + metrics ---------- //
  const scoreFromTrend = (row) => {
    let base = row.trend === "BULLISH" ? 70 : 40;
    if (row.squeeze) base += 10;
    return Math.max(0, Math.min(100, base));
  };

  const getStretchMetrics = (row) => {
    const ema20Stretch = row.ema20
      ? ((row.close - row.ema20) / row.ema20) * 100
      : 0;
    const ema50Stretch = row.ema50
      ? ((row.close - row.ema50) / row.ema50) * 100
      : 0;
    const atrPct = row.close && row.atr ? (row.atr / row.close) * 100 : 0;
    return { ema20Stretch, ema50Stretch, atrPct };
  };

  const getProfileWeights = () => {
    switch (profile) {
      case "trend":
        return { trendW: 0.45, emaW: 0.3, squeezeW: 0.15, volW: 0.1 };
      case "squeeze":
        return { trendW: 0.25, emaW: 0.25, squeezeW: 0.4, volW: 0.1 };
      case "balanced":
      default:
        return { trendW: 0.35, emaW: 0.35, squeezeW: 0.2, volW: 0.1 };
    }
  };

  const getDrivers = (row, score) => {
    const { ema20Stretch, ema50Stretch, atrPct } = getStretchMetrics(row);
    const { trendW, emaW, squeezeW, volW } = getProfileWeights();

    const trendRaw = row.trend === "BULLISH" ? 1 : 0.3;
    const emaRaw =
      1 / (1 + Math.abs(ema20Stretch) / 4 + Math.abs(ema50Stretch) / 6);
    const squeezeRaw = row.squeeze ? 1 : 0.3;
    const volRaw = 1 / (1 + atrPct / 6);

    const weighted =
      trendRaw * trendW +
      emaRaw * emaW +
      squeezeRaw * squeezeW +
      volRaw * volW;

    const scale = weighted > 0 ? score / weighted : 0;

    const trendScore = trendRaw * trendW * scale;
    const emaScore = emaRaw * emaW * scale;
    const squeezeScore = squeezeRaw * squeezeW * scale;
    const volScore = volRaw * volW * scale;

    return { trendScore, emaScore, squeezeScore, volScore };
  };

  const sortedData = useMemo(() => {
    const sorted = [...data];

    sorted.sort((a, b) => {
      const scoreA = a.score !== undefined ? a.score : scoreFromTrend(a);
      const scoreB = b.score !== undefined ? b.score : scoreFromTrend(b);

      const stretchA = getStretchMetrics(a);
      const stretchB = getStretchMetrics(b);

      if (sortMode === "symbol") {
        return a.symbol.localeCompare(b.symbol);
      }

      if (sortMode === "atr") {
        return stretchB.atrPct - stretchA.atrPct;
      }

      if (sortMode === "emaStretch") {
        const magA =
          Math.abs(stretchA.ema20Stretch) + Math.abs(stretchA.ema50Stretch);
        const magB =
          Math.abs(stretchB.ema20Stretch) + Math.abs(stretchB.ema50Stretch);
        return magB - magA;
      }

      const { trendW, emaW, squeezeW, volW } = getProfileWeights();
      const driversA = getDrivers(a, scoreA);
      const driversB = getDrivers(b, scoreB);

      const profA =
        driversA.trendScore * trendW +
        driversA.emaScore * emaW +
        driversA.squeezeScore * squeezeW +
        driversA.volScore * volW;

      const profB =
        driversB.trendScore * trendW +
        driversB.emaScore * emaW +
        driversB.squeezeScore * squeezeW +
        driversB.volScore * volW;

      return profB - profA;
    });

    return sorted;
  }, [data, sortMode, profile]);

  const trendColor = (trend) => {
    if (trend === "BULLISH") return "#34d399"; // emerald
    if (trend === "BEARISH") return "#fb923c"; // orange
    return "#e5e7eb";
  };

  const universeLabel =
    universe === "equities"
      ? "Equities"
      : universe === "crypto"
      ? "Crypto"
      : "Equities + Crypto";

  return (
    <>
      <main className="scanner-root">
        <div className="scanner-inner">
          {/* Header */}
          <header className="scanner-header">
            <p className="scanner-kicker">Scanner</p>
            <h1 className="scanner-title">Live Multi-Asset Scanner</h1>
            <p className="scanner-sub">
              Powered by the MarketScanner Pros engine. Ranked by your chosen
              profile with EMA stretch and ATR risk baked into the score.
            </p>
          </header>

          {/* Top controls */}
          <section className="scanner-top">
            {/* Universe + symbols */}
            <div className="scanner-card">
              <p className="section-label">Universe</p>
              <div className="chip-row">
                {["equities", "crypto", "both"].map((u) => (
                  <button
                    key={u}
                    onClick={() => setUniverse(u)}
                    className={
                      universe === u ? "chip chip-active-emerald" : "chip"
                    }
                  >
                    {u === "equities"
                      ? "Equities"
                      : u === "crypto"
                      ? "Crypto"
                      : "Both"}
                  </button>
                ))}
              </div>
              <p className="small-muted">
                {symbolsForUniverse.length} symbols · {universeLabel}
              </p>

              <div className="top-spacer" />

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={useTop100}
                  onChange={(e) => setUseTop100(e.target.checked)}
                />
                <span>Scan extended list (Top 100 per market)</span>
              </label>

              <div className="textarea-wrapper">
                <p className="small-muted">
                  Or paste custom symbols (one per line) to override everything:
                </p>
                <textarea
                  value={customSymbols}
                  onChange={(e) => setCustomSymbols(e.target.value)}
                  rows={4}
                  className="symbols-textarea"
                  placeholder={`AAPL\nMSFT\nTSLA\n...\nBTC-USD`}
                />
              </div>
            </div>

            {/* Profile */}
            <div className="scanner-card">
              <p className="section-label">Profile</p>
              <div className="chip-row">
                {["balanced", "trend", "squeeze"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setProfile(p)}
                    className={
                      profile === p ? "chip chip-active-indigo" : "chip"
                    }
                  >
                    {p === "balanced"
                      ? "Balanced"
                      : p === "trend"
                      ? "Trend Focused"
                      : "Squeeze Focused"}
                  </button>
                ))}
              </div>

              <div className="top-spacer" />

              <p className="section-label">Timeframe</p>
              <div className="chip-row">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setActiveTf(tf)}
                    className={
                      activeTf === tf ? "chip chip-active-sky" : "chip"
                    }
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <div className="top-spacer" />

              <p className="section-label">Sort By</p>
              <div className="chip-row">
                {[
                  ["score", "Score"],
                  ["symbol", "Symbol"],
                  ["atr", "ATR %"],
                  ["emaStretch", "EMA Stretch"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setSortMode(mode)}
                    className={
                      sortMode === mode ? "chip chip-active-amber" : "chip"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Actions / status */}
          <section className="scanner-actions">
            <button onClick={fetchScanner} className="refresh-btn">
              {loading ? "Refreshing…" : "Refresh Scan"}
            </button>
            <p className="small-muted">
              {sortedData.length > 0
                ? `${sortedData.length} symbols scanned`
                : "No data yet"}
            </p>
          </section>

          {loading && (
            <div className="status status-muted">Scanning markets…</div>
          )}

          {error && (
            <div className="status status-error">
              <strong>Scan failed:</strong> {error}
            </div>
          )}

          {/* Results */}
          <section className="results">
            {!loading &&
              !error &&
              sortedData.map((row) => {
                const score =
                  row.score !== undefined ? row.score : scoreFromTrend(row);
                const { ema20Stretch, ema50Stretch, atrPct } =
                  getStretchMetrics(row);
                const drivers = getDrivers(row, score);

                const driverEntries = [
                  ["Trend", drivers.trendScore],
                  ["EMA", drivers.emaScore],
                  ["Squeeze", drivers.squeezeScore],
                  ["Vol", drivers.volScore],
                ];
                driverEntries.sort((a, b) => b[1] - a[1]);
                const topDriver = driverEntries[0][0];

                const barWidth = `${score}%`;
                const barColor = trendColor(row.trend);

                return (
                  <article key={row.symbol} className="result-card">
                    <div className="result-main">
                      <div>
                        <div className="result-title-row">
                          <p className="symbol">{row.symbol}</p>
                          <span
                            className="trend"
                            style={{ color: trendColor(row.trend) }}
                          >
                            {row.trend}
                          </span>
                          <span className="pill pill-squeeze">
                            {row.squeeze ? "SQUEEZE" : "Normal"}
                          </span>
                          <span className="pill pill-driver">
                            {topDriver} driver
                          </span>
                        </div>
                        <p className="result-line">
                          {row.close
                            ? `Last: ${row.close.toFixed(2)}`
                            : "No price"}{" "}
                          · TF {activeTf}
                        </p>
                        <p className="result-line muted">
                          EMA20 {ema20Stretch >= 0 ? "+" : ""}
                          {ema20Stretch.toFixed(2)}% · EMA50{" "}
                          {ema50Stretch >= 0 ? "+" : ""}
                          {ema50Stretch.toFixed(2)}% · ATR{" "}
                          {atrPct.toFixed(2)}%
                        </p>
                      </div>

                      <div className="drivers">
                        <p>
                          Drivers: Trend {drivers.trendScore.toFixed(1)} · EMA{" "}
                          {drivers.emaScore.toFixed(1)} · Sqz{" "}
                          {drivers.squeezeScore.toFixed(1)} · Vol{" "}
                          {drivers.volScore.toFixed(1)}
                        </p>
                      </div>
                    </div>

                    <div className="score-bar">
                      <div
                        className="score-bar-fill"
                        style={{ width: barWidth, backgroundColor: barColor }}
                      />
                    </div>
                    <div className="score-row">
                      <span className="small-muted">Score</span>
                      <span className="score-value">{score}</span>
                    </div>
                  </article>
                );
              })}
          </section>
        </div>
      </main>

      {/* Scoped CSS for this page */}
      <style jsx>{`
        .scanner-root {
          min-height: 100vh;
          background: #020617;
          color: #e5e7eb;
          padding: 48px 16px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }
        .scanner-inner {
          max-width: 1120px;
          margin: 0 auto;
        }
        .scanner-header {
          margin-bottom: 24px;
        }
        .scanner-kicker {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #9ca3af;
        }
        .scanner-title {
          margin-top: 4px;
          font-size: 26px;
          font-weight: 600;
        }
        .scanner-sub {
          margin-top: 8px;
          font-size: 14px;
          color: #9ca3af;
        }
        .scanner-top {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
          gap: 16px;
          margin-bottom: 16px;
        }
        @media (max-width: 800px) {
          .scanner-top {
            grid-template-columns: 1fr;
          }
        }
        .scanner-card {
          background: #020617;
          border-radius: 16px;
          border: 1px solid #111827;
          padding: 16px;
        }
        .section-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #d1d5db;
          margin-bottom: 8px;
        }
        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          border-radius: 999px;
          border: 1px solid #4b5563;
          background: #020617;
          color: #d1d5db;
          font-size: 11px;
          padding: 4px 10px;
          cursor: pointer;
        }
        .chip:hover {
          border-color: #9ca3af;
        }
        .chip-active-emerald {
          border-color: #34d399;
          background: rgba(52, 211, 153, 0.08);
          color: #a7f3d0;
        }
        .chip-active-indigo {
          border-color: #818cf8;
          background: rgba(129, 140, 248, 0.08);
          color: #c7d2fe;
        }
        .chip-active-sky {
          border-color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          color: #e0f2fe;
        }
        .chip-active-amber {
          border-color: #fbbf24;
          background: rgba(251, 191, 36, 0.08);
          color: #fef3c7;
        }
        .small-muted {
          font-size: 11px;
          color: #6b7280;
        }
        .top-spacer {
          height: 16px;
        }
        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: #9ca3af;
        }
        .checkbox-row input {
          width: 12px;
          height: 12px;
        }
        .textarea-wrapper {
          margin-top: 10px;
        }
        .symbols-textarea {
          width: 100%;
          resize: vertical;
          min-height: 80px;
          margin-top: 4px;
          border-radius: 8px;
          border: 1px solid #1f2937;
          background: #020617;
          color: #e5e7eb;
          font-size: 11px;
          padding: 8px;
          outline: none;
        }
        .symbols-textarea:focus {
          border-color: #4b5563;
        }
        .scanner-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .refresh-btn {
          border-radius: 999px;
          border: 1px solid #34d399;
          background: rgba(52, 211, 153, 0.08);
          color: #a7f3d0;
          font-size: 12px;
          padding: 6px 16px;
          font-weight: 600;
          cursor: pointer;
        }
        .refresh-btn:hover {
          background: rgba(52, 211, 153, 0.15);
        }
        .status {
          font-size: 12px;
          margin-bottom: 12px;
          padding: 8px 10px;
          border-radius: 8px;
        }
        .status-muted {
          background: rgba(31, 41, 55, 0.8);
          color: #e5e7eb;
        }
        .status-error {
          background: rgba(185, 28, 28, 0.4);
          border: 1px solid rgba(248, 113, 113, 0.7);
          color: #fee2e2;
        }
        .results {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-bottom: 40px;
        }
        .result-card {
          border-radius: 16px;
          border: 1px solid #111827;
          background: rgba(15, 23, 42, 0.9);
          padding: 12px 16px 10px;
        }
        .result-main {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          gap: 12px;
        }
        @media (max-width: 800px) {
          .result-main {
            flex-direction: column;
          }
        }
        .result-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .symbol {
          font-size: 14px;
          font-weight: 600;
        }
        .trend {
          font-size: 11px;
          font-weight: 500;
        }
        .pill {
          border-radius: 999px;
          font-size: 10px;
          padding: 2px 8px;
        }
        .pill-squeeze {
          background: rgba(251, 191, 36, 0.08);
          color: #fde68a;
        }
        .pill-driver {
          background: rgba(129, 140, 248, 0.12);
          color: #c7d2fe;
        }
        .result-line {
          margin-top: 4px;
          font-size: 12px;
          color: #d1d5db;
        }
        .result-line.muted {
          font-size: 11px;
          color: #9ca3af;
        }
        .drivers {
          font-size: 11px;
          color: #9ca3af;
          text-align: right;
        }
        .score-bar {
          margin-top: 8px;
          height: 8px;
          width: 100%;
          border-radius: 999px;
          border: 1px solid #111827;
          background: #020617;
          overflow: hidden;
        }
        .score-bar-fill {
          height: 100%;
          border-radius: 999px;
        }
        .score-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
          font-size: 11px;
        }
        .score-value {
          font-weight: 600;
        }
      `}</style>
    </>
  );
}
