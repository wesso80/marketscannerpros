// =====================================================
// MSP AI COPILOT API - Main AI chat endpoint with tools
// POST /api/ai/copilot
// Features: Versioning, idempotency, enhanced tracking
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import OpenAI from 'openai';
import { buildUnifiedContext, serializeContextForPrompt } from '@/lib/ai/context';
import { getOpenAITools, toolRequiresConfirmation, AI_TOOLS, generateIdempotencyKey } from '@/lib/ai/tools';
import { SKILL_CONFIGS, CONTEXT_VERSION, SKILL_VERSION_PREFIX } from '@/lib/ai/types';
import type { PageContext, PageSkill, AIToolCall, CopilotMessage, SuggestedAction } from '@/lib/ai/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tier-based daily limits (database-backed for persistence)
const TIER_LIMITS: Record<string, number> = {
  free: 5,       // Free users: 5/day
  pro: 50,       // Pro subscribers: 50/day
  pro_trader: 200, // Pro Trader: 200/day
};

// Check daily usage against tier limit (database-backed)
async function checkTierQuota(workspaceId: string, tier: string): Promise<{
  allowed: boolean;
  usageCount: number;
  dailyLimit: number;
}> {
  const dailyLimit = TIER_LIMITS[tier] || 5;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Check usage from ai_usage table (same as msp-analyst)
    const usageResult = await q(
      `SELECT COUNT(*) as count FROM ai_usage 
       WHERE workspace_id = $1 AND DATE(created_at) = $2`,
      [workspaceId, today]
    );
    
    const usageCount = parseInt(usageResult[0]?.count || '0');
    
    return {
      allowed: usageCount < dailyLimit,
      usageCount,
      dailyLimit,
    };
  } catch (error) {
    console.error('Error checking tier quota:', error);
    // Allow on error to not block users
    return { allowed: true, usageCount: 0, dailyLimit };
  }
}

