// =====================================================
// MSP AI FEEDBACK API - Log user feedback on AI responses
// POST /api/ai/feedback
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { AIFeedback } from '@/lib/ai/types';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { responseId, feedbackType, feedbackReason, correctionText } = body as AIFeedback;

    if (!responseId || !feedbackType) {
      return NextResponse.json({ error: 'Response ID and feedback type required' }, { status: 400 });
    }

    // Validate feedback type
    const validFeedbackTypes = ['thumbs_up', 'thumbs_down', 'correction', 'flag'];
    if (!validFeedbackTypes.includes(feedbackType)) {
      return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 });
    }

    // Validate feedback reason if provided
    const validReasons = ['helpful', 'accurate', 'too_long', 'too_vague', 'wrong_data', 'not_actionable', 'outdated', 'inappropriate'];
    if (feedbackReason && !validReasons.includes(feedbackReason)) {
      return NextResponse.json({ error: 'Invalid feedback reason' }, { status: 400 });
    }

    // Insert feedback
    await q(
      `INSERT INTO ai_feedback (workspace_id, response_id, feedback_type, feedback_reason, correction_text)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.workspaceId, responseId, feedbackType, feedbackReason || null, correctionText || null]
    );

    // Update the response rating based on feedback
    if (feedbackType === 'thumbs_up') {
      await q(
        `UPDATE ai_responses SET user_rating = 5 WHERE id = $1 AND workspace_id = $2`,
        [responseId, session.workspaceId]
      );
    } else if (feedbackType === 'thumbs_down') {
      await q(
        `UPDATE ai_responses SET user_rating = 1 WHERE id = $1 AND workspace_id = $2`,
        [responseId, session.workspaceId]
      );
    }

    // Log as event for learning
    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data)
       VALUES ($1, $2, $3)`,
      [
        session.workspaceId, 
        feedbackType === 'thumbs_up' ? 'thumbs_up' : feedbackType === 'thumbs_down' ? 'thumbs_down' : 'user_correction',
        JSON.stringify({ responseId, feedbackReason, hasCorrectionText: !!correctionText })
      ]
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error logging AI feedback:', error);
    return NextResponse.json({ error: 'Failed to log feedback' }, { status: 500 });
  }
}

// GET - Fetch feedback stats (for admin/analytics)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if admin
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    // For non-admins, just return their own feedback stats
    
    const stats = await q(
      `SELECT 
        feedback_type,
        feedback_reason,
        COUNT(*) as count
       FROM ai_feedback
       WHERE workspace_id = $1
       GROUP BY feedback_type, feedback_reason
       ORDER BY count DESC`,
      [session.workspaceId]
    );

    const totalResponses = await q(
      `SELECT COUNT(*) as total, AVG(user_rating) as avg_rating
       FROM ai_responses
       WHERE workspace_id = $1 AND user_rating IS NOT NULL`,
      [session.workspaceId]
    );

    return NextResponse.json({ 
      success: true, 
      stats,
      summary: {
        totalRated: parseInt(totalResponses[0]?.total || '0'),
        averageRating: parseFloat(totalResponses[0]?.avg_rating || '0'),
      }
    });

  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
