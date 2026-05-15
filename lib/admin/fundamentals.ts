/**
 * Alpha Vantage fundamentals fetcher (admin only).
 *
 * Pulls the 4 endpoints needed for a Goldman-style equity research note:
 *   - OVERVIEW         (company description + ratios)
 *   - INCOME_STATEMENT (5y of revenue / margins)
 *   - BALANCE_SHEET    (debt / cash / equity)
 *   - CASH_FLOW        (FCF, capex, share buybacks)
 *
 * Every field that is missing or quota-throttled is reported in
 * `missingFields` so the TruthEnvelope can downgrade confidence.
 *
 * NEVER substitutes synthetic numbers when a field is missing.
 * NEVER hides a quota / 429 / network failure — surfaces it explicitly.
 */

import { fetchWithTimeout } from "./fetchWithTimeout";

const AV_BASE = "https://www.alphavantage.co/query";

export interface FundamentalsBundle {
  ticker: string;
  fetchedAt: string;
  /** Each endpoint's freshness; oldest wins for envelope freshness. */
  endpointStatus: Record<string, "ok" | "missing" | "error" | "rate-limited">;
  overview: Record<string, unknown> | null;
  incomeStatementAnnual: Array<Record<string, unknown>>;
  balanceSheetAnnual: Array<Record<string, unknown>>;
  cashFlowAnnual: Array<Record<string, unknown>>;
  missingFields: string[];
  errors: string[];
}

interface AvCallOpts {
  fn: string;
  symbol: string;
  apiKey: string;
}

