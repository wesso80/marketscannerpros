// =====================================================
// MSP AI PLATFORM - TOOL DEFINITIONS
// Defines all tools the AI can call with parameters
// =====================================================

import crypto from 'crypto';
import type { AITool, AIToolName, PageSkill, ToolPolicy } from './types';

// Default policies for different tool types
const READ_POLICY: ToolPolicy = {
  sideEffect: 'read',
  requiresConfirmation: false,
  rateLimitPerMinute: 30,
  rateLimitPerHour: 500,
  costLevel: 'free',
  cacheable: true,
  cacheTTLSeconds: 300,  // 5 minutes
};

const WRITE_POLICY: ToolPolicy = {
  sideEffect: 'write',
  requiresConfirmation: true,
  rateLimitPerMinute: 10,
  rateLimitPerHour: 100,
  costLevel: 'low',
  cacheable: false,
};

const HEAVY_POLICY: ToolPolicy = {
  sideEffect: 'heavy',
  requiresConfirmation: true,
  rateLimitPerMinute: 3,
  rateLimitPerHour: 20,
  costLevel: 'high',
  cacheable: false,
};

export const AI_TOOLS: Record<AIToolName, AITool> = {
  create_alert: {
    name: 'create_alert',
    description: 'Create a price or condition-based alert for a symbol',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'The trading symbol (e.g., BTC, AAPL)' },
        alertType: { 
          type: 'string', 
          enum: ['price_above', 'price_below', 'rsi_overbought', 'rsi_oversold', 'volume_spike', 'custom'],
          description: 'Type of alert condition'
        },
        value: { type: 'number', minimum: 0, maximum: 1000000000, description: 'The threshold value for the alert' },
        timeframe: { type: 'string', enum: ['5m', '15m', '30m', '1H', '4H', '1D', '1W'], description: 'Timeframe for the condition (e.g., 1H, 4H, 1D)' },
        note: { type: 'string', maxLength: 280, description: 'Optional note to include with the alert' },
      },
      required: ['symbol', 'alertType', 'value'],
    },
    policy: { ...WRITE_POLICY, rateLimitPerMinute: 5, rateLimitPerHour: 50 }, // Prevent spam
    allowedSkills: ['scanner', 'derivatives', 'options', 'time_confluence', 'portfolio', 'deep_analysis', 'watchlist'],
  },

  add_to_watchlist: {
    name: 'add_to_watchlist',
    description: 'Add a symbol to the user\'s watchlist with an optional note',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'The trading symbol to add' },
        note: { type: 'string', maxLength: 280, description: 'Why this symbol is being watched' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level' },
      },
      required: ['symbol'],
    },
    policy: { ...WRITE_POLICY, requiresConfirmation: false }, // Low risk write
    allowedSkills: ['home', 'scanner', 'derivatives', 'deep_analysis', 'watchlist'],
  },

  remove_from_watchlist: {
    name: 'remove_from_watchlist',
    description: 'Remove a symbol from the user\'s watchlist',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'The trading symbol to remove' },
      },
      required: ['symbol'],
    },
    policy: WRITE_POLICY,
    allowedSkills: ['watchlist'],
  },

  summarize_signal: {
    name: 'summarize_signal',
    description: 'Get a concise summary of a specific signal or scan result',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        signalId: { type: 'string', maxLength: 100, description: 'The signal ID to summarize' },
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'The symbol the signal is for' },
        signalType: { type: 'string', description: 'Type of signal (trend, reversal, etc.)' },
      },
      required: ['symbol'],
    },
    policy: READ_POLICY,
    allowedSkills: ['scanner', 'journal'],
  },

  generate_trade_plan: {
    name: 'generate_trade_plan',
    description: 'Generate a structured trade plan with entry, stops, and targets',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'The trading symbol' },
        direction: { type: 'string', enum: ['long', 'short'], description: 'Trade direction' },
        entryPrice: { type: 'number', minimum: 0, maximum: 1000000000, description: 'Planned entry price' },
        stopLoss: { type: 'number', minimum: 0, maximum: 1000000000, description: 'Stop loss price' },
        targets: { 
          type: 'array', 
          minItems: 1,
          maxItems: 5,
          items: { type: 'number', minimum: 0, maximum: 1000000000 },
          description: 'Array of profit target prices'
        },
        timeframe: { type: 'string', enum: ['5m', '15m', '30m', '1H', '4H', '1D', '1W'], description: 'Trading timeframe' },
        thesis: { type: 'string', maxLength: 1000, description: 'The reasoning behind the trade' },
      },
      required: ['symbol', 'direction'],
    },
    policy: { ...READ_POLICY, costLevel: 'medium', cacheable: false, rateLimitPerMinute: 10, rateLimitPerHour: 100 },
    allowedSkills: ['derivatives', 'options', 'deep_analysis', 'ai_analyst'],
  },

  journal_trade: {
    name: 'journal_trade',
    description: 'Create or update a trade journal entry',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'The trading symbol' },
        direction: { type: 'string', enum: ['long', 'short'], description: 'Trade direction' },
        entryPrice: { type: 'number', minimum: 0, maximum: 1000000000, description: 'Entry price' },
        exitPrice: { type: 'number', minimum: 0, maximum: 1000000000, description: 'Exit price (if closed)' },
        setupType: { 
          type: 'string', 
          enum: ['breakout', 'pullback', 'reversal', 'squeeze', 'momentum', 'mean_reversion', 'other'],
          description: 'Type of trade setup'
        },
        notes: { type: 'string', maxLength: 2000, description: 'Trade notes and observations' },
        mistakes: { 
          type: 'array', 
          maxItems: 20,
          items: { type: 'string' },
          description: 'Any mistakes made during the trade'
        },
        lessons: { type: 'string', maxLength: 1000, description: 'Lessons learned from this trade' },
      },
      required: ['symbol', 'direction'],
    },
    policy: WRITE_POLICY,
    allowedSkills: ['portfolio', 'journal'],
  },

  risk_position_size: {
    name: 'risk_position_size',
    description: 'Calculate proper position size based on risk parameters',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        accountSize: { type: 'number', minimum: 1, maximum: 1000000000, description: 'Total account size in USD' },
        riskPercent: { type: 'number', minimum: 0.1, maximum: 100, description: 'Risk percentage per trade (e.g., 1 or 2)' },
        entryPrice: { type: 'number', minimum: 0, maximum: 1000000000, description: 'Planned entry price' },
        stopLoss: { type: 'number', minimum: 0, maximum: 1000000000, description: 'Stop loss price' },
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'The trading symbol' },
      },
      required: ['accountSize', 'riskPercent', 'entryPrice', 'stopLoss'],
    },
    policy: READ_POLICY,
    allowedSkills: ['options', 'portfolio'],
  },

  run_backtest: {
    name: 'run_backtest',
    description: 'Run a backtest on a trading strategy',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        strategyId: { type: 'string', description: 'ID of a saved strategy to test' },
        symbol: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$', description: 'Symbol to backtest on' },
        startDate: { type: 'string', description: 'Backtest start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Backtest end date (YYYY-MM-DD)' },
        timeframe: { type: 'string', enum: ['5m', '15m', '30m', '1H', '4H', '1D', '1W'], description: 'Candle timeframe' },
      },
      required: ['symbol'],
    },
    policy: HEAVY_POLICY,
    allowedSkills: ['backtest'],
  },

  explain_metric: {
    name: 'explain_metric',
    description: 'Explain what a specific metric means and how to interpret it',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        metricName: { type: 'string', minLength: 1, maxLength: 100, description: 'Name of the metric to explain' },
        currentValue: { type: 'number', description: 'Current value of the metric' },
        context: { type: 'string', maxLength: 500, description: 'Additional context about where this metric appears' },
      },
      required: ['metricName'],
    },
    policy: { ...READ_POLICY, cacheTTLSeconds: 3600 }, // Cache for 1 hour
    allowedSkills: ['scanner', 'derivatives', 'options', 'time_confluence', 'deep_analysis', 'backtest', 'ai_analyst'],
  },

  compare_assets: {
    name: 'compare_assets',
    description: 'Compare multiple assets across various metrics',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbols: { 
          type: 'array', 
          minItems: 2,
          maxItems: 10,
          items: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9._-]{1,20}$' },
          description: 'Array of symbols to compare'
        },
        metrics: { 
          type: 'array', 
          maxItems: 12,
          items: { type: 'string' },
          description: 'Metrics to compare (trend, momentum, volatility, etc.)'
        },
        timeframe: { type: 'string', enum: ['5m', '15m', '30m', '1H', '4H', '1D', '1W'], description: 'Timeframe for comparison' },
      },
      required: ['symbols'],
    },
    policy: { ...READ_POLICY, costLevel: 'medium', cacheTTLSeconds: 600 },
    allowedSkills: ['deep_analysis', 'watchlist', 'ai_analyst'],
  },

  get_market_context: {
    name: 'get_market_context',
    description: 'Get current overall market context and regime',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        includeCorrelations: { type: 'boolean', description: 'Include correlation data' },
        includeSectors: { type: 'boolean', description: 'Include sector breakdown' },
      },
      required: [],
    },
    policy: { ...READ_POLICY, cacheTTLSeconds: 300 },
    allowedSkills: ['home', 'ai_analyst'],
  },
};

