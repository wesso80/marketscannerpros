import { NextRequest, NextResponse } from "next/server";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "UI755FUUAM6FRRI9";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Detect asset type from symbol
function detectAssetType(symbol: string): 'crypto' | 'forex' | 'commodity' | 'stock' {
  const s = symbol.toUpperCase();
  
  // Crypto patterns
  const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LINK', 'AVAX', 'SHIB', 'LTC', 'UNI', 'ATOM', 'XLM', 'ALGO', 'VET', 'FIL', 'AAVE', 'EOS', 'XTZ', 'THETA', 'XMR', 'NEO', 'MKR', 'COMP', 'SNX', 'YFI', 'SUSHI', 'CRV', 'BAT', 'ZRX', 'ENJ', 'MANA', 'SAND', 'AXS', 'GALA', 'APE', 'GMT', 'OP', 'ARB', 'SUI', 'SEI', 'TIA', 'JUP', 'WIF', 'PEPE', 'BONK', 'FLOKI'];
  if (cryptoSymbols.includes(s) || s.endsWith('USDT') || s.endsWith('USD') && cryptoSymbols.some(c => s.startsWith(c))) {
    return 'crypto';
  }
  
  // Forex patterns
  const forexPairs = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY', 'HKD', 'SGD', 'SEK', 'NOK', 'MXN', 'ZAR', 'TRY', 'INR', 'BRL', 'KRW'];
  if (s.length === 6 && forexPairs.some(f => s.includes(f))) {
    return 'forex';
  }
  
  // Commodities
  const commodities = ['GOLD', 'SILVER', 'OIL', 'GAS', 'WHEAT', 'CORN', 'COPPER', 'PLATINUM', 'PALLADIUM', 'XAU', 'XAG', 'WTI', 'BRENT', 'NG'];
  if (commodities.some(c => s.includes(c))) {
    return 'commodity';
  }
  
  return 'stock';
}

