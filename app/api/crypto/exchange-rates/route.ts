import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getExchangeRates, getSimplePrices } from '@/lib/coingecko';

/**
 * /api/crypto/exchange-rates?symbols=BTC,ETH&currencies=aud,eur,gbp,jpy
 *
 * Returns crypto prices in multiple fiat currencies.
 * Uses CoinGecko /exchange_rates endpoint (BTC base) and converts.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const currencies = (searchParams.get('currencies') || 'aud,eur,gbp,jpy,cad,chf,cny,inr,krw,sgd')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

  const ratesData = await getExchangeRates();
  if (!ratesData?.rates) {
    return NextResponse.json({ error: 'Failed to fetch exchange rates' }, { status: 502 });
  }

  // BTC/USD rate
  const btcUsd = ratesData.rates['usd']?.value || 0;
  if (!btcUsd) {
    return NextResponse.json({ error: 'BTC/USD rate unavailable' }, { status: 502 });
  }

  // Build fiat rates relative to USD
  const fiatRates: Record<string, { name: string; unit: string; ratePerUsd: number }> = {};
  for (const cur of currencies) {
    const rate = ratesData.rates[cur];
    if (rate && rate.type === 'fiat') {
      fiatRates[cur] = {
        name: rate.name,
        unit: rate.unit,
        ratePerUsd: rate.value / btcUsd, // convert BTC-denominated rate to USD-denominated
      };
    }
  }

  // All available fiat currencies
  const availableFiat = Object.entries(ratesData.rates)
    .filter(([, v]) => v.type === 'fiat')
    .map(([k, v]) => ({ code: k, name: v.name, unit: v.unit }));

  return NextResponse.json({
    btcUsd,
    currencies: fiatRates,
    availableFiat,
    timestamp: new Date().toISOString(),
  });
}