// Get tools allowed for a specific page skill
export function getToolsForSkill(skill: PageSkill): AITool[] {
  return Object.values(AI_TOOLS).filter(tool => 
    tool.allowedSkills.includes(skill)
  );
}

// Get OpenAI function calling format for tools
export function getOpenAITools(skill: PageSkill) {
  const tools = getToolsForSkill(skill);
  
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: `${tool.description}. Policy: sideEffect=${tool.policy.sideEffect}, confirmation=${tool.policy.requiresConfirmation ? 'required' : 'not_required'}, rate=${tool.policy.rateLimitPerMinute}/min.`,
      parameters: tool.parameters,
    },
  }));
}

export function assertToolAllowedForSkill(toolName: AIToolName, skill: PageSkill): void {
  const tool = AI_TOOLS[toolName];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  if (!tool.allowedSkills.includes(skill)) {
    throw new Error(`Tool ${toolName} not allowed for skill ${skill}`);
  }
}

// Check if a tool requires confirmation (uses new policy system)
export function toolRequiresConfirmation(toolName: AIToolName): boolean {
  return AI_TOOLS[toolName]?.policy?.requiresConfirmation ?? true;
}

// Get tool policy
export function getToolPolicy(toolName: AIToolName) {
  return AI_TOOLS[toolName]?.policy;
}

