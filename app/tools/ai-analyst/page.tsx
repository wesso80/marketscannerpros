"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import AdaptivePersonalityCard from "@/components/AdaptivePersonalityCard";

type AssetType = "crypto" | "stock" | "fx";
type OutputView = "thesis" | "risk" | "checklist" | "execution";

type ModeOption = {
  value: string;
  label: string;
  description: string;
};

const MODES: ModeOption[] = [
  { value: "analysis", label: "General", description: "Any market, asset, or setup." },
  { value: "macro", label: "Macro", description: "Multi-timeframe outlook." },
  { value: "scanner-explain", label: "Signal Explain", description: "Why a signal fired." },
  { value: "pine", label: "Pine / Code", description: "Indicators and strategy logic." },
];

const PRESET_QUERIES: Record<string, string> = {
  analysis: "Give me the market structure, directional bias, and most probable next path for this setup.",
  macro: "Provide a top-down macro cycle read with bullish and bearish paths and key invalidation levels.",
  "scanner-explain": "Explain why this scanner signal triggered, what phase we are in, and how to manage risk.",
  pine: "Design or improve a Pine Script logic for this setup with clear entry, invalidation, and exit rules.",
};

function getActionLinks(symbol: string, timeframe: string, query: string) {
  const s = encodeURIComponent(symbol || "BTCUSD");
  const tf = encodeURIComponent(timeframe || "1H");
  const q = encodeURIComponent(query || "Review this setup and generate a trade plan.");

  return {
    scanner: `/tools/scanner?symbol=${s}&tf=${tf}`,
    backtest: `/tools/backtest?symbol=${s}&timeframe=${tf}`,
    alerts: `/tools/alerts?symbol=${s}&tf=${tf}`,
    journal: `/tools/journal?note=${q}`,
  };
}

function normalizeDirection(direction?: string) {
  const d = direction?.toLowerCase();
  if (d === "long" || d === "bullish") return "bullish";
  if (d === "short" || d === "bearish") return "bearish";
  if (d === "neutral") return "neutral";
  return undefined;
}

