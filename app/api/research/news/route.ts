import { sectionEvidenceToken } from '@/lib/ai/sectionEvidenceAccess';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { detectAssetClass } from '@/lib/goldenEggFetchers';
import { getFundamentalsSummary } from '@/lib/goldenEgg/companyOverview';
import { cryptoNewsName } from '@/lib/crypto/newsRelevance';
import { buildSymbolNews, fetchSymbolNewsFeed } from '@/lib/research/newsEvidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Symbol-specific news, grouped by event, for the Symbol page (same feed and rule as Deep Analysis). */
export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ success: false, error: 'Please log in' }, { status: 401 });
  if (!hasPaidSessionAccess(session)) return NextResponse.json({ success: false, error: 'Pro access required' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-:/]{1,20}$/.test(symbol)) return NextResponse.json({ success: false, error: 'Missing or invalid symbol' }, { status: 400 });
  const assetClass = detectAssetClass(symbol, searchParams.get('type') || undefined);
  if (assetClass === 'forex') return NextResponse.json({ success: false, error: 'Symbol news is not available for forex pairs' }, { status: 400 });
  const [feed, fundamentals] = await Promise.all([
    fetchSymbolNewsFeed(symbol, assetClass),
    assetClass === 'equity' ? getFundamentalsSummary(symbol).catch(() => null) : Promise.resolve(null),
  ]);
  const companyName = assetClass === 'equity' ? fundamentals?.name ?? null : cryptoNewsName(symbol);
  const news=buildSymbolNews(symbol,assetClass,feed,companyName);
  const evidence={symbol:news.symbol,status:news.status,provider:news.provider,rule:news.rule,fetchedAt:news.fetchedAt,reason:news.reason ?? null,events:news.events.map(e=>({headline:e.headline,articles:e.articles,sources:e.sources,firstPublishedAt:e.firstPublishedAt,lastPublishedAt:e.lastPublishedAt}))};
  return NextResponse.json({success:true,news,copilotEvidenceToken:await sectionEvidenceToken('news',symbol,assetClass,evidence)},{headers:{'Cache-Control':'private, no-store'}});
}
