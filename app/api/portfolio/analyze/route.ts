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
import { sql } from "@vercel/postgres";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow longer for comprehensive analysis

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const PORTFOLIO_ANALYST_PROMPT = `You are a professional portfolio analyst for MarketScanner Pros. Your job is to provide actionable insights on the user's trading portfolio.

ANALYSIS FRAMEWORK:
1. **Portfolio Health Assessment** - Overall status (healthy/warning/critical)
2. **Winners & Losers** - Identify best and worst performing positions
3. **Patterns & Trends** - What trading behaviors/patterns do you see?
4. **Risk Assessment** - Concentration risk, sector exposure, drawdown analysis
5. **Actionable Recommendations** - Specific suggestions to improve

RESPONSE FORMAT:
Use clear sections with emojis for visual appeal:
- 📊 Portfolio Health
- 🏆 Top Performers
- ⚠️ Underperformers  
- 🔍 Trading Patterns
- 💡 Recommendations

Be direct and actionable. Reference specific symbols and numbers.
If the portfolio is in drawdown, acknowledge it honestly but constructively.
Consider position sizing, diversification, and timing of entries.
Keep your response concise but comprehensive (400-600 words).

IMPORTANT: Do NOT provide specific buy/sell recommendations, price targets, or tell the user to enter/exit specific positions. This is educational portfolio analysis only, not investment advice.

Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
`;

export async function POST(req: NextRequest) {
  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    // Get user session
    const freeForAll = process.env.FREE_FOR_ALL_MODE === "true";
    const session = await getSessionFromCookie();
    
    if (!session?.workspaceId && !freeForAll) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session?.workspaceId || "free-mode";
    const tier = session?.tier || "free";

    // Check AI usage limits
    if (tier !== "pro_trader" && workspaceId !== "free-mode") {
      const dailyLimit = tier === "pro" ? 50 : 5;
      const today = new Date().toISOString().split('T')[0];
      
      const usageResult = await sql`
        SELECT COUNT(*) as count FROM ai_usage 
        WHERE workspace_id = ${workspaceId} 
        AND DATE(created_at) = ${today}
      `;
      
      const currentUsage = parseInt(usageResult.rows[0]?.count || "0");
      if (currentUsage >= dailyLimit) {
        return NextResponse.json({
          error: `Daily AI limit reached (${dailyLimit} questions). ${tier === 'free' ? 'Upgrade to Pro for 50 questions/day or Pro Trader for unlimited.' : 'Upgrade to Pro Trader for unlimited AI access.'}`,
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

    const analysis = completion.choices[0]?.message?.content || "Unable to generate analysis.";

    // Log AI usage
    if (workspaceId !== "free-mode") {
      try {
        await sql`
          INSERT INTO ai_usage (workspace_id, query_type, tokens_used)
          VALUES (${workspaceId}, 'portfolio_analysis', ${completion.usage?.total_tokens || 0})
        `;
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

    // Top winners and losers
    const sorted = [...positions].sort((a, b) => b.plPercent - a.plPercent);
    if (sorted.length > 0) {
      const winners = sorted.filter(p => p.plPercent > 0).slice(0, 3);
      const losers = sorted.filter(p => p.plPercent < 0).slice(-3).reverse();
      
      if (winners.length > 0) {
        summary += `**Best Performers:** ${winners.map(p => `${p.symbol} (+${p.plPercent.toFixed(1)}%)`).join(', ')}\n`;
      }
      if (losers.length > 0) {
        summary += `**Worst Performers:** ${losers.map(p => `${p.symbol} (${p.plPercent.toFixed(1)}%)`).join(', ')}\n`;
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

    // Biggest wins and losses from history
    const sortedClosed = [...closedPositions].sort((a, b) => (b.realizedPL || 0) - (a.realizedPL || 0));
    const biggestWins = sortedClosed.filter(p => (p.realizedPL || 0) > 0).slice(0, 3);
    const biggestLosses = sortedClosed.filter(p => (p.realizedPL || 0) < 0).slice(-3).reverse();
    
    if (biggestWins.length > 0) {
      summary += `**Biggest Wins:** ${biggestWins.map(p => `${p.symbol} (+$${(p.realizedPL || 0).toFixed(0)})`).join(', ')}\n`;
    }
    if (biggestLosses.length > 0) {
      summary += `**Biggest Losses:** ${biggestLosses.map(p => `${p.symbol} ($${(p.realizedPL || 0).toFixed(0)})`).join(', ')}\n`;
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

  summary += "\n---\nPlease analyze this portfolio and provide insights on what's working, what's not, and actionable recommendations for improvement.";

  return summary;
}
