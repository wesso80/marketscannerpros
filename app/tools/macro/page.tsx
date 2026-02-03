'use client';

import { useEffect, useState } from 'react';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import { useAIPageContext } from '@/lib/ai/pageContext';

interface IndicatorValue {
  value: number | null;
  history?: { date: string; value: number }[];
}

interface MacroData {
  timestamp: string;
  rates: {
    treasury10y: IndicatorValue;
    treasury2y: IndicatorValue;
    yieldCurve: { value: number | null; inverted: boolean; label: string };
    fedFunds: IndicatorValue;
  };
  inflation: {
    cpi: IndicatorValue;
    inflationRate: IndicatorValue;
    trend: string;
  };
  employment: {
    unemployment: IndicatorValue;
    trend: string;
  };
  growth: {
    realGDP: IndicatorValue & { unit: string };
  };
  regime: {
    label: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

export default function MacroDashboardPage() {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/economic-indicators?all=true');
        if (!res.ok) throw new Error('Failed to fetch economic data');
        const result = await res.json();
        
        if (result.error) {
          setError(result.error);
          return;
        }
        
        setData(result);
        
        // Set AI context
        setPageData({
          skill: 'macro',
          symbols: [],
          summary: `Regime: ${result.regime?.label}, 10Y: ${result.rates?.treasury10y?.value}%, Fed Funds: ${result.rates?.fedFunds?.value}%, Unemployment: ${result.employment?.unemployment?.value}%`,
          data: {
            regime: result.regime,
            rates: {
              treasury10y: result.rates?.treasury10y?.value,
              treasury2y: result.rates?.treasury2y?.value,
              yieldCurve: result.rates?.yieldCurve,
              fedFunds: result.rates?.fedFunds?.value,
            },
            inflation: result.inflation,
            employment: result.employment,
          },
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60 * 60 * 1000); // Refresh every hour
    return () => clearInterval(interval);
  }, [setPageData]);

  const getRegimeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'from-green-500/20 to-green-600/10 border-green-500/30';
      case 'high': return 'from-red-500/20 to-red-600/10 border-red-500/30';
      default: return 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30';
    }
  };

  const getRegimeTextColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'text-green-400';
      case 'high': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  };

  // Mini sparkline component
  const Sparkline = ({ data, color = 'emerald' }: { data: { value: number }[]; color?: string }) => {
    if (!data || data.length < 2) return null;
    
    const values = data.slice(0, 12).reverse().map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 80;
      const y = 20 - ((v - min) / range) * 18;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <svg viewBox="0 0 80 24" className="w-20 h-6">
        <polyline
          fill="none"
          stroke={`rgb(var(--${color}-400))`}
          strokeWidth="1.5"
          points={points}
          className={`stroke-${color}-400`}
          style={{ stroke: color === 'emerald' ? '#34d399' : color === 'red' ? '#f87171' : '#60a5fa' }}
        />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <ToolsPageHeader
        title="Macro Dashboard"
        subtitle="Economic indicators, rates, and market regime"
        badge="Economic Data"
        icon="🏛️"
      />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Market Status */}
        <div className="flex items-center justify-between mb-6">
          <MarketStatusBadge showGlobal />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center">
            <p className="text-red-400">⚠️ {error}</p>
          </div>
        ) : data ? (
          <>
            {/* Regime Banner */}
            <div className={`bg-gradient-to-r ${getRegimeColor(data.regime.riskLevel)} border rounded-xl p-6 mb-8`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-2xl font-bold ${getRegimeTextColor(data.regime.riskLevel)} mb-1`}>
                    {data.regime.label}
                  </h2>
                  <p className="text-slate-300">{data.regime.description}</p>
                </div>
                <div className={`text-6xl opacity-50`}>
                  {data.regime.riskLevel === 'low' ? '🟢' : data.regime.riskLevel === 'high' ? '🔴' : '🟡'}
                </div>
              </div>
            </div>

            {/* Interest Rates Section */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>💰</span> Interest Rates
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 10Y Treasury */}
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">10Y Treasury</span>
                    {data.rates.treasury10y.history && (
                      <Sparkline data={data.rates.treasury10y.history} color="blue" />
                    )}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.rates.treasury10y.value?.toFixed(2) || 'N/A'}%
                  </p>
                </div>

                {/* 2Y Treasury */}
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">2Y Treasury</span>
                    {data.rates.treasury2y.history && (
                      <Sparkline data={data.rates.treasury2y.history} color="blue" />
                    )}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.rates.treasury2y.value?.toFixed(2) || 'N/A'}%
                  </p>
                </div>

                {/* Yield Curve */}
                <div className={`bg-slate-900/50 border rounded-xl p-5 ${data.rates.yieldCurve.inverted ? 'border-red-500/50' : 'border-slate-700/50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Yield Curve (10Y-2Y)</span>
                    {data.rates.yieldCurve.inverted && <span className="text-red-400 text-xs">⚠️</span>}
                  </div>
                  <p className={`text-3xl font-bold ${data.rates.yieldCurve.inverted ? 'text-red-400' : 'text-white'}`}>
                    {data.rates.yieldCurve.value?.toFixed(2) || 'N/A'}%
                  </p>
                  <p className={`text-xs mt-1 ${data.rates.yieldCurve.inverted ? 'text-red-400' : 'text-slate-500'}`}>
                    {data.rates.yieldCurve.label}
                  </p>
                </div>

                {/* Fed Funds */}
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Fed Funds Rate</span>
                    {data.rates.fedFunds.history && (
                      <Sparkline data={data.rates.fedFunds.history} color="emerald" />
                    )}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.rates.fedFunds.value?.toFixed(2) || 'N/A'}%
                  </p>
                </div>
              </div>
            </div>

            {/* Inflation Section */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>📈</span> Inflation
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CPI */}
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Consumer Price Index (CPI)</span>
                    {data.inflation.cpi.history && (
                      <Sparkline data={data.inflation.cpi.history} color="red" />
                    )}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.inflation.cpi.value?.toFixed(1) || 'N/A'}
                  </p>
                </div>

                {/* Inflation Rate */}
                <div className={`bg-slate-900/50 border rounded-xl p-5 ${data.inflation.trend === 'elevated' ? 'border-orange-500/50' : 'border-slate-700/50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Inflation Rate (YoY)</span>
                    {data.inflation.inflationRate.history && (
                      <Sparkline data={data.inflation.inflationRate.history} color="red" />
                    )}
                  </div>
                  <p className={`text-3xl font-bold ${data.inflation.trend === 'elevated' ? 'text-orange-400' : 'text-white'}`}>
                    {data.inflation.inflationRate.value?.toFixed(1) || 'N/A'}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1 capitalize">{data.inflation.trend}</p>
                </div>
              </div>
            </div>

            {/* Employment & Growth Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Employment */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span>👷</span> Employment
                </h3>
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Unemployment Rate</span>
                    {data.employment.unemployment.history && (
                      <Sparkline data={data.employment.unemployment.history} color="emerald" />
                    )}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.employment.unemployment.value?.toFixed(1) || 'N/A'}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1 capitalize">
                    Labor market: {data.employment.trend}
                  </p>
                </div>
              </div>

              {/* Growth */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span>📊</span> Economic Growth
                </h3>
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Real GDP</span>
                    {data.growth.realGDP.history && (
                      <Sparkline data={data.growth.realGDP.history} color="emerald" />
                    )}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    ${((data.growth.realGDP.value || 0) / 1000).toFixed(1)}T
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{data.growth.realGDP.unit}</p>
                </div>
              </div>
            </div>

            {/* Trading Implications */}
            <div className="mt-8 bg-slate-900/50 border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>💡</span> Trading Implications
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">Rate Environment</p>
                  <p className="text-white">
                    {(data.rates.fedFunds.value || 0) > 4 
                      ? '🔴 High rates - defensive sectors favored' 
                      : (data.rates.fedFunds.value || 0) > 2 
                        ? '🟡 Moderate rates - balanced approach' 
                        : '🟢 Low rates - growth stocks favored'}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">Yield Curve Signal</p>
                  <p className="text-white">
                    {data.rates.yieldCurve.inverted 
                      ? '⚠️ Inverted - recession risk elevated' 
                      : '✅ Normal - expansion expected'}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">Inflation Impact</p>
                  <p className="text-white">
                    {data.inflation.trend === 'elevated' 
                      ? '📈 Elevated - TIPS, commodities, value' 
                      : '📉 Moderate - tech, growth stocks'}
                  </p>
                </div>
              </div>
            </div>

            {/* Last Updated */}
            <p className="text-center text-xs text-slate-500 mt-6">
              Data refreshes hourly • Last updated: {new Date(data.timestamp).toLocaleString()}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
