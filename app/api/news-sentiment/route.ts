import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { deepAnalysisLimiter, getClientIP } from '@/lib/rateLimit';
import { buildNewsBriefPrompt, NEWS_BRIEF_SYSTEM_PROMPT, stripAdviceSentences } from '@/lib/news/newsBrief';
import { avNewsFeedError, buildTickerNews, NEWS_MAX_TICKERS, NEWS_RELEVANCE_RULE, type RequestedNewsTicker, type TickerFeedResult } from '@/lib/news/tickerNewsFeed';
import { cryptoNewsName } from '@/lib/crypto/newsRelevance';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Comprehensive crypto list - top 150+ by market cap
const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'TRX', 'AVAX', 'LINK', 'DOT',
  'MATIC', 'SHIB', 'LTC', 'BCH', 'NEAR', 'UNI', 'ATOM', 'XLM', 'ICP', 'HBAR',
  'FIL', 'VET', 'IMX', 'APT', 'GRT', 'INJ', 'OP', 'THETA', 'FTM', 'RUNE',
  'LDO', 'ALGO', 'XMR', 'AAVE', 'MKR', 'STX', 'EGLD', 'FLOW', 'AXS', 'SAND',
  'EOS', 'XTZ', 'NEO', 'KAVA', 'CFX', 'MINA', 'SNX', 'CRV', 'DYDX', 'BLUR',
  'AR', 'SUI', 'SEI', 'TIA', 'JUP', 'WIF', 'PEPE', 'BONK', 'FLOKI', 'MEME',
  'ORDI', 'PYTH', 'WLD', 'FET', 'RNDR', 'AGIX', 'OCEAN', 'TAO', 'ROSE', 'ZIL',
  'IOTA', 'ZEC', 'DASH', 'BAT', 'ZRX', 'ENJ', 'MANA', 'GALA', 'APE', 'GMT', 'ARB'
];

function isCryptoTicker(ticker: string): boolean {
  const clean = ticker.toUpperCase().replace(/^CRYPTO:/, '').replace(/[-/]?USDT?$/, '');
  return CRYPTO_SYMBOLS.includes(clean);
}

// Generate AI analysis of all articles
async function generateAINewsAnalysis(articles: any[], tickers: string): Promise<string | null> {
  if (!OPENAI_API_KEY || articles.length === 0) return null;
  
  try {
    // Descriptive-only prompt (describe, never direct the reader); see lib/news/newsBrief.ts.
    const prompt = buildNewsBriefPrompt(articles, tickers);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: NEWS_BRIEF_SYSTEM_PROMPT
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    });
    
    const result = await res.json();
    // Belt and braces: drop any sentence that still reads as a direction to the reader.
    return stripAdviceSentences(result.choices?.[0]?.message?.content || null);
  } catch (err) {
    console.error('AI news analysis error:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Allow anonymous access for dashboard headlines (default tickers)
  const session = await getSessionFromCookie();

  // Rate limit: expensive endpoint (AV + OpenAI)
  const ip = getClientIP(request);
  const rateCheck = deepAnalysisLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const tickers = searchParams.get('tickers') || 'AAPL,MSFT,GOOGL';
  const limit = String(Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50)));
  const includeAI = searchParams.get('includeAI') === 'true';
  
  try {
    const tickerList = [...new Set(tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))];
    // One provider ticker identity per requested symbol; topic-only news is not candidate evidence.
    const requested: RequestedNewsTicker[] = tickerList.slice(0, NEWS_MAX_TICKERS).map((t) => {
      if (!isCryptoTicker(t)) return { ticker: t, providerKey: t, name: null };
      const sym = t.replace(/^CRYPTO:/, '').replace(/[-/]?USDT?$/, '');
      return { ticker: sym, providerKey: `CRYPTO:${sym}`, name: cryptoNewsName(sym) };
    });
    const ignoredTickers = tickerList.slice(NEWS_MAX_TICKERS);

    // AV ANDs comma-separated tickers (articles mentioning ALL of them), so each ticker gets its own call (MV-2).
    const results: Record<string, TickerFeedResult> = {};
    await Promise.all(requested.map(async (req) => {
      try {
        const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(req.providerKey)}&sort=LATEST&limit=50&apikey=${ALPHA_VANTAGE_API_KEY}`;
        await avTakeToken();
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await response.json().catch(() => null);
        const error = avNewsFeedError(response.ok, response.status, data);
        results[req.providerKey] = error ? { error } : { feed: data.feed };
      } catch (err: any) {
        results[req.providerKey] = { error: err?.name === 'TimeoutError' ? 'Alpha Vantage timed out' : 'Alpha Vantage request failed' };
      }
    }));

    const { articles: relevantArticles, tickerSummaries, considered } = buildTickerNews(requested, results, parseInt(limit));
    const filter = { rule: NEWS_RELEVANCE_RULE, considered, kept: relevantArticles.length, ignoredTickers };
    const failed = requested.filter((req) => 'error' in (results[req.providerKey] ?? { error: '' }));
    if (requested.length > 0 && failed.length === requested.length) {
      const reasons = [...new Set(failed.map((req) => (results[req.providerKey] as { error: string }).error))].join('; ');
      return NextResponse.json({ error: `News provider unavailable (${reasons}); candidate evidence could not be verified.`, tickerSummaries, filter }, { status: 503 });
    }
    const allArticles = relevantArticles;

    // Generate AI analysis if requested
    let aiAnalysis = null;
    if (includeAI && allArticles.length > 0) {
      aiAnalysis = await generateAINewsAnalysis(allArticles, tickers);
    }
    
    return NextResponse.json({
      success: true,
      articlesCount: allArticles.length,
      articles: allArticles,
      tickerSummaries,
      filter,
      aiAnalysis,
    });
  } catch (error) {
    console.error('News sentiment error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news & sentiments' },
      { status: 500 }
    );
  }
}