// Fetch price data from appropriate source
async function fetchPriceData(symbol: string, assetType: string) {
  try {
    if (assetType === 'crypto') {
      // Use Binance for crypto
      const cleanSymbol = symbol.toUpperCase().replace(/[-\/]/g, '');
      const pair = cleanSymbol.endsWith('USDT') ? cleanSymbol : `${cleanSymbol}USDT`;
      
      const [tickerRes, klineRes] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`),
        fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=30`)
      ]);
      
      if (!tickerRes.ok) throw new Error('Binance API error');
      
      const ticker = await tickerRes.json();
      const klines = klineRes.ok ? await klineRes.json() : [];
      
      return {
        price: parseFloat(ticker.lastPrice),
        change: parseFloat(ticker.priceChange),
        changePercent: parseFloat(ticker.priceChangePercent),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.volume),
        quoteVolume: parseFloat(ticker.quoteVolume),
        historicalPrices: klines.map((k: any) => ({
          date: new Date(k[0]).toISOString().split('T')[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }))
      };
    } else {
      // Use Alpha Vantage for stocks/forex/commodities
      const func = assetType === 'forex' ? 'FX_DAILY' : 'TIME_SERIES_DAILY';
      const symbolParam = assetType === 'forex' 
        ? `from_symbol=${symbol.slice(0,3)}&to_symbol=${symbol.slice(3,6)}`
        : `symbol=${symbol}`;
      
      const url = `https://www.alphavantage.co/query?function=${func}&${symbolParam}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      
      const timeSeriesKey = Object.keys(data).find(k => k.includes('Time Series'));
      if (!timeSeriesKey) throw new Error('No time series data');
      
      const timeSeries = data[timeSeriesKey];
      const dates = Object.keys(timeSeries).sort().reverse();
      const latest = timeSeries[dates[0]];
      const previous = timeSeries[dates[1]];
      
      const price = parseFloat(latest['4. close']);
      const prevClose = parseFloat(previous['4. close']);
      
      return {
        price,
        change: price - prevClose,
        changePercent: ((price - prevClose) / prevClose) * 100,
        high24h: parseFloat(latest['2. high']),
        low24h: parseFloat(latest['3. low']),
        volume: parseFloat(latest['5. volume'] || '0'),
        historicalPrices: dates.slice(0, 30).map(d => ({
          date: d,
          open: parseFloat(timeSeries[d]['1. open']),
          high: parseFloat(timeSeries[d]['2. high']),
          low: parseFloat(timeSeries[d]['3. low']),
          close: parseFloat(timeSeries[d]['4. close']),
          volume: parseFloat(timeSeries[d]['5. volume'] || '0')
        }))
      };
    }
  } catch (err) {
    console.error('Price fetch error:', err);
    return null;
  }
}

// Fetch technical indicators
async function fetchTechnicalIndicators(symbol: string, assetType: string) {
  try {
    if (assetType === 'crypto') {
      // Calculate from Binance klines
      const pair = symbol.toUpperCase().replace(/[-\/]/g, '');
      const binanceSymbol = pair.endsWith('USDT') ? pair : `${pair}USDT`;
      
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=50`);
      if (!res.ok) return null;
      
      const klines = await res.json();
      const closes = klines.map((k: any) => parseFloat(k[4]));
      const highs = klines.map((k: any) => parseFloat(k[2]));
      const lows = klines.map((k: any) => parseFloat(k[3]));
      const volumes = klines.map((k: any) => parseFloat(k[5]));
      
      // Calculate indicators
      const sma20 = closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
      const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50 : null;
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const macd = ema12 - ema26;
      const rsi = calculateRSI(closes, 14);
      const { stochK, stochD } = calculateStochastic(closes, highs, lows, 14, 3);
      const atr = calculateATR(highs, lows, closes, 14);
      const avgVolume = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
      const volumeRatio = volumes[volumes.length - 1] / avgVolume;
      
      return {
        sma20,
        sma50,
        ema12,
        ema26,
        macd,
        rsi,
        stochK,
        stochD,
        atr,
        volumeRatio,
        priceVsSma20: ((closes[closes.length - 1] - sma20) / sma20) * 100,
        priceVsSma50: sma50 ? ((closes[closes.length - 1] - sma50) / sma50) * 100 : null,
      };
    } else {
      // Use Alpha Vantage for stocks
      const [rsiRes, macdRes, smaRes] = await Promise.all([
        fetch(`https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`),
        fetch(`https://www.alphavantage.co/query?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`),
        fetch(`https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=20&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`)
      ]);
      
      const rsiData = await rsiRes.json();
      const macdData = await macdRes.json();
      const smaData = await smaRes.json();
      
      const rsiValues = rsiData['Technical Analysis: RSI'];
      const macdValues = macdData['Technical Analysis: MACD'];
      const smaValues = smaData['Technical Analysis: SMA'];
      
      const latestRsi = rsiValues ? parseFloat((Object.values(rsiValues)[0] as any)?.RSI) || null : null;
      const latestMacd = macdValues ? Object.values(macdValues)[0] as any : null;
      const latestSma = smaValues ? parseFloat((Object.values(smaValues)[0] as any)?.SMA) || null : null;
      
      return {
        rsi: latestRsi,
        macd: latestMacd?.MACD ? parseFloat(latestMacd.MACD) : null,
        macdSignal: latestMacd?.MACD_Signal ? parseFloat(latestMacd.MACD_Signal) : null,
        macdHist: latestMacd?.MACD_Hist ? parseFloat(latestMacd.MACD_Hist) : null,
        sma20: latestSma,
      };
    }
  } catch (err) {
    console.error('Indicators fetch error:', err);
    return null;
  }
}

