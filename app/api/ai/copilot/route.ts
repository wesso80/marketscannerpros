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

// Rate limiting (simple in-memory, use Redis in production)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(workspaceId: string, tier: string): boolean {
  const limits = { free: 5, pro: 50, pro_trader: 200 };
  const limit = limits[tier as keyof typeof limits] || 5;
  
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  
  const current = rateLimits.get(workspaceId);
  if (!current || current.resetAt < dayStart) {
    rateLimits.set(workspaceId, { count: 1, resetAt: dayStart + 86400000 });
    return true;
  }
  
  if (current.count >= limit) {
    return false;
  }
  
  current.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    if (!checkRateLimit(session.workspaceId, session.tier || 'free')) {
      return NextResponse.json({ 
        error: 'Daily AI question limit reached. Upgrade for more.',
        limitReached: true 
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
    const tier = (session.tier || 'free') as 'free' | 'pro' | 'pro_trader';
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
