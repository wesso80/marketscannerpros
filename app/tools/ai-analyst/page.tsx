"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ToolsPageHeader from "@/components/ToolsPageHeader";

type AssetType = "crypto" | "stock" | "fx";

type ModeOption = {
  value: string;
  label: string;
  description: string;
};

const MODES: ModeOption[] = [
  { value: "analysis", label: "General Market Analysis", description: "Any market, asset, or setup." },
  { value: "macro", label: "Macro Cycle Analysis", description: "Multi-timeframe outlook for any ticker." },
  { value: "scanner-explain", label: "Explain Scanner Signal", description: "Why a signal fired, phases, and risk." },
  { value: "pine", label: "Pine Script / Code", description: "Indicators, strategies, coding help." },
];

function AiAnalystContent() {
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(
    "Give me a macro outlook for this ticker with bullish and bearish scenarios."
  );
  const [mode, setMode] = useState<string>("macro");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Market context state (works for ANY ticker)
  const [assetType, setAssetType] = useState<AssetType>("crypto");
  const [symbol, setSymbol] = useState<string>("XRPUSD");
  const [timeframe, setTimeframe] = useState<string>("1H");
  const [currentPrice, setCurrentPrice] = useState<string>("");
  const [keyLevelsText, setKeyLevelsText] = useState<string>("");

  const [priceLoading, setPriceLoading] = useState<boolean>(false);

  // Scanner integration state
  const [loadedFromScanner, setLoadedFromScanner] = useState<boolean>(false);
  const [scannerMeta, setScannerMeta] = useState<{
    signal?: string;
    direction?: string;
    score?: string;
  }>({});

  // ─────────────────────────────────────────────
  // SCANNER INTEGRATION: read URL params once
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!searchParams) return;

    // Check for scanner params (supports multiple formats)
    const modeParam = searchParams.get("mode");
    const fromParam = searchParams.get("from");
    const s = searchParams.get("symbol");
    
    // Support both 'tf' and 'timeframe' params
    const tfParam = searchParams.get("tf") || searchParams.get("timeframe");
    const priceParam = searchParams.get("price");
    
    // Support both 'dir'/'direction' params
    const directionParam = searchParams.get("dir") || searchParams.get("direction");
    const scoreParam = searchParams.get("score");
    const levelsParam = searchParams.get("levels");
    const signalParam = searchParams.get("signal");
    
    // Only process if coming from scanner
    const isFromScanner = modeParam === "scanner-explain" || fromParam === "scanner";
    if (!isFromScanner) return;

    // Set asset type
    const asset = searchParams.get("asset") as AssetType | null;
    if (asset === "crypto" || asset === "stock" || asset === "fx") {
      setAssetType(asset);
    } else if (s) {
      // Auto-detect: if symbol ends with USD/USDT/BTC, it's probably crypto
      setAssetType(/(USD|USDT|BTC|ETH)$/i.test(s) ? "crypto" : "stock");
    }
    
    if (s) setSymbol(s);
    if (tfParam) setTimeframe(tfParam.toUpperCase());
    if (priceParam) setCurrentPrice(priceParam);
    if (levelsParam) setKeyLevelsText(levelsParam);

    // Build a nice default question for scanner signals
    const defaultPromptParts: string[] = [];

    defaultPromptParts.push(
      `Explain the latest scanner signal for ${s || "this ticker"} on the ${tfParam || timeframe} timeframe.`
    );

    if (signalParam) defaultPromptParts.push(`Signal type: "${signalParam}".`);
    if (directionParam) {
      const direction = directionParam.toLowerCase() === 'long' ? 'Bullish' : 
                       directionParam.toLowerCase() === 'short' ? 'Bearish' : 
                       directionParam;
      defaultPromptParts.push(`Bias: ${direction.toUpperCase()}.`);
    }
    if (scoreParam) defaultPromptParts.push(`Signal strength score: ${scoreParam}.`);

    defaultPromptParts.push(
      "Give a structured breakdown with: executive summary, context, bullish and bearish scenarios, key levels and invalidation, risk management, and how to use this signal."
    );

    setQuery(defaultPromptParts.join(" "));

    setLoadedFromScanner(true);
    setScannerMeta({ 
      signal: signalParam || undefined,
      direction: directionParam || undefined, 
      score: scoreParam || undefined 
    });
    setMode("scanner-explain");
  }, [searchParams, timeframe]);

  // ─────────────────────────────────────────────
  // Auto-fill price from /api/quote
  // ─────────────────────────────────────────────
  async function handleAutoPrice() {
    if (!symbol.trim()) return;

    setPriceLoading(true);
    setError(null);

    try {
      // Extract base symbol for crypto (e.g., "XRPUSD" -> "XRP")
      let cleanSymbol = symbol.trim().toUpperCase();
      if (assetType === "crypto") {
        // Remove common quote currencies from the end
        cleanSymbol = cleanSymbol.replace(/(USD|USDT|EUR|BTC)$/i, '');
      }

      const params = new URLSearchParams({
        symbol: cleanSymbol,
        type: assetType === "stock" ? "stock" : assetType,
        market: "USD",
      });

      const res = await fetch(`/api/quote?${params.toString()}`);
      
      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`Server returned ${contentType} instead of JSON`);
      }
      
      const data: { ok: boolean; price?: number; error?: string } = await res.json();

      if (!res.ok || !data.ok || typeof data.price !== "number") {
        throw new Error(data.error || `Quote HTTP ${res.status}`);
      }

      setCurrentPrice(data.price.toFixed(4));
    } catch (err: any) {
      console.error("Auto price error:", err);
      setError(err.message || "Could not fetch live price.");
    } finally {
      setPriceLoading(false);
    }
  }

  // ─────────────────────────────────────────────
  // Call MSP Analyst backend
  // ─────────────────────────────────────────────
  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer("");

    const priceNum = Number(currentPrice);
    const parsedLevels =
      keyLevelsText
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => !Number.isNaN(n));

    const context: {
      symbol?: string;
      timeframe?: string;
      currentPrice?: number;
      keyLevels?: number[];
    } = {};

    if (symbol.trim()) context.symbol = symbol.trim().toUpperCase();
    if (timeframe.trim()) context.timeframe = timeframe.trim();
    if (!Number.isNaN(priceNum)) context.currentPrice = priceNum;
    if (parsedLevels.length > 0) context.keyLevels = parsedLevels;

    const scannerPayload =
      loadedFromScanner
        ? {
            source: "msp-web-scanner",
            signal: scannerMeta.signal,
            direction: scannerMeta.direction,
            score: scannerMeta.score ? Number(scannerMeta.score) : undefined,
          }
        : undefined;

    try {
      const res = await fetch("/api/msp-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          mode,
          context,
          scanner: scannerPayload,
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        throw new Error(data.error || "Daily limit reached. Upgrade for more AI questions.");
      }

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (!data.ok) {
        throw new Error(data.error || "Unknown error from MSP Analyst API");
      }

      setAnswer(data.text ?? "");
    } catch (err: any) {
      console.error("AI Analyst UI error:", err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      <ToolsPageHeader
        badge="ANALYST"
        title="MSP AI Analyst"
        subtitle="Ask the in-house quant & Pine engineer for structured market breakdowns."
        icon="🧠"
        backHref="/dashboard"
      />
      <main style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
        color: '#f9fafb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        padding: '24px 16px'
      }}>
        <div
          className="max-w-7xl mx-auto w-full"
        >
          <div style={{
            marginBottom: 16,
            color: '#e2e8f0',
            fontSize: 14,
            lineHeight: 1.6,
            background: 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 12,
            padding: '14px 16px'
          }}>
            <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 6 }}>Why you’re here</div>
            The AI Analyst is decision support, not prediction. Use it to explain a scanner signal, summarize multi-TF bias, and call out invalidation and risk before you take a trade.
            <div style={{ marginTop: 10, fontSize: 13, color: '#cbd5e1' }}>
              Ask things like:
              <ul style={{ margin: '6px 0 0 18px', padding: 0, listStyle: 'disc' }}>
                <li>Why did this signal trigger and what phase are we in?</li>
                <li>What would invalidate this setup? Where is the risk line?</li>
                <li>How do the intraday and higher timeframes line up?</li>
              </ul>
            </div>
          </div>
          {loadedFromScanner && (
            <div style={{
              marginBottom: 20,
              padding: '12px 16px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <span style={{ fontSize: 20 }}>🎯</span>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontSize: 13, 
                  fontWeight: 600, 
                  color: '#10b981',
                  marginBottom: 4 
                }}>
                  From Scanner
                </div>
                <div style={{ fontSize: 12, color: '#d1d5db' }}>
                  {scannerMeta.signal && <span>Signal: <strong>{scannerMeta.signal}</strong> • </span>}
                  {scannerMeta.direction && <span>Direction: <strong>{scannerMeta.direction.toUpperCase()}</strong> • </span>}
                  {scannerMeta.score && <span>Score: <strong>{scannerMeta.score}</strong></span>}
                </div>
              </div>
            </div>
          )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 24,
            width: '100%',
            boxSizing: 'border-box',
            ...(typeof window !== 'undefined' && window.innerWidth < 800
              ? { gridTemplateColumns: '1fr', gap: 16 }
              : {}),
          }}
        >
          {/* LEFT SIDE: inputs */}
          <section style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
            borderRadius: 16,
            border: '1px solid rgba(51,65,85,0.8)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            padding: 24
          }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, color: '#f9fafb' }}>Ask the Analyst</h2>

            <form onSubmit={handleAsk} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Mode selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#e5e7eb' }}>Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMode(m.value)}
                      style={{
                        borderRadius: 10,
                        border: mode === m.value ? '1px solid #22c55e' : '1px solid #334155',
                        background: mode === m.value ? 'rgba(34,197,94,0.12)' : 'rgba(15,23,42,0.6)',
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: 12,
                        color: mode === m.value ? '#bbf7d0' : '#cbd5e1',
                        transition: 'all 0.2s',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{m.label}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
                        {m.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Market context */}
              <div style={{
                borderRadius: 10,
                border: '1px solid #334155',
                background: 'rgba(5,7,11,0.6)',
                padding: 16
              }}>
                <p style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#9ca3af',
                  marginBottom: 12
                }}>
                  Market Context (for any ticker)
                </p>

                {/* Asset type + symbol */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: '#9ca3af' }}>
                      Asset Type
                    </label>
                    <select
                      value={assetType}
                      onChange={(e) => setAssetType(e.target.value as AssetType)}
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid #334155',
                        background: '#0b1120',
                        padding: '6px 10px',
                        fontSize: 13,
                        color: '#f9fafb',
                        outline: 'none'
                      }}
                    >
                      <option value="crypto">Crypto</option>
                      <option value="stock">Stock / ETF</option>
                      <option value="fx">FX Pair</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
                    <label style={{ fontSize: 11, color: '#9ca3af' }}>
                      Symbol (e.g. XRP, NVDA, BTC, EUR/USD)
                    </label>
                    <input
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid #334155',
                        background: '#0b1120',
                        padding: '6px 10px',
                        fontSize: 13,
                        color: '#f9fafb',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Timeframe + price + auto-fill */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: '#9ca3af' }}>
                      Timeframe (e.g. 15m, 1H, 4H, 1D)
                    </label>
                    <input
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value)}
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid #334155',
                        background: '#0b1120',
                        padding: '6px 10px',
                        fontSize: 13,
                        color: '#f9fafb',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
                    <label style={{ fontSize: 11, color: '#9ca3af' }}>
                      Current Price
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        step="0.0001"
                        value={currentPrice}
                        onChange={(e) => setCurrentPrice(e.target.value)}
                        style={{
                          flex: 1,
                          borderRadius: 6,
                          border: '1px solid #334155',
                          background: '#0b1120',
                          padding: '6px 10px',
                          fontSize: 13,
                          color: '#f9fafb',
                          outline: 'none'
                        }}
                        placeholder="Auto or manual, e.g. 2.02"
                      />
                      <button
                        type="button"
                        onClick={handleAutoPrice}
                        disabled={priceLoading || !symbol.trim()}
                        style={{
                          whiteSpace: 'nowrap',
                          borderRadius: 999,
                          border: priceLoading || !symbol.trim()
                            ? '1px solid #475569'
                            : '1px solid rgba(34,197,94,0.75)',
                          background: priceLoading || !symbol.trim()
                            ? 'rgba(30,64,175,0.4)'
                            : 'rgba(34,197,94,0.12)',
                          padding: '6px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: priceLoading || !symbol.trim() ? '#9ca3af' : '#bbf7d0',
                          cursor: priceLoading || !symbol.trim() ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {priceLoading ? "Fetching…" : "Auto-fill"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Key levels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: '#9ca3af' }}>
                    Key Levels (comma separated)
                  </label>
                  <input
                    value={keyLevelsText}
                    onChange={(e) => setKeyLevelsText(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: 6,
                      border: '1px solid #334155',
                      background: '#0b1120',
                      padding: '6px 10px',
                      fontSize: 13,
                      color: '#f9fafb',
                      outline: 'none'
                    }}
                    placeholder="e.g. 1.95, 2.10, 2.25"
                  />
                </div>
              </div>

              {/* Prompt */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#e5e7eb' }}>Your Question</label>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  rows={5}
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    border: '1px solid #334155',
                    background: '#0b1120',
                    padding: '12px',
                    fontSize: 14,
                    color: '#f9fafb',
                    outline: 'none',
                    lineHeight: 1.6,
                    resize: 'vertical'
                  }}
                  placeholder="E.g. Explain why my 1H breakout signal fired on this ticker and what the next likely phases are."
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 10,
                    background: loading || !query.trim() ? '#334155' : 'linear-gradient(135deg, #22c55e, #14b8a6)',
                    padding: '10px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: loading || !query.trim() ? '#64748b' : '#0b1120',
                    border: 'none',
                    cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: loading || !query.trim() ? 'none' : '0 4px 15px rgba(34,197,94,0.3)'
                  }}
                >
                  {loading ? "✨ Finding AI Trade Breakdown..." : "✨ Get AI Trade Breakdown"}
                </button>

                {loading && (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>
                    Analyzing market data…
                  </p>
                )}
              </div>

              {error && (
                <p style={{
                  borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(127,29,29,0.4)',
                  padding: '10px 12px',
                  fontSize: 12,
                  color: '#fecaca'
                }}>
                  {error}
                </p>
              )}
            </form>
          </section>

          {/* RIGHT SIDE: output */}
          <section style={{
            display: 'flex',
            minHeight: 400,
            flexDirection: 'column',
            background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
            borderRadius: 16,
            border: '1px solid rgba(51,65,85,0.8)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            padding: 24
          }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, color: '#f9fafb' }}>
              💡 Analyst Output
            </h2>

            <div style={{
              flex: 1,
              overflow: 'auto',
              borderRadius: 12,
              border: '1px solid rgba(34,197,94,0.3)',
              background: 'linear-gradient(to bottom, rgba(5,7,11,0.9), rgba(12,16,24,0.9))',
              padding: 20,
              fontSize: 13,
              lineHeight: 1.7,
              color: '#f9fafb',
              boxShadow: '0 10px 30px rgba(34,197,94,0.1)'
            }}>
              {/* Context header strip */}
              <div style={{
                marginBottom: 16,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                borderRadius: 8,
                background: 'rgba(15,23,42,0.9)',
                padding: '10px 14px',
                fontSize: 11,
                color: '#cbd5e1'
              }}>
                <span style={{ fontWeight: 600, color: '#22c55e' }}>
                  {symbol.toUpperCase()} · {timeframe.toUpperCase()}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  {currentPrice && (
                    <span>
                      Current Price:{" "}
                      <span style={{ fontFamily: 'monospace', color: '#22c55e' }}>
                        {currentPrice}
                      </span>
                    </span>
                  )}
                  {loadedFromScanner && (
                    <span style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: 'rgba(34,197,94,0.15)',
                      color: '#bbf7d0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em'
                    }}>
                      From Scanner
                    </span>
                  )}
                </div>
              </div>

              {loadedFromScanner && (scannerMeta.signal || scannerMeta.direction || scannerMeta.score) && (
                <div style={{ marginBottom: 12, fontSize: 11, color: '#9ca3af' }}>
                  <strong style={{ color: '#22c55e' }}>Scanner context:</strong>{" "}
                  {scannerMeta.signal && <>Signal “{scannerMeta.signal}”. </>}
                  {scannerMeta.direction && <>Bias: {scannerMeta.direction.toUpperCase()}. </>}
                  {scannerMeta.score && <>Score: {scannerMeta.score}. </>}
                </div>
              )}

              {loading && !answer && (
                <span style={{ color: '#64748b' }}>
                  🔄 Waiting for response from MSP Analyst…
                </span>
              )}

              {!loading && !answer && !error && (
                <span style={{ color: '#64748b' }}>
                  The full report will appear here once you run a query.
                </span>
              )}

              {error && !answer && (
                <span style={{ color: '#fca5a5' }}>{error}</span>
              )}

              {answer && (
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {answer}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
    </div>
  );
}

export default function AiAnalystPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff"
      }}>
        Loading AI Analyst...
      </div>
    }>
      <AiAnalystContent />
    </Suspense>
  );
}