// Fetch company overview (for stocks)
async function fetchCompanyOverview(symbol: string) {
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`);
    const data = await res.json();
    
    if (!data.Symbol) return null;
    
    return {
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      marketCap: data.MarketCapitalization,
      peRatio: data.PERatio !== 'None' ? parseFloat(data.PERatio) : null,
      forwardPE: data.ForwardPE !== 'None' ? parseFloat(data.ForwardPE) : null,
      eps: data.EPS !== 'None' ? parseFloat(data.EPS) : null,
      dividendYield: data.DividendYield !== 'None' ? parseFloat(data.DividendYield) * 100 : null,
      week52High: data['52WeekHigh'] !== 'None' ? parseFloat(data['52WeekHigh']) : null,
      week52Low: data['52WeekLow'] !== 'None' ? parseFloat(data['52WeekLow']) : null,
      targetPrice: data.AnalystTargetPrice !== 'None' ? parseFloat(data.AnalystTargetPrice) : null,
      strongBuy: parseInt(data.AnalystRatingStrongBuy) || 0,
      buy: parseInt(data.AnalystRatingBuy) || 0,
      hold: parseInt(data.AnalystRatingHold) || 0,
      sell: parseInt(data.AnalystRatingSell) || 0,
      strongSell: parseInt(data.AnalystRatingStrongSell) || 0,
    };
  } catch (err) {
    return null;
  }
}

// Fetch news sentiment
async function fetchNewsSentiment(symbol: string, assetType: string) {
  try {
    if (assetType === 'crypto') {
      // Use CryptoCompare for crypto news
      return await fetchCryptoNews(symbol);
    }
    
    // Use Alpha Vantage for stocks
    const res = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=5&apikey=${ALPHA_VANTAGE_API_KEY}`);
    const data = await res.json();
    
    if (!data.feed) return null;
    
    return data.feed.slice(0, 5).map((article: any) => ({
      title: article.title,
      summary: article.summary,
      source: article.source,
      sentiment: article.overall_sentiment_label,
      sentimentScore: parseFloat(article.overall_sentiment_score),
      url: article.url,
      publishedAt: article.time_published
    }));
  } catch (err) {
    return null;
  }
}

// Fetch crypto news from multiple sources
async function fetchCryptoNews(symbol: string) {
  const cleanSymbol = symbol.toUpperCase().replace('USDT', '').replace('USD', '');
  
  try {
    // Try CryptoCompare News API (free, no key required for basic)
    const ccRes = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?categories=${cleanSymbol}&excludeCategories=Sponsored`);
    const ccData = await ccRes.json();
    
    if (ccData.Data && ccData.Data.length > 0) {
      return ccData.Data.slice(0, 5).map((article: any) => {
        // Simple sentiment analysis based on keywords
        const text = (article.title + ' ' + article.body).toLowerCase();
        let sentiment = 'Neutral';
        let sentimentScore = 0;
        
        const bullishWords = ['bullish', 'surge', 'rally', 'soar', 'gain', 'rise', 'up', 'high', 'record', 'breakout', 'buy', 'positive', 'growth'];
        const bearishWords = ['bearish', 'crash', 'drop', 'fall', 'plunge', 'decline', 'down', 'low', 'sell', 'negative', 'fear', 'dump', 'loss'];
        
        let bullCount = bullishWords.filter(w => text.includes(w)).length;
        let bearCount = bearishWords.filter(w => text.includes(w)).length;
        
        if (bullCount > bearCount + 1) {
          sentiment = 'Bullish';
          sentimentScore = Math.min(0.5, bullCount * 0.1);
        } else if (bearCount > bullCount + 1) {
          sentiment = 'Bearish';
          sentimentScore = Math.max(-0.5, -bearCount * 0.1);
        }
        
        return {
          title: article.title,
          summary: article.body?.slice(0, 200) || '',
          source: article.source_info?.name || article.source || 'CryptoCompare',
          sentiment,
          sentimentScore,
          url: article.url || article.guid,
          publishedAt: new Date(article.published_on * 1000).toISOString()
        };
      });
    }
    
    // Fallback: Try Alpha Vantage with crypto topic
    const avRes = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=blockchain,cryptocurrency&limit=5&apikey=${ALPHA_VANTAGE_API_KEY}`);
    const avData = await avRes.json();
    
    if (avData.feed) {
      return avData.feed.slice(0, 5).map((article: any) => ({
        title: article.title,
        summary: article.summary,
        source: article.source,
        sentiment: article.overall_sentiment_label,
        sentimentScore: parseFloat(article.overall_sentiment_score),
        url: article.url,
        publishedAt: article.time_published
      }));
    }
    
    return null;
  } catch (err) {
    console.error('Crypto news fetch error:', err);
    return null;
  }
}

