// =====================================================
// MSP AI MEMORY API - Get/Update user memory
// GET/PATCH /api/ai/memory
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getUserMemory, updateUserMemory } from '@/lib/ai/context';
import type { UserMemory } from '@/lib/ai/types';

// GET - Fetch user memory
export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memory = await getUserMemory(session.workspaceId);

    return NextResponse.json({ 
      success: true, 
      memory: memory || {
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
      }
    });

  } catch (error) {
    console.error('Error fetching user memory:', error);
    return NextResponse.json({ error: 'Failed to fetch memory' }, { status: 500 });
  }
}

// PATCH - Update user memory
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const updates = body as Partial<UserMemory>;

    // Validate allowed fields
    const allowedFields: (keyof UserMemory)[] = [
      'preferredTimeframes',
      'preferredAssets',
      'riskProfile',
      'maxRiskPerTrade',
      'favoredSetups',
      'tradingStyle',
      'typicalHoldTime',
      'responseVerbosity',
      'showEducationalContent',
      'autoSuggestActions',
    ];

    const sanitizedUpdates: Partial<UserMemory> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sanitizedUpdates as any)[field] = updates[field];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
    }

    const success = await updateUserMemory(session.workspaceId, sanitizedUpdates);

    if (!success) {
      return NextResponse.json({ error: 'Failed to update memory' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: Object.keys(sanitizedUpdates) });

  } catch (error) {
    console.error('Error updating user memory:', error);
    return NextResponse.json({ error: 'Failed to update memory' }, { status: 500 });
  }
}
