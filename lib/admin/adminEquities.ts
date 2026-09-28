/** Operator-requested pause, scoped to admin research only. Public ingestion is unaffected. */
export function adminEquitiesPaused(): boolean {
  return /^(1|true|yes)$/i.test(process.env.ADMIN_EQUITIES_PAUSED ?? '');
}
export const ADMIN_EQUITIES_PAUSED_MESSAGE = 'Admin equity research is temporarily paused to reduce data and database usage. Public data services are unchanged.';
export function isEquityMarket(value: unknown): boolean {
  return /^(equities|equity|stocks|stock|options|etf)$/i.test(String(value ?? ''));
}
export function pausedAdminAvRequest(url: string): boolean {
  if (!adminEquitiesPaused()) return false;
  const fn = new URL(url).searchParams.get('function') ?? '';
  // Crypto and macro series remain available; equity/ETF/fundamental/options functions stop.
  return !/^(CRYPTO_|DIGITAL_CURRENCY_|FX_|CURRENCY_EXCHANGE_RATE$|TREASURY_YIELD$|FEDERAL_FUNDS_RATE$|CPI$|INFLATION$|REAL_GDP|UNEMPLOYMENT$|NONFARM_PAYROLL$)/.test(fn);
}
export function pausedAdminRequest(path: string, values: Record<string, unknown>): boolean {
  if (!adminEquitiesPaused() || !path.startsWith('/api/admin/')) return false;
  if (/^\/api\/admin\/(equity-research|options-architect|insider|transcripts|sector-rotation|quant-screener)(\/|$)/.test(path)) return true;
  return [values.market, values.assetClass, values.asset_class, values.assetType].some(isEquityMarket);
}
