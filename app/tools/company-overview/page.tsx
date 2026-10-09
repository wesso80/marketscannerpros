"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessPortfolioInsights } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import { useV2 } from '@/app/v2/_lib/V2Context';
import RegimeBanner from '@/components/RegimeBanner';
import AdaptivePersonalityCard from '@/components/AdaptivePersonalityCard';
import { formatChangePercent } from '@/lib/presentation/formatChangePercent';
import { sectorTone } from '@/lib/overview/today';

interface CompanyData {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: string;
  pe: string;
  peg: string;
  bookValue: string;
  dividendYield: string;
  eps: string;
  profitMargin: string;
  operatingMargin: string;
  returnOnAssets: string;
  returnOnEquity: string;
  revenue: string;
  grossProfit: string;
  quarterlyEarningsGrowth: string;
  quarterlyRevenueGrowth: string;
  analystTargetPrice: string;
  week52High: string;
  week52Low: string;
  day50MA: string;
  day200MA: string;
  beta: string;
  currentPrice: string | null;
  changePercent: string | null;
  fetchedAt?: string | null;
  forwardPE?: string | null;
  // Period basis / earnings / analyst context (shared helper)
  latestQuarter?: string | null;
  fiscalYearEnd?: string | null;
  periodBasis?: Array<{ metric: string; period: string }>;
  periodSummary?: string;
  valuationBasis?: string;
  multiple?: { label: string; detail: string; rule: string };
  nextEarningsDate?: string | null;
  nextEarningsStatus?: 'SCHEDULED' | 'NONE_IN_HORIZON' | 'UNKNOWN';
  nextEarningsEstimate?: number | null;
  daysToEarnings?: number | null;
  lastReportedQuarter?: string | null;
  lastReportedDate?: string | null;
  lastReportedEPS?: number | null;
  lastEstimatedEPS?: number | null;
  lastEpsBeat?: boolean | null;
  beatRate?: number | null;
  recentQuarters?: Array<{ fiscalDateEnding: string; reportedDate: string | null; reportedEPS: number | null; estimatedEPS: number | null; surprisePercent: number | null; beat: boolean | null }>;
  analystCount?: number | null;
  analystRatings?: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
  priceAsOf?: string | null;
  dataSource?: string | null;
}

