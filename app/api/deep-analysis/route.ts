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
      
      const latestRsi = rsiValues ? parseFloat(Object.values(rsiValues)[0] as any)?.RSI || null : null;
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
async function fetchNewsSentiment(symbol: string) {
  try {
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
            content: `You are an elite financial analyst providing a comprehensive analysis. Be direct, data-driven, and actionable. Format with sections using emojis:
📊 PRICE ACTION - Current price context and key levels
📈 TECHNICAL SIGNALS - Indicator readings and what they suggest
🎯 KEY LEVELS - Support/resistance and targets
⚠️ RISK FACTORS - What could go wrong
💡 VERDICT - Clear buy/hold/sell stance with reasoning

Keep it concise but comprehensive. Max 400 words.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 600,
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
  
  if (data.news?.length > 0) {
    prompt += `RECENT NEWS SENTIMENT:\n`;
    data.news.slice(0, 3).forEach((n: any) => {
      prompt += `- ${n.sentiment}: "${n.title.slice(0, 60)}..."\n`;
    });
    prompt += '\n';
  }
  
  prompt += `Provide a comprehensive analysis with clear trading signals and risk assessment.`;
  
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
    const [price, indicators, company, news, cryptoData] = await Promise.all([
      fetchPriceData(symbol, assetType),
      fetchTechnicalIndicators(symbol, assetType),
      assetType === 'stock' ? fetchCompanyOverview(symbol) : null,
      fetchNewsSentiment(symbol),
      assetType === 'crypto' ? fetchCryptoData(symbol) : null,
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
      cryptoData
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
