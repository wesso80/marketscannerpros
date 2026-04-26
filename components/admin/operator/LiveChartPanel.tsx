"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

let lwcModule: typeof import("lightweight-charts") | null = null;

export default function LiveChartPanel({ data }: { data: AdminSymbolIntelligence | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<{ candle: any; volume: any; ema20: any; ema50: any } | null>(null);
  const [chartReady, setChartReady] = useState(0);

  // Convert bars to lightweight-charts format
  const candles = useMemo(() => {
    if (!data?.bars?.length) return [];
    return data.bars
      .map((b) => ({
        time: (Math.floor(new Date(b.timestamp).getTime() / 1000)) as any,
        open: b.open, high: b.high, low: b.low, close: b.close,
      }))
      .sort((a: any, b: any) => a.time - b.time);
  }, [data?.bars]);

  const volumes = useMemo(() => {
    if (!data?.bars?.length) return [];
    return data.bars
      .map((b) => ({
        time: (Math.floor(new Date(b.timestamp).getTime() / 1000)) as any,
        value: b.volume,
        color: b.close >= b.open ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
      }))
      .sort((a: any, b: any) => a.time - b.time);
  }, [data?.bars]);

  const emaLines = useMemo(() => {
    if (!data?.bars?.length) return { ema20: [] as any[], ema50: [] as any[] };
    const closes = data.bars.map((b) => b.close);
    const times = data.bars.map((b) => Math.floor(new Date(b.timestamp).getTime() / 1000));
    function calcEma(values: number[], period: number) {
      const out: { time: any; value: number }[] = [];
      const k = 2 / (period + 1);
      let prev: number | null = null;
      for (let i = 0; i < values.length; i++) {
        if (i < period - 1) continue;
        if (prev === null) {
          prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
        } else {
          prev = values[i] * k + prev * (1 - k);
        }
        out.push({ time: times[i] as any, value: prev });
      }
      return out.sort((a: any, b: any) => a.time - b.time);
    }
    return { ema20: calcEma(closes, 20), ema50: calcEma(closes, 50) };
  }, [data?.bars]);

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    async function init() {
      if (!lwcModule) {
        lwcModule = await import("lightweight-charts");
      }
      if (disposed || !containerRef.current) return;

      const { createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType, CrosshairMode, PriceScaleMode } = lwcModule;

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 380,
        layout: {
          background: { type: ColorType.Solid, color: "#0b1220" },
          textColor: "rgba(255,255,255,0.3)",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.03)" },
          horzLines: { color: "rgba(255,255,255,0.03)" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          mode: PriceScaleMode.Normal,
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10B981", downColor: "#EF4444",
        borderDownColor: "#EF4444", borderUpColor: "#10B981",
        wickDownColor: "#EF4444", wickUpColor: "#10B981",
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: "rgba(99,102,241,0.25)",
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      const ema20Series = chart.addSeries(LineSeries, {
        color: "rgba(59,130,246,0.6)", lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      });

      const ema50Series = chart.addSeries(LineSeries, {
        color: "rgba(251,191,36,0.6)", lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      });

      chartRef.current = chart;
      seriesRef.current = { candle: candleSeries, volume: volumeSeries, ema20: ema20Series, ema50: ema50Series };

      // Resize handler
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current);

      // Store cleanup for resize observer
      (chartRef.current as any)._ro = ro;

      // Signal that chart is ready so data effects can run
      setChartReady((c) => c + 1);
    }

    init();

    return () => {
      disposed = true;
      if (chartRef.current) {
        (chartRef.current as any)._ro?.disconnect();
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, []); // Mount once only

  // Update data when candles/volumes/ema change
  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s || !chart || candles.length === 0) return;

    s.candle.setData(candles);
    s.volume.setData(volumes);
    if (emaLines.ema20.length) s.ema20.setData(emaLines.ema20);
    if (emaLines.ema50.length) s.ema50.setData(emaLines.ema50);
    chart.timeScale().fitContent();
  }, [candles, volumes, emaLines, chartReady]);

  // Update price lines when targets/levels change
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !data) return;

    // Price lines are re-set on each data change — lightweight-charts replaces previous ones when setData is called
    // So we create new ones each time targets change
    const addLine = (price: number, color: string, title: string, style = 2) => {
      if (!price) return;
      try {
        s.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: style === 2, title });
      } catch { /* price line may already exist */ }
    };

    if (data.targets) {
      addLine(data.targets.entry, "#10B981", "Entry");
      addLine(data.targets.invalidation, "#EF4444", "Stop");
      addLine(data.targets.target1, "#3B82F6", "T1");
      addLine(data.targets.target2, "#3B82F6", "T2");
      if (data.targets.target3) addLine(data.targets.target3, "#8B5CF6", "T3");
    }
    if (data.levels) {
      addLine(data.levels.pdh, "rgba(255,255,255,0.12)", "PDH", 1);
      addLine(data.levels.pdl, "rgba(255,255,255,0.12)", "PDL", 1);
      if (data.levels.vwap) addLine(data.levels.vwap, "rgba(251,191,36,0.2)", "VWAP", 1);
    }
  }, [data?.targets, data?.levels, candles, chartReady]); // re-run after chart ready + candles

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
      <div ref={containerRef} style={{ height: 380 }} />
    </div>
  );
}
