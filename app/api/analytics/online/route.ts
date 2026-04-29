import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import crypto from 'crypto';

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * GET /api/analytics/online
 * Returns live user counts. Admin-only (requires ADMIN_SECRET Bearer token).
 */
export async function GET(req: NextRequest) {
  // Admin auth gate
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.replace('Bearer ', '');
  const adminSecret = process.env.ADMIN_SECRET || '';

  if (!secret || !adminSecret || !timingSafeCompare(secret, adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Total online sessions (active within 5 minutes)
    const totalRows = await q<{ count: string }>(
      `SELECT COUNT(*) as count FROM active_sessions WHERE last_seen > NOW() - INTERVAL '5 minutes'`
    );

    // Logged-in users (distinct user_id)
    const loggedInRows = await q<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id) as count FROM active_sessions
       WHERE last_seen > NOW() - INTERVAL '5 minutes' AND user_id IS NOT NULL`
    );

    // Anonymous sessions
    const anonRows = await q<{ count: string }>(
      `SELECT COUNT(*) as count FROM active_sessions
       WHERE last_seen > NOW() - INTERVAL '5 minutes' AND user_id IS NULL`
    );

    // Top active pages in last 5 minutes
    const pageRows = await q<{ path: string; count: string }>(
      `SELECT current_path as path, COUNT(*) as count
       FROM active_sessions
       WHERE last_seen > NOW() - INTERVAL '5 minutes'
         AND current_path IS NOT NULL
         AND current_path != ''
       GROUP BY current_path
       ORDER BY count DESC
       LIMIT 20`
    );

    // Map paths to friendly names for grouping
    const pages = pageRows.map(r => ({
      path: r.path,
      count: parseInt(r.count, 10),
      section: classifyPath(r.path),
    }));

    // Aggregate by section
    const sectionMap: Record<string, number> = {};
    for (const p of pages) {
      sectionMap[p.section] = (sectionMap[p.section] || 0) + p.count;
    }
    const sections = Object.entries(sectionMap)
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      totalOnline: parseInt(totalRows[0]?.count || '0', 10),
      loggedIn: parseInt(loggedInRows[0]?.count || '0', 10),
      anonymous: parseInt(anonRows[0]?.count || '0', 10),
      timestamp: new Date().toISOString(),
      pages,
      sections,
    });
  } catch (err) {
    console.error('[online] error:', err);
    return NextResponse.json({ error: 'Failed to fetch online stats' }, { status: 500 });
  }
}

/** Classify a path into a human-readable section name */
function classifyPath(path: string): string {
  if (!path) return 'Unknown';
  if (path === '/' || path === '/home') return 'Home';
  if (path.startsWith('/dashboard')) return 'Dashboard';
  if (path.startsWith('/tools/scanner') || path.startsWith('/v2/scanner')) return 'Scanner';
  if (path.startsWith('/tools/golden-egg') || path.startsWith('/v2/golden-egg')) return 'Golden Egg';
  if (path.startsWith('/tools/terminal') || path.startsWith('/v2/terminal')) return 'Trade Terminal';
  if (path.startsWith('/tools/dashboard')) return 'Dashboard';
  if (path.startsWith('/tools/explorer')) return 'Explorer';
  if (path.startsWith('/tools/research')) return 'Research';
  if (path.startsWith('/tools/workspace')) return 'Workspace';
  if (path.startsWith('/tools/crypto-intel') || path.startsWith('/tools/crypto-heatmap')) return 'Crypto Intelligence';
  if (path.startsWith('/tools/ai-analyst') || path.startsWith('/v2/ai')) return 'AI Analyst';
  if (path.startsWith('/tools/portfolio') || path.startsWith('/v2/portfolio')) return 'Portfolio';
  if (path.startsWith('/tools/journal') || path.startsWith('/v2/journal')) return 'Trade Journal';
  if (path.startsWith('/tools/alerts') || path.startsWith('/v2/alerts')) return 'Alerts';
  if (path.startsWith('/tools/backtest') || path.startsWith('/v2/backtest')) return 'Backtest';
  if (path.startsWith('/tools/watchlist') || path.startsWith('/v2/watchlist')) return 'Watchlists';
  if (path.startsWith('/tools/chart')) return 'Charts';
  if (path.startsWith('/tools')) return 'Tools (Other)';
  if (path.startsWith('/v2')) return 'V2 Tools';
  if (path.startsWith('/account')) return 'Account';
  if (path.startsWith('/admin')) return 'Admin';
  if (path.startsWith('/pricing')) return 'Pricing';
  if (path.startsWith('/login')) return 'Login';
  if (path.startsWith('/legal')) return 'Legal';
  return 'Other';
}
