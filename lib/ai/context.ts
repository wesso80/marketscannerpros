// =====================================================
// MSP AI PLATFORM - CONTEXT BUILDER
// Builds unified context object for all AI interactions
// =====================================================

import { q } from '@/lib/db';
import type { 
  UnifiedAIContext, 
  UserContext, 
  PageContext, 
  MarketState,
  UserMemory,
  RecentAction,
  OpenTrade 
} from './types';

// Default user context for new/free users
const DEFAULT_USER_CONTEXT: UserContext = {
  tier: 'free',
  riskProfile: 'medium',
  preferredAssets: [],
  preferredTimeframes: ['1H', '4H', '1D'],
  tradingStyle: 'swing',
  responseVerbosity: 'balanced',
};

// Fetch or create user memory
export async function getUserMemory(workspaceId: string): Promise<UserMemory | null> {
  try {
    const rows = await q(
      `SELECT * FROM user_memory WHERE workspace_id = $1`,
      [workspaceId]
    );
    
    if (rows.length === 0) {
      // Create default memory
      await q(
        `INSERT INTO user_memory (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [workspaceId]
      );
      return null;
    }
    
    const row = rows[0];
    return {
      preferredTimeframes: row.preferred_timeframes || ['1H', '4H', '1D'],
      preferredAssets: row.preferred_assets || [],
      riskProfile: row.risk_profile || 'medium',
      maxRiskPerTrade: parseFloat(row.max_risk_per_trade) || 2.0,
      favoredSetups: row.favored_setups || [],
      tradingStyle: row.trading_style || 'swing',
      typicalHoldTime: row.typical_hold_time || '1-5 days',
      responseVerbosity: row.response_verbosity || 'balanced',
      showEducationalContent: row.show_educational_content ?? true,
      autoSuggestActions: row.auto_suggest_actions ?? true,
      mostUsedFeatures: row.most_used_features || [],
      commonScanFilters: row.common_scan_filters || {},
      downvotedTopics: row.downvoted_topics || [],
    };
  } catch (error) {
    console.error('Error fetching user memory:', error);
    return null;
  }
}

// Update user memory
export async function updateUserMemory(
  workspaceId: string, 
  updates: Partial<UserMemory>
): Promise<boolean> {
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    
    const fieldMap: Record<keyof UserMemory, string> = {
      preferredTimeframes: 'preferred_timeframes',
      preferredAssets: 'preferred_assets',
      riskProfile: 'risk_profile',
      maxRiskPerTrade: 'max_risk_per_trade',
      favoredSetups: 'favored_setups',
      tradingStyle: 'trading_style',
      typicalHoldTime: 'typical_hold_time',
      responseVerbosity: 'response_verbosity',
      showEducationalContent: 'show_educational_content',
      autoSuggestActions: 'auto_suggest_actions',
      mostUsedFeatures: 'most_used_features',
      commonScanFilters: 'common_scan_filters',
      downvotedTopics: 'downvoted_topics',
    };
    
    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key as keyof UserMemory];
      if (dbField && value !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }
    
    if (setClauses.length === 0) return true;
    
    values.push(workspaceId);
    await q(
      `UPDATE user_memory SET ${setClauses.join(', ')} WHERE workspace_id = $${paramIndex}`,
      values
    );
    
    return true;
  } catch (error) {
    console.error('Error updating user memory:', error);
    return false;
  }
}

// Fetch recent actions for context
async function getRecentActions(workspaceId: string, limit = 10): Promise<RecentAction[]> {
  try {
    const rows = await q(
      `SELECT event_type, event_data, created_at 
       FROM ai_events 
       WHERE workspace_id = $1 
         AND event_type IN ('ai_action_used', 'signal_clicked', 'widget_interaction')
       ORDER BY created_at DESC 
       LIMIT $2`,
      [workspaceId, limit]
    );
    
    return rows.map(row => ({
      type: row.event_type,
      details: row.event_data,
      timestamp: row.created_at,
    }));
  } catch (error) {
    console.error('Error fetching recent actions:', error);
    return [];
  }
}

// Fetch open trades from portfolio
async function getOpenTrades(workspaceId: string): Promise<OpenTrade[]> {
  try {
    const rows = await q(
      `SELECT symbol, side, entry_price, current_price, pnl_percent, created_at
       FROM portfolio_positions 
       WHERE workspace_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [workspaceId]
    );
    
    return rows.map(row => ({
      symbol: row.symbol,
      direction: row.side === 'long' ? 'long' : 'short',
      entryPrice: parseFloat(row.entry_price),
      currentPrice: row.current_price ? parseFloat(row.current_price) : undefined,
      pnlPercent: row.pnl_percent ? parseFloat(row.pnl_percent) : undefined,
      openedAt: row.created_at,
    }));
  } catch (error) {
    console.error('Error fetching open trades:', error);
    return [];
  }
}

// Fetch watchlist symbols
async function getWatchlist(workspaceId: string): Promise<string[]> {
  try {
    // Assuming watchlist is stored - adjust table name as needed
    const rows = await q(
      `SELECT symbol FROM user_watchlist WHERE workspace_id = $1 LIMIT 50`,
      [workspaceId]
    );
    return rows.map(row => row.symbol);
  } catch {
    return [];
  }
}

// Fetch recent questions for context
async function getRecentQuestions(workspaceId: string, limit = 5): Promise<string[]> {
  try {
    const rows = await q(
      `SELECT user_prompt FROM ai_responses 
       WHERE workspace_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [workspaceId, limit]
    );
    return rows.map(row => row.user_prompt);
  } catch {
    return [];
  }
}

// Fetch current market state (could be cached/real-time)
export async function getMarketState(): Promise<MarketState> {
  // This would ideally fetch from a real-time source or cache
  // For now, return reasonable defaults
  try {
    // You could fetch from your fear/greed endpoint or cache
    const fngResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/api/fear-greed`, {
      next: { revalidate: 300 } // Cache for 5 minutes
    }).catch(() => null);
    
    let fng = 50;
    if (fngResponse?.ok) {
      const data = await fngResponse.json();
      fng = data.value || 50;
    }
    
    return {
      regime: fng > 60 ? 'risk-on' : fng < 40 ? 'risk-off' : 'neutral',
      volatility: 'normal', // Would need VIX or similar
      fearGreedIndex: fng,
    };
  } catch {
    return {
      regime: 'neutral',
      volatility: 'normal',
      fearGreedIndex: 50,
    };
  }
}

// Build complete unified context
export async function buildUnifiedContext(
  workspaceId: string,
  tier: 'free' | 'pro' | 'pro_trader',
  pageContext: PageContext,
  pageData: Record<string, unknown> = {}
): Promise<UnifiedAIContext> {
  // Fetch all context in parallel
  const [
    userMemory,
    recentActions,
    openTrades,
    watchlist,
    recentQuestions,
    marketState,
  ] = await Promise.all([
    getUserMemory(workspaceId),
    getRecentActions(workspaceId),
    getOpenTrades(workspaceId),
    getWatchlist(workspaceId),
    getRecentQuestions(workspaceId),
    getMarketState(),
  ]);
  
  // Build user context from memory + tier
  const userContext: UserContext = {
    tier,
    riskProfile: userMemory?.riskProfile || DEFAULT_USER_CONTEXT.riskProfile,
    preferredAssets: userMemory?.preferredAssets || DEFAULT_USER_CONTEXT.preferredAssets,
    preferredTimeframes: userMemory?.preferredTimeframes || DEFAULT_USER_CONTEXT.preferredTimeframes,
    tradingStyle: (userMemory?.tradingStyle as UserContext['tradingStyle']) || DEFAULT_USER_CONTEXT.tradingStyle,
    responseVerbosity: userMemory?.responseVerbosity || DEFAULT_USER_CONTEXT.responseVerbosity,
  };
  
  return {
    user: userContext,
    page: pageContext,
    marketState,
    pageData,
    history: {
      recentActions,
      watchlist,
      openTrades,
      recentQuestions,
    },
    timestamp: new Date().toISOString(),
  };
}

// Serialize context for prompt injection
export function serializeContextForPrompt(context: UnifiedAIContext): string {
  const parts: string[] = [];
  
  // User info
  parts.push(`User: ${context.user.tier} tier, ${context.user.riskProfile} risk profile, ${context.user.tradingStyle} trading style`);
  if (context.user.preferredAssets.length > 0) {
    parts.push(`Preferred assets: ${context.user.preferredAssets.join(', ')}`);
  }
  
  // Page context
  parts.push(`Current page: ${context.page.name}`);
  if (context.page.symbols?.length) {
    parts.push(`Viewing symbols: ${context.page.symbols.join(', ')}`);
  }
  if (context.page.timeframes?.length) {
    parts.push(`Timeframes: ${context.page.timeframes.join(', ')}`);
  }
  
  // Market state
  parts.push(`Market: ${context.marketState.regime} regime, ${context.marketState.volatility} volatility, Fear/Greed: ${context.marketState.fearGreedIndex}`);
  
  // Open trades
  if (context.history.openTrades.length > 0) {
    const trades = context.history.openTrades.slice(0, 5).map(t => 
      `${t.symbol} ${t.direction} @ ${t.entryPrice}${t.pnlPercent ? ` (${t.pnlPercent > 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}%)` : ''}`
    );
    parts.push(`Open positions: ${trades.join(', ')}`);
  }
  
  // Watchlist
  if (context.history.watchlist.length > 0) {
    parts.push(`Watchlist: ${context.history.watchlist.slice(0, 10).join(', ')}`);
  }
  
  return parts.join('\n');
}
