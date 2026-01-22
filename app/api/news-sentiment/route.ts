import { NextRequest, NextResponse } from 'next/server';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// List of known crypto symbols
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LINK', 'AVAX', 'SHIB', 'LTC', 'UNI', 'ATOM', 'XLM', 'ALGO', 'VET', 'FIL', 'AAVE', 'EOS', 'XTZ', 'THETA', 'XMR', 'NEO', 'MKR', 'COMP', 'SNX', 'YFI', 'SUSHI', 'CRV', 'BAT', 'ZRX', 'ENJ', 'MANA', 'SAND', 'AXS', 'GALA', 'APE', 'GMT', 'OP', 'ARB', 'SUI', 'SEI', 'TIA', 'JUP', 'WIF', 'PEPE', 'BONK', 'FLOKI'];

function isCryptoTicker(ticker: string): boolean {
  const clean = ticker.toUpperCase().replace('USDT', '').replace('USD', '').replace('-', '');
  return CRYPTO_SYMBOLS.includes(clean);
}

// Fetch crypto news from CryptoCompare
async function fetchCryptoNews(symbols: string[]): Promise<any[]> {
  const articles: any[] = [];
  
  for (const symbol of symbols.slice(0, 3)) { // Limit to 3 symbols to avoid rate limits
    const cleanSymbol = symbol.toUpperCase().replace('USDT', '').replace('USD', '');
    try {
      const res = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?categories=${cleanSymbol}&excludeCategories=Sponsored`);
      const data = await res.json();
      
      if (data.Data) {
        data.Data.slice(0, 10).forEach((article: any) => {
          // Simple sentiment analysis
          const text = (article.title + ' ' + article.body).toLowerCase();
          const bullishWords = ['bullish', 'surge', 'rally', 'soar', 'gain', 'rise', 'up', 'high', 'record', 'breakout', 'buy', 'positive', 'growth', 'moon', 'pump'];
          const bearishWords = ['bearish', 'crash', 'drop', 'fall', 'plunge', 'decline', 'down', 'low', 'sell', 'negative', 'fear', 'dump', 'loss', 'tank'];
          
          let bullCount = bullishWords.filter(w => text.includes(w)).length;
          let bearCount = bearishWords.filter(w => text.includes(w)).length;
          
          let sentimentLabel = 'Neutral';
          let sentimentScore = 0;
          if (bullCount > bearCount + 1) {
            sentimentLabel = bullCount > bearCount + 2 ? 'Bullish' : 'Somewhat-Bullish';
            sentimentScore = Math.min(0.5, bullCount * 0.08);
          } else if (bearCount > bullCount + 1) {
            sentimentLabel = bearCount > bullCount + 2 ? 'Bearish' : 'Somewhat-Bearish';
            sentimentScore = Math.max(-0.5, -bearCount * 0.08);
          }
          
          articles.push({
            title: article.title,
            url: article.url || article.guid,
            timePublished: new Date(article.published_on * 1000).toISOString().replace(/[-:]/g, '').split('.')[0],
            summary: article.body?.slice(0, 300) || '',
            source: article.source_info?.name || article.source || 'CryptoCompare',
            sentiment: {
              label: sentimentLabel,
              score: sentimentScore,
            },
            tickerSentiments: [{
              ticker: cleanSymbol,
              relevance: 1.0,
              sentimentScore,
              sentimentLabel,
            }],
          });
        });
      }
    } catch (err) {
      console.error(`Error fetching crypto news for ${symbol}:`, err);
    }
  }
  
  return articles;
}

// Generate AI analysis of all articles
async function generateAINewsAnalysis(articles: any[], tickers: string): Promise<string | null> {
  if (!OPENAI_API_KEY || articles.length === 0) return null;
  
  try {
    // Summarize articles for the prompt
    const articleSummaries = articles.slice(0, 15).map((a, i) => 
      `${i+1}. [${a.sentiment.label}] "${a.title}" (${a.source})\n   ${a.summary?.slice(0, 150) || 'No summary'}...`
    ).join('\n');
    
    // Calculate overall sentiment
    const bullish = articles.filter(a => a.sentiment.label.toLowerCase().includes('bullish')).length;
    const bearish = articles.filter(a => a.sentiment.label.toLowerCase().includes('bearish')).length;
    const neutral = articles.length - bullish - bearish;
    
    const prompt = `Analyze the following ${articles.length} news articles about ${tickers.toUpperCase()}:

SENTIMENT BREAKDOWN:
- Bullish: ${bullish} articles (${((bullish/articles.length)*100).toFixed(0)}%)
- Bearish: ${bearish} articles (${((bearish/articles.length)*100).toFixed(0)}%)
- Neutral: ${neutral} articles (${((neutral/articles.length)*100).toFixed(0)}%)

RECENT HEADLINES:
${articleSummaries}

Based on this news flow, provide:
1. **Overall Sentiment**: Is the news predominantly bullish, bearish, or mixed?
2. **Key Themes**: What are the 2-3 main narratives driving coverage?
3. **Notable Events**: Any significant news that traders should watch?
4. **Market Impact**: How might this news affect price action?
5. **Risk Factors**: Any concerning stories or negative catalysts?

Be concise and actionable. Max 300 words.`;

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
            content: 'You are a financial news analyst providing concise, actionable market intelligence. Focus on what matters for traders. Use emojis sparingly for visual hierarchy.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });
    
    const result = await res.json();
    return result.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('AI news analysis error:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickers = searchParams.get('tickers') || 'AAPL,MSFT,GOOGL';
  const limit = searchParams.get('limit') || '50';
  const includeAI = searchParams.get('includeAI') === 'true';
  
  try {
    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
    const cryptoTickers = tickerList.filter(isCryptoTicker);
    const stockTickers = tickerList.filter(t => !isCryptoTicker(t));
    
    let allArticles: any[] = [];
    
    // Fetch stock news from Alpha Vantage
    if (stockTickers.length > 0) {
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${stockTickers.join(',')}&limit=${limit}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data['Error Message'] && !data['Note'] && data.feed) {
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
    
    // Fetch crypto news from CryptoCompare
    if (cryptoTickers.length > 0) {
      const cryptoArticles = await fetchCryptoNews(cryptoTickers);
      allArticles = [...allArticles, ...cryptoArticles];
    }
    
    // If no tickers matched, try Alpha Vantage as fallback for general crypto news
    if (allArticles.length === 0 && cryptoTickers.length > 0) {
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=blockchain,cryptocurrency&limit=${limit}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.feed) {
        allArticles = data.feed.map((article: any) => ({
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
