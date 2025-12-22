import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Disable static optimization
export const revalidate = 0; // Disable ISR caching

// Alpha Vantage API for technical indicators (web-only)
const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Friendly handler for Alpha Vantage throttling/premium notices
async function fetchAlphaJson(url: string, tag: string) {
  // Add cache-busting timestamp
  const cacheBustUrl = url + (url.includes('?') ? '&' : '?') + `_nocache=${Date.now()}`;
  console.info(`[AV] Fetching ${tag}: ${url.substring(0, 100)}...`);
  
  const res = await fetch(cacheBustUrl, { 
    next: { revalidate: 0 }, 
    cache: "no-store",
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    }
  });
  
  if (!res.ok) {
    console.error(`[AV] HTTP ${res.status} for ${tag}`);
    throw new Error(`Alpha Vantage HTTP ${res.status} during ${tag}`);
  }
  
  const json = await res.json();

  const note = (json && (json.Note || json.Information)) as string | undefined;
  const errMsg = (json && json["Error Message"]) as string | undefined;

  if (note) {
    console.warn(`[AV] Rate limit/premium notice for ${tag}:`, note.substring(0, 100));
    throw new Error(`Alpha Vantage limit or premium notice during ${tag}: ${note}`);
  }
  if (errMsg) {
    console.error(`[AV] Error for ${tag}:`, errMsg);
    throw new Error(`Alpha Vantage error during ${tag}: ${errMsg}`);
  }

  return json;
}

interface ScanRequest {
  type: "crypto" | "equity" | "forex";
  timeframe: string;
  minScore: number;
  symbols?: string[];
}

interface ScanResult {
  symbol: string;
  score: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  signals?: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  timeframe: string;
  type: string;
  price?: number;
  rsi?: number;
  macd_hist?: number;
  ema200?: number;
  atr?: number;
  adx?: number;
  stoch_k?: number;
  stoch_d?: number;
  cci?: number;
  aroon_up?: number;
  aroon_down?: number;
  obv?: number;
  lastCandleTime?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ScanRequest;
    const { type, timeframe, minScore, symbols } = body;
    console.info("[scanner] request", { type, timeframe, minScore, symbolsCount: Array.isArray(symbols) ? symbols.length : 0 });

    // Validate inputs
    if (!type || !["crypto", "equity", "forex"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'crypto', 'equity', or 'forex'" },
        { status: 400 }
      );
    }