function AiAnalystContent() {
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(
    "Give me a macro outlook for this ticker with bullish and bearish scenarios."
  );
  const [mode, setMode] = useState<string>("macro");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [outputView, setOutputView] = useState<OutputView>("thesis");

  const [assetType, setAssetType] = useState<AssetType>("crypto");
  const [symbol, setSymbol] = useState<string>("XRPUSD");
  const [timeframe, setTimeframe] = useState<string>("1H");
  const [currentPrice, setCurrentPrice] = useState<string>("");
  const [keyLevelsText, setKeyLevelsText] = useState<string>("");
  const [priceLoading, setPriceLoading] = useState<boolean>(false);

  const [loadedFromScanner, setLoadedFromScanner] = useState<boolean>(false);
  const [scannerMeta, setScannerMeta] = useState<{
    signal?: string;
    direction?: string;
    score?: string;
  }>({});

  useEffect(() => {
    if (!searchParams) return;

    const modeParam = searchParams.get("mode");
    const fromParam = searchParams.get("from");
    const s = searchParams.get("symbol");
    const tfParam = searchParams.get("tf") || searchParams.get("timeframe");
    const priceParam = searchParams.get("price");
    const directionParam = searchParams.get("dir") || searchParams.get("direction");
    const scoreParam = searchParams.get("score");
    const levelsParam = searchParams.get("levels");
    const signalParam = searchParams.get("signal");

    const isFromScanner = modeParam === "scanner-explain" || fromParam === "scanner";
    if (!isFromScanner) return;

    const asset = searchParams.get("asset") as AssetType | null;
    if (asset === "crypto" || asset === "stock" || asset === "fx") {
      setAssetType(asset);
    } else if (s) {
      setAssetType(/(USD|USDT|BTC|ETH)$/i.test(s) ? "crypto" : "stock");
    }

    if (s) setSymbol(s);
    if (tfParam) setTimeframe(tfParam.toUpperCase());
    if (priceParam) setCurrentPrice(priceParam);
    if (levelsParam) setKeyLevelsText(levelsParam);

    const defaultPromptParts: string[] = [];
    defaultPromptParts.push(
      `Explain the latest scanner signal for ${s || "this ticker"} on the ${tfParam || timeframe} timeframe.`
    );

    if (signalParam) defaultPromptParts.push(`Signal type: "${signalParam}".`);
    if (directionParam) {
      const direction =
        directionParam.toLowerCase() === "long"
          ? "Bullish"
          : directionParam.toLowerCase() === "short"
            ? "Bearish"
            : directionParam;
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
      score: scoreParam || undefined,
    });
    setMode("scanner-explain");
  }, [searchParams, timeframe]);

  async function handleAutoPrice() {
    if (!symbol.trim()) return;

    setPriceLoading(true);
    setError(null);

    try {
      let cleanSymbol = symbol.trim().toUpperCase();
      if (assetType === "crypto") {
        cleanSymbol = cleanSymbol.replace(/(USD|USDT|EUR|BTC)$/i, "");
      }

      const params = new URLSearchParams({
        symbol: cleanSymbol,
        type: assetType === "stock" ? "stock" : assetType,
        market: "USD",
      });

      const res = await fetch(`/api/quote?${params.toString()}`);
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

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer("");

    const priceNum = Number(currentPrice);
    const parsedLevels = keyLevelsText
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

    const scannerPayload = loadedFromScanner
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

  const scoreLabel = scannerMeta.score ? Number(scannerMeta.score) : 50;
  const actionLinks = useMemo(() => getActionLinks(symbol.toUpperCase(), timeframe.toUpperCase(), query), [symbol, timeframe, query]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ToolsPageHeader
        badge="ANALYST"
        title="MSP AI Analyst"
        subtitle="State → Context → Query → Output → Action"
        icon="🧠"
        backHref="/dashboard"
      />

      <main className="mx-auto w-full max-w-[1700px] space-y-2 px-2 pb-6 pt-3 md:px-3">
        <section className="sticky top-0 z-20 grid grid-cols-1 gap-1.5 rounded-lg border border-slate-800 bg-slate-900/95 p-1.5 backdrop-blur md:grid-cols-[2fr_1fr]">
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            <div className="rounded-md border border-slate-700 bg-slate-900 p-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Asset</p>
              <p className="text-xs font-semibold text-emerald-300">{symbol.toUpperCase()}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900 p-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Timeframe</p>
              <p className="text-xs font-semibold text-emerald-300">{timeframe.toUpperCase()}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900 p-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Price</p>
              <p className="text-xs font-semibold text-emerald-300">{currentPrice || "—"}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900 p-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Mode</p>
              <p className="text-xs font-semibold text-emerald-300">{mode}</p>
            </div>
          </div>

          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-1.5">
            <p className="text-[10px] uppercase tracking-wide text-emerald-200/80">Analyst State</p>
            <p className="text-[11px] text-emerald-100/90">
              {loading ? "Inference running..." : answer ? "Response ready for execution" : "Awaiting prompt"}
            </p>
            {loadedFromScanner && (
              <p className="mt-0.5 text-[10px] text-emerald-200/90">
                Scanner: {scannerMeta.signal || "signal"} · {scannerMeta.direction?.toUpperCase() || "N/A"} · Score {scannerMeta.score || "—"}
              </p>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-200">Context Bar</h2>
              <span className="text-[11px] text-slate-400">Live market framing</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-0.5 xl:col-span-1">
                <span className="text-[10px] text-slate-400">Asset Type</span>
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as AssetType)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none"
                >
                  <option value="crypto">Crypto</option>
                  <option value="stock">Stock / ETF</option>
                  <option value="fx">FX Pair</option>
                </select>
              </label>

              <label className="space-y-0.5 xl:col-span-1">
                <span className="text-[10px] text-slate-400">Symbol</span>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none"
                />
              </label>

              <label className="space-y-0.5 xl:col-span-1">
                <span className="text-[10px] text-slate-400">Timeframe</span>
                <input
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none"
                />
              </label>

              <label className="space-y-0.5 xl:col-span-2">
                <span className="text-[10px] text-slate-400">Current Price</span>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.0001"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="Auto or manual"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAutoPrice}
                    disabled={priceLoading || !symbol.trim()}
                    className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-400"
                  >
                    {priceLoading ? "Fetching" : "Auto"}
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-1.5 grid grid-cols-1 gap-1.5 xl:grid-cols-[2fr_1fr]">
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-400">Key Levels (comma separated)</span>
                <input
                  value={keyLevelsText}
                  onChange={(e) => setKeyLevelsText(e.target.value)}
                  placeholder="1.95, 2.10, 2.25"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none"
                />
              </label>

              <div className="rounded-md border border-slate-800 bg-slate-950 p-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Regime Summary</p>
                <p className="mt-0.5 text-[11px] text-slate-300">Bias {scannerMeta.direction?.toUpperCase() || "N/A"} · Strength {scannerMeta.score || "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <AdaptivePersonalityCard
              skill="ai_analyst"
              setupText={`${symbol} ${timeframe} ${query.slice(0, 80)}`}
              direction={normalizeDirection(scannerMeta.direction)}
              timeframe={timeframe}
              baseScore={scoreLabel}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2 xl:grid-cols-[1.2fr_1fr]">
          <form onSubmit={handleAsk} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-200">Query Workbench</h2>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="rounded-md bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {loading ? "Analyzing" : "Run Analysis"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMode(option.value);
                    setQuery(PRESET_QUERIES[option.value]);
                  }}
                  className={`rounded-md border px-2 py-1.5 text-left text-[11px] ${
                    mode === option.value
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-950 text-slate-300"
                  }`}
                >
                  <p className="font-semibold">{option.label}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{option.description}</p>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1">
              {Object.entries(PRESET_QUERIES).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMode(key);
                    setQuery(value);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200"
                >
                  {key}
                </button>
              ))}
            </div>

            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={6}
              placeholder="State intent, setup conditions, and desired output format."
              className="w-full resize-y rounded-md border border-slate-700 bg-slate-950 p-2 text-xs leading-5 text-slate-100 outline-none"
            />

            {error && (
              <p className="rounded-md border border-red-500/40 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">{error}</p>
            )}
          </form>

          <section className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-200">Output Console</h2>
              <div className="flex gap-0.5">
                {([
                  ["thesis", "Thesis"],
                  ["risk", "Risk"],
                  ["checklist", "Checklist"],
                  ["execution", "Execution"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOutputView(value)}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                      outputView === value
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              {outputView === "thesis" && "High-level directional thesis and rationale."}
              {outputView === "risk" && "Risk, invalidation, and downside pathways."}
              {outputView === "checklist" && "Pre-trade validation checklist and confirmation stack."}
              {outputView === "execution" && "Action plan routing into scanner, alerts, journal, and backtest."}
            </p>

            <div className="min-h-[300px] rounded-md border border-slate-700 bg-slate-950 p-2 text-xs leading-5 text-slate-100">
              {loading && !answer && <span className="text-slate-400">Waiting for MSP Analyst response...</span>}
              {!loading && !answer && !error && <span className="text-slate-400">Run a query to populate the institutional output console.</span>}
              {answer && (
                <div className="prose prose-invert max-w-none prose-p:my-1 prose-li:my-0 prose-headings:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Link href={actionLinks.journal} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-center text-[11px] text-slate-200 hover:border-emerald-400/50">
                Send to Journal
              </Link>
              <Link href={actionLinks.scanner} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-center text-[11px] text-slate-200 hover:border-emerald-400/50">
                Open Scanner
              </Link>
              <Link href={actionLinks.alerts} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-center text-[11px] text-slate-200 hover:border-emerald-400/50">
                Create Alert
              </Link>
              <Link href={actionLinks.backtest} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-center text-[11px] text-slate-200 hover:border-emerald-400/50">
                Backtest Idea
              </Link>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default function AiAnalystPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
          Loading AI Analyst...
        </div>
      }
    >
      <AiAnalystContent />
    </Suspense>
  );
}
