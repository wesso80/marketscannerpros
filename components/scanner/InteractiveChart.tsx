'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';

/* ─── Types ─── */
export interface InteractiveChartCandle {
  t: string; // ISO date or YYYY-MM-DD
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface InteractiveChartProps {
  candles: InteractiveChartCandle[];
  ema200?: number[];
  symbol?: string;
  interval?: string;
  height?: number;
  /** Optional volume data (if separate from candles) */
  volumes?: number[];
  /** Show EMA200 overlay */
  showEMA?: boolean;
  /** Show volume bars */
  showVolume?: boolean;
}

/* ─── Helpers ─── */
function toUTC(iso: string): UTCTimestamp {
  const d = new Date(iso);
  return Math.floor(d.getTime() / 1000) as UTCTimestamp;
}

/* ─── Component ─── */
export default function InteractiveChart({
  candles,
  ema200,
  symbol = '',
  interval = '',
  height = 420,
  showEMA = true,
  showVolume = true,
}: InteractiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Build chart once
  const initChart = useCallback(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
        attributionLogo: true, // Required by Apache 2.0 license
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.3)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.3)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(16, 185, 129, 0.4)', labelBackgroundColor: '#10B981' },
        horzLine: { color: 'rgba(16, 185, 129, 0.4)', labelBackgroundColor: '#10B981' },
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        scaleMargins: { top: 0.1, bottom: showVolume ? 0.25 : 0.05 },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candleSeriesRef.current = candleSeries;

    // Volume histogram (pinned to bottom)
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeriesRef.current = volumeSeries;
    }

    // EMA 200 line
    if (showEMA) {
      const emaSeries = chart.addSeries(LineSeries, {
        color: '#FBBF24',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      emaSeriesRef.current = emaSeries;
    }

    chartRef.current = chart;

    // Responsive resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) chart.applyOptions({ width });
      }
    });
    ro.observe(containerRef.current);
    resizeObserverRef.current = ro;
  }, [height, showVolume, showEMA]);

  // Update data when candles change
  const updateData = useCallback(() => {
    if (!chartRef.current || !candleSeriesRef.current || !candles.length) return;

    // Deduplicate by timestamp (lightweight-charts requires unique times)
    const seen = new Set<number>();
    const candleData: CandlestickData[] = [];
    const volData: { time: UTCTimestamp; value: number; color: string }[] = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const time = toUTC(c.t);
      if (seen.has(time)) continue;
      seen.add(time);

      candleData.push({ time, open: c.o, high: c.h, low: c.l, close: c.c });

      const vol = c.v ?? 0;
      volData.push({
        time,
        value: vol,
        color: c.c >= c.o ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      });
    }

    // Sort ascending
    candleData.sort((a, b) => (a.time as number) - (b.time as number));
    volData.sort((a, b) => (a.time as number) - (b.time as number));

    candleSeriesRef.current.setData(candleData);

    if (volumeSeriesRef.current && volData.some((v) => v.value > 0)) {
      volumeSeriesRef.current.setData(volData);
    }

    // EMA overlay
    if (emaSeriesRef.current && ema200 && ema200.length > 0) {
      const offset = candleData.length - ema200.length;
      const emaData = ema200
        .map((val, i) => ({
          time: candleData[i + offset]?.time as UTCTimestamp,
          value: val,
        }))
        .filter((d) => d.time != null && Number.isFinite(d.value));
      emaSeriesRef.current.setData(emaData);
    }

    chartRef.current!.timeScale().fitContent();
  }, [candles, ema200]);

  // Lifecycle
  useEffect(() => {
    initChart();
    return () => {
      resizeObserverRef.current?.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        emaSeriesRef.current = null;
      }
    };
  }, [initChart]);

  useEffect(() => {
    updateData();
  }, [updateData]);

  if (!candles.length) {
    return (
      <div
        style={{ height, background: 'rgba(15, 23, 42, 0.5)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        className="text-slate-500 text-sm"
      >
        No chart data available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Symbol + interval label */}
      {(symbol || interval) && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 12,
            zIndex: 2,
            fontSize: 12,
            color: '#94a3b8',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {symbol} {interval && <span style={{ color: '#64748b' }}>· {interval}</span>}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }} />
    </div>
  );
}
