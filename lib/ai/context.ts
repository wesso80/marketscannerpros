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

const DEFAULT_USER_MEMORY: UserMemory = {
  preferredTimeframes: ['1H', '4H', '1D'],
  preferredAssets: [],
  riskProfile: 'medium',
  maxRiskPerTrade: 2.0,
  favoredSetups: [],
  tradingStyle: 'swing',
  typicalHoldTime: '1-5 days',
  responseVerbosity: 'balanced',
  showEducationalContent: true,
  autoSuggestActions: true,
  mostUsedFeatures: [],
  commonScanFilters: {},
  downvotedTopics: [],
};

const CONTEXT_MAX_CHARS = 12_000;
const PER_FIELD_MAX_CHARS = 800;

const JSONB_MEMORY_FIELDS = new Set([
  'preferred_timeframes',
  'preferred_assets',
  'favored_setups',
  'most_used_features',
  'common_scan_filters',
  'downvoted_topics',
]);

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function asObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function truncateString(value: string, maxChars = PER_FIELD_MAX_CHARS): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

function sanitizePageDataForPrompt(pageData: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(pageData || {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      sanitized[key] = truncateString(value);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
      continue;
    }

    const serialized = JSON.stringify(value);
    sanitized[key] = serialized.length > PER_FIELD_MAX_CHARS
      ? `${serialized.slice(0, PER_FIELD_MAX_CHARS)}...`
      : value;
  }

  return sanitized;
}

function normalizeTradeDirection(side: unknown): 'long' | 'short' {
  if (typeof side !== 'string') return 'long';
  const normalized = side.toLowerCase();
  if (normalized === 'long') return 'long';
  if (normalized === 'short') return 'short';
  return 'long';
}

function resolveMarketApiBase(): string | null {
  const base = process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || '';
  return base ? base.replace(/\/$/, '') : null;
}

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
export async function getUserMemory(workspaceId: string): Promise<UserMemory> {
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
      return { ...DEFAULT_USER_MEMORY };
    }
    
    const row = rows[0];
    return {
      preferredTimeframes: asStringArray(row.preferred_timeframes, DEFAULT_USER_MEMORY.preferredTimeframes),
      preferredAssets: asStringArray(row.preferred_assets, DEFAULT_USER_MEMORY.preferredAssets),
      riskProfile: row.risk_profile || DEFAULT_USER_MEMORY.riskProfile,
      maxRiskPerTrade: asNumber(row.max_risk_per_trade, DEFAULT_USER_MEMORY.maxRiskPerTrade),
      favoredSetups: asStringArray(row.favored_setups, DEFAULT_USER_MEMORY.favoredSetups),
      tradingStyle: row.trading_style || DEFAULT_USER_MEMORY.tradingStyle,
      typicalHoldTime: row.typical_hold_time || DEFAULT_USER_MEMORY.typicalHoldTime,
      responseVerbosity: row.response_verbosity || DEFAULT_USER_MEMORY.responseVerbosity,
      showEducationalContent: row.show_educational_content ?? DEFAULT_USER_MEMORY.showEducationalContent,
      autoSuggestActions: row.auto_suggest_actions ?? DEFAULT_USER_MEMORY.autoSuggestActions,
      mostUsedFeatures: asStringArray(row.most_used_features, DEFAULT_USER_MEMORY.mostUsedFeatures),
      commonScanFilters: asObject(row.common_scan_filters, DEFAULT_USER_MEMORY.commonScanFilters),
      downvotedTopics: asStringArray(row.downvoted_topics, DEFAULT_USER_MEMORY.downvotedTopics),
    };
  } catch (error) {
    console.error('Error fetching user memory:', error);
    return { ...DEFAULT_USER_MEMORY };
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
    
    await q(
      `INSERT INTO user_memory (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING`,
      [workspaceId]
    );

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key as keyof UserMemory];
      if (dbField && value !== undefined) {
        if (JSONB_MEMORY_FIELDS.has(dbField)) {
          setClauses.push(`${dbField} = $${paramIndex}::jsonb`);
          values.push(JSON.stringify(value));
        } else {
          setClauses.push(`${dbField} = $${paramIndex}`);
          values.push(value);
        }
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
      details: asObject(row.event_data, {}),
      timestamp: row.created_at,
    }));
  } catch (error) {
    console.error('Error fetching recent actions:', error);
    return [];
  }
}

