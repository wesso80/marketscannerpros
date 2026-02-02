// =====================================================
// MSP AI SUGGEST API - Quick "Next Best Actions"
// GET /api/ai/suggest - Returns pre-computed suggestions
// POST /api/ai/suggest - Generate new suggestions for current context
// Cheaper and faster than full chat - no LLM call for GET
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { buildUnifiedContext } from '@/lib/ai/context';
import { getToolsForSkill, generateIdempotencyKey } from '@/lib/ai/tools';
import type { PageSkill, PageContext, UnifiedAIContext } from '@/lib/ai/types';

interface Suggestion {
  id: string;
  type: 'action' | 'insight' | 'warning' | 'opportunity';
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  tool?: string;
  toolParams?: Record<string, unknown>;
  idempotencyKey?: string;
  validUntil?: string;
}

// GET - Retrieve existing suggestions (no LLM cost)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const skill = searchParams.get('skill') as PageSkill | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 10);

    // Fetch valid suggestions
    let query = `
      SELECT id, suggestion_type, title, description, priority, 
             tool_name, tool_params, idempotency_key, valid_until
      FROM ai_suggestions 
      WHERE workspace_id = $1 
        AND NOT is_dismissed 
        AND NOT is_acted_on
        AND (valid_until IS NULL OR valid_until > NOW())
    `;
    const params: unknown[] = [session.workspaceId];

    if (skill) {
      query += ` AND page_skill = $${params.length + 1}`;
      params.push(skill);
    }

    query += ` ORDER BY 
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC
      LIMIT $${params.length + 1}`;
    params.push(limit);

    const rows = await q(query, params);

    const suggestions: Suggestion[] = rows.map(row => ({
      id: row.id,
      type: row.suggestion_type,
      title: row.title,
      description: row.description,
      priority: row.priority,
      tool: row.tool_name,
      toolParams: row.tool_params,
      idempotencyKey: row.idempotency_key,
      validUntil: row.valid_until?.toISOString(),
    }));

    // Also include quick AI highlights (non-personalized, cacheable)
    const highlights = await getAIHighlights(skill || 'home');

    return NextResponse.json({
      success: true,
      suggestions,
      highlights,
      count: suggestions.length,
    });

  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}

