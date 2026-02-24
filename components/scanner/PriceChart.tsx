'use client';

import React from 'react';

export interface ChartData {
  candles: { t: string; o: number; h: number; l: number; c: number }[];
  ema200: number[];
  rsi: number[];
  macd: { macd: number; signal: number; hist: number }[];
}

/** @deprecated Use PriceChart instead — kept for barrel-export compat */
export const TradingViewChart = PriceChart;

export function PriceChart({ 
  symbol, 
  interval, 
  price,
  chartData: chartDataProp 
}: { 
  symbol: string; 
  interval: string; 
  price?: number;
  chartData?: ChartData;
}) {
  const priceCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const rsiCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const macdCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const priceChartRef = React.useRef<any>(null);
  const rsiChartRef = React.useRef<any>(null);
  const macdChartRef = React.useRef<any>(null);

  // Self-fetch bars from /api/bars when scanner didn't provide chartData
  const [fetchedData, setFetchedData] = React.useState<ChartData | null>(null);
  const [barSource, setBarSource] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const prevSymbolRef = React.useRef(symbol);

  // Reset fetched data when symbol changes to prevent stale chart
  React.useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      setFetchedData(null);
      setBarSource('');
      prevSymbolRef.current = symbol;
    }
  }, [symbol]);

  React.useEffect(() => {
    if (chartDataProp && chartDataProp.candles.length > 0) {
      setFetchedData(null);
      setBarSource('scanner');
      setLoading(false);
      return;
    }
    // No inline chart data — fetch from cache API
    let cancelled = false;
    setLoading(true);
    const timeframe = interval === 'daily' || interval === 'weekly' ? interval : 'daily';
    fetch(`/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=50`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return;
        if (!json?.ok) { setLoading(false); return; }
        setFetchedData({
          candles: json.candles,
          ema200: json.ema200,
          rsi: json.rsi,
          macd: json.macd,
        });
        setBarSource(json.source ?? 'cache');
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, interval, chartDataProp]);

  const chartData = chartDataProp ?? fetchedData;

  React.useEffect(() => {
    if (!priceCanvasRef.current) return;

    const initCharts = async () => {
      try {
        const ChartJsModule = await import('chart.js');
        const { Chart: ChartLib, registerables } = ChartJsModule;
        ChartLib.register(...registerables);

        if (priceChartRef.current) priceChartRef.current.destroy();
        if (rsiChartRef.current) rsiChartRef.current.destroy();
        if (macdChartRef.current) macdChartRef.current.destroy();

        let labels: string[];
        let closes: number[];
        let ema200Data: (number | null)[];
        let rsiData: number[];
        let macdHist: number[];
        let macdLine: number[];
        let signalLine: number[];

        if (chartData && chartData.candles.length > 0) {
          labels = chartData.candles.map(c => {
            const d = new Date(c.t);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          });
          closes = chartData.candles.map(c => c.c);
          ema200Data = chartData.ema200.map(v => Number.isFinite(v) ? v : null);
          rsiData = chartData.rsi.map(v => Number.isFinite(v) ? v : 50);
          macdHist = chartData.macd.map(m => Number.isFinite(m.hist) ? m.hist : 0);
          macdLine = chartData.macd.map(m => Number.isFinite(m.macd) ? m.macd : 0);
          signalLine = chartData.macd.map(m => Number.isFinite(m.signal) ? m.signal : 0);
        } else {
          const basePrice = price || 100;
          const now = new Date();
          labels = Array.from({ length: 20 }, (_, i) => {
            const d = new Date(now);
            d.setDate(d.getDate() - (19 - i));
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          });
          closes = Array.from({ length: 20 }, () => basePrice);
          ema200Data = Array.from({ length: 20 }, () => basePrice);
          rsiData = Array.from({ length: 20 }, () => 50);
          macdHist = Array.from({ length: 20 }, () => 0);
          macdLine = Array.from({ length: 20 }, () => 0);
          signalLine = Array.from({ length: 20 }, () => 0);
        }

        // === PRICE CHART with EMA200 ===
        const priceCtx = priceCanvasRef.current?.getContext('2d');
        if (priceCtx) {
          priceChartRef.current = new ChartLib(priceCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: `${symbol} Price`,
                  data: closes,
                  borderColor: '#10B981',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  borderWidth: 2,
                  tension: 0.1,
                  fill: true,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                },
                {
                  label: 'EMA 200',
                  data: ema200Data,
                  borderColor: '#F59E0B',
                  borderWidth: 1.5,
                  borderDash: [5, 5],
                  tension: 0.1,
                  fill: false,
                  pointRadius: 0,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index' },
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: { color: '#94A3B8', font: { size: 11 }, boxWidth: 12 },
                },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  titleColor: '#F1F5F9',
                  bodyColor: '#CBD5E1',
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  borderWidth: 1,
                },
              },
              scales: {
                x: {
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 10 }, maxRotation: 0 },
                },
                y: {
                  position: 'right',
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 10 } },
                },
              },
            },
          });
        }

        // === RSI CHART ===
        const rsiCtx = rsiCanvasRef.current?.getContext('2d');
        if (rsiCtx) {
          rsiChartRef.current = new ChartLib(rsiCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: 'RSI (14)',
                  data: rsiData,
                  borderColor: 'var(--msp-accent)',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  borderWidth: 1.5,
                  tension: 0.1,
                  fill: true,
                  pointRadius: 0,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index', axis: 'x' },
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: { color: '#94A3B8', font: { size: 10 }, boxWidth: 10 },
                },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  titleColor: '#F1F5F9',
                  bodyColor: '#CBD5E1',
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                  borderWidth: 1,
                  callbacks: {
                    label: (ctx: any) => `RSI: ${ctx.parsed.y?.toFixed(1)}`
                  }
                },
              },
              scales: {
                x: { display: false },
                y: {
                  position: 'right',
                  min: 0,
                  max: 100,
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { 
                    color: '#64748B', 
                    font: { size: 9 },
                    stepSize: 30,
                    callback: (v) => v === 70 ? '70' : v === 30 ? '30' : ''
                  },
                },
              },
            },
            plugins: [{
              id: 'rsiLines',
              beforeDraw: (chart: any) => {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea) return;
                ctx.save();
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                ctx.setLineDash([4, 4]);
                const y70 = scales.y.getPixelForValue(70);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, y70);
                ctx.lineTo(chartArea.right, y70);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
                const y30 = scales.y.getPixelForValue(30);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, y30);
                ctx.lineTo(chartArea.right, y30);
                ctx.stroke();
                ctx.restore();
              }
            }],
          });
        }

        // === MACD CHART ===
        const macdCtx = macdCanvasRef.current?.getContext('2d');
        if (macdCtx) {
          macdChartRef.current = new ChartLib(macdCtx, {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  type: 'bar' as const,
                  label: 'Histogram',
                  data: macdHist,
                  backgroundColor: macdHist.map(v => v >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'),
                  borderWidth: 0,
                  barPercentage: 0.8,
                },
                {
                  type: 'line' as const,
                  label: 'MACD',
                  data: macdLine,
                  borderColor: 'var(--msp-accent)',
                  borderWidth: 1.5,
                  tension: 0.1,
                  pointRadius: 0,
                  fill: false,
                },
                {
                  type: 'line' as const,
                  label: 'Signal',
                  data: signalLine,
                  borderColor: '#F97316',
                  borderWidth: 1.5,
                  tension: 0.1,
                  pointRadius: 0,
                  fill: false,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index', axis: 'x' },
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: { color: '#94A3B8', font: { size: 10 }, boxWidth: 10 },
                },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  titleColor: '#F1F5F9',
                  bodyColor: '#CBD5E1',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  borderWidth: 1,
                  callbacks: {
                    label: (ctx: any) => {
                      const val = ctx.parsed.y?.toFixed(4);
                      return `${ctx.dataset.label}: ${val}`;
                    }
                  }
                },
              },
              scales: {
                x: {
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 9 }, maxRotation: 0 },
                },
                y: {
                  position: 'right',
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 9 } },
                },
              },
            },
          });
        }

      } catch (error) {
        console.warn('Chart initialization error:', error);
      }
    };

    initCharts();

    return () => {
      if (priceChartRef.current) priceChartRef.current.destroy();
      if (rsiChartRef.current) rsiChartRef.current.destroy();
      if (macdChartRef.current) macdChartRef.current.destroy();
    };
  }, [symbol, interval, price, chartData]);

  const hasData = chartData && chartData.candles.length > 0;
  const sourceLabel = chartDataProp ? 'via scanner' : barSource ? `via ${barSource}` : '';

  return (
    <div style={{ background: 'var(--msp-panel)', borderRadius: '8px', padding: '12px' }}>
      <div style={{ height: '280px', marginBottom: '8px' }}>
        <canvas ref={priceCanvasRef} />
      </div>
      <div style={{ height: '80px', marginBottom: '8px', borderTop: '1px solid var(--msp-border)', paddingTop: '8px' }}>
        <canvas ref={rsiCanvasRef} />
      </div>
      <div style={{ height: '100px', borderTop: '1px solid var(--msp-border)', paddingTop: '8px' }}>
        <canvas ref={macdCanvasRef} />
      </div>
      <div style={{ 
        textAlign: 'right', 
        fontSize: '10px', 
        color: hasData ? 'var(--msp-bull)' : 'var(--msp-neutral)',
        marginTop: '4px'
      }}>
        {hasData ? `● Live Data ${sourceLabel}` : loading ? '⟳ Loading chart data…' : '○ Awaiting bar data'}
      </div>
    </div>
  );
}
