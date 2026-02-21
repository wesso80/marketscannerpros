"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessPortfolioInsights } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import PermissionGate from "@/components/news-decision/PermissionGate";
import NarrativeStack from "@/components/news-decision/NarrativeStack";
import RotationBoard from "@/components/news-decision/RotationBoard";
import NewsGroup from "@/components/news-decision/NewsGroup";
import type { DecisionNewsItem, NarrativeGroup, NewsGateModel } from "@/components/news-decision/types";

interface TickerSentiment {
  ticker: string;
  relevance: number;
  sentimentScore: number;
  sentimentLabel: string;
}

interface NewsArticle {
  title: string;
  url: string;
  timePublished: string;
  summary: string;
  source: string;
  sentiment: {
    label: string;
    score: number;
  };
  tickerSentiments: TickerSentiment[];
  // AI-generated fields
  aiTags?: string[];
  aiWhyMatters?: string;
}

interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: number | null;
  currency: string;
}

interface EarningsResult {
  symbol: string;
  name: string;
  reportedDate: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercentage: number | null;
  beat: boolean;
  history: Array<{
    fiscalDateEnding: string;
    reportedDate: string;
    reportedEPS: number | null;
    estimatedEPS: number | null;
    surprisePercentage: number | null;
  }>;
}

interface AnalystData {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: string;
  peRatio: number | null;
  forwardPE: number | null;
  eps: number | null;
  dividendYield: number | null;
  targetPrice: number | null;
  analystRating: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  description: string;
  week52High: number | null;
  week52Low: number | null;
  loading?: boolean;
  error?: string;
}

// Helper to parse date string as local date (avoid timezone issues)
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

// Helper to categorize earnings by time period
function categorizeEarnings(earnings: EarningsEvent[]): {
  today: EarningsEvent[];
  tomorrow: EarningsEvent[];
  thisWeek: EarningsEvent[];
  nextWeek: EarningsEvent[];
  later: EarningsEvent[];
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay())); // Sunday
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
  
  const result = {
    today: [] as EarningsEvent[],
    tomorrow: [] as EarningsEvent[],
    thisWeek: [] as EarningsEvent[],
    nextWeek: [] as EarningsEvent[],
    later: [] as EarningsEvent[],
  };
  
  earnings.forEach(event => {
    const eventDate = parseLocalDate(event.reportDate);
    if (eventDate.toDateString() === today.toDateString()) {
      result.today.push(event);
    } else if (eventDate.toDateString() === tomorrow.toDateString()) {
      result.tomorrow.push(event);
    } else if (eventDate < endOfWeek) {
      result.thisWeek.push(event);
    } else if (eventDate < endOfNextWeek) {
      result.nextWeek.push(event);
    } else {
      result.later.push(event);
    }
  });
  
  return result;
}

// Format relative date
function formatRelativeDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7 && diffDays > 0) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type EarningsFilter = 'all' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek';
type SessionTag = 'PRE' | 'RTH' | 'AH';
type ImpactTier = 'A' | 'B' | 'C';
type PermissionState = 'YES' | 'CONDITIONAL' | 'NO';

// Top market cap companies that can shake the market
const TOP_10_COMPANIES = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.A', 'BRK.B'];
const TOP_25_COMPANIES = [...TOP_10_COMPANIES, 'UNH', 'XOM', 'LLY', 'JPM', 'JNJ', 'V', 'PG', 'MA', 'AVGO', 'HD', 'CVX', 'MRK', 'ABBV', 'COST', 'PEP'];
const TOP_100_COMPANIES = [...TOP_25_COMPANIES, 'KO', 'ADBE', 'WMT', 'BAC', 'CRM', 'MCD', 'CSCO', 'ACN', 'TMO', 'ABT', 'NFLX', 'PFE', 'DHR', 'LIN', 'CMCSA', 'NKE', 'TXN', 'AMD', 'ORCL', 'PM', 'WFC', 'VZ', 'DIS', 'INTC', 'COP', 'RTX', 'NEE', 'HON', 'IBM', 'UPS', 'QCOM', 'INTU', 'SPGI', 'LOW', 'CAT', 'BA', 'GE', 'AMGN', 'ELV', 'DE', 'AMAT', 'UNP', 'GS', 'MS', 'BLK', 'ISRG', 'BKNG', 'SYK', 'ADP', 'GILD', 'MDLZ', 'ADI', 'PLD', 'VRTX', 'TJX', 'C', 'MMC', 'REGN', 'CI', 'SBUX', 'CVS', 'LRCX', 'MO', 'AMT', 'BDX', 'ZTS', 'PANW', 'CB', 'SCHW', 'SO', 'DUK', 'PGR', 'PYPL', 'EQIX', 'NOW', 'SLB'];

function getMarketCapRank(symbol: string): { rank: 'top10' | 'top25' | 'top100' | null; label: string; color: string; bgColor: string } {
  const sym = symbol.toUpperCase();
  if (TOP_10_COMPANIES.includes(sym)) {
    return { rank: 'top10', label: '🔥 TOP 10', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.2)' };
  }
  if (TOP_25_COMPANIES.includes(sym)) {
    return { rank: 'top25', label: '⚡ TOP 25', color: 'var(--msp-accent)', bgColor: 'rgba(16,185,129,0.2)' };
  }
  if (TOP_100_COMPANIES.includes(sym)) {
    return { rank: 'top100', label: '📊 TOP 100', color: '#94A3B8', bgColor: 'rgba(148,163,184,0.2)' };
  }
  return { rank: null, label: '', color: '', bgColor: '' };
}

function inferSessionTag(symbol: string): SessionTag {
  const hash = symbol
    .toUpperCase()
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  if (hash % 3 === 0) return 'PRE';
  if (hash % 3 === 1) return 'RTH';
  return 'AH';
}

function getImpactTier(symbol: string): ImpactTier {
  const rank = getMarketCapRank(symbol).rank;
  if (rank === 'top10' || rank === 'top25') return 'A';
  if (rank === 'top100') return 'B';
  return 'C';
}