// Fetch crypto-specific data
async function fetchCryptoData(symbol: string) {
  try {
    // Fear & Greed Index
    const fgRes = await fetch('https://api.alternative.me/fng/?limit=1');
    const fgData = await fgRes.json();
    
    // Try to get market data from CoinGecko
    const cgSymbol = symbol.toLowerCase().replace('usdt', '').replace('usd', '');
    const cgMapping: Record<string, string> = {
      'btc': 'bitcoin', 'eth': 'ethereum', 'xrp': 'ripple', 'sol': 'solana',
      'ada': 'cardano', 'doge': 'dogecoin', 'dot': 'polkadot', 'matic': 'polygon',
      'link': 'chainlink', 'avax': 'avalanche-2', 'shib': 'shiba-inu', 'ltc': 'litecoin'
    };
    
    let marketData = null;
    const cgId = cgMapping[cgSymbol];
    if (cgId) {
      try {
        const cgRes = await fetch(`https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&community_data=false&developer_data=false`);
        if (cgRes.ok) {
          const cgData = await cgRes.json();
          marketData = {
            marketCapRank: cgData.market_cap_rank,
            marketCap: cgData.market_data?.market_cap?.usd,
            totalVolume: cgData.market_data?.total_volume?.usd,
            circulatingSupply: cgData.market_data?.circulating_supply,
            maxSupply: cgData.market_data?.max_supply,
            ath: cgData.market_data?.ath?.usd,
            athChangePercent: cgData.market_data?.ath_change_percentage?.usd,
            atl: cgData.market_data?.atl?.usd,
          };
        }
      } catch {}
    }
    
    return {
      fearGreed: {
        value: parseInt(fgData.data[0].value),
        classification: fgData.data[0].value_classification
      },
      marketData
    };
  } catch (err) {
    return null;
  }
}

// Fetch earnings data for stocks
async function fetchEarningsData(symbol: string) {
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (!data.annualEarnings && !data.quarterlyEarnings) {
      return null;
    }
    
    // Get upcoming and recent earnings
    const quarterly = data.quarterlyEarnings || [];
    const annual = data.annualEarnings || [];
    
    // Find the next upcoming report (estimated dates)
    const now = new Date();
    const upcoming = quarterly.find((e: any) => {
      const reportDate = new Date(e.reportedDate || e.fiscalDateEnding);
      return reportDate > now;
    });
    
    // Get most recent 4 quarters for history
    const recentQuarters = quarterly.slice(0, 4).map((q: any) => ({
      fiscalDateEnding: q.fiscalDateEnding,
      reportedDate: q.reportedDate,
      reportedEPS: parseFloat(q.reportedEPS) || null,
      estimatedEPS: parseFloat(q.estimatedEPS) || null,
      surprise: q.reportedEPS && q.estimatedEPS 
        ? parseFloat(q.reportedEPS) - parseFloat(q.estimatedEPS) 
        : null,
      surprisePercent: q.surprisePercentage ? parseFloat(q.surprisePercentage) : null,
      beat: q.reportedEPS && q.estimatedEPS 
        ? parseFloat(q.reportedEPS) > parseFloat(q.estimatedEPS) 
        : null
    }));
    
    // Calculate beat rate
    const beatsCount = recentQuarters.filter((q: any) => q.beat === true).length;
    const beatRate = recentQuarters.length > 0 ? (beatsCount / recentQuarters.length) * 100 : null;
    
    // Get last reported
    const lastReported = recentQuarters[0];
    
    return {
      nextEarningsDate: upcoming?.fiscalDateEnding || null,
      lastReportedDate: lastReported?.reportedDate || null,
      lastReportedEPS: lastReported?.reportedEPS || null,
      lastEstimatedEPS: lastReported?.estimatedEPS || null,
      lastSurprise: lastReported?.surprise || null,
      lastSurprisePercent: lastReported?.surprisePercent || null,
      lastBeat: lastReported?.beat || null,
      beatRate,
      recentQuarters,
      annualEPS: annual.slice(0, 3).map((a: any) => ({
        fiscalYear: a.fiscalDateEnding?.split('-')[0],
        eps: parseFloat(a.reportedEPS) || null
      }))
    };
  } catch (err) {
    console.error('Earnings fetch error:', err);
    return null;
  }
}

