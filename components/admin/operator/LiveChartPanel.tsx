"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

/* ── Helpers ── */
function parseBars(bars: NonNullable<AdminSymbolIntelligence["bars"]>) {
  const seen = new Set<number>();
  const candles: any[] = [];
  const volumes: any[] = [];

  for (const b of bars) {
    const t = Math.floor(new Date(b.timestamp.replace(" ", "T") + "Z").getTime() / 1000);
    if (!Number.isFinite(t) || seen.has(t)) continue;
    seen.add(t);
    candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close });
    volumes.push({ time: t, value: b.volume, color: b.close >= b.open ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)" });
  }

  candles.sort((a: any, b: any) => a.time - b.time);
  volumes.sort((a: any, b: any) => a.time - b.time);
  return { candles, volumes };
}

function calcEma(candles: any[], period: number): any[] {
  const out: any[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) continue;
    if (prev === null) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[j].close;
      prev = sum / period;
    } else {
      prev = candles[i].close * k + prev * (1 - k);
    }
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/* ── Component ── */
export default function LiveChartPanel({ data }: { data: AdminSymbolIntelligence | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  // Single effect: build chart + load data whenever bars change
  // We use data?.symbol as an extra dep so chart rebuilds per symbol
  useEffect(() => {
    if (!containerRef.current || !data?.bars?.length) return;
    let disposed = false;

    async function build() {
      try {
        const lwc = await import("lightweight-charts");
        if (disposed || !containerRef.current) return;

        // Destroy previous chart if any
        if (chartRef.current) {
          roRef.current?.disconnect();
          chartRef.current.remove();
          chartRef.current = null;
        }

        const { candles, volumes } = parseBars(data!.bars!);
        if (candles.length === 0) { setChartError("No valid bars after parse"); return; }

        const chart = lwc.createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 380,
          layout: {
            background: { type: lwc.ColorType.Solid, color: "#0b1220" },
            textColor: "rgba(255,255,255,0.3)",
            fontSize: 10,
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.03)" },
            horzLines: { color: "rgba(255,255,255,0.03)" },
          },
          crosshair: { mode: lwc.CrosshairMode.Normal },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
          timeScale: { borderColor: "rgba(255,255,255,0.06)", timeVisible: true, secondsVisible: false },
        });

        // Candlesticks
        const candleSeries = chart.addSeries(lwc.CandlestickSeries, {
          upColor: "#10B981", downColor: "#EF4444",
          borderDownColor: "#EF4444", borderUpColor: "#10B981",
          wickDownColor: "#EF4444", wickUpColor: "#10B981",
        });
        candleSeries.setData(candles);

        // Volume
        const volSeries = chart.addSeries(lwc.HistogramSeries, {
          color: "rgba(99,102,241,0.25)", priceFormat: { type: "volume" }, priceScaleId: "",
        });
        volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volSeries.setData(volumes);

        // EMAs
        const ema20 = calcEma(candles, 20);
        const ema50 = calcEma(candles, 50);
        if (ema20.length) {
          const s = chart.addSeries(lwc.LineSeries, { color: "rgba(59,130,246,0.6)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          s.setData(ema20);
        }
        if (ema50.length) {
          const s = chart.addSeries(lwc.LineSeries, { color: "rgba(251,191,36,0.6)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          s.setData(ema50);
        }

        // Price lines (targets / levels)
        const chartHigh = Math.max(...candles.map((c: any) => c.high));
        const chartLow = Math.min(...candles.map((c: any) => c.low));
        const range = chartHigh - chartLow || chartHigh * 0.1;
        const validMin = chartLow - range * 0.5;
        const validMax = chartHigh + range * 0.5;

        const addLine = (price: number, color: string, title: string, style = 2) => {
          if (!price || price < validMin || price > validMax) return;
          try { candleSeries.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: style === 2, title }); } catch {}
        };

        if (data!.targets) {
          addLine(data!.targets.entry, "#10B981", "Entry");
          addLine(data!.targets.invalidation, "#EF4444", "Stop");
          addLine(data!.targets.target1, "#3B82F6", "T1");
          addLine(data!.targets.target2, "#3B82F6", "T2");
          if (data!.targets.target3) addLine(data!.targets.target3, "#8B5CF6", "T3");
        }
        if (data!.levels) {
          addLine(data!.levels.pdh, "rgba(255,255,255,0.12)", "PDH", 1);
          addLine(data!.levels.pdl, "rgba(255,255,255,0.12)", "PDL", 1);
          if (data!.levels.vwap) addLine(data!.levels.vwap, "rgba(251,191,36,0.2)", "VWAP", 1);
        }

        chart.timeScale().fitContent();
        chartRef.current = chart;
        setChartError(null);

        // Resize
        const ro = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        ro.observe(containerRef.current);
        roRef.current = ro;
      } catch (err: unknown) {
        console.error("[LiveChartPanel] Chart build failed:", err);
        setChartError(err instanceof Error ? err.message : "Chart init failed");
      }
    }

    build();

    return () => {
      disposed = true;
      roRef.current?.disconnect();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [data]); // rebuild on any data change

  if (!data?.bars?.length) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#0b1220] flex items-center justify-center text-white/30 text-sm" style={{ height: 380 }}>
        {data ? "No bar data available" : "Select a symbol to load chart"}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0b1220] overflow-hidden relative">
      <div className="absolute top-1.5 left-3 z-10 flex flex-wrap gap-2 text-[10px] pointer-events-none">
        <span className="text-amber-400 font-medium">{data.symbol} · {data.timeframe}</span>
        <span className="text-emerald-400">{data.regime}</span>
        <span className="text-blue-400/60">EMA20 {data.indicators.ema20.toFixed(data.price < 1 ? 6 : 2)}</span>
        <span className="text-amber-400/60">EMA50 {data.indicators.ema50.toFixed(data.price < 1 ? 6 : 2)}</span>
        {data.indicators.ema200 > 0 && (
          <span className="text-white/30">EMA200 {data.indicators.ema200.toFixed(data.price < 1 ? 6 : 2)}</span>
        )}
        <span className="text-white/30">ATR {data.indicators.atr.toFixed(data.price < 1 ? 6 : 4)}</span>
        <span className="text-white/30">ADX {data.indicators.adx.toFixed(1)}</span>
      </div>
      {chartError && (
        <div className="absolute top-1.5 right-3 z-10 text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
          Chart error: {chartError}
        </div>
      )}
      <div ref={containerRef} style={{ height: 380 }} />
    </div>
  );
}
