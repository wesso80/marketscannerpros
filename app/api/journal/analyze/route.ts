/**
 * AI Journal Analyzer API
 * 
 * @route POST /api/journal/analyze
 * @description Analyzes trade journal entries with AI insights
 * @authentication Required (ms_auth cookie)
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionFromCookie } from "@/lib/auth";
import { sql } from "@vercel/postgres";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const JOURNAL_ANALYST_PROMPT = `You are a professional trading coach and journal analyst for MarketScanner Pros. Your job is to analyze the trader's journal entries and provide actionable insights to improve their trading.

ANALYSIS FRAMEWORK:
1. **Trading Performance** - Win rate, profit factor, risk/reward assessment
2. **Pattern Recognition** - Identify what setups/strategies are working vs failing
3. **Psychological Analysis** - Review noted emotions and their correlation with outcomes
4. **Risk Management** - Position sizing, loss patterns, drawdown behavior
5. **Actionable Improvements** - Specific, practical advice based on data

RESPONSE FORMAT:
Use clear sections with emojis for visual appeal:
- 📊 Performance Summary
- 🎯 What's Working (strategies/setups with best results)
- ⚠️ Areas of Concern (patterns leading to losses)
- 🧠 Psychological Patterns (emotional trends)
- 💡 Recommended Improvements

Be direct and specific. Reference actual symbols, strategies, and numbers from the data.
For emotional analysis, look for patterns like "Did trades made when feeling 'FOMO' or 'anxious' perform worse?"
Keep your response concise but comprehensive (400-600 words).

IMPORTANT: Do NOT provide specific buy/sell recommendations, price targets, or tell the user to enter/exit specific positions. This is educational pattern analysis of their past trades only, not investment advice.

Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
`;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

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

    const body = await req.json();
    const { entries } = body;

    if (!entries || entries.length === 0) {
      return NextResponse.json({ 
        error: "No journal entries to analyze. Add some trades first!" 
      }, { status: 400 });
    }

    const journalSummary = buildJournalSummary(entries);

    const openai = getOpenAIClient();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: JOURNAL_ANALYST_PROMPT },
        { role: "user", content: journalSummary }
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
          VALUES (${workspaceId}, 'journal_analysis', ${completion.usage?.total_tokens || 0})
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
    logger.error("Journal analysis error:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to analyze journal" 
    }, { status: 500 });
  }
}

function buildJournalSummary(entries: any[]): string {
  let summary = "## TRADE JOURNAL ANALYSIS REQUEST\n\n";

  const openTrades = entries.filter((e: any) => e.isOpen || e.outcome === 'open');
  const closedTrades = entries.filter((e: any) => !e.isOpen && e.outcome !== 'open');

  // Overall stats
  const totalTrades = closedTrades.length;
  const wins = closedTrades.filter((e: any) => e.outcome === 'win' || e.pl > 0);
  const losses = closedTrades.filter((e: any) => e.outcome === 'loss' || e.pl < 0);
  const winRate = totalTrades > 0 ? ((wins.length / totalTrades) * 100) : 0;
  
  const totalPL = closedTrades.reduce((sum: number, e: any) => sum + (e.pl || 0), 0);
  const avgWin = wins.length > 0 ? wins.reduce((sum: number, e: any) => sum + e.pl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum: number, e: any) => sum + e.pl, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : avgWin > 0 ? 999 : 0;

  summary += `### OVERALL PERFORMANCE\n`;
  summary += `Total Closed Trades: ${totalTrades}\n`;
  summary += `Win Rate: ${winRate.toFixed(1)}% (${wins.length} wins, ${losses.length} losses)\n`;
  summary += `Total P&L: ${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(2)}\n`;
  summary += `Average Win: $${avgWin.toFixed(2)}\n`;
  summary += `Average Loss: $${avgLoss.toFixed(2)}\n`;
  summary += `Profit Factor: ${profitFactor.toFixed(2)}\n`;
  summary += `Open Positions: ${openTrades.length}\n\n`;

  // Strategy breakdown
  const strategyStats: Record<string, { trades: number; wins: number; pl: number }> = {};
  closedTrades.forEach((e: any) => {
    const strategy = e.strategy || 'No Strategy';
    if (!strategyStats[strategy]) {
      strategyStats[strategy] = { trades: 0, wins: 0, pl: 0 };
    }
    strategyStats[strategy].trades++;
    if (e.pl > 0) strategyStats[strategy].wins++;
    strategyStats[strategy].pl += e.pl || 0;
  });

  if (Object.keys(strategyStats).length > 0) {
    summary += `### STRATEGY PERFORMANCE\n`;
    summary += "| Strategy | Trades | Win Rate | P&L |\n";
    summary += "|----------|--------|----------|-----|\n";
    Object.entries(strategyStats).forEach(([strategy, stats]) => {
      const strategyWinRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(0) : '0';
      const plStr = `${stats.pl >= 0 ? '+' : ''}$${stats.pl.toFixed(2)}`;
      summary += `| ${strategy} | ${stats.trades} | ${strategyWinRate}% | ${plStr} |\n`;
    });
    summary += "\n";
  }

  // Symbol breakdown
  const symbolStats: Record<string, { trades: number; wins: number; pl: number }> = {};
  closedTrades.forEach((e: any) => {
    const symbol = e.symbol || 'Unknown';
    if (!symbolStats[symbol]) {
      symbolStats[symbol] = { trades: 0, wins: 0, pl: 0 };
    }
    symbolStats[symbol].trades++;
    if (e.pl > 0) symbolStats[symbol].wins++;
    symbolStats[symbol].pl += e.pl || 0;
  });

  if (Object.keys(symbolStats).length > 0) {
    summary += `### SYMBOL PERFORMANCE\n`;
    summary += "| Symbol | Trades | Win Rate | P&L |\n";
    summary += "|--------|--------|----------|-----|\n";
    Object.entries(symbolStats)
      .sort((a, b) => b[1].pl - a[1].pl)
      .slice(0, 10)
      .forEach(([symbol, stats]) => {
        const symbolWinRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(0) : '0';
        const plStr = `${stats.pl >= 0 ? '+' : ''}$${stats.pl.toFixed(2)}`;
        summary += `| ${symbol} | ${stats.trades} | ${symbolWinRate}% | ${plStr} |\n`;
      });
    summary += "\n";
  }

  // Emotional analysis
  const emotionStats: Record<string, { trades: number; wins: number; pl: number }> = {};
  entries.filter((e: any) => e.emotions).forEach((e: any) => {
    const emotion = e.emotions.toLowerCase();
    if (!emotionStats[emotion]) {
      emotionStats[emotion] = { trades: 0, wins: 0, pl: 0 };
    }
    emotionStats[emotion].trades++;
    if (e.pl > 0) emotionStats[emotion].wins++;
    emotionStats[emotion].pl += e.pl || 0;
  });

  if (Object.keys(emotionStats).length > 0) {
    summary += `### EMOTIONAL CORRELATION\n`;
    summary += "| Emotion/State | Trades | Win Rate | P&L |\n";
    summary += "|---------------|--------|----------|-----|\n";
    Object.entries(emotionStats)
      .sort((a, b) => b[1].trades - a[1].trades)
      .forEach(([emotion, stats]) => {
        const emotionWinRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(0) : '0';
        const plStr = `${stats.pl >= 0 ? '+' : ''}$${stats.pl.toFixed(2)}`;
        summary += `| ${emotion} | ${stats.trades} | ${emotionWinRate}% | ${plStr} |\n`;
      });
    summary += "\n";
  }

  // Recent trades detail
  const recentTrades = closedTrades.slice(0, 15);
  if (recentTrades.length > 0) {
    summary += `### RECENT CLOSED TRADES\n`;
    summary += "| Date | Symbol | Side | Strategy | Entry | Exit | P&L | Emotion | Notes |\n";
    summary += "|------|--------|------|----------|-------|------|-----|---------|-------|\n";
    recentTrades.forEach((e: any) => {
      const date = e.exitDate || e.date || 'N/A';
      const plStr = `${e.pl >= 0 ? '+' : ''}$${(e.pl || 0).toFixed(2)}`;
      const notes = e.notes ? e.notes.substring(0, 30) + (e.notes.length > 30 ? '...' : '') : '-';
      summary += `| ${date} | ${e.symbol} | ${e.side} | ${e.strategy || '-'} | $${e.entryPrice} | $${e.exitPrice} | ${plStr} | ${e.emotions || '-'} | ${notes} |\n`;
    });
    summary += "\n";
  }

  // Open positions
  if (openTrades.length > 0) {
    summary += `### CURRENT OPEN POSITIONS\n`;
    summary += "| Date | Symbol | Side | Entry | Strategy | Notes |\n";
    summary += "|------|--------|------|-------|----------|-------|\n";
    openTrades.forEach((e: any) => {
      const notes = e.notes ? e.notes.substring(0, 40) + (e.notes.length > 40 ? '...' : '') : '-';
      summary += `| ${e.date} | ${e.symbol} | ${e.side} | $${e.entryPrice} | ${e.strategy || '-'} | ${notes} |\n`;
    });
    summary += "\n";
  }

  // Tags analysis
  const tagStats: Record<string, { trades: number; wins: number; pl: number }> = {};
  entries.forEach((e: any) => {
    (e.tags || []).forEach((tag: string) => {
      if (!tagStats[tag]) {
        tagStats[tag] = { trades: 0, wins: 0, pl: 0 };
      }
      tagStats[tag].trades++;
      if (e.pl > 0) tagStats[tag].wins++;
      tagStats[tag].pl += e.pl || 0;
    });
  });

  if (Object.keys(tagStats).length > 0) {
    summary += `### TAG PERFORMANCE\n`;
    Object.entries(tagStats)
      .sort((a, b) => b[1].trades - a[1].trades)
      .slice(0, 8)
      .forEach(([tag, stats]) => {
        const tagWinRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(0) : '0';
        summary += `- **${tag}**: ${stats.trades} trades, ${tagWinRate}% win rate, ${stats.pl >= 0 ? '+' : ''}$${stats.pl.toFixed(2)}\n`;
      });
    summary += "\n";
  }

  summary += "\n---\nPlease analyze this trading journal and provide insights on:\n";
  summary += "1. What trading patterns/strategies are working best?\n";
  summary += "2. What mistakes or losing patterns should be avoided?\n";
  summary += "3. How do emotions correlate with trading outcomes?\n";
  summary += "4. Specific, actionable recommendations to improve.\n";

  return summary;
}
