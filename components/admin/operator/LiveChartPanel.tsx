"use client";

import { useEffect, useRef, useMemo } from "react";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function LiveChartPanel({ data }: { data: AdminSymbolIntelligence | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleRef = useRef<any>(null);
  const volumeRef = useRef<any>(null);
  const ema20Ref = useRef<any>(null);
  const ema50Ref = useRef<any>(null);

  // Convert bars to lightweight-charts format (time as UTC seconds)
  const candles = useMemo(() => {
    if (!data?.bars?.length) return [];
    return data.bars
      .map((b) => ({
        time: Math.floor(new Date(b.timestamp).getTime() / 1000) as any,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
      .sort((a: any, b: any) => a.time - b.time);
  }, [data?.bars]);

  const volumes = useMemo(() => {
    if (!data?.bars?.length) return [];
    return data.bars
      .map((b) => ({
        time: Math.floor(new Date(b.timestamp).getTime() / 1000) as any,
        value: b.volume,
        color: b.close >= b.open ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
      }))
      .sort((a: any, b: any) => a.time - b.time);
  }, [data?.bars]);

  // Compute EMA line data from bars
  const emaData = useMemo(() => {
    if (!data?.bars?.length) return { ema20: [] as any[], ema50: [] as any[] };
    const closes = data.bars.map((b) => b.close);
    const times = data.bars.map((b) => Math.floor(new Date(b.timestamp).getTime() / 1000));

    function computeEma(values: number[], period: number) {
      const result: { time: any; value: number }[] = [];
      const k = 2 / (period + 1);
      let prev: number | null = null;
      for (let i = 0; i < values.length; i++) {
        if (i < period - 1) continue;
        if (prev === null) {
          prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
        } else {
          prev = values[i] * k + prev * (1 - k);
        }
        result.push({ time: times[i] as any, value: prev });
      }
      return result.sort((a: any, b: any) => a.time - b.time);
    }

    return { ema20: computeEma(closes, 20), ema50: computeEma(closes, 50) };
  }, [data?.bars]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;
    let chart: any;

    (async () => {
      const { createChart, ColorType, CrosshairMode, PriceScaleMode } = await import("lightweight-charts");

      if (chartRef.current) {
        chartRef.current.remove();
      }

      chart = createChart(containerRef.current!, {
        width: containerRef.current!.clientWidth,
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

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#10B981",
        downColor: "#EF4444",
        borderDownColor: "#EF4444",
        borderUpColor: "#10B981",
        wickDownColor: "#EF4444",
        wickUpColor: "#10B981",
      });

      const volumeSeries = chart.addHistogramSeries({
        color: "rgba(99,102,241,0.25)",
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      const ema20Series = chart.addLineSeries({
        color: "rgba(59,130,246,0.6)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const ema50Series = chart.addLineSeries({
        color: "rgba(251,191,36,0.6)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      chartRef.current = chart;
      candleRef.current = candleSeries;
      volumeRef.current = volumeSeries;
      ema20Ref.current = ema20Series;
      ema50Ref.current = ema50Series;

      // Set data
      if (candles.length > 0) {
        candleSeries.setData(candles);
        volumeSeries.setData(volumes);
        if (emaData.ema20.length) ema20Series.setData(emaData.ema20);
        if (emaData.ema50.length) ema50Series.setData(emaData.ema50);
        chart.timeScale().fitContent();
      }

      // Add price lines for key levels
      if (data?.targets) {
        const addLevel = (price: number, color: string, title: string) => {
          if (!price) return;
          candleSeries.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title,
          });
        };
        addLevel(data.targets.entry, "#10B981", "Entry");
        addLevel(data.targets.invalidation, "#EF4444", "Stop");
        addLevel(data.targets.target1, "#3B82F6", "T1");
        addLevel(data.targets.target2, "#3B82F6", "T2");
        addLevel(data.targets.target3, "#8B5CF6", "T3");
      }

      // Add key levels
      if (data?.levels) {
        const addKeyLevel = (price: number, title: string) => {
          if (!price) return;
          candleSeries.createPriceLine({
            price,
            color: "rgba(255,255,255,0.12)",
            lineWidth: 1,
            lineStyle: 1, // dotted
            axisLabelVisible: false,
            title,
          });
        };
        addKeyLevel(data.levels.pdh, "PDH");
        addKeyLevel(data.levels.pdl, "PDL");
        addKeyLevel(data.levels.vwap, "VWAP");
      }

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chart) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current!);

      return () => {
        ro.disconnect();
        chart.remove();
      };
    })();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, volumes, emaData, data?.targets, data?.levels]);

  if (!data?.bars?.length) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#0b1220] flex items-center justify-center text-white/30 text-sm" style={{ height: 380 }}>
        {data ? "No bar data available" : "Select a symbol to load chart"}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0b1220] overflow-hidden relative">
      {/* Indicator overlay header */}
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