async function avCall<T = unknown>({
  fn,
  symbol,
  apiKey,
}: AvCallOpts): Promise<{
  status: "ok" | "rate-limited" | "error" | "missing";
  body: T | null;
  error?: string;
}> {
  const url = `${AV_BASE}?function=${encodeURIComponent(fn)}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetchWithTimeout(url, { cache: "no-store" }, 25000);
    if (!res.ok) {
      return { status: "error", body: null, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as Record<string, unknown>;
    if (typeof json["Note"] === "string" || typeof json["Information"] === "string") {
      const note = (json["Note"] || json["Information"]) as string;
      if (/limit|frequency|quota|premium/i.test(note)) {
        return { status: "rate-limited", body: null, error: note.slice(0, 240) };
      }
    }
    if (Object.keys(json).length === 0) {
      return { status: "missing", body: null, error: "empty response" };
    }
    return { status: "ok", body: json as T };
  } catch (err) {
    return {
      status: "error",
      body: null,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

export async function fetchFundamentalsBundle(
  ticker: string,
): Promise<FundamentalsBundle> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const symbol = ticker.toUpperCase();
  const bundle: FundamentalsBundle = {
    ticker: symbol,
    fetchedAt: new Date().toISOString(),
    endpointStatus: {},
    overview: null,
    incomeStatementAnnual: [],
    balanceSheetAnnual: [],
    cashFlowAnnual: [],
    missingFields: [],
    errors: [],
  };

  if (!apiKey) {
    bundle.errors.push("ALPHA_VANTAGE_API_KEY missing in environment");
    bundle.endpointStatus.OVERVIEW = "error";
    bundle.endpointStatus.INCOME_STATEMENT = "error";
    bundle.endpointStatus.BALANCE_SHEET = "error";
    bundle.endpointStatus.CASH_FLOW = "error";
    bundle.missingFields.push(
      "overview",
      "incomeStatement",
      "balanceSheet",
      "cashFlow",
    );
    return bundle;
  }

  // Sequential fetch — Alpha Vantage free tier is 5 req/min.
  const overview = await avCall<Record<string, unknown>>({
    fn: "OVERVIEW",
    symbol,
    apiKey,
  });
  bundle.endpointStatus.OVERVIEW = overview.status;
  if (overview.status === "ok" && overview.body) {
    bundle.overview = overview.body;
  } else {
    bundle.missingFields.push("overview");
    if (overview.error) bundle.errors.push(`OVERVIEW: ${overview.error}`);
  }

  const income = await avCall<{ annualReports?: Array<Record<string, unknown>> }>({
    fn: "INCOME_STATEMENT",
    symbol,
    apiKey,
  });
  bundle.endpointStatus.INCOME_STATEMENT = income.status;
  if (income.status === "ok" && income.body?.annualReports) {
    bundle.incomeStatementAnnual = income.body.annualReports.slice(0, 5);
  } else {
    bundle.missingFields.push("incomeStatement");
    if (income.error) bundle.errors.push(`INCOME_STATEMENT: ${income.error}`);
  }

  const balance = await avCall<{ annualReports?: Array<Record<string, unknown>> }>({
    fn: "BALANCE_SHEET",
    symbol,
    apiKey,
  });
  bundle.endpointStatus.BALANCE_SHEET = balance.status;
  if (balance.status === "ok" && balance.body?.annualReports) {
    bundle.balanceSheetAnnual = balance.body.annualReports.slice(0, 5);
  } else {
    bundle.missingFields.push("balanceSheet");
    if (balance.error) bundle.errors.push(`BALANCE_SHEET: ${balance.error}`);
  }

  const cash = await avCall<{ annualReports?: Array<Record<string, unknown>> }>({
    fn: "CASH_FLOW",
    symbol,
    apiKey,
  });
  bundle.endpointStatus.CASH_FLOW = cash.status;
  if (cash.status === "ok" && cash.body?.annualReports) {
    bundle.cashFlowAnnual = cash.body.annualReports.slice(0, 5);
  } else {
    bundle.missingFields.push("cashFlow");
    if (cash.error) bundle.errors.push(`CASH_FLOW: ${cash.error}`);
  }

  return bundle;
}

/** Compact, model-friendly serialization — strips boilerplate fields. */
export function serializeFundamentalsForPrompt(b: FundamentalsBundle): string {
  const lines: string[] = [];
  lines.push(`TICKER: ${b.ticker}`);
  lines.push(`FETCHED_AT: ${b.fetchedAt}`);
  lines.push(`ENDPOINT_STATUS: ${JSON.stringify(b.endpointStatus)}`);
  if (b.errors.length) {
    lines.push(`FETCH_ERRORS: ${b.errors.join(" | ")}`);
  }
  if (b.missingFields.length) {
    lines.push(`MISSING_FIELDS: ${b.missingFields.join(",")}`);
  }
  if (b.overview) {
    lines.push("");
    lines.push("OVERVIEW:");
    const o = b.overview as Record<string, string | undefined>;
    const keep = [
      "Symbol", "Name", "Sector", "Industry", "MarketCapitalization",
      "PERatio", "ForwardPE", "PEGRatio", "PriceToSalesRatioTTM",
      "PriceToBookRatio", "EVToRevenue", "EVToEBITDA",
      "ProfitMargin", "OperatingMarginTTM", "ReturnOnEquityTTM",
      "ReturnOnAssetsTTM", "RevenueTTM", "GrossProfitTTM", "EBITDA",
      "DilutedEPSTTM", "QuarterlyEarningsGrowthYOY",
      "QuarterlyRevenueGrowthYOY", "AnalystTargetPrice", "Beta",
      "52WeekHigh", "52WeekLow", "DividendYield", "PayoutRatio",
      "SharesOutstanding", "BookValue",
    ];
    for (const k of keep) {
      if (o[k]) lines.push(`  ${k}: ${o[k]}`);
    }
  }
  if (b.incomeStatementAnnual.length) {
    lines.push("");
    lines.push("INCOME_STATEMENT_ANNUAL (most recent first, up to 5y):");
    for (const r of b.incomeStatementAnnual) {
      const rec = r as Record<string, string>;
      lines.push(
        `  ${rec.fiscalDateEnding}: revenue=${rec.totalRevenue} grossProfit=${rec.grossProfit} operatingIncome=${rec.operatingIncome} netIncome=${rec.netIncome}`,
      );
    }
  }
  if (b.balanceSheetAnnual.length) {
    lines.push("");
    lines.push("BALANCE_SHEET_ANNUAL (most recent first, up to 5y):");
    for (const r of b.balanceSheetAnnual) {
      const rec = r as Record<string, string>;
      lines.push(
        `  ${rec.fiscalDateEnding}: totalAssets=${rec.totalAssets} totalLiab=${rec.totalLiabilities} cash=${rec.cashAndCashEquivalentsAtCarryingValue} shortTermDebt=${rec.shortTermDebt} longTermDebt=${rec.longTermDebt} totalEquity=${rec.totalShareholderEquity}`,
      );
    }
  }
  if (b.cashFlowAnnual.length) {
    lines.push("");
    lines.push("CASH_FLOW_ANNUAL (most recent first, up to 5y):");
    for (const r of b.cashFlowAnnual) {
      const rec = r as Record<string, string>;
      lines.push(
        `  ${rec.fiscalDateEnding}: opCashFlow=${rec.operatingCashflow} capex=${rec.capitalExpenditures} dividends=${rec.dividendPayout} buybacks=${rec.paymentsForRepurchaseOfCommonStock}`,
      );
    }
  }
  return lines.join("\n");
}

/** Derive Truth envelope freshness/confidence from bundle health. */
export function deriveBundleTruth(b: FundamentalsBundle): {
  freshness: "real-time" | "delayed" | "stale" | "unknown";
  simulated: boolean;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
} {
  const okCount = Object.values(b.endpointStatus).filter((s) => s === "ok")
    .length;
  const total = Object.keys(b.endpointStatus).length || 1;
  const ratio = okCount / total;
  if (ratio === 1) {
    return {
      freshness: "delayed",
      simulated: false,
      confidence: "high",
      confidenceReason: `All ${total} fundamentals endpoints returned data.`,
    };
  }
  if (ratio >= 0.5) {
    return {
      freshness: "delayed",
      simulated: false,
      confidence: "medium",
      confidenceReason: `${okCount}/${total} endpoints OK; missing: ${b.missingFields.join(",")}`,
    };
  }
  return {
    freshness: "stale",
    simulated: false,
    confidence: "low",
    confidenceReason: `Only ${okCount}/${total} endpoints OK; conclusions are unreliable.`,
  };
}
