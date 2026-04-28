/**
 * AI Portfolio Analyzer API
 * 
 * @route POST /api/portfolio/analyze
 * @description Analyzes full portfolio (positions + history) with AI insights
 * @authentication Required (ms_auth cookie)
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getDailyAiLimit, isFreeForAllMode, normalizeTier } from "@/lib/entitlements";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow longer for comprehensive analysis

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const PORTFOLIO_ANALYST_PROMPT = `You are a simulation-record describer for MarketScanner Pros. You receive a set of user-entered position records. Your ONLY job is to restate the numbers in plain English. You must NEVER offer commentary, analysis, interpretation, or guidance of any kind.

OUTPUT RULES — follow every one exactly:
1. State the number of open positions and their symbols.
2. State each position's recorded entry price, current price, quantity, and unrealised P&L (dollar and %).
3. State the total recorded net unrealised change across all positions.
4. State the recorded allocation percentages (which symbol is the largest, which is the smallest).
5. If closed positions exist, state total realised P&L.
6. End with EXACTLY this sentence: "This summary is descriptive only and does not indicate what action, if any, should be taken."

ABSOLUTE BANNED LIST — never use any of these words or phrases:
top performers, underperformers, winners, losers, best holding, worst holding, diversify, diversification, concentration risk, monitor, watch closely, assess, review, protect gains, lock in, take profit, cut losses, trim, reduce, add, rebalance, rotate, manage, improve, optimise, fix, adjust, consider, should, recommend, important to, maintain, exposure for now, action plan, next steps, key takeaway, opportunity, upside, downside risk, stay disciplined, be cautious, keep an eye on, hedge, de-risk

BANNED SECTION TYPES — do not create sections titled:
Top Performers, Underperformers, Recommendations, Action Items, Key Takeaways, What To Do Next, Portfolio Health, Risk Assessment, Areas of Concern, Trading Patterns, Strategy

FORMAT: Write 3-5 short paragraphs of plain factual restatement. No section headers. No emojis. No bullet points. Just flat descriptive prose restating the numbers.

EXAMPLE of correct output style:
"The current simulation record shows two open positions: CRM at 250 shares (entry $280.00, current $295.40, unrealised +$3,850.00 / +5.50%) and TSLA at 100 shares (entry $178.50, current $171.20, unrealised −$730.00 / −4.09%). The net unrealised change across all recorded positions is +$3,120.00. Recorded concentration is 68% CRM and 32% TSLA by notional value. This summary is descriptive only and does not indicate what action, if any, should be taken."

Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
`;

const REQUIRED_PORTFOLIO_FOOTER = 'This summary is descriptive only and does not indicate what action, if any, should be taken.';

const PORTFOLIO_ADVICE_PATTERNS = [
  /\b(recommend|recommendation|suggest|consider|should|must|need to|try to)\b/i,
  /\b(buy|sell|hold|trim|reduce|add|rebalance|rotate|hedge|de-risk)\b/i,
  /\b(take profit|cut losses|protect gains|lock in|action plan|next steps|key takeaway)\b/i,
  /\b(top performers|underperformers|best holding|worst holding|concentration risk)\b/i,
];

function hasPortfolioAdviceLanguage(text: string): boolean {
  const withoutRequiredFooter = text.replace(REQUIRED_PORTFOLIO_FOOTER, '');
  return PORTFOLIO_ADVICE_PATTERNS.some((pattern) => pattern.test(withoutRequiredFooter));
}

function money(value: unknown): string {
  const parsed = Number(value || 0);
  return `${parsed >= 0 ? '+' : ''}$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function plainMoney(value: unknown): string {
  const parsed = Number(value || 0);
  return `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: unknown): string {
  const parsed = Number(value || 0);
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(2)}%`;
}

function buildDeterministicPortfolioDescription(positions: any[] = [], closedPositions: any[] = []): string {
  const open = Array.isArray(positions) ? positions : [];
  const closed = Array.isArray(closedPositions) ? closedPositions : [];
  const openSymbols = open.map((position) => String(position.symbol || 'N/A').toUpperCase()).join(', ') || 'none';
  const totalValue = open.reduce((sum, position) => sum + Number(position.currentPrice || 0) * Number(position.quantity || 0), 0);
  const totalCost = open.reduce((sum, position) => sum + Number(position.entryPrice || 0) * Number(position.quantity || 0), 0);
  const totalUnrealized = open.reduce((sum, position) => sum + Number(position.pl || 0), 0);
  const totalRealized = closed.reduce((sum, position) => sum + Number(position.realizedPL || 0), 0);

  const positionText = open.length > 0
    ? open.map((position) => {
        const symbol = String(position.symbol || 'N/A').toUpperCase();
        const quantity = Number(position.quantity || 0);
        return `${symbol}: ${quantity} units, entry ${plainMoney(position.entryPrice)}, current ${plainMoney(position.currentPrice)}, recorded unrealised change ${money(position.pl)} / ${pct(position.plPercent)}`;
      }).join('; ')
    : 'No open position records are present.';

  return `The current simulation record shows ${open.length} open position${open.length === 1 ? '' : 's'}: ${openSymbols}. ${positionText}. Total recorded market value is ${plainMoney(totalValue)}, total recorded cost basis is ${plainMoney(totalCost)}, and net unrealised change is ${money(totalUnrealized)}. Closed simulation records total ${closed.length}, with recorded realised P&L of ${money(totalRealized)}. ${REQUIRED_PORTFOLIO_FOOTER}`;
}

export async function POST(req: NextRequest) {
  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    // Get user session
    const freeForAll = isFreeForAllMode();
    const session = await getSessionFromCookie();
    
    if (!session?.workspaceId && !freeForAll) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session?.workspaceId || "free-mode";
    const tier = normalizeTier(session?.tier);

    // Check AI usage limits
    if (workspaceId !== "free-mode") {
      const dailyLimit = getDailyAiLimit(tier);
      const today = new Date().toISOString().split('T')[0];
      
      const usageResult = await q(
        `SELECT COUNT(*) as count FROM ai_usage 
        WHERE workspace_id = $1 
        AND DATE(created_at) = $2`,
        [workspaceId, today]
      );
      
      const currentUsage = parseInt(usageResult[0]?.count || "0");
      if (currentUsage >= dailyLimit) {
        return NextResponse.json({
          error: `Daily AI limit reached (${dailyLimit} questions). ${tier === 'free' ? 'Upgrade to Pro for 50 questions/day or Pro Trader for 200/day.' : 'Upgrade to Pro Trader for 200/day.'}`,
          limitReached: true
        }, { status: 429 });
      }
    }

    // Parse request body
    const body = await req.json();
    const { positions, closedPositions, performanceHistory } = body;

    // Validate we have data to analyze
    if ((!positions || positions.length === 0) && (!closedPositions || closedPositions.length === 0)) {
      return NextResponse.json({ 
        error: "No portfolio data to analyze. Add some positions first!" 
      }, { status: 400 });
    }

    // Build portfolio summary for AI
    const portfolioSummary = buildPortfolioSummary(positions, closedPositions, performanceHistory);

    // Call OpenAI
    const openai = getOpenAIClient();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: PORTFOLIO_ANALYST_PROMPT },
        { role: "user", content: portfolioSummary }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const rawAnalysis = completion.choices[0]?.message?.content || "Unable to generate analysis.";
    const analysis = hasPortfolioAdviceLanguage(rawAnalysis)
      ? buildDeterministicPortfolioDescription(positions, closedPositions)
      : rawAnalysis.includes(REQUIRED_PORTFOLIO_FOOTER)
      ? rawAnalysis
      : `${rawAnalysis.trim()} ${REQUIRED_PORTFOLIO_FOOTER}`;

    // Log AI usage
    if (workspaceId !== "free-mode") {
      try {
        await q(
          `INSERT INTO ai_usage (workspace_id, question, response_length, tier, created_at)
          VALUES ($1, $2, $3, $4, NOW())`,
          [workspaceId, 'Portfolio Analysis', analysis.length, tier]
        );
      } catch (e) {
        logger.error("Failed to log AI usage", e);
      }
    }

    return NextResponse.json({ 
      analysis,
      usage: {
        tokens: completion.usage?.total_tokens || 0,
        model: "gpt-4o-mini"
      }
    });

  } catch (error: any) {
    logger.error("Portfolio analysis error:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to analyze portfolio" 
    }, { status: 500 });
  }
}

function buildPortfolioSummary(
  positions: any[], 
  closedPositions: any[], 
  performanceHistory: any[]
): string {
  let summary = "## PORTFOLIO ANALYSIS REQUEST\n\n";

  // Current positions
  if (positions && positions.length > 0) {
    const totalValue = positions.reduce((sum: number, p: any) => sum + (p.currentPrice * p.quantity), 0);
    const totalCost = positions.reduce((sum: number, p: any) => sum + (p.entryPrice * p.quantity), 0);
    const totalPL = positions.reduce((sum: number, p: any) => sum + p.pl, 0);
    const totalPLPercent = totalCost > 0 ? ((totalPL / totalCost) * 100) : 0;

    summary += `### CURRENT OPEN POSITIONS (${positions.length} total)\n`;
    summary += `Total Market Value: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    summary += `Total Cost Basis: $${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    summary += `Unrealized P&L: ${totalPL >= 0 ? '+' : ''}$${totalPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalPLPercent >= 0 ? '+' : ''}${totalPLPercent.toFixed(2)}%)\n\n`;

    summary += "| Symbol | Side | Qty | Entry | Current | P&L | P&L % | Entry Date |\n";
    summary += "|--------|------|-----|-------|---------|-----|-------|------------|\n";
    
    for (const p of positions) {
      const plStr = `${p.pl >= 0 ? '+' : ''}$${p.pl.toFixed(2)}`;
      const plPctStr = `${p.plPercent >= 0 ? '+' : ''}${p.plPercent.toFixed(2)}%`;
      const entryDate = p.entryDate ? new Date(p.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A';
      summary += `| ${p.symbol} | ${p.side} | ${p.quantity} | $${p.entryPrice.toFixed(2)} | $${p.currentPrice.toFixed(2)} | ${plStr} | ${plPctStr} | ${entryDate} |\n`;
    }
    summary += "\n";

    // Highest and lowest recorded open-position changes
    const sorted = [...positions].sort((a, b) => b.plPercent - a.plPercent);
    if (sorted.length > 0) {
      const positiveChanges = sorted.filter(p => p.plPercent > 0).slice(0, 3);
      const negativeChanges = sorted.filter(p => p.plPercent < 0).slice(-3).reverse();
      
      if (positiveChanges.length > 0) {
        summary += `**Highest Positive Recorded Changes:** ${positiveChanges.map(p => `${p.symbol} (+${p.plPercent.toFixed(1)}%)`).join(', ')}\n`;
      }
      if (negativeChanges.length > 0) {
        summary += `**Lowest Negative Recorded Changes:** ${negativeChanges.map(p => `${p.symbol} (${p.plPercent.toFixed(1)}%)`).join(', ')}\n`;
      }
      summary += "\n";
    }
  } else {
    summary += "### CURRENT OPEN POSITIONS\nNo open positions.\n\n";
  }

  // Closed positions (trade history)
  if (closedPositions && closedPositions.length > 0) {
    const totalRealizedPL = closedPositions.reduce((sum: number, p: any) => sum + (p.realizedPL || 0), 0);
    const winners = closedPositions.filter((p: any) => (p.realizedPL || 0) > 0);
    const losers = closedPositions.filter((p: any) => (p.realizedPL || 0) < 0);
    const winRate = closedPositions.length > 0 ? ((winners.length / closedPositions.length) * 100) : 0;
    
    const avgWin = winners.length > 0 ? winners.reduce((sum: number, p: any) => sum + p.realizedPL, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum: number, p: any) => sum + p.realizedPL, 0) / losers.length) : 0;

    summary += `### TRADE HISTORY (${closedPositions.length} closed trades)\n`;
    summary += `Total Realized P&L: ${totalRealizedPL >= 0 ? '+' : ''}$${totalRealizedPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    summary += `Win Rate: ${winRate.toFixed(1)}% (${winners.length} wins, ${losers.length} losses)\n`;
    summary += `Average Win: $${avgWin.toFixed(2)} | Average Loss: $${avgLoss.toFixed(2)}\n`;
    
    if (avgLoss > 0) {
      const riskReward = avgWin / avgLoss;
      summary += `Risk/Reward Ratio: ${riskReward.toFixed(2)}:1\n`;
    }
    summary += "\n";

    // Recent trades (last 10)
    const recentTrades = closedPositions.slice(0, 10);
    summary += "**Recent Closed Trades:**\n";
    summary += "| Symbol | Side | Entry | Close | P&L | Close Date |\n";
    summary += "|--------|------|-------|-------|-----|------------|\n";
    
    for (const p of recentTrades) {
      const plStr = `${(p.realizedPL || 0) >= 0 ? '+' : ''}$${(p.realizedPL || 0).toFixed(2)}`;
      const closeDate = p.closeDate ? new Date(p.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A';
      summary += `| ${p.symbol} | ${p.side} | $${p.entryPrice.toFixed(2)} | $${(p.closePrice || p.currentPrice).toFixed(2)} | ${plStr} | ${closeDate} |\n`;
    }
    summary += "\n";

    // Largest realized positive and negative records from history
    const sortedClosed = [...closedPositions].sort((a, b) => (b.realizedPL || 0) - (a.realizedPL || 0));
    const largestPositive = sortedClosed.filter(p => (p.realizedPL || 0) > 0).slice(0, 3);
    const largestNegative = sortedClosed.filter(p => (p.realizedPL || 0) < 0).slice(-3).reverse();
    
    if (largestPositive.length > 0) {
      summary += `**Largest Positive Realized Records:** ${largestPositive.map(p => `${p.symbol} (+$${(p.realizedPL || 0).toFixed(0)})`).join(', ')}\n`;
    }
    if (largestNegative.length > 0) {
      summary += `**Largest Negative Realized Records:** ${largestNegative.map(p => `${p.symbol} ($${(p.realizedPL || 0).toFixed(0)})`).join(', ')}\n`;
    }
  } else {
    summary += "### TRADE HISTORY\nNo closed trades yet.\n\n";
  }

  // Performance trend
  if (performanceHistory && performanceHistory.length > 1) {
    const first = performanceHistory[0];
    const last = performanceHistory[performanceHistory.length - 1];
    const change = last.totalValue - first.totalValue;
    const changePct = first.totalValue > 0 ? ((change / first.totalValue) * 100) : 0;
    
    summary += `### PERFORMANCE TREND\n`;
    summary += `From ${new Date(first.timestamp).toLocaleDateString()} to ${new Date(last.timestamp).toLocaleDateString()}\n`;
    summary += `Portfolio Change: ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)\n\n`;
  }

  summary += "\n---\nRestate the simulation records in plain English only. Do not include interpretation, commentary, guidance, or future-oriented language.";

  return summary;
}