function CompanyOverviewContent({ propSymbol }: { propSymbol?: string }) {
  const embeddedInGoldenEgg = Boolean(propSymbol);
  const { tier } = useUserTier();
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [error, setError] = useState("");

  // Sync symbol from prop (Golden Egg), V2Context, or URL
  const { selectedSymbol: v2Symbol } = useV2();
  useEffect(() => {
    const sym = propSymbol?.trim().toUpperCase() || v2Symbol || searchParams.get('symbol');
    if (sym) {
      const normalized = sym.toUpperCase();
      setSymbol(normalized);
      fetchCompanyData(normalized);
    }
  }, [propSymbol, v2Symbol, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCompanyData = async (sym: string) => {
    if (!sym.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await fetch(`/api/company-overview?symbol=${sym.toUpperCase()}`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to fetch company data");
      } else {
        setData(result.data);
      }
    } catch (err) {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  };

  // Gate for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--msp-bg)] text-[var(--msp-text)]">
        <UpgradeGate feature="Company Overview" requiredTier="pro" />
      </div>
    );
  }

  const handleSearch = async () => {
    fetchCompanyData(symbol);
  };

  const formatValue = (value: string | undefined | null) => {
    if (!value || value === "None" || value === "-") return "N/A";
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value;
  };

  const formatMarketCap = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  const formatPercent = (value: string | undefined | null) => {
    if (!value || value === "None" || value === "-") return "N/A";
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    const pct = num * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}% YoY`;
  };

  const formatPercentRaw = (value: string | undefined | null) => {
    if (!value || value === "None" || value === "-") return "N/A";
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    return `${(num * 100).toFixed(1)}%`;
  };

  // Analysis helper functions
  // W3: measured relations only (provider overview fields), not a "Bullish / Bearish" bias.
  const getPricePosition = () => {
    if (!data || !data.currentPrice) return null;
    const price = parseFloat(data.currentPrice);
    const ma50 = parseFloat(data.day50MA);
    const ma200 = parseFloat(data.day200MA);
    const high52 = parseFloat(data.week52High);
    const low52 = parseFloat(data.week52Low);
    if (isNaN(price) || isNaN(ma50) || isNaN(ma200)) return null;
    const rel = (ma: number) => (price > ma ? 'above' : price < ma ? 'below' : 'at');
    const parts = [`Price ${rel(ma50)} the 50-day average ($${ma50.toFixed(2)}) and ${rel(ma200)} the 200-day ($${ma200.toFixed(2)})`];
    if (high52 > 0 && low52 > 0) parts.push(`${((1 - price / high52) * 100).toFixed(1)}% below the 52-week high, ${((price / low52 - 1) * 100).toFixed(1)}% above the 52-week low`);
    return { text: parts.join('; ') + '.' };
  };

  const getAnalystContext = () => {
    if (!data || !data.currentPrice || !data.analystTargetPrice) return null;
    const current = parseFloat(data.currentPrice);
    const target = parseFloat(data.analystTargetPrice);
    
    if (isNaN(current) || isNaN(target) || current === 0) return null;
    
    const diff = ((target - current) / current) * 100;
    // Where the third-party target sits relative to the current price, as a distance (not a gain or loss).
    return { diff: diff.toFixed(1), isUpside: diff > 0 };
  };

  const pricePosition = getPricePosition();
  const analystContext = getAnalystContext();

  // Gate entire page for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div style={{ minHeight: embeddedInGoldenEgg ? "auto" : "100vh", background: "var(--msp-bg)" }}>
        {!embeddedInGoldenEgg && (
          <ToolsPageHeader
            badge="FUNDAMENTALS"
            title="Company Overview"
            subtitle="Find key fundamentals, technical levels, and valuation context fast."
            icon="CO"
            backHref="/dashboard"
          />
        )}
        <main style={{ padding: "24px 16px", display: "flex", justifyContent: "center" }}>
          <UpgradeGate feature="Company Overview" requiredTier="pro" />
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: embeddedInGoldenEgg ? "auto" : "100vh", background: "var(--msp-bg)" }}>
      {!embeddedInGoldenEgg && (
        <ToolsPageHeader
          badge="FUNDAMENTALS"
          title="Company Overview"
          subtitle="Find key fundamentals, technical levels, and valuation context fast."
          icon="CO"
          backHref="/dashboard"
        />
      )}
      <main style={{ minHeight: embeddedInGoldenEgg ? "auto" : "100vh", padding: embeddedInGoldenEgg ? "8px 0 0" : "24px 16px" }}>
        <div style={{ maxWidth: "none", margin: "0 auto", padding: 0 }}>

        {/* Regime & Personality Context */}
        {!embeddedInGoldenEgg && (
          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <RegimeBanner />
            {data && (
              <div style={{ borderRadius: '8px', border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(15,23,42,0.5)', padding: '8px' }}>
                <AdaptivePersonalityCard
                  skill="company_overview"
                  setupText={`${data.symbol} ${data.sector} fundamental analysis`}
                  direction={undefined}
                  timeframe="D"
                  baseScore={50}
                />
              </div>
            )}
          </div>
        )}

        {/* Search Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter ticker symbol (e.g., AAPL)"
            aria-label="Ticker symbol"
            style={{ flex: 1, minWidth: "200px", padding: "14px 16px", background: "var(--msp-card)", border: "1px solid var(--msp-border)", borderRadius: "12px", color: "var(--msp-text)", fontSize: "15px" }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: "14px 28px", background: "var(--msp-accent)", border: "none", borderRadius: "12px", color: "var(--msp-bg)", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, boxShadow: "var(--msp-shadow)" }}
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "14px 16px", background: "var(--msp-bear-tint)", border: "1px solid var(--msp-bear)", borderRadius: "12px", color: "var(--msp-bear)", marginBottom: "24px" }}>
            {error}
          </div>
        )}

        {data && (
          <div style={{ display: "grid", gap: "20px" }}>
            {/* Company Header */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "1.75rem", fontWeight: "bold", color: "var(--msp-text)", marginBottom: "12px" }}>
                    {data.name} ({data.symbol})
                  </h2>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                    <span style={{ padding: "8px 14px", background: "var(--msp-bull-tint)", borderRadius: "8px", color: "var(--msp-bull)", fontSize: "13px", border: "1px solid var(--msp-bull)" }}>
                      {data.sector}
                    </span>
                    <span style={{ padding: "8px 14px", background: "var(--msp-panel)", borderRadius: "8px", color: "var(--msp-accent)", fontSize: "13px", border: "1px solid var(--msp-border)" }}>
                      {data.industry}
                    </span>
                  </div>
                </div>
                {data.currentPrice && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--msp-text)" }}>
                      ${parseFloat(data.currentPrice).toFixed(2)}
                    </div>
                    {data.changePercent && (
                      <div style={{ 
                        fontSize: "14px", 
                        // Same flat grey as the crypto dashboard StatTile when the change rounds to 0.00%
                        color: formatChangePercent(data.changePercent) === "0.00%"
                          ? sectorTone(0).color
                          : Number(String(data.changePercent).replace(/%/g, '')) < 0 ? "var(--msp-bear)" : "var(--msp-bull)",
                        fontWeight: "600"
                      }}>
                        {formatChangePercent(data.changePercent)}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p style={{ color: "var(--msp-text-muted)", lineHeight: "1.7", fontSize: "14px", overflowWrap: "anywhere", wordBreak: "break-word" }}>{data.description}</p>
            </div>

            {/* W3: no algorithmic "overall view" or bull / risk case lists; the numbers are in the sections below. */}

            {/* Price position (measured relations; W3) */}
            {pricePosition && (
              <div data-price-position style={{
                background: "var(--msp-panel)",
                borderRadius: "12px",
                border: "1px solid var(--msp-border)",
                padding: "16px 20px",
              }}>
                <span style={{ color: "var(--msp-text)", fontWeight: "bold", fontSize: "15px" }}>Price position</span>
                <span style={{ color: "var(--msp-text-muted)", fontSize: "14px", marginLeft: "12px" }}>{pricePosition.text}</span>
                <div style={{ color: "var(--msp-text-faint)", fontSize: "12px", marginTop: "4px" }}>Provider overview fields (moving averages and 52-week range); a description, not a direction.</div>
              </div>
            )}

            {/* Valuation Metrics */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "12px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", margin: 0 }}>Valuation</h3>
              </div>
              {data.multiple && (
                <p style={{ color: "var(--msp-text-muted)", fontSize: "12px", margin: "0 0 16px 0" }}>{data.multiple.detail}</p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "1rem" }}>
                <MetricCard label="Market cap (provider)" value={formatMarketCap(data.marketCap)} />
                <MetricCard label="P/E (trailing)" value={formatValue(data.pe)} />
                <MetricCard label="Forward P/E" value={formatValue(data.forwardPE)} />
                <MetricCard label="PEG Ratio" value={formatValue(data.peg)} />
                <MetricCard label="Book Value" value={`$${formatValue(data.bookValue)}`} />
                <MetricCard label="Beta" value={formatValue(data.beta)} />
              </div>
              {data.valuationBasis && <p className="mt-2 text-xs text-slate-400">{data.valuationBasis}</p>}
              {data.periodSummary && (
                <p style={{ color: "var(--msp-text-muted)", fontSize: "12px", marginTop: "12px" }}>
                  <strong style={{ color: "var(--msp-text)" }}>Period basis:</strong> {data.periodSummary}
                </p>
              )}
              {data.periodBasis && (
                <div style={{ display: "grid", gap: "2px", marginTop: "6px" }}>
                  {data.periodBasis.map((b) => <div key={b.metric} style={{ color: "var(--msp-text-faint)", fontSize: "11px" }}>{b.metric}: <span style={{ color: "var(--msp-text-muted)" }}>{b.period}</span></div>)}
                </div>
              )}
              {data.fetchedAt && (
                <p style={{ color: "var(--msp-text-faint)", fontSize: "11px", marginTop: "6px" }}>
                  Snapshot retrieved {new Date(data.fetchedAt).toLocaleString()} (retrieval time, not the reporting period) · Source: Alpha Vantage
                </p>
              )}
            </div>

            {/* Earnings & analyst context */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "16px" }}>Earnings & analyst context</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "1rem" }}>
                <MetricCard
                  label="Next earnings"
                  value={data.nextEarningsDate ?? (data.nextEarningsStatus === 'NONE_IN_HORIZON' ? 'None in next 3 months' : 'UNKNOWN (calendar unavailable)')}
                  valueColor={data.daysToEarnings != null && data.daysToEarnings >= 0 && data.daysToEarnings <= 14 ? 'var(--msp-warn)' : undefined}
                  subValue={data.daysToEarnings != null ? <span style={{ fontSize: 12, color: 'var(--msp-text-muted)' }}>in {data.daysToEarnings} day{data.daysToEarnings === 1 ? '' : 's'}{data.nextEarningsEstimate != null ? ` · est. EPS $${data.nextEarningsEstimate.toFixed(2)}` : ''} — event risk</span> : undefined}
                />
                <MetricCard
                  label="Last reported quarter"
                  value={data.lastReportedQuarter ?? '—'}
                  subValue={data.lastReportedEPS != null ? <span style={{ fontSize: 12, color: 'var(--msp-text-muted)' }}>Reported EPS ${data.lastReportedEPS.toFixed(2)} vs third-party consensus estimate {data.lastEstimatedEPS != null ? `$${data.lastEstimatedEPS.toFixed(2)}` : 'not provided'}{data.lastEstimatedEPS != null ? ` (${data.lastEpsBeat ? 'above' : 'below or equal to'} estimate)` : ''}{data.lastReportedDate ? ` · reported ${data.lastReportedDate}` : ''}</span> : undefined}
                />
                <MetricCard label="Quarters above consensus estimate (last 4)" value={data.beatRate != null ? `${data.beatRate.toFixed(0)}%` : '—'} />
                <MetricCard
                  label="Third-party analyst target (consensus)"
                  value={`$${formatValue(data.analystTargetPrice)}`}
                  subValue={<span style={{ fontSize: 12, color: 'var(--msp-text-muted)' }}>{data.analystCount ? `${data.analystCount} analysts` : 'analyst count not provided'}{analystContext ? ` · target is ${Math.abs(Number(analystContext.diff))}% ${analystContext.isUpside ? 'above' : 'below'} the current price` : ''}</span>}
                />
                {data.analystRatings && (
                  <MetricCard
                    label="Third-party view distribution"
                    value={`SB ${data.analystRatings.strongBuy} · B ${data.analystRatings.buy} · H ${data.analystRatings.hold} · S ${data.analystRatings.sell} · SS ${data.analystRatings.strongSell}`}
                  />
                )}
              </div>
              <p style={{ color: "var(--msp-text-faint)", fontSize: "12px", marginTop: "10px" }}>
                <span data-third-party>Analyst targets, views and EPS estimates are third-party consensus figures from Alpha Vantage's company overview{data.fetchedAt ? `, retrieved ${new Date(data.fetchedAt).toLocaleString()}` : ''}; the provider does not give their publication date. They are not this site's view, a reading or a forecast.</span> Earnings dates come from the provider calendar and can move.
              </p>
            </div>

            {/* Profitability */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>Profitability</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "1rem" }}>
                <MetricCard label="Profit Margin" value={formatPercentRaw(data.profitMargin)} />
                <MetricCard label="Operating Margin" value={formatPercentRaw(data.operatingMargin)} />
                <MetricCard label="ROE" value={formatPercentRaw(data.returnOnEquity)} />
                <MetricCard label="ROA" value={formatPercentRaw(data.returnOnAssets)} />
                <MetricCard label="EPS" value={`$${formatValue(data.eps)}`} />
              </div>
            </div>

            {/* Growth & Revenue */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>Growth & Revenue</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "1rem" }}>
                <MetricCard label="Revenue TTM" value={formatMarketCap(data.revenue)} />
                <MetricCard label="Gross Profit TTM" value={formatMarketCap(data.grossProfit)} />
                <MetricCard 
                  label={`Earnings Growth (latest quarter${data.latestQuarter ? ` ${data.latestQuarter}` : ''} YoY)`} 
                  value={formatPercent(data.quarterlyEarningsGrowth)}
                  valueColor={parseFloat(data.quarterlyEarningsGrowth) >= 0 ? "var(--msp-bull)" : "var(--msp-bear)"}
                />
                <MetricCard 
                  label={`Revenue Growth (latest quarter${data.latestQuarter ? ` ${data.latestQuarter}` : ''} YoY)`} 
                  value={formatPercent(data.quarterlyRevenueGrowth)}
                  valueColor={parseFloat(data.quarterlyRevenueGrowth) >= 0 ? "var(--msp-bull)" : "var(--msp-bear)"}
                />
              </div>
            </div>

            {/* Technical Indicators */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>Technical</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "1rem" }}>
                <MetricCard label="50-Day MA" value={`$${formatValue(data.day50MA)}`} />
                <MetricCard label="200-Day MA" value={`$${formatValue(data.day200MA)}`} />
                <MetricCard label="52-Week High" value={`$${formatValue(data.week52High)}`} />
                <MetricCard label="52-Week Low" value={`$${formatValue(data.week52Low)}`} />
              </div>
            </div>

            {/* Dividends */}
            {data.dividendYield && parseFloat(data.dividendYield) > 0 && (
              <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>Dividends</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "1rem" }}>
                  <MetricCard label="Dividend Yield" value={formatPercentRaw(data.dividendYield)} />
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ 
              background: "var(--msp-warn-tint)", 
              borderRadius: "12px", 
              border: "1px solid var(--msp-warn)", 
              padding: "16px 20px",
              marginTop: "8px"
            }}>
              <p style={{ color: "var(--msp-warn)", fontSize: "13px", margin: 0, lineHeight: "1.6" }}>
                <strong>Research disclaimer:</strong> This analysis is algorithmic and for informational purposes only. It does not constitute investment advice. Always conduct your own research and consult a financial advisor before making investment decisions.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
    </div>
  );
}

// Wrapper component with Suspense for useSearchParams
export default function CompanyOverviewPage({ symbol: propSymbol }: { symbol?: string } = {}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--msp-bg)]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    }>
      <CompanyOverviewContent propSymbol={propSymbol} />
    </Suspense>
  );
}

function MetricCard({ 
  label, 
  value, 
  subValue,
  valueColor 
}: { 
  label: string; 
  value: string; 
  subValue?: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <dl style={{ padding: "16px", background: "var(--msp-panel)", borderRadius: "12px", border: "1px solid var(--msp-border)", margin: 0 }}>
      <dt style={{ fontSize: "13px", color: "var(--msp-text-muted)", marginBottom: "8px" }}>{label}</dt>
      <dd style={{ fontSize: "1.15rem", fontWeight: "bold", color: valueColor || "var(--msp-text)", margin: 0 }}>{value}</dd>
      {subValue && <dd style={{ marginTop: "4px", margin: 0 }}>{subValue}</dd>}
    </dl>
  );
}