// Generate AI analysis
async function generateAIAnalysis(data: any) {
  if (!OPENAI_API_KEY) return null;
  
  try {
    const prompt = buildAnalysisPrompt(data);
    
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
            content: `You are the Golden Egg Analyst - an elite financial analyst providing comprehensive, actionable analysis by synthesizing ALL available data including price action, technicals, fundamentals, news sentiment, and market conditions.

Your analysis MUST consider and integrate:
- Price action and momentum (current price, 24h change, volume)
- Technical indicators (RSI, MACD, moving averages, stochastics)
- Company fundamentals (if stock: P/E, EPS, analyst targets, sector)
- News sentiment (summarize the overall sentiment from recent news)
- Market conditions (Fear & Greed for crypto, analyst consensus for stocks)
- Upcoming catalysts (earnings dates, significant events from news)

Format your analysis with these sections:
📊 MARKET CONTEXT - Big picture: what's driving this asset right now?
📈 TECHNICAL OUTLOOK - Indicator confluence and what the charts are saying
📰 SENTIMENT ANALYSIS - What the news flow and market sentiment suggest
🎯 KEY LEVELS - Critical support/resistance and price targets
⚠️ RISK FACTORS - What could invalidate this thesis?
💡 GOLDEN EGG VERDICT - Clear BUY/HOLD/SELL with confidence level (High/Medium/Low) and 1-2 sentence reasoning

Be bold with your verdict. Traders want clear direction, not wishy-washy analysis.
Max 500 words. Be concise but comprehensive.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });
    
    const result = await res.json();
    return result.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('AI analysis error:', err);
    return null;
  }
}

function buildAnalysisPrompt(data: any): string {
  let prompt = `Analyze ${data.symbol} (${data.assetType.toUpperCase()}):\n\n`;
  
  if (data.price) {
    prompt += `PRICE DATA:\n`;
    prompt += `- Current: $${data.price.price?.toFixed(data.assetType === 'crypto' ? 4 : 2)}\n`;
    prompt += `- 24h Change: ${data.price.changePercent?.toFixed(2)}%\n`;
    prompt += `- 24h High: $${data.price.high24h?.toFixed(2)}\n`;
    prompt += `- 24h Low: $${data.price.low24h?.toFixed(2)}\n\n`;
  }
  
  if (data.indicators) {
    prompt += `TECHNICAL INDICATORS:\n`;
    if (data.indicators.rsi) prompt += `- RSI(14): ${data.indicators.rsi.toFixed(1)}\n`;
    if (data.indicators.macd) prompt += `- MACD: ${data.indicators.macd.toFixed(4)}\n`;
    if (data.indicators.sma20) prompt += `- SMA20: $${data.indicators.sma20.toFixed(2)}\n`;
    if (data.indicators.priceVsSma20) prompt += `- Price vs SMA20: ${data.indicators.priceVsSma20.toFixed(2)}%\n`;
    if (data.indicators.stochK) prompt += `- Stochastic: K=${data.indicators.stochK.toFixed(1)}, D=${data.indicators.stochD?.toFixed(1)}\n`;
    if (data.indicators.volumeRatio) prompt += `- Volume Ratio (vs 20d avg): ${data.indicators.volumeRatio.toFixed(2)}x\n`;
    prompt += '\n';
  }
  
  if (data.company) {
    prompt += `COMPANY DATA:\n`;
    prompt += `- Name: ${data.company.name}\n`;
    prompt += `- Sector: ${data.company.sector}\n`;
    if (data.company.peRatio) prompt += `- P/E: ${data.company.peRatio}\n`;
    if (data.company.eps) prompt += `- EPS: $${data.company.eps}\n`;
    if (data.company.targetPrice) prompt += `- Analyst Target: $${data.company.targetPrice}\n`;
    if (data.company.week52High) prompt += `- 52W Range: $${data.company.week52Low} - $${data.company.week52High}\n`;
    prompt += '\n';
  }
  
  if (data.cryptoData?.fearGreed) {
    prompt += `CRYPTO MARKET:\n`;
    prompt += `- Fear & Greed: ${data.cryptoData.fearGreed.value} (${data.cryptoData.fearGreed.classification})\n`;
    if (data.cryptoData.marketData?.marketCapRank) {
      prompt += `- Market Cap Rank: #${data.cryptoData.marketData.marketCapRank}\n`;
    }
    prompt += '\n';
  }
  
  if (data.earnings) {
    prompt += `EARNINGS DATA:\n`;
    if (data.earnings.nextEarningsDate) {
      prompt += `- Next Earnings: ${data.earnings.nextEarningsDate}\n`;
    }
    if (data.earnings.lastReportedEPS !== null) {
      prompt += `- Last EPS: $${data.earnings.lastReportedEPS?.toFixed(2)} (Est: $${data.earnings.lastEstimatedEPS?.toFixed(2)})\n`;
      prompt += `- Last Surprise: ${data.earnings.lastBeat ? '✅ BEAT' : '❌ MISS'} by ${data.earnings.lastSurprisePercent?.toFixed(1)}%\n`;
    }
    if (data.earnings.beatRate !== null) {
      prompt += `- Beat Rate (last 4Q): ${data.earnings.beatRate.toFixed(0)}%\n`;
    }
    prompt += '\n';
  }
  
  if (data.news?.length > 0) {
    prompt += `RECENT NEWS & SENTIMENT:\n`;
    // Calculate overall sentiment
    const sentiments = data.news.map((n: any) => n.sentiment?.toLowerCase() || 'neutral');
    const bullishCount = sentiments.filter((s: string) => s.includes('bullish')).length;
    const bearishCount = sentiments.filter((s: string) => s.includes('bearish')).length;
    const neutralCount = sentiments.filter((s: string) => !s.includes('bullish') && !s.includes('bearish')).length;
    
    prompt += `- Overall Sentiment: ${bullishCount} Bullish, ${bearishCount} Bearish, ${neutralCount} Neutral\n`;
    prompt += `- Headlines:\n`;
    data.news.slice(0, 5).forEach((n: any, i: number) => {
      prompt += `  ${i+1}. [${n.sentiment || 'Neutral'}] "${n.title}" (${n.source})\n`;
      if (n.summary) {
        prompt += `     Summary: ${n.summary.slice(0, 100)}...\n`;
      }
    });
    prompt += '\n';
  }
  
  prompt += `Based on ALL the data above, provide a comprehensive Golden Egg analysis with a clear, actionable verdict.`;
  
  return prompt;
}

