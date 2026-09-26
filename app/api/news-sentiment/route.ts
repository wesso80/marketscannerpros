import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { deepAnalysisLimiter, getClientIP } from '@/lib/rateLimit';
import { buildNewsBriefPrompt, NEWS_BRIEF_SYSTEM_PROMPT, stripAdviceSentences } from '@/lib/news/newsBrief';

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
    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
    const cryptoTickers = tickerList.filter(isCryptoTicker);
    const stockTickers = tickerList.filter(t => !isCryptoTicker(t));
    
    let allArticles: any[] = [];
    
    // Use provider ticker identity for both assets; topic-only news is not candidate evidence.
    const providerTickers = [...stockTickers, ...cryptoTickers.map(t => `CRYPTO:${t.replace(/^CRYPTO:/, '').replace(/[-/]?USDT?$/, '')}`)];
    if (providerTickers.length > 0) {
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(providerTickers.join(','))}&limit=${limit}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      
      await avTakeToken();
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      
      if (!response.ok || data['Error Message'] || data['Note'] || data['Information'] || !Array.isArray(data.feed)) {
        return NextResponse.json({ error: 'News provider unavailable; candidate evidence could not be verified.' }, { status: 503 });
      }
      if (data.feed) {
        const stockArticles = data.feed.map((article: any) => ({
          title: article.title,
          url: article.url,
          timePublished: article.time_published,
          summary: article.summary,
          source: article.source,
          sentiment: {
            label: article.overall_sentiment_label,
            score: parseFloat(article.overall_sentiment_score),
          },
          tickerSentiments: article.ticker_sentiment?.map((ts: any) => ({
            ticker: ts.ticker,
            relevance: parseFloat(ts.relevance_score),
            sentimentScore: parseFloat(ts.ticker_sentiment_score),
            sentimentLabel: ts.ticker_sentiment_label,
          })) || [],
        }));
        allArticles = [...allArticles, ...stockArticles];
      }
    }
    
    // Sort by date (newest first)
    allArticles.sort((a, b) => {
      const dateA = a.timePublished || '';
      const dateB = b.timePublished || '';
      return dateB.localeCompare(dateA);
    });
    
    // Limit results
    allArticles = allArticles.slice(0, parseInt(limit));
    
    // Generate AI analysis if requested
    let aiAnalysis = null;
    if (includeAI && allArticles.length > 0) {
      aiAnalysis = await generateAINewsAnalysis(allArticles, tickers);
    }
    
    return NextResponse.json({
      success: true,
      articlesCount: allArticles.length,
      articles: allArticles,
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
