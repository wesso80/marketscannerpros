'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { TradeDatafeed } from './datafeed';
import SymbolPicker from './SymbolPicker';
import OrderPanel from './OrderPanel';
import type { Bar, BarsResponse, Resolution, SymbolMeta } from '@/lib/trade/marketdata';

interface Props {
  initialSymbol?: string;
  initialResolution?: Resolution;
}

interface Overlay {
  id: string;
  source: string;
  symbol: string;
  direction: number;
  entry: number;
  tp1: number | null;
  tp2: number | null;
  sl: number | null;
}

export default function ChartView({ initialSymbol = 'ES.c.0', initialResolution = '5' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlayLinesRef = useRef<IPriceLine[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  const symbol = (searchParams.get('symbol') ?? initialSymbol).toUpperCase();
  const resolution = (searchParams.get('res') ?? initialResolution) as Resolution;

  const [meta, setMeta] = useState<SymbolMeta | null>(null);
  const [source, setSource] = useState<string>('—');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'open' | 'error'>('idle');
  const [overlays, setOverlays] = useState<Overlay[]>([]);

  const updateUrl = (next: { symbol: string; resolution: Resolution }) => {
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.set('symbol', next.symbol);
    sp.set('res', next.resolution);
    router.replace(`/trade?${sp.toString()}`);
  };

  // Init chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0F172A' }, textColor: '#E2E8F0' },
      grid: { vertLines: { color: '#1E293B' }, horzLines: { color: '#1E293B' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#334155' },
      rightPriceScale: { borderColor: '#334155' },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load history + symbol meta on symbol/res change.
  useEffect(() => {
    let cancelled = false;
    const feed = new TradeDatafeed();
    setError(null);

    (async () => {
      try {
        const m = await feed.resolve(symbol);
        if (cancelled) return;
        setMeta(m);

        const to = Date.now();
        const from = to - 5 * 24 * 60 * 60 * 1000;
        const data: BarsResponse = await feed.getBars(symbol, resolution, from, to, 5000);
        if (cancelled) return;
        setSource(data.source);
        setFetchedAt(data.fetchedAt);
        setLastPrice(data.bars.at(-1)?.close ?? null);

        if (seriesRef.current) {
          seriesRef.current.setData(
            data.bars.map((b: Bar) => ({
              time: Math.floor(b.time / 1000) as UTCTimestamp,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            }))
          );
        }
        if (data.noData) setError('No bars returned for this range.');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, resolution]);

  // SSE live feed.
  useEffect(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setStreamStatus('idle');
    const url = `/api/trade/stream?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}`;
    const es = new EventSource(url, { withCredentials: true });
    sseRef.current = es;

    es.addEventListener('hello', () => setStreamStatus('open'));
    es.addEventListener('error', () => setStreamStatus('error'));
    es.addEventListener('bar', (ev) => {
      try {
        const b = JSON.parse((ev as MessageEvent).data) as Bar;
        if (!seriesRef.current) return;
        seriesRef.current.update({
          time: Math.floor(b.time / 1000) as UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        });
        setLastPrice(b.close);
      } catch { /* ignore */ }
    });
    es.addEventListener('tick', (ev) => {
      try {
        const t = JSON.parse((ev as MessageEvent).data) as { price: number };
        setLastPrice(t.price);
      } catch { /* ignore */ }
    });

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [symbol, resolution]);

  // Overlays: poll every 10s + render as price lines.
  useEffect(() => {
    let cancelled = false;
    const fetchOverlays = async () => {
      try {
        const res = await fetch(`/api/trade/overlays?symbol=${encodeURIComponent(symbol)}`, { credentials: 'include' });
        if (!res.ok) return;
        const json = (await res.json()) as { overlays: Overlay[] };
        if (cancelled) return;
        setOverlays(json.overlays);
      } catch { /* ignore */ }
    };
    fetchOverlays();
    const timer = setInterval(fetchOverlays, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

  // Render overlay price lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of overlayLinesRef.current) series.removePriceLine(line);
    overlayLinesRef.current = [];

    for (const o of overlays) {
      const tag = o.direction > 0 ? 'L' : 'S';
      const lines: Array<{ price: number; color: string; title: string }> = [
        { price: o.entry, color: '#3B82F6', title: `${tag} ENTRY` },
      ];
      if (o.tp1 != null) lines.push({ price: o.tp1, color: '#10B981', title: `${tag} TP1` });
      if (o.tp2 != null) lines.push({ price: o.tp2, color: '#10B981', title: `${tag} TP2` });
      if (o.sl != null) lines.push({ price: o.sl, color: '#EF4444', title: `${tag} SL` });

      for (const l of lines) {
        const pl = series.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: l.title,
        });
        overlayLinesRef.current.push(pl);
      }
    }
  }, [overlays]);

  const streamBadge = useMemo(() => {
    if (streamStatus === 'open') return { label: 'live', color: '#10B981' };
    if (streamStatus === 'error') return { label: 'reconnecting', color: '#EF4444' };
    return { label: 'idle', color: '#64748B' };
  }, [streamStatus]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0F172A', color: '#E2E8F0', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', gap: 16, padding: '8px 16px', borderBottom: '1px solid #1E293B', alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
        <strong style={{ color: '#10B981' }}>MSP Trade</strong>
        <SymbolPicker symbol={symbol} resolution={resolution} onChange={updateUrl} />
        {meta && <span style={{ opacity: 0.6, fontSize: 12 }}>tick {meta.tickSize} · ${meta.tickValue}/tick</span>}
        {lastPrice != null && (
          <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#10B981' }}>{lastPrice.toFixed(2)}</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', opacity: 0.7, fontSize: 11 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: streamBadge.color, display: 'inline-block' }} />
            {streamBadge.label}
          </span>
          <span>source: <code>{source}</code></span>
          {fetchedAt && <span>fetched {new Date(fetchedAt).toLocaleTimeString()}</span>}
        </span>
      </header>
      {error && <div style={{ padding: '6px 16px', background: '#7F1D1D', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div ref={containerRef} style={{ flex: 1, minWidth: 0 }} />
        <OrderPanel symbol={symbol} estPrice={lastPrice} />
      </div>
      <footer style={{ padding: '4px 16px', borderTop: '1px solid #1E293B', fontSize: 11, opacity: 0.5 }}>
        Personal admin · paper broker only · TGS overlays via webhook · audit log on every action
      </footer>
    </div>
  );
}