// Fetch open positions from portfolio
async function getOpenPositions(workspaceId: string): Promise<OpenTrade[]> {
  try {
    const rows = await q(
      `SELECT symbol, side, quantity, entry_price, current_price, created_at, entry_date
       FROM portfolio_positions 
       WHERE workspace_id = $1 AND quantity > 0
       ORDER BY created_at DESC 
       LIMIT 20`,
      [workspaceId]
    );
    
    return rows.map(row => ({
      symbol: row.symbol,
      direction: normalizeTradeDirection(row.side),
      entryPrice: asNumber(row.entry_price, 0),
      currentPrice: row.current_price !== null && row.current_price !== undefined
        ? asNumber(row.current_price, 0)
        : undefined,
      pnlPercent: row.current_price !== null && row.current_price !== undefined && asNumber(row.entry_price, 0) > 0
        ? ((asNumber(row.current_price, 0) - asNumber(row.entry_price, 0)) / asNumber(row.entry_price, 0)) * 100
        : undefined,
      openedAt: row.entry_date || row.created_at,
    }));
  } catch (error) {
    console.error('Error fetching open positions:', error);
    return [];
  }
}

// Fetch watchlist symbols
async function getWatchlist(workspaceId: string): Promise<string[]> {
  try {
    // Assuming watchlist is stored - adjust table name as needed
    const rows = await q(
      `SELECT symbol FROM user_watchlist WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50`,
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
    const apiBase = resolveMarketApiBase();
    if (!apiBase) {
      return {
        regime: 'neutral',
        volatility: 'normal',
        fearGreedIndex: 50,
      };
    }

    const fngResponse = await fetch(`${apiBase}/api/fear-greed`, {
      next: { revalidate: 300 }
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
    getOpenPositions(workspaceId),
    getWatchlist(workspaceId),
    getRecentQuestions(workspaceId),
    getMarketState(),
  ]);
  
  // Build user context from memory + tier
  const userContext: UserContext = {
    tier,
    riskProfile: userMemory.riskProfile || DEFAULT_USER_CONTEXT.riskProfile,
    preferredAssets: userMemory.preferredAssets || DEFAULT_USER_CONTEXT.preferredAssets,
    preferredTimeframes: userMemory.preferredTimeframes || DEFAULT_USER_CONTEXT.preferredTimeframes,
    tradingStyle: userMemory.tradingStyle || DEFAULT_USER_CONTEXT.tradingStyle,
    responseVerbosity: userMemory.responseVerbosity || DEFAULT_USER_CONTEXT.responseVerbosity,
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
  const payload = {
    user: context.user,
    page: context.page,
    marketState: context.marketState,
    history: {
      recentActions: context.history.recentActions.slice(0, 10),
      openTrades: context.history.openTrades.slice(0, 10),
      watchlist: context.history.watchlist.slice(0, 25),
      recentQuestions: context.history.recentQuestions.slice(0, 5).map((question) => truncateString(question, 240)),
    },
    pageData: sanitizePageDataForPrompt(context.pageData),
    timestamp: context.timestamp,
  };

  let serialized = JSON.stringify(payload);
  if (serialized.length > CONTEXT_MAX_CHARS) {
    serialized = `${serialized.slice(0, CONTEXT_MAX_CHARS)}...`;
  }

  return `<<MSP_CONTEXT_JSON>>\n${serialized}\n<</MSP_CONTEXT_JSON>>`;
}