// POST - Generate new suggestions based on current context (uses LLM)
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pageContext, pageData } = body as {
      pageContext: PageContext;
      pageData?: Record<string, unknown>;
    };

    if (!pageContext?.name) {
      return NextResponse.json({ error: 'Page context required' }, { status: 400 });
    }

    // Build context
    const tier = (session.tier || 'free') as 'free' | 'pro' | 'pro_trader';
    const context = await buildUnifiedContext(
      session.workspaceId,
      tier,
      pageContext,
      pageData || {}
    );

    // Generate suggestions based on context (rule-based + simple heuristics)
    // This is cheaper than a full LLM call
    const suggestions = await generateSuggestions(
      session.workspaceId,
      pageContext.name,
      context,
      pageData || {}
    );

    // Store suggestions
    for (const suggestion of suggestions) {
      await q(
        `INSERT INTO ai_suggestions 
         (workspace_id, page_skill, trigger_context, suggestion_type, title, description, 
          priority, tool_name, tool_params, idempotency_key, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT DO NOTHING`,
        [
          session.workspaceId,
          pageContext.name,
          JSON.stringify({ symbols: pageContext.symbols }),
          suggestion.type,
          suggestion.title,
          suggestion.description,
          suggestion.priority,
          suggestion.tool,
          JSON.stringify(suggestion.toolParams || {}),
          suggestion.idempotencyKey,
          suggestion.validUntil ? new Date(suggestion.validUntil) : null,
        ]
      );
    }

    return NextResponse.json({
      success: true,
      suggestions,
      generated: suggestions.length,
    });

  } catch (error) {
    console.error('Error generating suggestions:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}

// PATCH - Dismiss or act on a suggestion
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { suggestionId, action } = body as {
      suggestionId: string;
      action: 'dismiss' | 'acted';
    };

    if (!suggestionId || !action) {
      return NextResponse.json({ error: 'suggestionId and action required' }, { status: 400 });
    }

    if (action === 'dismiss') {
      await q(
        `UPDATE ai_suggestions SET is_dismissed = true, dismissed_at = NOW() 
         WHERE id = $1 AND workspace_id = $2`,
        [suggestionId, session.workspaceId]
      );
    } else if (action === 'acted') {
      await q(
        `UPDATE ai_suggestions SET is_acted_on = true, acted_on_at = NOW() 
         WHERE id = $1 AND workspace_id = $2`,
        [suggestionId, session.workspaceId]
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating suggestion:', error);
    return NextResponse.json({ error: 'Failed to update suggestion' }, { status: 500 });
  }
}

// ===== HELPER FUNCTIONS =====

// Rule-based suggestion generation (no LLM cost)
async function generateSuggestions(
  workspaceId: string,
  skill: PageSkill,
  context: UnifiedAIContext,
  pageData: Record<string, unknown>
): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];
  const tools = getToolsForSkill(skill);
  const now = new Date();
  const validFor24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Scanner-specific suggestions
  if (skill === 'scanner' && pageData.signals) {
    const signals = pageData.signals as Array<{ symbol: string; confidence: number; type: string }>;
    const highConfidence = signals.filter(s => s.confidence > 75);
    
    if (highConfidence.length > 0) {
      const top = highConfidence[0];
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'opportunity',
        title: `High confidence signal on ${top.symbol}`,
        description: `${top.type} signal with ${top.confidence}% confidence detected`,
        priority: 'high',
        tool: 'create_alert',
        toolParams: { symbol: top.symbol, alertType: 'price_above' },
        idempotencyKey: generateIdempotencyKey(workspaceId, 'create_alert', { symbol: top.symbol }),
        validUntil: validFor24h,
      });
    }
  }

  // Derivatives-specific suggestions
  if (skill === 'derivatives' && pageData.fundingRate !== undefined) {
    const fundingRate = pageData.fundingRate as number;
    if (Math.abs(fundingRate) > 0.01) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'warning',
        title: `Extreme funding rate detected`,
        description: `Funding at ${(fundingRate * 100).toFixed(3)}% - crowded ${fundingRate > 0 ? 'longs' : 'shorts'}`,
        priority: 'high',
        validUntil: validFor24h,
      });
    }
  }

  // Portfolio suggestions
  if (skill === 'portfolio' && pageData.positions) {
    const positions = pageData.positions as Array<{ symbol: string; pnlPercent: number }>;
    const losers = positions.filter(p => p.pnlPercent < -5);
    
    if (losers.length > 0) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'warning',
        title: `${losers.length} positions down >5%`,
        description: `Consider reviewing your stop losses`,
        priority: 'medium',
        validUntil: validFor24h,
      });
    }
  }

  // General suggestions based on user behavior (from context)
  const userContext = context as { user?: { mostUsedFeatures?: string[] } };
  if (userContext?.user?.mostUsedFeatures?.includes('scanner') && skill !== 'scanner') {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'insight',
      title: 'New signals available',
      description: 'Check the scanner for fresh opportunities',
      priority: 'low',
      validUntil: validFor24h,
    });
  }

  return suggestions;
}

// Static AI highlights (can be heavily cached)
async function getAIHighlights(skill: PageSkill): Promise<string[]> {
  // These could come from a cache or be generated periodically
  const highlightsBySkill: Record<string, string[]> = {
    home: [
      'Markets are in risk-on mode today',
      'BTC dominance declining - altseason potential',
      '3 high-confluence signals detected this session',
    ],
    scanner: [
      'Momentum favors large caps today',
      'Volume spike detected in tech sector',
      'RSI extremes on 5 symbols',
    ],
    derivatives: [
      'Open interest rising across major pairs',
      'Funding rates elevated - caution on longs',
      'Liquidation clusters near current price',
    ],
    portfolio: [
      'Your portfolio beta is 1.2 vs market',
      'Consider rebalancing - tech overweight',
      '2 positions hitting stop targets',
    ],
  };

  return highlightsBySkill[skill] || [];
}