// Check if tool is cacheable
export function isToolCacheable(toolName: AIToolName): boolean {
  return AI_TOOLS[toolName]?.policy?.cacheable ?? false;
}

// Get cache TTL for a tool
export function getToolCacheTTL(toolName: AIToolName): number {
  return AI_TOOLS[toolName]?.policy?.cacheTTLSeconds ?? 0;
}

// Check if tool is rate-limited for a given usage count
export function isToolRateLimited(
  toolName: AIToolName, 
  minuteCount: number, 
  hourCount: number
): boolean {
  const policy = AI_TOOLS[toolName]?.policy;
  if (!policy) return false;
  
  return minuteCount >= policy.rateLimitPerMinute || hourCount >= policy.rateLimitPerHour;
}

// Generate idempotency key for an action
export function generateIdempotencyKey(
  workspaceId: string,
  tool: AIToolName,
  parameters: Record<string, unknown>,
  skill?: PageSkill,
  sessionId?: string
): string {
  const sortedKeys = Object.keys(parameters || {}).sort();
  const canonicalParams = JSON.stringify(parameters || {}, sortedKeys);
  const input = `${workspaceId}:${tool}:${skill || 'na'}:${sessionId || 'na'}:${canonicalParams}`;
  const digest = crypto.createHash('sha256').update(input).digest('hex').slice(0, 24);
  return `idem_${digest}`;
}

// Get tool summary for documentation
export function getToolSummary() {
  return Object.values(AI_TOOLS).map(tool => ({
    name: tool.name,
    sideEffect: tool.policy.sideEffect,
    requiresConfirmation: tool.policy.requiresConfirmation,
    costLevel: tool.policy.costLevel,
    cacheable: tool.policy.cacheable,
  }));
}