    const inputSymbols = Array.isArray(symbols)
      ? symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean)
      : [];

    // If client didn't provide symbols, use a small preset to ensure the page works
    // Top 10 by market cap (approx; stable choices for Alpha Vantage)
    const DEFAULT_EQUITIES = [
      "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
      "META", "AVGO", "LLY", "TSLA", "JPM"
    ];
    const DEFAULT_CRYPTO = [
      "BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD",
      "ADA-USD", "DOGE-USD", "TRX-USD", "AVAX-USD", "DOT-USD"
    ];
    let symbolsToScan = inputSymbols.length
      ? inputSymbols
      : (type === "crypto" ? DEFAULT_CRYPTO : DEFAULT_EQUITIES);

    // Alpha Vantage crypto symbols use format like BTC (just the base coin, remove -USD or USD suffix)
    if (type === "crypto") {
      symbolsToScan = symbolsToScan.map(s => {
        // Remove -USD, USD, -USDT, USDT suffixes; keep just the base symbol
        return s.replace(/[-]?(USD|USDT)$/i, "");
      });
    }
    // Commodity symbols unsupported in this endpoint (no intraday); ignore mapping

    if (!ALPHA_KEY) {
      return NextResponse.json({
        success: false,
        message: "Alpha Vantage API key not configured",
        results: [],
        errors: ["Missing ALPHA_VANTAGE_API_KEY"],
        metadata: { timestamp: new Date().toISOString(), count: 0 }
      }, { status: 500 });
    }

    const intervalMap: Record<string, string> = {
      "1h": "60min",
      "30m": "30min",
      "1d": "daily",
      "daily": "daily"
    };
    const avInterval = intervalMap[timeframe] || "daily";
    console.info("[scanner] Using Alpha Vantage interval:", avInterval, "for timeframe:", timeframe);


    async function fetchRSI(sym: string) {
      const url = `https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&series_type=close&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `RSI ${sym}`);
      const ta = j["Technical Analysis: RSI"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] RSI", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.RSI) : NaN;
    }

    async function fetchMACD(sym: string) {
      const url = `https://www.alphavantage.co/query?function=MACD&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&series_type=close&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `MACD ${sym}`);
      const ta = j["Technical Analysis: MACD"] || {};
      const first = Object.values(ta)[0] as any;
      if (!first) return { macd: NaN, sig: NaN, hist: NaN };
      console.debug("[scanner] MACD", { sym, avInterval, hasTA: !!first });
      return {
        macd: Number(first?.MACD),
        sig: Number(first?.MACD_Signal),
        hist: Number(first?.MACD_Hist)
      };
    }

    async function fetchEMA200(sym: string) {
      const url = `https://www.alphavantage.co/query?function=EMA&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=200&series_type=close&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `EMA200 ${sym}`);
      const ta = j["Technical Analysis: EMA"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] EMA200", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.EMA) : NaN;
    }

    async function fetchATR(sym: string) {
      const url = `https://www.alphavantage.co/query?function=ATR&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `ATR ${sym}`);
      const ta = j["Technical Analysis: ATR"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] ATR", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.ATR) : NaN;
    }

    // Crypto support: fetch OHLC and compute indicators locally when type === "crypto"
    type Candle = { t: string; open: number; high: number; low: number; close: number; };

    async function fetchCryptoDaily(symbol: string, market = "USD"): Promise<Candle[]> {
      const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${encodeURIComponent(symbol)}&market=${market}&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `CRYPTO_DAILY ${symbol}`);
      const ts = j["Time Series (Digital Currency Daily)"] || {};
      const candles: Candle[] = Object.entries(ts).map(([date, v]: any) => ({
        t: date as string,
        open: Number(v["1a. open (USD)"] ?? v["1. open"] ?? NaN),
        high: Number(v["2a. high (USD)"] ?? v["2. high"] ?? NaN),
        low: Number(v["3a. low (USD)"] ?? v["3. low"] ?? NaN),
        close: Number(v["4a. close (USD)"] ?? v["4. close"] ?? NaN),
      })).filter(c => Number.isFinite(c.close)).sort((a,b) => a.t.localeCompare(b.t));
      console.debug("[scanner] crypto daily candles", { symbol, count: candles.length, latestDate: candles[candles.length-1]?.t });
      return candles;
    }

    async function fetchCryptoIntraday(symbol: string, market = "USD", interval = "60min"): Promise<Candle[]> {
      // Use CRYPTO_INTRADAY for Premium Alpha Vantage
      // Map our intervals to AV intervals
      const avCryptoInterval = interval === "30min" ? "30min" : "60min";
      const url = `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${encodeURIComponent(symbol)}&market=${market}&interval=${avCryptoInterval}&outputsize=full&apikey=${ALPHA_KEY}`;
      
      console.info(`[scanner] Fetching CRYPTO_INTRADAY for ${symbol} (${avCryptoInterval})`);
      
      try {
        const j = await fetchAlphaJson(url, `CRYPTO_INTRADAY ${symbol}`);
        const tsKey = `Time Series Crypto (${avCryptoInterval})`;
        const ts = j[tsKey] || {};
        
        if (Object.keys(ts).length === 0) {
          console.warn(`[scanner] No intraday data for ${symbol}, falling back to daily`);
          return await fetchCryptoDaily(symbol, market);
        }
        
        const candles: Candle[] = Object.entries(ts).map(([datetime, v]: any) => ({
          t: datetime as string,
          open: Number(v["1. open"] ?? NaN),
          high: Number(v["2. high"] ?? NaN),
          low: Number(v["3. low"] ?? NaN),
          close: Number(v["4. close"] ?? NaN),
        })).filter(c => Number.isFinite(c.close)).sort((a, b) => a.t.localeCompare(b.t));
        
        console.info(`[scanner] CRYPTO_INTRADAY ${symbol}: Got ${candles.length} candles, latest: ${candles[candles.length-1]?.t}`);
        return candles;
      } catch (err: any) {
        // If premium endpoint fails, fall back to daily
        console.warn(`[scanner] CRYPTO_INTRADAY failed for ${symbol}, falling back to daily:`, err?.message);
        return await fetchCryptoDaily(symbol, market);
      }
    }

    function ema(values: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const out: number[] = [];
      let prev: number | undefined;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (i === 0) prev = v;
        const cur = (v * k) + (prev! * (1 - k));
        out.push(cur);
        prev = cur;
      }
      return out;
    }

    function rsi(values: number[], period = 14): number[] {
      const out: number[] = new Array(values.length).fill(NaN);
      if (values.length <= period) return out;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const ch = values[i] - values[i-1];
        if (ch >= 0) gains += ch; else losses -= ch;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      out[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
      for (let i = period + 1; i < values.length; i++) {
        const ch = values[i] - values[i-1];
        const gain = Math.max(0, ch);
        const loss = Math.max(0, -ch);
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        out[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
      }
      return out;
    }

    function macd(values: number[], fast=12, slow=26, signal=9) {
      const emaFast = ema(values, fast);
      const emaSlow = ema(values, slow);
      const macdLine = emaFast.map((v, i) => v - (emaSlow[i] ?? v));
      const signalLine = ema(macdLine, signal);
      const hist = macdLine.map((v, i) => v - (signalLine[i] ?? v));
      return { macdLine, signalLine, hist };
    }

    function atr(highs: number[], lows: number[], closes: number[], period=14): number[] {
      const trs: number[] = [];
      for (let i = 1; i < highs.length; i++) {
        const h = highs[i], l = lows[i], pc = closes[i-1];
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        trs.push(tr);
      }
      const out: number[] = new Array(trs.length).fill(NaN);
      let sum = 0;
      for (let i = 0; i < trs.length; i++) {
        sum += trs[i];
        if (i >= period) sum -= trs[i - period];
        out[i] = (i + 1 >= period) ? (sum / period) : NaN;
      }
      return out;
    }

    function adx(highs: number[], lows: number[], closes: number[], period=14) {
      const plus_dm: number[] = [], minus_dm: number[] = [];
      for (let i = 1; i < highs.length; i++) {
        const upMove = highs[i] - highs[i-1];
        const downMove = lows[i-1] - lows[i];
        plus_dm.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minus_dm.push(downMove > upMove && downMove > 0 ? downMove : 0);
      }
      const trs: number[] = [];
      for (let i = 1; i < highs.length; i++) {
        const h = highs[i], l = lows[i], pc = closes[i-1];
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        trs.push(tr);
      }
      const atr_vals: number[] = [], plus_di: number[] = [], minus_di: number[] = [];
      let tr_sum = 0, pdm_sum = 0, mdm_sum = 0;
      for (let i = 0; i < trs.length; i++) {
        tr_sum += trs[i]; pdm_sum += plus_dm[i]; mdm_sum += minus_dm[i];
        if (i >= period - 1) {
          atr_vals.push(tr_sum / period);
          const atr_val = atr_vals[atr_vals.length-1];
          plus_di.push((pdm_sum / atr_val) * 100);
          minus_di.push((mdm_sum / atr_val) * 100);
          if (i > period - 1) { tr_sum -= trs[i-period]; pdm_sum -= plus_dm[i-period]; mdm_sum -= minus_dm[i-period]; }
        }
      }
      const di_diff = plus_di.map((p, i) => Math.abs(p - minus_di[i])), di_sum = plus_di.map((p, i) => p + minus_di[i]);
      const dx = di_diff.map((d, i) => (d / di_sum[i]) * 100);
      const adx_out: number[] = [];
      let adx_sum = 0;
      for (let i = 0; i < dx.length; i++) {
        adx_sum += dx[i];
        adx_out.push(i >= period - 1 ? adx_sum / period : NaN);
      }
      return { adx: adx_out[adx_out.length - 1] ?? NaN, plus_di: plus_di[plus_di.length - 1] ?? NaN, minus_di: minus_di[minus_di.length - 1] ?? NaN };
    }

    function stochastic(highs: number[], lows: number[], closes: number[], period=14, smooth=3) {
      const k_vals: number[] = [];
      for (let i = period - 1; i < closes.length; i++) {
        const h_max = Math.max(...highs.slice(i - period + 1, i + 1));
        const l_min = Math.min(...lows.slice(i - period + 1, i + 1));
        const k = ((closes[i] - l_min) / (h_max - l_min)) * 100;
        k_vals.push(Number.isNaN(k) ? 50 : k);
      }
      const k_smooth = ema(k_vals, smooth);
      const d_smooth = ema(k_smooth, smooth);
      return { k: k_smooth[k_smooth.length - 1] ?? NaN, d: d_smooth[d_smooth.length - 1] ?? NaN };
    }

    function cci(highs: number[], lows: number[], closes: number[], period=20) {
      const tp: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        tp.push((highs[i] + lows[i] + closes[i]) / 3);
      }
      const sma_tp: number[] = [];
      for (let i = period - 1; i < tp.length; i++) {
        const avg = tp.slice(i - period + 1, i + 1).reduce((a,b) => a+b, 0) / period;
        sma_tp.push(avg);
      }
      const cci_vals: number[] = [];
      for (let i = period - 1; i < tp.length; i++) {
        const dev = tp.slice(i - period + 1, i + 1).map(t => Math.abs(t - sma_tp[i - period + 1])).reduce((a,b) => a+b, 0) / period;
        const cci = dev === 0 ? 0 : (tp[i] - sma_tp[i - period + 1]) / (0.015 * dev);
        cci_vals.push(cci);
      }
      return cci_vals[cci_vals.length - 1] ?? NaN;
    }

    function aroon(highs: number[], lows: number[], period=25) {
      const aroon_up: number[] = [], aroon_down: number[] = [];
      for (let i = period; i < highs.length; i++) {
        const h_idx = highs.slice(i - period, i).lastIndexOf(Math.max(...highs.slice(i - period, i)));
        const l_idx = lows.slice(i - period, i).lastIndexOf(Math.min(...lows.slice(i - period, i)));
        aroon_up.push(((period - (period - 1 - h_idx)) / period) * 100);
        aroon_down.push(((period - (period - 1 - l_idx)) / period) * 100);
      }
      return { up: aroon_up[aroon_up.length - 1] ?? NaN, down: aroon_down[aroon_down.length - 1] ?? NaN };
    }

    function obv(closes: number[], volumes: number[]): number[] {
      const obv_vals = [volumes[0]];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i] > closes[i-1]) obv_vals.push(obv_vals[i-1] + volumes[i]);
        else if (closes[i] < closes[i-1]) obv_vals.push(obv_vals[i-1] - volumes[i]);
        else obv_vals.push(obv_vals[i-1]);
      }
      return obv_vals;
    }

    function computeScore(
      close: number | undefined, 
      ema200: number, 
      rsi: number, 
      macd: number, 
      sig: number, 
      hist: number, 
      atr: number,
      adxVal?: number,
      stochK?: number,
      aroonUp?: number,
      aroonDown?: number,
      cciVal?: number,
      obvCurrent?: number,
      obvPrev?: number
    ): { score: number; direction: 'bullish' | 'bearish' | 'neutral'; signals: { bullish: number; bearish: number; neutral: number } } {
      // Count individual signals for more accurate direction
      let bullishSignals = 0;
      let bearishSignals = 0;
      let neutralSignals = 0;
      
      // 1. Trend vs EMA200 (major signal)
      if (Number.isFinite(ema200) && Number.isFinite(close)) {
        if (close! > ema200 * 1.01) { bullishSignals += 2; } // Above EMA200 by 1%+
        else if (close! < ema200 * 0.99) { bearishSignals += 2; } // Below EMA200 by 1%+
        else { neutralSignals += 1; }
      }
      
      // 2. RSI
      if (Number.isFinite(rsi)) {
        if (rsi >= 55 && rsi <= 70) { bullishSignals += 1; } // Bullish momentum
        else if (rsi > 70) { bearishSignals += 1; } // Overbought = caution
        else if (rsi <= 45 && rsi >= 30) { bearishSignals += 1; } // Bearish momentum
        else if (rsi < 30) { bullishSignals += 1; } // Oversold = potential bounce
        else { neutralSignals += 1; }
      }
      
      // 3. MACD Histogram
      if (Number.isFinite(hist)) {
        if (hist > 0) { bullishSignals += 1; }
        else { bearishSignals += 1; }
      }
      
      // 4. MACD vs Signal
      if (Number.isFinite(macd) && Number.isFinite(sig)) {
        if (macd > sig) { bullishSignals += 1; }
        else { bearishSignals += 1; }
      }
      
      // 5. ADX (trend strength)
      if (Number.isFinite(adxVal)) {
        if (adxVal! > 25) { 
          // Strong trend - amplify the dominant direction
          if (bullishSignals > bearishSignals) bullishSignals += 1;
          else if (bearishSignals > bullishSignals) bearishSignals += 1;
        } else {
          neutralSignals += 1; // Weak trend
        }
      }
      
      // 6. Stochastic
      if (Number.isFinite(stochK)) {
        if (stochK! > 80) { bearishSignals += 1; } // Overbought
        else if (stochK! < 20) { bullishSignals += 1; } // Oversold
        else if (stochK! >= 50) { bullishSignals += 0.5; }
        else { bearishSignals += 0.5; }
      }
      
      // 7. Aroon
      if (Number.isFinite(aroonUp) && Number.isFinite(aroonDown)) {
        if (aroonUp! > aroonDown! && aroonUp! > 70) { bullishSignals += 1; }
        else if (aroonDown! > aroonUp! && aroonDown! > 70) { bearishSignals += 1; }
        else { neutralSignals += 0.5; }
      }
      
      // 8. CCI (Commodity Channel Index)
      if (Number.isFinite(cciVal)) {
        if (cciVal! > 100) { bullishSignals += 1; } // Strong bullish
        else if (cciVal! > 0) { bullishSignals += 0.5; } // Mild bullish
        else if (cciVal! < -100) { bearishSignals += 1; } // Strong bearish
        else { bearishSignals += 0.5; } // Mild bearish
      }
      
      // 9. OBV (On Balance Volume) - trend confirmation
      if (Number.isFinite(obvCurrent) && Number.isFinite(obvPrev)) {
        if (obvCurrent! > obvPrev!) { bullishSignals += 1; } // Volume confirming up move
        else if (obvCurrent! < obvPrev!) { bearishSignals += 1; } // Volume confirming down move
        else { neutralSignals += 0.5; }
      }
      
      // 10. ATR-based volatility adjustment (risk factor)
      // High ATR in a downtrend is more bearish; high ATR in uptrend can be bullish breakout
      // For now, extreme volatility adds caution (neutral weight)
      if (Number.isFinite(atr) && Number.isFinite(close)) {
        const atrPercent = (atr / close!) * 100;
        if (atrPercent > 5) { // Very high volatility (>5% daily range)
          neutralSignals += 1; // Add caution weight
        }
      }
      
      // Calculate total signals
      const totalSignals = bullishSignals + bearishSignals + neutralSignals;
      
      // Determine direction based on signal counts
      let direction: 'bullish' | 'bearish' | 'neutral';
      if (bullishSignals > bearishSignals * 1.3) {
        direction = 'bullish';
      } else if (bearishSignals > bullishSignals * 1.3) {
        direction = 'bearish';
      } else {
        direction = 'neutral';
      }
      
      // Calculate score (0-100 scale)
      // Base score starts at 50 (neutral)
      let score = 50;
      const signalDiff = bullishSignals - bearishSignals;
      const maxSignals = 12; // Max possible with all 10 indicators
      
      // Adjust score based on signal difference
      score += (signalDiff / maxSignals) * 50;
      
      // Clamp to 0-100
      score = Math.max(0, Math.min(100, Math.round(score)));
      
      return {
        score,
        direction,
        signals: {
          bullish: Math.round(bullishSignals),
          bearish: Math.round(bearishSignals),
          neutral: Math.round(neutralSignals)
        }
      };
    }

    // Keep equities lower due to Alpha Vantage rate limits on TA endpoints
    const MAX_PER_SCAN = type === "equity" ? 5 : 10;
    const limited = symbolsToScan.slice(0, MAX_PER_SCAN);
    const results: ScanResult[] = [];
    const errors: string[] = [];

    for (const sym of limited) {
      try {
        if (type === "crypto") {
          const market = "USD";
          const baseSym = sym;
          const candles = avInterval === "daily" ? await fetchCryptoDaily(baseSym, market) : await fetchCryptoIntraday(baseSym, market, avInterval);
          if (!candles.length) throw new Error("No crypto candles returned");
          
          // Log the latest candle time for debugging
          const lastCandleTime = candles[candles.length - 1]?.t;
          console.info(`[scanner] Crypto ${baseSym}: Got ${candles.length} candles, latest: ${lastCandleTime}`);
          
          const closes = candles.map(c => c.close);
          const highs = candles.map(c => c.high);
          const lows = candles.map(c => c.low);
          const volumes = candles.map(c => 0); // placeholder
          
          const rsiArr = rsi(closes, 14);
          const macObj = macd(closes, 12, 26, 9);
          const emaArr = ema(closes, 200);
          const atrArr = atr(highs, lows, closes, 14);
          const adxObj = adx(highs, lows, closes, 14);
          const stochObj = stochastic(highs, lows, closes, 14, 3);
          const cciVal = cci(highs, lows, closes, 20);
          const aroonObj = aroon(highs, lows, 25);
          const obvArr = obv(closes, volumes);
          
          const last = closes.length - 1;
          const rsiVal = rsiArr[last];
          const macHist = macObj.hist[last];
          const macLine = macObj.macdLine[last];
          const sigLine = macObj.signalLine[last];
          const ema200Val = emaArr[last];
          const atrVal = atrArr[last - 1]; // ATR array has length-1 elements
          const close = closes[last];
          const price = close;
          const obvCurrent = obvArr[last];
          const obvPrev = obvArr[last - 1];
          
          const scoreResult = computeScore(close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, obvCurrent, obvPrev);
          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: `${baseSym}-${market}`,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            timeframe,
            type,
            price,
            rsi: rsiVal,
            macd_hist: macHist,
            ema200: ema200Val,
            atr: atrVal,
            adx: adxObj.adx,
            stoch_k: stochObj.k,
            stoch_d: stochObj.d,
            cci: cciVal,
            aroon_up: aroonObj.up,
            aroon_down: aroonObj.down,
            obv: obvArr[last] ?? NaN,
            lastCandleTime,
          };
          if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
        } else if (type === "forex") {
          // FOREX: Use FX_INTRADAY or FX_DAILY endpoints
          const cacheBuster = Date.now();
          let url: string;
          let tsKey: string;
          
          // Parse forex pair (e.g., "EURUSD" -> from=EUR, to=USD)
          const fromCurrency = sym.substring(0, 3);
          const toCurrency = sym.substring(3, 6) || "USD";
          
          if (avInterval === "daily") {
            url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&outputsize=full&apikey=${ALPHA_KEY}&_t=${cacheBuster}`;
            tsKey = "Time Series FX (Daily)";
          } else {
            url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&interval=${avInterval}&outputsize=full&apikey=${ALPHA_KEY}&_t=${cacheBuster}`;
            tsKey = `Time Series FX (Intraday)`;
          }
          
          console.info(`[scanner] Fetching FOREX ${fromCurrency}/${toCurrency} (${avInterval})`);
          
          const r = await fetch(url, { 
            next: { revalidate: 0 }, 
            cache: "no-store",
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          });
          const j = await r.json();
          
          // Check for AV errors/rate limits
          if (j.Note || j.Information) {
            console.warn(`[scanner] AV rate limit for ${sym}:`, j.Note || j.Information);
            throw new Error(`Alpha Vantage rate limit: ${(j.Note || j.Information).substring(0, 100)}`);
          }
          if (j["Error Message"]) {
            console.error(`[scanner] AV error for ${sym}:`, j["Error Message"]);
            throw new Error(`Alpha Vantage error: ${j["Error Message"]}`);
          }
          
          // Find the time series data
          const possibleKeys = [tsKey, "Time Series FX (Daily)", "Time Series FX (Intraday)"];
          const foundKey = possibleKeys.find(k => j[k]);
          const ts = j[foundKey || tsKey] || {};
          
          const candles: Candle[] = Object.entries(ts).map(([date, v]: any) => ({
            t: date as string,
            open: Number(v["1. open"] ?? NaN),
            high: Number(v["2. high"] ?? NaN),
            low: Number(v["3. low"] ?? NaN),
            close: Number(v["4. close"] ?? NaN),
          })).filter(c => Number.isFinite(c.close)).sort((a,b) => a.t.localeCompare(b.t));
          
          if (!candles.length) throw new Error(`No forex candles returned for ${sym}`);
          
          const lastCandleTime = candles[candles.length - 1]?.t;
          console.info(`[scanner] Forex ${sym}: Got ${candles.length} candles, latest: ${lastCandleTime}`);
          
          const closes = candles.map(c => c.close);
          const highs = candles.map(c => c.high);
          const lows = candles.map(c => c.low);
          const volumes = new Array(closes.length).fill(1000);
          
          const rsiArr = rsi(closes, 14);
          const macObj = macd(closes, 12, 26, 9);
          const emaArr = ema(closes, 200);
          const atrArr = atr(highs, lows, closes, 14);
          const adxObj = adx(highs, lows, closes, 14);
          const stochObj = stochastic(highs, lows, closes, 14, 3);
          const cciVal = cci(highs, lows, closes, 20);
          const aroonObj = aroon(highs, lows, 25);
          const obvArr = obv(closes, volumes);
          
          const last = closes.length - 1;
          const rsiVal = rsiArr[last];
          const macHist = macObj.hist[last];
          const macLine = macObj.macdLine[last];
          const sigLine = macObj.signalLine[last];
          const ema200Val = emaArr[last];
          const atrVal = atrArr[last - 1];
          const close = closes[last];
          const price = close;
          const obvCurrent = obvArr[last];
          const obvPrev = obvArr[last - 1];
          
          const scoreResult = computeScore(close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, obvCurrent, obvPrev);
          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: sym,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            timeframe,
            type,
            price,
            rsi: rsiVal,
            macd_hist: macHist,
            ema200: ema200Val,
            atr: atrVal,
            adx: adxObj.adx,
            stoch_k: stochObj.k,
            stoch_d: stochObj.d,
            cci: cciVal,
            aroon_up: aroonObj.up,
            aroon_down: aroonObj.down,
            obv: obvArr[last] ?? NaN,
            lastCandleTime,
          };
          if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
        } else {
          // EQUITIES: Use TIME_SERIES_INTRADAY or TIME_SERIES_DAILY
          const cacheBuster = Date.now();
          let url: string;
          let tsKey: string;
          
          if (avInterval === "daily") {
            url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(sym)}&outputsize=full&apikey=${ALPHA_KEY}&_t=${cacheBuster}`;
            tsKey = "Time Series (Daily)";
          } else {
            url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&outputsize=full&apikey=${ALPHA_KEY}&_t=${cacheBuster}`;
            tsKey = `Time Series (${avInterval})`;
          }
          
          console.info(`[scanner] Fetching EQUITY ${sym} (${avInterval})`);
          
          const r = await fetch(url, { 
            next: { revalidate: 0 }, 
            cache: "no-store",
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          });
          const j = await r.json();
          
          // Check for AV errors/rate limits
          if (j.Note || j.Information) {
            console.warn(`[scanner] AV rate limit for ${sym}:`, j.Note || j.Information);
            throw new Error(`Alpha Vantage rate limit: ${(j.Note || j.Information).substring(0, 100)}`);
          }
          if (j["Error Message"]) {
            console.error(`[scanner] AV error for ${sym}:`, j["Error Message"]);
            throw new Error(`Alpha Vantage error: ${j["Error Message"]}`);
          }
          
          // Find the time series data
          const possibleKeys = [tsKey, "Time Series (Daily)", `Time Series (${avInterval})`, "Time Series (60min)", "Time Series (30min)"];
          const foundKey = possibleKeys.find(k => j[k]);
          if (!foundKey) {
            console.warn("[scanner] No time series data", { sym, avInterval, keys: Object.keys(j).slice(0, 5) });
          }
          
          const ts = j[foundKey || tsKey] || {};
          const candles: Candle[] = Object.entries(ts).map(([date, v]: any) => ({
            t: date as string,
            open: Number(v["1. open"] ?? NaN),
            high: Number(v["2. high"] ?? NaN),
            low: Number(v["3. low"] ?? NaN),
            close: Number(v["4. close"] ?? NaN),
          })).filter(c => Number.isFinite(c.close)).sort((a,b) => a.t.localeCompare(b.t));
          
          if (!candles.length) throw new Error(`No equity candles returned for ${sym}`);
          
          // Log the latest candle time
          const lastCandleTime = candles[candles.length - 1]?.t;
          console.info(`[scanner] Equity ${sym}: Got ${candles.length} candles, latest: ${lastCandleTime}`);
          
          const closes = candles.map(c => c.close);
          const highs = candles.map(c => c.high);
          const lows = candles.map(c => c.low);
          const volumes = new Array(closes.length).fill(1000); // placeholder volume
          
          const rsiArr = rsi(closes, 14);
          const macObj = macd(closes, 12, 26, 9);
          const emaArr = ema(closes, 200);
          const atrArr = atr(highs, lows, closes, 14);
          const adxObj = adx(highs, lows, closes, 14);
          const stochObj = stochastic(highs, lows, closes, 14, 3);
          const cciVal = cci(highs, lows, closes, 20);
          const aroonObj = aroon(highs, lows, 25);
          const obvArr = obv(closes, volumes);
          
          const last = closes.length - 1;
          const rsiVal = rsiArr[last];
          const macHist = macObj.hist[last];
          const macLine = macObj.macdLine[last];
          const sigLine = macObj.signalLine[last];
          const ema200Val = emaArr[last];
          const atrVal = atrArr[last - 1]; // ATR array has length-1 elements
          const close = closes[last];
          const price = close;
          const obvCurrent = obvArr[last];
          const obvPrev = obvArr[last - 1];
          
          const scoreResult = computeScore(close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, obvCurrent, obvPrev);
          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: sym,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            timeframe,
            type,
            price,
            rsi: rsiVal,
            macd_hist: macHist,
            ema200: ema200Val,
            atr: atrVal,
            adx: adxObj.adx,
            stoch_k: stochObj.k,
            stoch_d: stochObj.d,
            cci: cciVal,
            aroon_up: aroonObj.up,
            aroon_down: aroonObj.down,
            obv: obvArr[last] ?? NaN,
            lastCandleTime,
          };
          if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
        }
      } catch (err: any) {
        console.error("[scanner] error for", sym, err);
        const msg = err?.message || "Unknown error";
        const friendly = msg.includes("limit") || msg.includes("premium")
          ? `${sym}: Alpha Vantage rate limit or premium requirement. Please retry shortly.`
          : `${sym}: ${msg}`;
        errors.push(friendly);
      }
    }

    // Return results with cache-prevention headers
    return NextResponse.json({
      success: true,
      message: results.length ? "OK" : "No symbols matched the minimum score (showing first for debug)",
      redirect: null,
      results,
      errors,
      metadata: {
        timestamp: new Date().toISOString(),
        count: results.length,
        minScore,
        timeframe,
        type
      },
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });

  } catch (error: any) {
    console.error("Scanner error:", error);
    const msg = error?.message || "Unknown error";
    const friendly = msg.includes("limit") || msg.includes("premium")
      ? "Alpha Vantage rate limit hit or premium access required. Please retry in a minute."
      : msg;

    return NextResponse.json(
      {
        error: friendly,
        details: msg,
        hint: "If this persists, reduce frequency or try again shortly.",
      },
      { 
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      }
    );
  }
}