function daysUntilReport(reportDate: string): number {
  const eventDate = parseLocalDate(reportDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  return Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

type TabType = "news" | "earnings";
type EnrichedNewsItem = DecisionNewsItem & {
  volatilityKeywords: boolean;
  macroMentions: boolean;
};

export default function NewsSentimentPage() {
  const { tier, isAdmin } = useUserTier();
  const [activeTab, setActiveTab] = useState<TabType>("news");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'earnings') {
      setActiveTab('earnings');
    }
  }, []);
  
  // News state
  const [tickers, setTickers] = useState("AAPL,MSFT,GOOGL");
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [error, setError] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [newsAIAnalysis, setNewsAIAnalysis] = useState<string | null>(null);
  const [newsBucket, setNewsBucket] = useState<'ALL' | 'HIGH_IMPACT' | 'EARNINGS' | 'MACRO' | 'CRYPTO' | 'GEOPOLITICS' | 'AI' | 'COMMODITIES'>('ALL');
  const [newsSort, setNewsSort] = useState<'MOST_RELEVANT' | 'NEWEST' | 'HIGHEST_IMPACT' | 'MOST_MENTIONED'>('MOST_RELEVANT');
  const [hideLowQualityNews, setHideLowQualityNews] = useState(true);
  const [groupByNarrative, setGroupByNarrative] = useState(true);
  const [newsQuery, setNewsQuery] = useState('');
  const [expandedDecisionIds, setExpandedDecisionIds] = useState<Record<string, boolean>>({});
  const [macroEventCard, setMacroEventCard] = useState<{ event: string; daysUntil: number | null; date: string; time: string } | null>(null);

  // Earnings state
  const [earningsSymbol, setEarningsSymbol] = useState("");
  const [earningsHorizon, setEarningsHorizon] = useState("3month");
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [earningsError, setEarningsError] = useState("");
  const [earningsFilter, setEarningsFilter] = useState<EarningsFilter>('all');
  const [earningsResults, setEarningsResults] = useState<EarningsResult[]>([]);
  const [earningsAIAnalysis, setEarningsAIAnalysis] = useState<string | null>(null);
  const [showRecentResults, setShowRecentResults] = useState(true);
  const [selectedEarning, setSelectedEarning] = useState<EarningsEvent | null>(null);
  const [analystData, setAnalystData] = useState<AnalystData | null>(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'PRE' | 'AH'>('all');
  const [highImpactOnly, setHighImpactOnly] = useState(false);
  const [marketScope, setMarketScope] = useState<'all' | 'my' | 'mag7' | 'spy100'>('all');
  const [sortBy, setSortBy] = useState<'impact' | 'time' | 'marketcap'>('impact');
  
  // Categorize earnings by time period
  const categorizedEarnings = categorizeEarnings(earnings);
  
  // Track if initial earnings fetch has been done
  const earningsInitialFetchDone = useRef(false);
  
  // Auto-fetch earnings when tab switches to earnings (load today's earnings)
  useEffect(() => {
    if (activeTab === "earnings" && !earningsInitialFetchDone.current && earnings.length === 0 && !earningsLoading) {
      earningsInitialFetchDone.current = true;
      // Auto-fetch earnings calendar
      const autoFetchEarnings = async () => {
        setEarningsLoading(true);
        setEarningsError("");
        try {
          const response = await fetch(`/api/earnings-calendar?symbol=&horizon=${earningsHorizon}&includeResults=true&includeAI=true`);
          const result = await response.json();
          if (result.success) {
            setEarnings(result.earnings);
            if (result.recentResults) {
              setEarningsResults(result.recentResults);
            }
            if (result.aiAnalysis) {
              setEarningsAIAnalysis(result.aiAnalysis);
            }
            // Auto-filter to today's earnings
            setEarningsFilter('today');
          }
        } catch (err) {
          console.error("Error auto-fetching earnings:", err);
        } finally {
          setEarningsLoading(false);
        }
      };
      autoFetchEarnings();
    }
  }, [activeTab, earnings.length, earningsLoading, earningsHorizon]);
  
  // Filter earnings based on selected filter
  const getFilteredEarnings = (): EarningsEvent[] => {
    switch (earningsFilter) {
      case 'today': return categorizedEarnings.today;
      case 'tomorrow': return categorizedEarnings.tomorrow;
      case 'thisWeek': return [...categorizedEarnings.today, ...categorizedEarnings.tomorrow, ...categorizedEarnings.thisWeek];
      case 'nextWeek': return categorizedEarnings.nextWeek;
      default: return earnings;
    }
  };
  
  const filteredEarnings = getFilteredEarnings();

  const myWatchlistSymbols = useMemo(() => {
    const source = earningsSymbol || tickers;
    return source
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);
  }, [earningsSymbol, tickers]);

  const scopeSet = useMemo(() => {
    if (marketScope === 'my') return new Set(myWatchlistSymbols);
    if (marketScope === 'mag7') return new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA']);
    if (marketScope === 'spy100') return new Set(TOP_100_COMPANIES);
    return null;
  }, [marketScope, myWatchlistSymbols]);

  const enhancedEarningsRows = useMemo(() => {
    const mapped = filteredEarnings.map((event) => {
      const session = inferSessionTag(event.symbol);
      const impactTier = getImpactTier(event.symbol);
      const deltaDays = daysUntilReport(event.reportDate);
      const scoreBase = impactTier === 'A' ? 82 : impactTier === 'B' ? 66 : 48;
      const dateScore = deltaDays <= 0 ? 18 : deltaDays <= 1 ? 14 : deltaDays <= 3 ? 9 : 4;
      const sessionScore = session === 'PRE' ? 10 : session === 'AH' ? 7 : 4;
      const estimateScore = event.estimate ? Math.min(8, Math.abs(event.estimate) * 3) : 0;
      const impactScore = clamp(Math.round(scoreBase + dateScore + sessionScore + estimateScore));
      return {
        ...event,
        session,
        impactTier,
        impactScore,
        deltaDays,
      };
    });

    let scoped = mapped;
    if (scopeSet) {
      scoped = scoped.filter((row) => scopeSet.has(row.symbol.toUpperCase()));
    }
    if (sessionFilter !== 'all') {
      scoped = scoped.filter((row) => row.session === sessionFilter);
    }
    if (highImpactOnly) {
      scoped = scoped.filter((row) => row.impactTier === 'A');
    }

    const sorted = [...scoped].sort((a, b) => {
      if (sortBy === 'time') {
        if (a.deltaDays !== b.deltaDays) return a.deltaDays - b.deltaDays;
        return a.session.localeCompare(b.session);
      }
      if (sortBy === 'marketcap') {
        const rankWeight = (symbol: string) => {
          const rank = getMarketCapRank(symbol).rank;
          if (rank === 'top10') return 0;
          if (rank === 'top25') return 1;
          if (rank === 'top100') return 2;
          return 3;
        };
        return rankWeight(a.symbol) - rankWeight(b.symbol);
      }
      return b.impactScore - a.impactScore;
    });

    return sorted;
  }, [filteredEarnings, highImpactOnly, scopeSet, sessionFilter, sortBy]);

  const catalystState = useMemo(() => {
    const next24 = enhancedEarningsRows.filter((row) => row.deltaDays <= 1);
    const next7 = enhancedEarningsRows.filter((row) => row.deltaDays <= 7);
    const pre24 = next24.filter((row) => row.session === 'PRE').length;
    const ah24 = next24.filter((row) => row.session === 'AH').length;
    const aTier24 = next24.filter((row) => row.impactTier === 'A').length;
    const meanImpact = next24.length > 0
      ? Math.round(next24.reduce((sum, row) => sum + row.impactScore, 0) / next24.length)
      : 0;

    const densityScore = clamp(next24.length * 6 + aTier24 * 10 + pre24 * 5);
    const densityLabel = densityScore >= 66 ? 'High' : densityScore >= 31 ? 'Medium' : 'Low';
    const volRisk = densityScore >= 60 || aTier24 >= 3 ? 'Expansion' : 'Compression';
    const headlineRisk = aTier24 >= 2 || meanImpact >= 78 ? 'Elevated' : 'Low';
    const liquidityWindow: SessionTag = pre24 >= ah24 && pre24 > 0 ? 'PRE' : ah24 > 0 ? 'AH' : 'RTH';

    let executionMode: 'Trend' | 'Mean-Reversion' | 'Sit Out' = 'Trend';
    if (volRisk === 'Compression') executionMode = 'Mean-Reversion';
    if (densityScore >= 78 && volRisk === 'Expansion' && pre24 >= 3) executionMode = 'Sit Out';

    const permission: PermissionState =
      densityScore >= 78 && volRisk === 'Expansion' && pre24 >= 3
        ? 'NO'
        : densityScore >= 31 || volRisk === 'Expansion'
          ? 'CONDITIONAL'
          : 'YES';

    const reason =
      permission === 'NO'
        ? `Earnings density high with heavy pre-market catalysts; expect whipsaw and failed breakouts.`
        : permission === 'CONDITIONAL'
          ? `Catalyst cluster is tradable only with tighter selection and risk controls.`
          : `Catalyst load is manageable; normal execution allowed with plan discipline.`;

    const watchlist24 = enhancedEarningsRows
      .filter((row) => row.deltaDays <= 1 && myWatchlistSymbols.includes(row.symbol.toUpperCase()))
      .slice(0, 5);

    return {
      next24,
      next7,
      pre24,
      ah24,
      aTier24,
      densityScore,
      densityLabel,
      volRisk,
      headlineRisk,
      liquidityWindow,
      executionMode,
      permission,
      reason,
      watchlist24,
      meanImpact,
      timeline: {
        PRE: enhancedEarningsRows.filter((row) => row.session === 'PRE' && row.deltaDays <= 1),
        RTH: enhancedEarningsRows.filter((row) => row.session === 'RTH' && row.deltaDays <= 1),
        AH: enhancedEarningsRows.filter((row) => row.session === 'AH' && row.deltaDays <= 1),
      },
    };
  }, [enhancedEarningsRows, myWatchlistSymbols]);

  const handleSearch = async () => {
    if (!tickers.trim()) {
      setError("Please enter at least one ticker symbol");
      return;
    }

    setLoading(true);
    setError("");
    setArticles([]);
    setNewsAIAnalysis(null);

    try {
      const response = await fetch(`/api/news-sentiment?tickers=${tickers.toUpperCase()}&limit=25&includeAI=true`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to fetch news data");
      } else {
        setArticles(result.articles);
        if (result.aiAnalysis) {
          setNewsAIAnalysis(result.aiAnalysis);
        }
      }
    } catch (err) {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  };

  const handleEarningsSearch = async () => {
    setEarningsLoading(true);
    setEarningsError("");
    setEarnings([]);
    setEarningsResults([]);
    setEarningsAIAnalysis(null);

    try {
      const symbol = earningsSymbol.trim() || undefined;
      // Fetch earnings calendar + recent results with AI analysis
      const response = await fetch(`/api/earnings-calendar?symbol=${symbol || ""}&horizon=${earningsHorizon}&includeResults=true&includeAI=true`);
      const result = await response.json();

      if (!result.success) {
        setEarningsError(result.error || "Failed to fetch earnings data");
      } else {
        setEarnings(result.earnings);
        if (result.recentResults) {
          setEarningsResults(result.recentResults);
        }
        if (result.aiAnalysis) {
          setEarningsAIAnalysis(result.aiAnalysis);
        }
      }
    } catch (err) {
      setEarningsError("Network error - please try again");
    } finally {
      setEarningsLoading(false);
    }
  };

  // Fetch analyst data for a selected stock
  const fetchAnalystData = async (event: EarningsEvent) => {
    console.log('📊 Fetching analyst data for:', event.symbol);
    setSelectedEarning(event);
    setAnalystLoading(true);
    setAnalystData(null);
    
    try {
      const response = await fetch(`/api/analyst-ratings?symbol=${event.symbol}`);
      const result = await response.json();
      console.log('📊 Analyst API response:', result);
      
      if (result.success) {
        setAnalystData(result.data);
      } else {
        setAnalystData({
          symbol: event.symbol,
          name: event.name,
          sector: 'N/A',
          industry: 'N/A',
          marketCap: 'N/A',
          peRatio: null,
          forwardPE: null,
          eps: null,
          dividendYield: null,
          targetPrice: null,
          analystRating: 'N/A',
          strongBuy: 0,
          buy: 0,
          hold: 0,
          sell: 0,
          strongSell: 0,
          description: result.error || 'Unable to fetch company data.',
          week52High: null,
          week52Low: null,
          error: result.error
        });
      }
    } catch (err) {
      console.error('📊 Analyst API error:', err);
      setAnalystData({
        symbol: event.symbol,
        name: event.name,
        sector: 'N/A',
        industry: 'N/A',
        marketCap: 'N/A',
        peRatio: null,
        forwardPE: null,
        eps: null,
        dividendYield: null,
        targetPrice: null,
        analystRating: 'N/A',
        strongBuy: 0,
        buy: 0,
        hold: 0,
        sell: 0,
        strongSell: 0,
        description: 'Network error fetching data.',
        week52High: null,
        week52Low: null,
        error: 'Network error'
      });
    } finally {
      setAnalystLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'news') return;
    const loadNextMacroEvent = async () => {
      try {
        const res = await fetch('/api/economic-calendar?days=14&impact=high');
        if (!res.ok) return;
        const json = await res.json();
        if (json?.nextMajorEvent) {
          setMacroEventCard({
            event: json.nextMajorEvent.event,
            daysUntil: json.daysUntilMajor,
            date: json.nextMajorEvent.date,
            time: json.nextMajorEvent.time,
          });
        }
      } catch {
        setMacroEventCard(null);
      }
    };
    loadNextMacroEvent();
  }, [activeTab]);

  const enrichNews = useMemo<EnrichedNewsItem[]>(() => {
    return articles.map((article, idx) => {
      const sourceText = `${article.title} ${article.summary} ${(article.aiTags || []).join(' ')}`.toLowerCase();
      const mentions = article.tickerSentiments?.length || 0;
      const maxRelevance = article.tickerSentiments?.reduce((max, entry) => Math.max(max, entry.relevance || 0), 0) || 0;
      const macroMentions = /(fomc|cpi|nfp|payroll|rates|fed|inflation|yield|treasury)/i.test(sourceText);
      const cryptoMentions = /(btc|bitcoin|eth|ethereum|crypto|solana|altcoin)/i.test(sourceText);
      const aiMentions = /(ai|semiconductor|gpu|nvidia|openai|model)/i.test(sourceText);
      const earningsMentions = /(earnings|guidance|eps|revenue|beat|miss)/i.test(sourceText);
      const geoMentions = /(war|geopolitic|sanction|taiwan|middle east|opec|oil shock)/i.test(sourceText);
      const commoditiesMentions = /(oil|gold|silver|copper|wti|commodity)/i.test(sourceText);
      const volatilityKeywords = /(crash|shock|liquidation|downgrade|panic|volatility spike|whipsaw)/i.test(sourceText);

      const tags = [
        ...(earningsMentions ? ['Earnings'] : []),
        ...(macroMentions ? ['Macro'] : []),
        ...(cryptoMentions ? ['Crypto'] : []),
        ...(geoMentions ? ['Geopolitics'] : []),
        ...(aiMentions ? ['AI'] : []),
        ...(commoditiesMentions ? ['Commodities'] : []),
      ];

      const narrative =
        aiMentions ? 'AI Leadership' :
        earningsMentions ? 'Earnings Dispersion' :
        macroMentions ? 'Macro Repricing' :
        cryptoMentions ? 'Crypto Beta Flow' :
        geoMentions ? 'Geopolitical Risk' :
        commoditiesMentions ? 'Commodity Shock' :
        'General Risk Tape';

      const sentiment: DecisionNewsItem['sentiment'] = article.sentiment.label.toLowerCase().includes('bull')
        ? 'BULLISH'
        : article.sentiment.label.toLowerCase().includes('bear')
          ? 'BEARISH'
          : 'NEUTRAL';

      const impactScore = clamp(
        Math.round(
          (maxRelevance * 55) +
          (mentions * 7) +
          (volatilityKeywords ? 16 : 0) +
          (macroMentions ? 14 : 0) +
          (earningsMentions ? 10 : 0) +
          (article.source ? 4 : 0)
        )
      );

      const impact: DecisionNewsItem['impact'] = impactScore >= 72 ? 'HIGH' : impactScore >= 46 ? 'MEDIUM' : 'LOW';
      const quality = clamp(Math.round((article.summary?.length || 0) / 12 + (article.aiWhyMatters ? 20 : 0)));

      return {
        id: `${idx}-${article.timePublished}`,
        raw: article,
        impact,
        impactScore,
        quality,
        sentiment,
        tags: tags.length ? tags : ['General'],
        narrative,
        mentions,
        volatilityKeywords,
        macroMentions,
      };
    });
  }, [articles]);

  const filteredNews = useMemo<EnrichedNewsItem[]>(() => {
    const bySentiment = sentimentFilter === 'all'
      ? enrichNews
      : enrichNews.filter((item) => item.sentiment.toLowerCase().includes(sentimentFilter));

    const byQuery = !newsQuery.trim()
      ? bySentiment
      : bySentiment.filter((item) => (`${item.raw.title} ${item.raw.summary} ${item.tags.join(' ')}`.toLowerCase().includes(newsQuery.toLowerCase())));

    const byBucket = byQuery.filter((item) => {
      if (newsBucket === 'ALL') return true;
      if (newsBucket === 'HIGH_IMPACT') return item.impact === 'HIGH';
      return item.tags.map((tag) => tag.toUpperCase()).includes(newsBucket.replace('_', ' ')) || item.tags.map((tag) => tag.toUpperCase()).includes(newsBucket);
    });

    const byQuality = hideLowQualityNews ? byBucket.filter((item) => item.quality >= 35) : byBucket;

    const sorted = [...byQuality].sort((a, b) => {
      if (newsSort === 'NEWEST') return b.raw.timePublished.localeCompare(a.raw.timePublished);
      if (newsSort === 'HIGHEST_IMPACT') return b.impactScore - a.impactScore;
      if (newsSort === 'MOST_MENTIONED') return b.mentions - a.mentions;
      return (b.impactScore + b.mentions * 2) - (a.impactScore + a.mentions * 2);
    });

    return sorted.slice(0, 25);
  }, [enrichNews, sentimentFilter, newsQuery, newsBucket, hideLowQualityNews, newsSort]);

  const groupedNarratives = useMemo<NarrativeGroup[]>(() => {
    const groups: Record<string, typeof filteredNews> = {};
    filteredNews.forEach((item) => {
      if (!groups[item.narrative]) groups[item.narrative] = [];
      groups[item.narrative].push(item);
    });
    return Object.entries(groups)
      .map(([narrative, items]) => ({
        narrative,
        items,
        bullish: items.filter((item) => item.sentiment === 'BULLISH').length,
        bearish: items.filter((item) => item.sentiment === 'BEARISH').length,
        avgImpact: items.length ? Math.round(items.reduce((sum, item) => sum + item.impactScore, 0) / items.length) : 0,
      }))
      .sort((a, b) => b.avgImpact - a.avgImpact);
  }, [filteredNews]);

  const newsGate = useMemo<NewsGateModel>(() => {
    const highImpactCount24h = filteredNews.filter((item) => item.impact === 'HIGH').length;
    const macroMentionsCount = filteredNews.filter((item) => item.macroMentions).length;
    const volatilityKeywordsScore = filteredNews.filter((item) => item.volatilityKeywords).length;
    const bullish = filteredNews.filter((item) => item.sentiment === 'BULLISH').length;
    const bearish = filteredNews.filter((item) => item.sentiment === 'BEARISH').length;
    const topNarrative = groupedNarratives[0];
    const topNarrativeShare = topNarrative ? topNarrative.items.length / Math.max(1, filteredNews.length) : 0;

    const riskState = bearish > bullish + 3 ? 'Risk-Off' : bullish > bearish + 3 ? 'Risk-On' : 'Neutral';
    const volRegime = volatilityKeywordsScore >= 3 ? 'Event Shock' : highImpactCount24h >= 4 ? 'Expansion' : 'Compression';
    const catalystDensity = highImpactCount24h >= 6 ? 'High' : highImpactCount24h >= 3 ? 'Medium' : 'Low';
    const narrativeStrength = topNarrativeShare >= 0.45 ? 'Dominant' : topNarrativeShare >= 0.25 ? 'Mixed' : 'Weak';

    const permission: PermissionState =
      (volRegime === 'Event Shock' && riskState === 'Risk-Off')
        ? 'NO'
        : (highImpactCount24h >= 3 || macroMentionsCount >= 4 || volRegime !== 'Compression')
          ? 'CONDITIONAL'
          : 'YES';

    const executionMode = permission === 'NO' ? 'Sit Out' : volRegime === 'Compression' ? 'Trend' : 'Mean Revert';
    const confidencePct = clamp(Math.round((topNarrativeShare * 100) + Math.min(25, (topNarrative?.avgImpact || 0) / 4)));

    const rotationLeaders = groupedNarratives.slice(0, 3).map((group) => group.narrative);
    const warnings = [
      ...(highImpactCount24h >= 3 ? ['Headline risk elevated'] : []),
      ...(macroMentionsCount >= 4 ? ['Macro catalyst near'] : []),
      ...(volRegime === 'Event Shock' ? ['Event shock language elevated'] : []),
    ];

    return {
      permission,
      riskState,
      volRegime,
      catalystDensity,
      narrativeStrength,
      executionMode,
      topNarrative: topNarrative?.narrative || 'No dominant narrative',
      confidencePct,
      rotationLeaders,
      warnings,
      sentimentPct: clamp(Math.round((bullish / Math.max(1, bullish + bearish)) * 100)),
      eventRiskLabel: macroEventCard?.event || 'No major macro event',
      eventRiskCountdown: macroEventCard?.daysUntil !== null && macroEventCard?.daysUntil !== undefined ? `${macroEventCard.daysUntil}d` : '--',
      briefAllowed:
        permission === 'NO'
          ? ['Observation only until shock window clears.', 'Trade plans only, no fresh deployment.']
          : permission === 'CONDITIONAL'
            ? ['Long leaders with tighter risk.', 'Fade overstretched moves only on confirmation.']
            : ['Trend continuation in confirmed leaders.', 'Normal sizing with discipline.'],
      briefAvoid:
        volRegime === 'Event Shock'
          ? ['Breakout chasing into headline spikes.', 'Oversized trades in mixed breadth.']
          : ['Low quality laggards without catalyst support.', 'Overtrading around conflicting narratives.'],
    };
  }, [filteredNews, groupedNarratives, macroEventCard]);

  const handleToggleDecision = (id: string) => {
    setExpandedDecisionIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Gate entire page for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a" }}>
        <ToolsPageHeader
          badge="INTELLIGENCE"
          title="Market Intelligence"
          subtitle="Find news sentiment, earnings catalysts, and insider activity in one view."
          icon="📰"
          backHref="/dashboard"
        />
        <main style={{ padding: "24px 16px", display: "flex", justifyContent: "center" }}>
          <UpgradeGate feature="Market Intelligence" requiredTier="pro" />
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="INTELLIGENCE"
        title="Market Intelligence"
        subtitle="Find news sentiment, earnings catalysts, and insider activity in one view."
        icon="📰"
        backHref="/dashboard"
      />
      <main style={{ minHeight: "100vh", padding: "24px 16px", width: '100%' }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 0, width: '100%' }}>

        {/* Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginBottom: '2rem',
            padding: '0.5rem',
            background: 'rgba(30,41,59,0.3)',
            borderRadius: '12px',
          }}
        >
          <button
            onClick={() => setActiveTab("news")}
            style={{
              padding: "1rem 1.5rem",
              background: activeTab === "news" ? "rgba(16,185,129,0.15)" : "transparent",
              border: activeTab === "news" ? "1px solid rgba(16,185,129,0.5)" : "1px solid transparent",
              borderRadius: "10px",
              color: activeTab === "news" ? "#10B981" : "#94A3B8",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s"
            }}
          >
            📰 News & Sentiment
          </button>
          <button
            onClick={() => setActiveTab("earnings")}
            style={{
              padding: "1rem 1.5rem",
              background: activeTab === "earnings" ? "rgba(16,185,129,0.15)" : "transparent",
              border: activeTab === "earnings" ? "1px solid rgba(16,185,129,0.5)" : "1px solid transparent",
              borderRadius: "10px",
              color: activeTab === "earnings" ? "#10B981" : "#94A3B8",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s"
            }}
          >
            📅 Earnings Calendar
          </button>
        </div>

        {activeTab === "news" && (
          <>
            <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <PermissionGate gate={newsGate} />

              <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
                <div className="text-xs text-white/60">Top Narrative</div>
                <div className="mt-1 text-base font-semibold text-white/90">{newsGate.topNarrative}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-white/60">
                  <span>Confidence</span>
                  <span>{newsGate.confidencePct}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/10">
                  <div className="h-2 rounded-full bg-white/35" style={{ width: `${newsGate.confidencePct}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['Equities', 'Rates', 'USD', 'Crypto'].map((impact) => (
                    <span key={impact} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70">{impact}</span>
                  ))}
                </div>
              </article>
            </section>

            <section className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
              <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Sentiment</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{newsGate.riskState}</div>
                <div className="mt-1 text-xs text-white/60">{newsGate.sentimentPct}% bullish balance</div>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Vol Warning</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{newsGate.volRegime}</div>
                <div className="mt-1 text-xs text-white/60">{newsGate.warnings[0] || 'No elevated warning'}</div>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Rotation</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{newsGate.rotationLeaders[0] || 'No clear leader'}</div>
                <div className="mt-1 text-xs text-white/60">Theme leadership flow</div>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Event Risk</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{newsGate.eventRiskLabel}</div>
                <div className="mt-1 text-xs text-white/60">{newsGate.eventRiskCountdown} • ET</div>
              </article>
            </section>

            <section className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input
                    value={newsQuery}
                    onChange={(e) => setNewsQuery(e.target.value)}
                    placeholder="Search symbol/topic (AAPL, inflation, BTC...)"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 lg:w-[420px]"
                  />
                  {(['ALL', 'HIGH_IMPACT', 'EARNINGS', 'MACRO', 'CRYPTO', 'GEOPOLITICS', 'AI', 'COMMODITIES'] as const).map((bucket) => (
                    <button
                      key={bucket}
                      onClick={() => setNewsBucket(bucket)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${newsBucket === bucket ? 'border-white/25 bg-white/10 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                    >
                      {bucket.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={newsSort}
                    onChange={(e) => setNewsSort(e.target.value as typeof newsSort)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                  >
                    <option value="MOST_RELEVANT">Most Relevant</option>
                    <option value="NEWEST">Newest</option>
                    <option value="HIGHEST_IMPACT">Highest Impact</option>
                    <option value="MOST_MENTIONED">Most Mentioned</option>
                  </select>
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75">
                    <input type="checkbox" checked={hideLowQualityNews} onChange={(e) => setHideLowQualityNews(e.target.checked)} className="h-3.5 w-3.5" />
                    Hide Low Quality
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75">
                    <input type="checkbox" checked={groupByNarrative} onChange={(e) => setGroupByNarrative(e.target.checked)} className="h-3.5 w-3.5" />
                    Group by Narrative
                  </label>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200"
                  >
                    {loading ? 'Scanning...' : 'Find News Setup'}
                  </button>
                </div>
              </div>
            </section>

            {error && <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-300">{error}</div>}

            {!loading && filteredNews.length > 0 && (
              <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-4">
                  <NarrativeStack groups={groupedNarratives} />
                  <RotationBoard gate={newsGate} groups={groupedNarratives} />

                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Watchlist Triggers</div>
                    <div className="mt-2 space-y-1 text-xs text-white/70">
                      <div>• If permission is NO: no fresh deployment.</div>
                      <div>• If Event Shock: defined risk only.</div>
                      <div>• Trade leaders, not mid-pack laggards.</div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">Create Alert</button>
                      <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">Add to Watchlist</button>
                    </div>
                  </article>
                </div>

                <div className="space-y-4 lg:col-span-8">
                  {(groupByNarrative ? groupedNarratives : [{ narrative: 'All Articles', items: filteredNews, bullish: 0, bearish: 0, avgImpact: 0 }]).map((group) => (
                    <NewsGroup
                      key={group.narrative}
                      group={group}
                      gate={newsGate}
                      isAdmin={isAdmin}
                      expandedDecisionIds={expandedDecisionIds}
                      onToggleDecision={handleToggleDecision}
                    />
                  ))}
                </div>
              </section>
            )}

            {newsAIAnalysis && (
              <section className="mb-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
                <div className="mb-2 text-xs text-white/60">Daily Brief</div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/75">
                    <div>• Bias: {newsGate.riskState} with narrative {newsGate.topNarrative}.</div>
                    <div>• Rotation: {newsGate.rotationLeaders.join(' • ') || 'No clear flow'}.</div>
                    <div>• Volatility Warning: {newsGate.volRegime} ({newsGate.warnings.join(', ') || 'none'}).</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/75">
                    <div className="mb-1">Allowed Trades:</div>
                    {newsGate.briefAllowed.map((line) => <div key={line}>• {line}</div>)}
                    <div className="mt-2 mb-1">Avoid:</div>
                    {newsGate.briefAvoid.map((line) => <div key={line}>• {line}</div>)}
                    {isAdmin ? <button className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-300/20">Post Daily Brief (Admin)</button> : null}
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/70 whitespace-pre-wrap">{newsAIAnalysis}</div>
              </section>
            )}

            {!loading && filteredNews.length === 0 && (
              <section className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                <div className="mb-2 text-3xl">📰</div>
                <h3 className="text-lg font-semibold text-white/90">No decision-ready news objects</h3>
                <p className="mt-1 text-sm text-white/60">Run a scan or relax filters to build your narrative stack.</p>
              </section>
            )}
          </>
        )}

        {activeTab === "earnings" && (
          <>
            <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white/90">Catalyst Permission Gate</h2>
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                    catalystState.permission === 'YES'
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                      : catalystState.permission === 'NO'
                        ? 'border-rose-400/40 bg-rose-500/10 text-rose-300'
                        : 'border-amber-400/40 bg-amber-500/10 text-amber-300'
                  }`}>
                    PERMISSION: {catalystState.permission}
                  </span>
                </div>
                <p className="mb-3 text-sm text-white/70">{catalystState.reason}</p>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/70">Catalyst Density: {catalystState.densityLabel}</span>
                  <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/70">Volatility Risk: {catalystState.volRisk}</span>
                  <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/70">Liquidity Window: {catalystState.liquidityWindow}</span>
                  <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/70">Headline Risk: {catalystState.headlineRisk}</span>
                  <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/70">Execution Mode: {catalystState.executionMode}</span>
                </div>
                <ul className="space-y-1 text-xs text-white/70">
                  <li>• Avoid first 15 minutes when catalyst density is high.</li>
                  <li>• Trade only A-tier setups when permission is conditional.</li>
                  <li>• No counter-trend scalps during expansion windows.</li>
                </ul>
              </article>

              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h2 className="mb-2 text-sm font-semibold text-white/90">My Watchlist Impact</h2>
                <p className="mb-3 text-xs text-white/60">Watchlist events next 24h with timing and impact score.</p>
                {myWatchlistSymbols.length === 0 ? (
                  <div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                    Add watchlist symbols in the symbol input to unlock personal catalyst mapping.
                  </div>
                ) : catalystState.watchlist24.length === 0 ? (
                  <div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                    No watchlist catalysts in next 24h.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {catalystState.watchlist24.map((event) => (
                      <div key={`${event.symbol}-${event.reportDate}`} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-xs">
                        <div>
                          <div className="font-semibold text-white/85">{event.symbol}</div>
                          <div className="text-white/55">{event.session} • {formatRelativeDate(event.reportDate)}</div>
                        </div>
                        <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                          {event.impactScore}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={earningsSymbol}
                    onChange={(e) => setEarningsSymbol(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleEarningsSearch()}
                    placeholder="AAPL, MSFT, NVDA"
                    className="rounded-md border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-white outline-none"
                  />
                  {(['my', 'mag7', 'spy100', 'all'] as const).map((scope) => (
                    <button
                      key={scope}
                      onClick={() => setMarketScope(scope)}
                      className={`rounded-md border px-2 py-1 text-xs ${marketScope === scope ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-black/20 text-white/70'}`}
                    >
                      {scope === 'my' ? 'My Watchlist' : scope === 'mag7' ? 'Magnificent 7' : scope === 'spy100' ? 'SPY 100' : 'All'}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={earningsHorizon}
                    onChange={(e) => setEarningsHorizon(e.target.value)}
                    className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-white"
                  >
                    <option value="3month">3 Months</option>
                    <option value="6month">6 Months</option>
                    <option value="12month">12 Months</option>
                  </select>
                  <button
                    onClick={() => setSessionFilter('PRE')}
                    className={`rounded-md border px-2 py-1 text-xs ${sessionFilter === 'PRE' ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-black/20 text-white/70'}`}
                  >
                    Pre-market
                  </button>
                  <button
                    onClick={() => setSessionFilter('AH')}
                    className={`rounded-md border px-2 py-1 text-xs ${sessionFilter === 'AH' ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-black/20 text-white/70'}`}
                  >
                    After-hours
                  </button>
                  <button
                    onClick={() => setSessionFilter('all')}
                    className={`rounded-md border px-2 py-1 text-xs ${sessionFilter === 'all' ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-black/20 text-white/70'}`}
                  >
                    All sessions
                  </button>
                  <button
                    onClick={() => setHighImpactOnly((prev) => !prev)}
                    className={`rounded-md border px-2 py-1 text-xs ${highImpactOnly ? 'border-amber-400/40 bg-amber-500/15 text-amber-200' : 'border-white/15 bg-black/20 text-white/70'}`}
                  >
                    High Impact only
                  </button>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'impact' | 'time' | 'marketcap')}
                    className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-white"
                  >
                    <option value="impact">Sort: Impact</option>
                    <option value="time">Sort: Time</option>
                    <option value="marketcap">Sort: Market Cap</option>
                  </select>
                  <button
                    onClick={handleEarningsSearch}
                    disabled={earningsLoading}
                    className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
                  >
                    {earningsLoading ? 'Loading...' : 'Search'}
                  </button>
                </div>
              </div>
            </section>

            {earningsError && (
              <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{earningsError}</div>
            )}

            {!earningsLoading && earnings.length > 0 && (
              <>
                <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: 'Next 24h', count: catalystState.next24.length, risk: catalystState.volRisk === 'Expansion' ? '↑' : '↓' },
                    { label: 'Pre-market', count: catalystState.pre24, risk: catalystState.pre24 > 2 ? '↑' : '↓' },
                    { label: 'After-hours', count: catalystState.ah24, risk: catalystState.ah24 > 2 ? '↑' : '↓' },
                    { label: 'Next 7 Days', count: catalystState.next7.length, risk: catalystState.next7.length > 20 ? '↑' : '↓' },
                  ].map((card) => {
                    const density = card.count >= 12 ? 'High' : card.count >= 5 ? 'Medium' : 'Low';
                    return (
                      <article key={card.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-xl font-bold text-white/90">{card.count}</div>
                        <div className="text-xs text-white/55">{card.label}</div>
                        <div className="mt-1 text-[11px] text-white/65">Density: {density}</div>
                        <div className={`text-[11px] ${card.risk === '↑' ? 'text-amber-300' : 'text-emerald-300'}`}>Vol risk: {card.risk}</div>
                      </article>
                    );
                  })}
                </section>

                <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <h3 className="mb-2 text-sm font-semibold text-white/85">Catalyst Timeline</h3>
                    {(['PRE', 'RTH', 'AH'] as SessionTag[]).map((session) => {
                      const bucket = catalystState.timeline[session];
                      const topSymbols = bucket.slice(0, 4).map((row) => row.symbol).join(', ') || 'None';
                      return (
                        <div key={session} className="mb-2 rounded-md border border-white/10 bg-black/20 p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white/80">{session}</span>
                            <span className="text-white/55">{bucket.length} events</span>
                          </div>
                          <div className="mt-1 text-white/55">High impact: {bucket.filter((row) => row.impactTier === 'A').length}</div>
                          <div className="text-white/45">{topSymbols}</div>
                        </div>
                      );
                    })}
                  </article>

                  <article className="rounded-xl border border-white/10 bg-white/5 p-3 lg:col-span-2">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white/85">Event List</h3>
                      <span className="text-xs text-white/55">{enhancedEarningsRows.length} rows</span>
                    </div>
                    {enhancedEarningsRows.length === 0 ? (
                      <div className="rounded-md border border-white/10 bg-black/20 p-6 text-center text-sm text-white/55">
                        No events match your current filters.
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {enhancedEarningsRows.slice(0, 120).map((event) => (
                          <div key={`${event.symbol}-${event.reportDate}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/[0.07]">
                            <div className="min-w-[98px] rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/70">
                              <div>{formatRelativeDate(event.reportDate)}</div>
                              <div className="font-semibold">{event.session} • ET</div>
                            </div>
                            <div className="min-w-[220px] flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-emerald-300">{event.symbol}</span>
                                <span className="rounded border border-white/15 bg-black/20 px-1.5 py-0.5 text-[10px] text-white/70">Impact {event.impactTier}</span>
                                {getMarketCapRank(event.symbol).rank && (
                                  <span className="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">{getMarketCapRank(event.symbol).label}</span>
                                )}
                              </div>
                              <div className="text-xs text-white/60">{event.name}</div>
                            </div>
                            <div className="min-w-[120px] text-right text-xs text-white/65">
                              <div>EPS Est: {event.estimate !== null ? `$${event.estimate.toFixed(2)}` : 'N/A'}</div>
                              <div>Impact: {event.impactScore}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Link href={`/tools/equity-explorer?symbol=${event.symbol}`} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/75">Open Explorer</Link>
                              <Link href={`/tools/intraday-charts?symbol=${event.symbol}`} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/75">Open Chart</Link>
                              <button onClick={() => fetchAnalystData(event)} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/75">Create Alert</button>
                              <button className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/75">Journal Draft</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </section>

                <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <h4 className="mb-2 text-sm font-semibold text-white/85">What Matters Today</h4>
                    <p className="text-xs text-white/65">
                      {catalystState.aTier24 > 0
                        ? `${catalystState.aTier24} A-tier catalysts in next 24h; prioritize high-liquidity leaders.`
                        : 'No A-tier catalysts in next 24h; reduce urgency and wait for confirmation.'}
                    </p>
                  </article>
                  <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <h4 className="mb-2 text-sm font-semibold text-white/85">Risk to Avoid</h4>
                    <p className="text-xs text-white/65">
                      {catalystState.volRisk === 'Expansion'
                        ? 'Expansion regime active: avoid low-liquidity counter-trend setups around catalyst windows.'
                        : 'Compression regime: avoid forcing breakout trades without volume confirmation.'}
                    </p>
                  </article>
                  <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <h4 className="mb-2 text-sm font-semibold text-white/85">Best Hunting Ground</h4>
                    <p className="text-xs text-white/65">
                      {catalystState.liquidityWindow === 'PRE'
                        ? 'Pre-market is catalyst-heavy: wait for open structure then trade only leaders.'
                        : catalystState.liquidityWindow === 'AH'
                          ? 'After-hours carries the catalyst cluster; prepare next-session continuation plans.'
                          : 'RTH concentration favors cleaner intraday continuation setups.'}
                    </p>
                  </article>
                </section>

                {earningsAIAnalysis && (
                  <section className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="mb-2 text-sm font-semibold text-emerald-300">Catalyst Insights</h3>
                    <p className="whitespace-pre-wrap text-sm text-white/70">{earningsAIAnalysis}</p>
                  </section>
                )}

                {earningsResults.length > 0 && (
                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white/85">Recent Results Tape</h3>
                      <button
                        onClick={() => setShowRecentResults(!showRecentResults)}
                        className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/70"
                      >
                        {showRecentResults ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {showRecentResults && (
                      <div className="grid gap-2">
                        {earningsResults.slice(0, 16).map((result) => (
                          <div key={`${result.symbol}-${result.reportedDate}`} className="grid grid-cols-[80px_1fr_auto_auto] items-center gap-3 rounded-md border border-white/10 bg-black/20 px-2 py-2 text-xs">
                            <span className={`rounded px-1.5 py-0.5 text-center font-semibold ${result.beat ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                              {result.beat ? 'BEAT' : 'MISS'}
                            </span>
                            <span className="text-white/80">{result.symbol} • {result.name}</span>
                            <span className="text-white/65">EPS {result.reportedEPS !== null ? result.reportedEPS.toFixed(2) : 'N/A'}</span>
                            <span className={result.surprisePercentage !== null && result.surprisePercentage >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                              {result.surprisePercentage !== null ? `${result.surprisePercentage >= 0 ? '+' : ''}${result.surprisePercentage.toFixed(1)}%` : 'N/A'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}

            {earningsLoading && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
                Loading catalyst calendar...
              </div>
            )}

            {!earningsLoading && earnings.length === 0 && !earningsError && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
                <div className="mb-2 text-4xl">📅</div>
                <h3 className="mb-1 text-lg font-semibold text-white/90">Search for Earnings Catalysts</h3>
                <p className="text-sm text-white/55">Enter symbols or run all-market search to generate catalyst permission output.</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
    </div>
  );
}

function FilterButton({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: "0.5rem 1rem", background: active ? "rgba(16, 185, 129, 0.2)" : "rgba(30, 41, 59, 0.5)", border: active ? "1px solid #10B981" : "1px solid rgba(16, 185, 129, 0.1)", borderRadius: "8px", color: active ? "#10B981" : "#94A3B8", fontWeight: "600", cursor: "pointer", fontSize: "0.875rem" }}
    >
      {label}
    </button>
  );
}