// Log usage to ai_usage table for tracking
async function logAIUsage(
  workspaceId: string,
  tier: string,
  question: string,
  responseLength: number,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number
): Promise<void> {
  try {
    await q(
      `INSERT INTO ai_usage (workspace_id, question, response_length, tier, prompt_tokens, completion_tokens, total_tokens, model, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [workspaceId, question.slice(0, 500), responseLength, tier, promptTokens, completionTokens, totalTokens, 'gpt-4o-mini']
    );
  } catch (error) {
    console.error('Error logging AI usage:', error);
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tier = (session.tier || 'free') as 'free' | 'pro' | 'pro_trader';

    // Check daily quota against tier limit (database-backed)
    const quota = await checkTierQuota(session.workspaceId, tier);
    if (!quota.allowed) {
      const upgradeMsg = tier === 'free' 
        ? 'Upgrade to Pro for 50/day or Pro Trader for 200/day.' 
        : tier === 'pro'
        ? 'Upgrade to Pro Trader for 200/day.'
        : 'Limit resets at midnight UTC.';
      
      return NextResponse.json({ 
        error: `Daily AI question limit reached (${quota.usageCount}/${quota.dailyLimit}). ${upgradeMsg}`,
        limitReached: true,
        tier,
        dailyLimit: quota.dailyLimit,
        usageCount: quota.usageCount,
      }, { status: 429 });
    }

    const body = await req.json();
    const { 
      message, 
      pageContext, 
      pageData,
      conversationHistory = [],
    } = body as { 
      message: string;
      pageContext: PageContext;
      pageData?: Record<string, unknown>;
      conversationHistory?: CopilotMessage[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    if (!pageContext?.name) {
      return NextResponse.json({ error: 'Page context required' }, { status: 400 });
    }

    const skill = pageContext.name as PageSkill;
    const skillConfig = SKILL_CONFIGS[skill];

    if (!skillConfig) {
      return NextResponse.json({ error: 'Unknown page skill' }, { status: 400 });
    }

    // Build unified context
    const context = await buildUnifiedContext(
      session.workspaceId,
      tier,
      pageContext,
      pageData || {}
    );

    // Build system prompt
    const systemPrompt = buildSystemPrompt(skill, skillConfig, context);

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last 10 messages)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add context summary
    messages.push({
      role: 'system',
      content: `Current context:\n${serializeContextForPrompt(context)}\n\nPage data summary: ${JSON.stringify(pageData || {}).slice(0, 1000)}`,
    });

    // Add user message
    messages.push({ role: 'user', content: message });

    // Get tools for this skill
    const tools = getOpenAITools(skill);

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: skillConfig.maxTokens,
      temperature: 0.7,
    });

    const assistantMessage = completion.choices[0]?.message;
    const responseContent = assistantMessage?.content || '';
    const toolCalls: AIToolCall[] = [];
    const suggestedActions: SuggestedAction[] = [];

    // Process tool calls
    if (assistantMessage?.tool_calls) {
      for (const toolCall of assistantMessage.tool_calls) {
        // Only process function tool calls (not custom tool calls)
        if (toolCall.type !== 'function') continue;
        
        const toolName = toolCall.function.name as keyof typeof AI_TOOLS;
        let parameters = {};
        
        try {
          parameters = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          parameters = {};
        }

        const requiresConfirmation = toolRequiresConfirmation(toolName);

        // Generate idempotency key for actionable tools
        const idempotencyKey = requiresConfirmation 
          ? generateIdempotencyKey(session.workspaceId, toolName, parameters)
          : undefined;

        toolCalls.push({
          tool: toolName,
          parameters,
        });

        // Add as suggested action if requires confirmation
        if (requiresConfirmation) {
          suggestedActions.push({
            label: formatToolLabel(toolName, parameters),
            tool: toolName,
            parameters,
            priority: 'high',
            idempotencyKey: idempotencyKey!,
          });
        }
      }
    }

    const latency = Date.now() - startTime;
    const responseId = crypto.randomUUID();

    // Generate input hash for deduplication/tracking
    const inputHash = await generateInputHash(message, JSON.stringify(context));
    const skillVersion = `${skill}@${SKILL_VERSION_PREFIX}`;

    // Store response for learning (with enhanced tracking)
    await q(
      `INSERT INTO ai_responses 
       (id, workspace_id, page_skill, user_prompt, context_snapshot, model_output, model_used, 
        tokens_used, token_prompt, token_completion, latency_ms, tools_called, actions_suggested,
        context_version, skill_version, input_hash, tool_calls_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        responseId,
        session.workspaceId,
        skill,
        message,
        JSON.stringify(context),
        responseContent,
        'gpt-4o-mini',
        completion.usage?.total_tokens || 0,
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0,
        latency,
        JSON.stringify(toolCalls),
        JSON.stringify(suggestedActions),
        CONTEXT_VERSION,
        skillVersion,
        inputHash,
        JSON.stringify(toolCalls),
      ]
    );

    // Log event
    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, 'ai_question_asked', $2, $3)`,
      [
        session.workspaceId,
        JSON.stringify({ responseId, hasToolCalls: toolCalls.length > 0 }),
        JSON.stringify(pageContext),
      ]
    );

    // Log to ai_usage table for tier quota tracking (consistent with msp-analyst)
    await logAIUsage(
      session.workspaceId,
      tier,
      message,
      responseContent.length,
      completion.usage?.prompt_tokens || 0,
      completion.usage?.completion_tokens || 0,
      completion.usage?.total_tokens || 0
    );

    return NextResponse.json({
      success: true,
      responseId,
      content: responseContent,
      toolCalls,
      suggestedActions,
      sources: [], // Would come from RAG retrieval
      model: 'gpt-4o-mini',
      tokensUsed: completion.usage?.total_tokens || 0,
      tokenPrompt: completion.usage?.prompt_tokens || 0,
      tokenCompletion: completion.usage?.completion_tokens || 0,
      latencyMs: latency,
      contextVersion: CONTEXT_VERSION,
      skillVersion,
      // Include quota info in response
      quota: {
        used: quota.usageCount + 1,
        limit: quota.dailyLimit,
        tier,
      },
    });

  } catch (error) {
    console.error('Error in AI copilot:', error);
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}

// Generate a simple hash of input for deduplication
async function generateInputHash(message: string, context: string): Promise<string> {
  const input = `${message}:${context}`;
  // Simple hash - in production use crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// Build the system prompt based on skill and context
function buildSystemPrompt(
  skill: PageSkill, 
  skillConfig: typeof SKILL_CONFIGS[PageSkill],
  context: Awaited<ReturnType<typeof buildUnifiedContext>>
): string {
  const basePrompt = `You are MSP Analyst, the AI assistant for MarketScanner Pros - a professional trading analysis platform.

CORE PRINCIPLES:
1. Be concise and actionable. Traders value their time.
2. Always show your sources: "Based on: [specific data points]"
3. Never invent numbers. If data is missing, say "data unavailable".
4. Include educational context for complex topics.
5. Every response should end with "Educational purposes only - not financial advice."

YOUR CAPABILITIES ON THIS PAGE (${skillConfig.displayName}):
${skillConfig.systemPromptAddition}

USER PROFILE:
- Subscription: ${context.user.tier}
- Risk Profile: ${context.user.riskProfile}
- Trading Style: ${context.user.tradingStyle}
- Response Preference: ${context.user.responseVerbosity === 'brief' ? 'Keep responses short and punchy' : context.user.responseVerbosity === 'detailed' ? 'Provide thorough explanations' : 'Balance detail with brevity'}

TOOLS AVAILABLE:
You can call tools to take actions. Only suggest actions that make sense for the current context.
Tools that require confirmation will be shown to the user before executing.

RESPONSE FORMAT:
- Start with the direct answer or insight
- Include 1-2 supporting data points
- If action is warranted, suggest it using available tools
- End with the educational disclaimer

FORBIDDEN:
- Never guarantee returns or profits
- Never tell users exactly what to buy/sell
- Never share specific price targets as recommendations
- Never dismiss risk or downplay potential losses`;

  return basePrompt;
}

// Format tool call into user-friendly label
function formatToolLabel(toolName: string, params: Record<string, unknown>): string {
  switch (toolName) {
    case 'create_alert':
      return `Create ${params.alertType} alert for ${params.symbol}`;
    case 'add_to_watchlist':
      return `Add ${params.symbol} to watchlist`;
    case 'journal_trade':
      return `Log ${params.symbol} ${params.direction} trade to journal`;
    case 'run_backtest':
      return `Run backtest on ${params.symbol}`;
    case 'generate_trade_plan':
      return `Generate trade plan for ${params.symbol}`;
    default:
      return toolName.replace(/_/g, ' ');
  }
}