// Helper functions for technical indicators
function calculateEMA(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(closes: number[], period: number): number {
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  return 100 - (100 / (1 + rs));
}

function calculateStochastic(closes: number[], highs: number[], lows: number[], kPeriod: number, dPeriod: number) {
  const recentCloses = closes.slice(-kPeriod);
  const recentHighs = highs.slice(-kPeriod);
  const recentLows = lows.slice(-kPeriod);
  
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  const currentClose = closes[closes.length - 1];
  
  const stochK = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  const stochD = stochK; // Simplified
  
  return { stochK, stochD };
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Generate trading signals
function generateSignals(data: any): { signal: string; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let bullish = 0;
  let bearish = 0;
  
  if (data.indicators) {
    const ind = data.indicators;
    
    // RSI signals
    if (ind.rsi !== null && ind.rsi !== undefined) {
      if (ind.rsi < 30) { bullish += 2; reasons.push('RSI oversold (<30)'); }
      else if (ind.rsi < 40) { bullish += 1; reasons.push('RSI approaching oversold'); }
      else if (ind.rsi > 70) { bearish += 2; reasons.push('RSI overbought (>70)'); }
      else if (ind.rsi > 60) { bearish += 1; reasons.push('RSI elevated'); }
    }
    
    // MACD signals
    if (ind.macd !== null && ind.macd !== undefined) {
      if (ind.macd > 0) { bullish += 1; reasons.push('MACD positive'); }
      else { bearish += 1; reasons.push('MACD negative'); }
    }
    
    // Price vs SMA
    if (ind.priceVsSma20 !== null && ind.priceVsSma20 !== undefined) {
      if (ind.priceVsSma20 > 5) { bullish += 1; reasons.push('Price above SMA20'); }
      else if (ind.priceVsSma20 < -5) { bearish += 1; reasons.push('Price below SMA20'); }
    }
    
    // Volume
    if (ind.volumeRatio !== null && ind.volumeRatio !== undefined) {
      if (ind.volumeRatio > 1.5) { reasons.push('High volume activity'); }
    }
    
    // Stochastic
    if (ind.stochK !== null && ind.stochK !== undefined) {
      if (ind.stochK < 20) { bullish += 1; reasons.push('Stochastic oversold'); }
      else if (ind.stochK > 80) { bearish += 1; reasons.push('Stochastic overbought'); }
    }
  }
  
  // Price momentum
  if (data.price?.changePercent !== null && data.price?.changePercent !== undefined) {
    if (data.price.changePercent > 5) { bullish += 1; reasons.push('Strong upward momentum'); }
    else if (data.price.changePercent < -5) { bearish += 1; reasons.push('Strong downward momentum'); }
  }
  
  // Crypto fear/greed
  if (data.cryptoData?.fearGreed) {
    const fg = data.cryptoData.fearGreed.value;
    if (fg < 25) { bullish += 1; reasons.push('Extreme Fear (contrarian bullish)'); }
    else if (fg > 75) { bearish += 1; reasons.push('Extreme Greed (contrarian bearish)'); }
  }
  
  // Analyst consensus (stocks)
  if (data.company) {
    const totalAnalysts = (data.company.strongBuy || 0) + (data.company.buy || 0) + 
                          (data.company.hold || 0) + (data.company.sell || 0) + (data.company.strongSell || 0);
    if (totalAnalysts > 0) {
      const buyPercent = ((data.company.strongBuy || 0) + (data.company.buy || 0)) / totalAnalysts;
      if (buyPercent > 0.7) { bullish += 1; reasons.push('Strong analyst buy consensus'); }
      else if (buyPercent < 0.3) { bearish += 1; reasons.push('Analyst sell consensus'); }
    }
  }
  
  const score = bullish - bearish;
  let signal = 'NEUTRAL';
  if (score >= 3) signal = 'STRONG BUY';
  else if (score >= 1) signal = 'BUY';
  else if (score <= -3) signal = 'STRONG SELL';
  else if (score <= -1) signal = 'SELL';
  
  return { signal, score, reasons };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();
    
    if (!symbol) {
      return NextResponse.json({ success: false, error: "Symbol is required" });
    }
    
    const assetType = detectAssetType(symbol);
    
    // Fetch all data in parallel
    const [price, indicators, company, news, cryptoData, earnings] = await Promise.all([
      fetchPriceData(symbol, assetType),
      fetchTechnicalIndicators(symbol, assetType),
      assetType === 'stock' ? fetchCompanyOverview(symbol) : null,
      fetchNewsSentiment(symbol, assetType),
      assetType === 'crypto' ? fetchCryptoData(symbol) : null,
      assetType === 'stock' ? fetchEarningsData(symbol) : null,
    ]);
    
    if (!price) {
      return NextResponse.json({ 
        success: false, 
        error: `Unable to fetch data for ${symbol}. Please check the symbol and try again.` 
      });
    }
    
    const analysisData = {
      symbol,
      assetType,
      price,
      indicators,
      company,
      news,
      cryptoData,
      earnings
    };
    
    // Generate signals
    const signals = generateSignals(analysisData);
    
    // Generate AI analysis
    const aiAnalysis = await generateAIAnalysis(analysisData);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      symbol,
      assetType,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      price,
      indicators,
      company,
      news,
      cryptoData,
      earnings,
      signals,
      aiAnalysis
    });
  } catch (error) {
    console.error("Deep analysis error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Analysis failed"
    }, { status: 500 });
  }
}
