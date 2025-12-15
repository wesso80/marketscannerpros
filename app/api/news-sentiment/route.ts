import { NextRequest, NextResponse } from 'next/server';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickers = searchParams.get('tickers') || 'AAPL,MSFT,GOOGL';
  const limit = searchParams.get('limit') || '50';
  
  try {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${tickers}&limit=${limit}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data['Error Message'] || data['Note']) {
      return NextResponse.json(
        { error: data['Error Message'] || data['Note'] },
        { status: 429 }
      );
    }
    
    const feed = data.feed || [];
    const articles = feed.map((article: any) => ({
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
    
    return NextResponse.json({
      success: true,
      articlesCount: articles.length,
      articles,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch news & sentiments' },
      { status: 500 }
    );
  }
}
