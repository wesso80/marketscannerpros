import { dailyChartSvg, type PublicDailyChart } from '@/lib/research/publicDailyChart';

/** Env name. Unset, safe, and any other value are safe. Only raw serves signed-out OHLC. */
export const PUBLIC_CHART_MODE_ENV = 'PUBLIC_CHART_MODE';

export type PublicChartMode = 'safe' | 'raw';

/**
 * Market routes note that the Alpha Vantage licence requires signed-in users for
 * raw data. Safe is the default: a signed-out visitor gets a server-drawn chart
 * and no OHLC array. Raw is the other choice: that visitor gets the dailyChart
 * bars in JSON. Signed-in readers get the bars in both modes.
 */
export function publicChartMode(env: NodeJS.ProcessEnv = process.env): PublicChartMode {
  return env[PUBLIC_CHART_MODE_ENV]?.trim().toLowerCase() === 'raw' ? 'raw' : 'safe';
}

export function presentDailyChart(
  chart: PublicDailyChart | null | undefined,
  signedIn: boolean,
  mode: PublicChartMode = publicChartMode(),
): PublicDailyChart | null {
  if (!chart) return null;
  const bars = chart.bars ?? [];
  if (signedIn || mode === 'raw') return bars.length ? { basis: chart.basis, bars } : null;
  if (bars.length < 2) return { basis: chart.basis, image: null };
  return { basis: chart.basis, image: dailyChartSvg({ basis: chart.basis, bars }) };
}
