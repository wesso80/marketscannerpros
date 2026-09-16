import { NextRequest, NextResponse } from 'next/server';
import { buildCalendarFeed } from '@/lib/macro/calendar/feed';
import { parseCountryFilter } from '@/lib/macro/calendar/countries';
import { parseFocusAssets } from '@/lib/macro/calendar/relevance';
import type { CalendarEvent, Importance } from '@/lib/macro/calendar/types';

/**
 * Global Macro Calendar API
 *
 * GET /api/economic-calendar
 * Query params:
 *   - days:      horizon in days (1..90, default 30)
 *   - impact:    'high' | 'medium' | 'low' | 'all' (default 'all')  [legacy name]
 *   - countries: comma-separated codes (US,JP,EU,UK,AU,CA,CN,NZ,CH,KR,IN) or GLOBAL (default)
 *   - assets:    comma-separated focus assets for the market-relevant countdown (default SPX,NQ,USD)
 *
 * Response keeps the legacy fields consumed elsewhere (`events[].date/time/event/
 * country/impact/category/forecast`, `nextMajorEvent`, `daysUntilMajor`, `grouped`,
 * `count`, `dateRange`, `lastUpdated`) and adds the normalized model, surprise
 * engine output, split data-quality states and provider metadata.
 *
 * All comparisons happen in UTC. `date`/`time` remain ET for legacy consumers;
 * `releaseTimeUtc` + `releaseTimeLocal` are the authoritative fields.
 * Events are provider-agnostic: consumers only see NormalizedEconomicEvent
 * (CalendarEvent) objects assembled by lib/macro/calendar/feed.ts.
 */

export const dynamic = 'force-dynamic';

const VALID_IMPACT: ReadonlyArray<string> = ['high', 'medium', 'low', 'all'];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const daysRaw = parseInt(url.searchParams.get('days') || '30', 10);
    const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, daysRaw)) : 30;
    const impactRaw = (url.searchParams.get('impact') || 'all').toLowerCase();
    const impact = (VALID_IMPACT.includes(impactRaw) ? impactRaw : 'all') as Importance | 'all';
    const countries = parseCountryFilter(url.searchParams.get('countries') ?? url.searchParams.get('country'));
    const focusAssets = parseFocusAssets(url.searchParams.get('assets'));

    const nowMs = Date.now();
    const feed = await buildCalendarFeed({ nowMs, days, countries, importance: impact, focusAssets });

    const grouped: Record<string, CalendarEvent[]> = {};
    for (const event of feed.events) {
      (grouped[event.date] ||= []).push(event);
    }

    const nextMajor = feed.nextMajorEvent;
    const msUntilMajor = nextMajor ? Date.parse(nextMajor.releaseTimeUtc) - nowMs : null;

    return NextResponse.json(
      {
        events: feed.events,
        grouped,
        count: feed.events.length,
        nextMajorEvent: nextMajor,
        daysUntilMajor: msUntilMajor !== null ? Math.ceil(msUntilMajor / 86_400_000) : null,
        minutesUntilMajor: msUntilMajor !== null ? Math.max(0, Math.floor(msUntilMajor / 60_000)) : null,
        nextRelevantEvent: feed.nextRelevantEvent,
        focusAssets: feed.focusAssets,
        regionalContext: feed.regionalContext,
        countries,
        warnings: feed.meta.warnings,
        dateRange: {
          from: feed.dateRange.fromUtc.slice(0, 10),
          to: feed.dateRange.toUtc.slice(0, 10),
          fromUtc: feed.dateRange.fromUtc,
          toUtc: feed.dateRange.toUtc,
        },
        meta: feed.meta,
        lastUpdated: feed.meta.generatedAt,
      },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (error) {
    console.error('Economic calendar error:', error);
    return NextResponse.json({ error: 'Failed to fetch economic calendar' }, { status: 500 });
  }
}
